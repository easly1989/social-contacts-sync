import express, { Request, Response } from "express";

import { Contact, ProfileScanState, ProfileSearchState, ProfileSuggestion, ProfilesOverview, SocialNetwork, SocialPerson } from "../../interfaces/api";
import { getFromCache, setInCache } from "../src/cache";
import { OAuth2Client } from "../src/gapi";
import { ContactsApi, peopleContactsApi } from "../src/cleanup/people";
import { addContactLink, removeContactLink } from "../src/contactLinks";
import { toContact } from "../src/contacts/model";
import { clearPlaceholder, getPlaceholders } from "../src/contacts/placeholders";
import { askDesktop, desktopMode } from "../src/desktop";
import { answeredRevoked } from "../src/googleSignIn";
import { parseInstagramExport, parseLinkedInConnections } from "../src/profiles/imports";
import { candidatesFor } from "../src/profiles/match";
import { runSearch, SearchNetwork, searchNetworks } from "../src/profiles/search";
import { loadProfiles, mergePeople, ProfilesData, saveProfiles, StoredLinked } from "../src/profiles/store";
import { downloadImage, lookupProfileLink, parseProfileLink } from "../src/sources/links";

// Find profiles (issue #61): suggestions from exports, a public search and,
// in the desktop app, a scan of the user's own followers with their login.

export type ScanNetwork = Extract<SocialNetwork, "instagram" | "facebook" | "linkedin">;
export const scanNetworks: ScanNetwork[] = ["instagram", "facebook", "linkedin"];

/** What the desktop app's main process does for the login scan (desktop/src/socialScan.ts). */
export interface SocialDesktop {
  status(): Promise<ProfileScanState[]>;
  login(network: ScanNetwork): Promise<ProfileScanState>;
  logout(network: ScanNetwork): Promise<void>;
  /** Resolves with everyone read when the scan ends (finished, stopped or blocked). */
  scan(network: ScanNetwork): Promise<{ people: SocialPerson[]; stopped?: string }>;
  stop(network: ScanNetwork): Promise<void>;
}

const viaDesktopApp: SocialDesktop = {
  status: () => askDesktop("social-status"),
  login: (network) => askDesktop("social-login", { network }, 15 * 60 * 1000),
  logout: (network) => askDesktop("social-logout", { network }),
  scan: (network) => askDesktop("social-scan", { network }, 4 * 60 * 60 * 1000),
  stop: (network) => askDesktop("social-stop", { network }),
};

interface Options {
  contactsApi?: (auth: OAuth2Client) => ContactsApi;
  desktop?: SocialDesktop | null;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/** What the desktop app read, checked like any link: known profile addresses only. */
export function scannedPeople(network: ScanNetwork, people: SocialPerson[]): SocialPerson[] {
  return (Array.isArray(people) ? people : []).flatMap((p): SocialPerson[] => {
    const link = typeof p?.url === "string" ? parseProfileLink(p.url) : undefined;
    if (!link || link.network !== network) return [];
    const relation = ["follower", "following", "friend", "connection"].includes(p.relation ?? "") ? p.relation : undefined;
    const short = (s: unknown) => (typeof s === "string" && s.trim() ? s.trim().slice(0, 120) : undefined);
    return [{
      id: `${network}:${link.handle.toLowerCase()}`,
      network,
      url: link.url,
      handle: link.handle,
      name: short(p.name),
      photoUrl: typeof p.photoUrl === "string" && p.photoUrl.startsWith("https://") ? p.photoUrl : undefined,
      source: "scan",
      relation,
      detail: short(p.detail),
    }];
  });
}

export function profilesRouter(options: Options = {}): express.Router {
  const router = express.Router();
  const contactsApi = options.contactsApi ?? peopleContactsApi;
  const desktop = options.desktop === undefined ? (desktopMode ? viaDesktopApp : null) : options.desktop;

  function google(req: Request, res: Response): ContactsApi | undefined {
    const gAuth: OAuth2Client | undefined = getFromCache(req.sessionID, "gauth");
    if (!gAuth) res.status(401).send({ error: "not_signed_in" });
    return gAuth && contactsApi(gAuth);
  }

  function jsonOnly(req: Request, res: Response): boolean {
    if (req.is("application/json")) return true;
    res.status(415).send({ error: "json_required" });
    return false;
  }

  function failed(req: Request, res: Response, what: string, e: unknown): void {
    if (answeredRevoked(req.sessionID, e, res)) return;
    console.error(`${what} failed:`, e);
    res.status(502).send({ error: "google_unavailable" });
  }

  /** The address book, read again at most every two minutes (it takes a while for big ones). */
  async function contacts(req: Request, api: ContactsApi, fresh = false): Promise<Contact[]> {
    const cached: { at: number; contacts: Contact[] } | undefined = getFromCache(req.sessionID, "profiles_contacts");
    if (!fresh && cached && Date.now() - cached.at < 2 * 60 * 1000) return cached.contacts;
    const placeholders = getPlaceholders(req.sessionID);
    const list = (await api.list()).filter((p) => p.resourceName).map((p) => toContact(p, placeholders));
    setInCache(req.sessionID, "profiles_contacts", { at: Date.now(), contacts: list });
    return list;
  }
  const forget = (req: Request) => setInCache(req.sessionID, "profiles_contacts", undefined);

  function suggestions(data: ProfilesData, list: Contact[]): ProfileSuggestion[] {
    const linked = new Set(data.linked.filter((l) => !l.undone).map((l) => l.person.id));
    const skipped = new Set(data.skipped);
    return list
      .map((c) => ({ contact: c, candidates: candidatesFor(c, data.people, { rejected: data.rejected, linked }) }))
      .filter((s) => s.candidates.length)
      .sort(
        (a, b) =>
          Number(skipped.has(a.contact.id)) - Number(skipped.has(b.contact.id)) ||
          Number(a.contact.hasPhoto && !a.contact.placeholder) - Number(b.contact.hasPhoto && !b.contact.placeholder) ||
          b.candidates[0].score - a.candidates[0].score ||
          (a.contact.name ?? "").localeCompare(b.contact.name ?? "")
      )
      .map(({ contact: c, candidates }) => ({
        contactId: c.id,
        name: c.name ?? "",
        photoUrl: c.photoUrl,
        hasPhoto: c.hasPhoto,
        placeholder: c.placeholder,
        detail: [c.phones[0]?.value, c.emails[0]?.value, c.company].filter(Boolean).join(" · ") || undefined,
        candidates,
      }));
  }

  const searchState = (req: Request): ProfileSearchState =>
    getFromCache(req.sessionID, "profiles_search") ?? { running: false, networks: [], checked: 0, total: 0, found: {} };

  async function scanStates(req: Request, data: ProfilesData): Promise<ProfileScanState[] | undefined> {
    if (!desktop) return undefined;
    const live: ProfileScanState[] = await desktop.status().catch(() => scanNetworks.map((network) => ({ network, loggedIn: false })));
    return live.map((s) => ({ ...s, ...(s.running ? {} : data.scans[s.network] ?? {}) }));
  }

  async function overview(req: Request, api: ContactsApi): Promise<ProfilesOverview> {
    const data = loadProfiles(req.sessionID);
    const list = await contacts(req, api);
    const networks: SocialNetwork[] = ["instagram", "linkedin", "facebook", "bluesky", "mastodon", "github"];
    return {
      sources: networks.map((network) => ({
        network,
        people: data.people.filter((p) => p.network === network).length,
        imported: data.imports[network],
        scanned: data.scans[network]?.finishedAt,
      })),
      search: searchState(req),
      scans: await scanStates(req, data),
      suggestions: suggestions(data, list),
      linked: data.linked.map(({ previousPhoto: _p, addedLink: _a, ...rest }) => rest).reverse(),
    };
  }

  router.get("/profiles", async (req: Request, res: Response) => {
    const api = google(req, res);
    if (!api) return;
    try {
      res.send(await overview(req, api));
    } catch (e) {
      failed(req, res, "Reading profiles", e);
    }
  });

  // One export file at a time, as text (they're bigger than a JSON body allows).
  router.post("/profiles/import", express.text({ type: ["text/plain", "text/csv", "application/octet-stream"], limit: "30mb" }), (req: Request, res: Response) => {
    const network = req.query.network;
    if (network !== "instagram" && network !== "linkedin") return res.status(400).send({ error: "unsupported_network" });
    if (typeof req.body !== "string" || !req.body.trim()) return res.status(400).send({ error: "empty_file" });
    let people: SocialPerson[];
    try {
      people = network === "instagram" ? parseInstagramExport(req.body, String(req.query.file ?? "")) : parseLinkedInConnections(req.body);
    } catch {
      return res.status(400).send({ error: "unreadable_file" });
    }
    if (!people.length) return res.status(400).send({ error: "no_people" });
    const data = loadProfiles(req.sessionID);
    const added = mergePeople(data, people);
    data.imports[network] = new Date().toISOString();
    saveProfiles(req.sessionID, data);
    res.send({ read: people.length, added });
  });

  router.post("/profiles/search", async (req: Request, res: Response) => {
    if (!jsonOnly(req, res)) return;
    const api = google(req, res);
    if (!api) return;
    const networks = (Array.isArray(req.body?.networks) ? req.body.networks : []).filter((n: unknown): n is SearchNetwork => searchNetworks.includes(n as SearchNetwork));
    if (!networks.length) return res.status(400).send({ error: "no_networks" });
    if (searchState(req).running) return res.status(409).send({ error: "busy" });
    let list: Contact[];
    try {
      list = await contacts(req, api, true);
    } catch (e) {
      return failed(req, res, "Reading contacts", e);
    }
    const sessionId = req.sessionID;
    const state: ProfileSearchState = { running: true, networks, checked: 0, total: 0, found: {} };
    setInCache(sessionId, "profiles_search", state);
    setInCache(sessionId, "profiles_search_stop", false);
    const data = loadProfiles(sessionId);
    void runSearch({
      contacts: list,
      networks,
      searched: data.searched,
      fetchImpl: options.fetchImpl,
      sleep: options.sleep,
      cancelled: () => getFromCache(sessionId, "profiles_search_stop") === true,
      found: (people) => {
        const current = loadProfiles(sessionId);
        mergePeople(current, people);
        current.searched = data.searched;
        saveProfiles(sessionId, current);
      },
      progress: (checked, total, found) => {
        Object.assign(state, { checked, total, found });
        const current = loadProfiles(sessionId);
        current.searched = data.searched;
        saveProfiles(sessionId, current);
      },
    })
      .then(({ stopped }) => Object.assign(state, { running: false, ...(stopped ? { error: `limited:${stopped}` } : {}) }))
      .catch((e) => Object.assign(state, { running: false, error: String((e as Error)?.message ?? e) }));
    res.send(state);
  });

  router.post("/profiles/search/stop", (req: Request, res: Response) => {
    setInCache(req.sessionID, "profiles_search_stop", true);
    res.send(searchState(req));
  });

  // Link a profile to a contact, and optionally use its photo.
  router.post("/profiles/link", async (req: Request, res: Response) => {
    if (!jsonOnly(req, res)) return;
    const api = google(req, res);
    if (!api) return;
    const data = loadProfiles(req.sessionID);
    const person = data.people.find((p) => p.id === req.body?.personId);
    const contactId = typeof req.body?.contactId === "string" && /^people\/[\w-]+$/.test(req.body.contactId) ? (req.body.contactId as string) : undefined;
    if (!person || !contactId) return res.status(404).send({ error: "not_found" });
    try {
      const before = toContact(await api.get(contactId), getPlaceholders(req.sessionID));
      const addedLink = await addContactLink(api, contactId, person.url);
      let photoSet = false;
      let previousPhoto: string | null | undefined;
      if (req.body?.usePhoto === true) {
        // The photo read with the profile, else the one its page shows.
        const fetchImpl = options.fetchImpl ?? fetch;
        const photo =
          (person.photoUrl ? await downloadImage(person.photoUrl, person.network, fetchImpl).catch(() => null) : null) ??
          (await lookupProfileLink(person.url, { fetchImpl }).catch(() => null))?.photo ??
          null;
        if (photo) {
          previousPhoto = before.hasPhoto ? await api.photo(await api.get(contactId)) : null;
          await api.setPhoto(contactId, photo);
          clearPlaceholder(req.sessionID, contactId);
          photoSet = true;
        }
      }
      const entry: StoredLinked = { contactId, name: before.name ?? "", person, at: new Date().toISOString(), photoSet, addedLink, previousPhoto };
      data.linked.push(entry);
      data.skipped = data.skipped.filter((id) => id !== contactId);
      saveProfiles(req.sessionID, data);
      forget(req);
      const { previousPhoto: _p, addedLink: _a, ...linked } = entry;
      res.send({ linked, photoWanted: req.body?.usePhoto === true });
    } catch (e) {
      failed(req, res, "Linking a profile", e);
    }
  });

  router.post("/profiles/undo", async (req: Request, res: Response) => {
    if (!jsonOnly(req, res)) return;
    const api = google(req, res);
    if (!api) return;
    const data = loadProfiles(req.sessionID);
    const entry = [...data.linked].reverse().find((l) => !l.undone && l.contactId === req.body?.contactId && l.person.id === req.body?.personId);
    if (!entry) return res.status(404).send({ error: "not_found" });
    try {
      if (entry.addedLink) await removeContactLink(api, entry.contactId, entry.person.url);
      if (entry.photoSet) {
        if (entry.previousPhoto) await api.setPhoto(entry.contactId, entry.previousPhoto);
        else await api.deletePhoto(entry.contactId);
      }
      entry.undone = true;
      entry.previousPhoto = undefined;
      saveProfiles(req.sessionID, data);
      forget(req);
      res.send({ ok: true });
    } catch (e) {
      failed(req, res, "Undoing a link", e);
    }
  });

  // "None of these": the shown profiles aren't this contact.
  router.post("/profiles/reject", (req: Request, res: Response) => {
    if (!jsonOnly(req, res)) return;
    const contactId = String(req.body?.contactId ?? "");
    const ids = (Array.isArray(req.body?.personIds) ? req.body.personIds : []).filter((id: unknown): id is string => typeof id === "string");
    if (!contactId || !ids.length) return res.status(400).send({ error: "invalid_request" });
    const data = loadProfiles(req.sessionID);
    data.rejected[contactId] = [...new Set([...(data.rejected[contactId] ?? []), ...ids])];
    saveProfiles(req.sessionID, data);
    res.send({ ok: true });
  });

  router.post("/profiles/skip", (req: Request, res: Response) => {
    if (!jsonOnly(req, res)) return;
    const contactId = String(req.body?.contactId ?? "");
    const data = loadProfiles(req.sessionID);
    data.skipped = [...data.skipped.filter((id) => id !== contactId), contactId];
    saveProfiles(req.sessionID, data);
    res.send({ ok: true });
  });

  // The login scan: desktop app only.
  const scanNetwork = (req: Request): ScanNetwork | undefined => (scanNetworks.includes(req.body?.network) ? (req.body.network as ScanNetwork) : undefined);

  router.post("/profiles/scan/:action", async (req: Request, res: Response) => {
    if (!jsonOnly(req, res)) return;
    if (!desktop) return res.status(404).send({ error: "desktop_only" });
    const network = scanNetwork(req);
    if (!network) return res.status(400).send({ error: "unsupported_network" });
    const sessionId = req.sessionID;
    try {
      switch (req.params.action) {
        case "login":
          return res.send(await desktop.login(network));
        case "logout":
          await desktop.logout(network);
          return res.send({ ok: true });
        case "stop":
          await desktop.stop(network);
          return res.send({ ok: true });
        case "start": {
          // Only after the user acknowledged the risk in the page.
          if (req.body?.acceptRisk !== true) return res.status(400).send({ error: "risk_not_accepted" });
          void desktop
            .scan(network)
            .then(({ people, stopped }) => {
              const data = loadProfiles(sessionId);
              mergePeople(data, scannedPeople(network, people));
              data.scans[network] = { finishedAt: new Date().toISOString(), read: people.length, ...(stopped ? { stopped } : {}) };
              saveProfiles(sessionId, data);
            })
            .catch((e) => console.error(`Scanning ${network} failed:`, e));
          return res.send({ ok: true });
        }
        default:
          return res.status(404).send({ error: "not_found" });
      }
    } catch (e) {
      console.error(`Profiles scan ${req.params.action} failed:`, e);
      res.status(502).send({ error: "desktop_unavailable", detail: (e as Error)?.message });
    }
  });

  return router;
}

export default profilesRouter();
