import express, { Request, Response } from "express";

import { Contact, ProfileBulkState, ProfileLinkRequest, ProfileScanState, ProfileSearchState, ProfileSuggestion, ProfilesOverview, SocialNetwork, SocialPerson } from "../../interfaces/api";
import { getFromCache, setInCache } from "../src/cache";
import { OAuth2Client } from "../src/gapi";
import { ContactsApi, peopleContactsApi } from "../src/cleanup/people";
import { addContactLinks, removeContactLink } from "../src/contactLinks";
import { toContact } from "../src/contacts/model";
import { clearPlaceholder, getPlaceholders } from "../src/contacts/placeholders";
import { askDesktop, desktopMode } from "../src/desktop";
import { answeredRevoked, expireGoogleSignIn, isRevokedSignIn } from "../src/googleSignIn";
import { googleErrorMessage } from "../src/googleRetry";
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

/** The image's type from its first bytes. */
export function imageType(bytes: Buffer): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (bytes.subarray(0, 3).toString("latin1") === "GIF") return "image/gif";
  return "image/jpeg";
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
        searched: data.searches[network],
      })),
      search: searchState(req),
      scans: await scanStates(req, data),
      suggestions: suggestions(data, list),
      linked: data.linked.map(({ previousPhoto: _p, addedLink: _a, ...rest }) => rest).reverse(),
      bulk: getFromCache(req.sessionID, "profiles_bulk"),
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
      .then(({ stopped }) => {
        const current = loadProfiles(sessionId);
        for (const network of networks as SearchNetwork[]) current.searches[network] = new Date().toISOString();
        saveProfiles(sessionId, current);
        Object.assign(state, { running: false, ...(stopped ? { error: `limited:${stopped}` } : {}) });
      })
      .catch((e) => Object.assign(state, { running: false, error: String((e as Error)?.message ?? e) }));
    res.send(state);
  });

  router.post("/profiles/search/stop", (req: Request, res: Response) => {
    setInCache(req.sessionID, "profiles_search_stop", true);
    res.send(searchState(req));
  });

  /**
   * Links the ticked profiles to a contact in one change, and uses one
   * profile's photo if asked (issue #65: several profiles per contact). The
   * card's other profiles are remembered as not this contact.
   */
  async function linkContact(sessionId: string, api: ContactsApi, request: ProfileLinkRequest): Promise<{ linked: StoredLinked[]; photoSet: boolean }> {
    const data = loadProfiles(sessionId);
    const persons = request.personIds.map((id) => data.people.find((p) => p.id === id)).filter((p): p is SocialPerson => Boolean(p));
    if (!persons.length) throw Object.assign(new Error("not_found"), { status: 404 });
    const { contactId } = request;
    const before = toContact(await api.get(contactId), getPlaceholders(sessionId));
    const added = await addContactLinks(api, contactId, persons.map((p) => p.url));
    let photoSet = false;
    let previousPhoto: string | null | undefined;
    const photoPerson = persons.find((p) => p.id === request.photoFrom);
    if (photoPerson) {
      const photo = await profilePhoto(photoPerson);
      if (photo) {
        previousPhoto = before.hasPhoto ? await api.photo(await api.get(contactId)) : null;
        await api.setPhoto(contactId, photo);
        clearPlaceholder(sessionId, contactId);
        photoSet = true;
      }
    }
    const at = new Date().toISOString();
    const linked = persons.map(
      (person): StoredLinked => ({
        contactId,
        name: before.name ?? request.name ?? "",
        person,
        at,
        photoSet: photoSet && person === photoPerson,
        addedLink: added.some((url) => url === person.url),
        ...(photoSet && person === photoPerson ? { previousPhoto } : {}),
      })
    );
    const current = loadProfiles(sessionId);
    current.linked.push(...linked);
    current.skipped = current.skipped.filter((id) => id !== contactId);
    if (request.rejectIds?.length) current.rejected[contactId] = [...new Set([...(current.rejected[contactId] ?? []), ...request.rejectIds])];
    saveProfiles(sessionId, current);
    return { linked, photoSet };
  }

  /** The profile's photo: the one read with it, else the one its page shows now. */
  async function profilePhoto(person: SocialPerson): Promise<string | null> {
    const fetchImpl = options.fetchImpl ?? fetch;
    return (
      (person.photoUrl ? await downloadImage(person.photoUrl, person.network, fetchImpl).catch(() => null) : null) ??
      (await lookupProfileLink(person.url, { fetchImpl }).catch(() => null))?.photo ??
      null
    );
  }

  const strings = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").slice(0, 50) : []);
  function linkRequest(body: Record<string, unknown> | undefined): ProfileLinkRequest | undefined {
    const contactId = typeof body?.contactId === "string" && /^people\/[\w-]+$/.test(body.contactId) ? body.contactId : undefined;
    // `personId` and `usePhoto`: one profile, as before.
    const personIds = typeof body?.personId === "string" ? [body.personId] : strings(body?.personIds);
    if (!contactId || !personIds.length) return undefined;
    const photoFrom = typeof body?.photoFrom === "string" ? body.photoFrom : body?.usePhoto === true ? personIds[0] : undefined;
    const name = typeof body?.name === "string" ? body.name.slice(0, 120) : undefined;
    return { contactId, personIds, photoFrom, rejectIds: strings(body?.rejectIds), name };
  }
  const publicLinked = ({ previousPhoto: _p, addedLink: _a, ...rest }: StoredLinked) => rest;

  router.post("/profiles/link", async (req: Request, res: Response) => {
    if (!jsonOnly(req, res)) return;
    const api = google(req, res);
    if (!api) return;
    const request = linkRequest(req.body);
    if (!request) return res.status(404).send({ error: "not_found" });
    try {
      const { linked, photoSet } = await linkContact(req.sessionID, api, request);
      forget(req);
      res.send({ linked: linked.map(publicLinked), photoWanted: Boolean(request.photoFrom), photoSet });
    } catch (e) {
      if ((e as { status?: number })?.status === 404) return res.status(404).send({ error: "not_found" });
      failed(req, res, "Linking a profile", e);
    }
  });

  // Several contacts at once (issue #65), in the background at Google's pace.
  const bulkState = (req: Request): ProfileBulkState | undefined => getFromCache(req.sessionID, "profiles_bulk");

  router.post("/profiles/link_many", (req: Request, res: Response) => {
    if (!jsonOnly(req, res)) return;
    const api = google(req, res);
    if (!api) return;
    if (bulkState(req)?.running) return res.status(409).send({ error: "busy" });
    const requests = (Array.isArray(req.body?.items) ? req.body.items : []).map(linkRequest).filter((r: ProfileLinkRequest | undefined): r is ProfileLinkRequest => Boolean(r));
    if (!requests.length) return res.status(400).send({ error: "invalid_request" });
    const sessionId = req.sessionID;
    const state: ProfileBulkState = { running: true, done: 0, total: requests.length, contacts: 0, profiles: 0, failed: [] };
    setInCache(sessionId, "profiles_bulk", state);
    setInCache(sessionId, "profiles_bulk_stop", false);
    const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    void (async () => {
      for (const request of requests) {
        if (getFromCache(sessionId, "profiles_bulk_stop") === true) {
          state.stopped = true;
          break;
        }
        try {
          const { linked } = await linkContact(sessionId, api, request);
          state.contacts++;
          state.profiles += linked.length;
        } catch (e) {
          state.failed.push({ contactId: request.contactId, name: request.name ?? request.contactId, error: googleErrorMessage(e) });
          // Without the sign-in, the rest would fail the same way.
          if (isRevokedSignIn(e)) {
            expireGoogleSignIn(sessionId);
            break;
          }
        }
        state.done++;
        // Google allows about one contact change a second.
        await sleep(1000);
      }
      state.running = false;
      setInCache(sessionId, "profiles_contacts", undefined);
    })();
    res.send(state);
  });

  router.post("/profiles/link_many/stop", (req: Request, res: Response) => {
    setInCache(req.sessionID, "profiles_bulk_stop", true);
    res.send(bulkState(req) ?? { running: false, done: 0, total: 0, contacts: 0, profiles: 0, failed: [] });
  });

  /*
    A profile's photo, through this server (issue #65): Instagram's image
    servers refuse to be shown in another page, and their addresses expire.
    Kept in memory for the session.
  */
  const photoCache = new Map<string, { at: number; bytes?: Buffer }>();
  router.get("/profiles/photo", async (req: Request, res: Response) => {
    const id = String(req.query.id ?? "");
    const person = loadProfiles(req.sessionID).people.find((p) => p.id === id);
    if (!person) return res.status(404).send({ error: "not_found" });
    let cached = photoCache.get(id);
    // A miss is tried again after ten minutes.
    if (!cached || (!cached.bytes && Date.now() - cached.at > 10 * 60 * 1000)) {
      const photo = await profilePhoto(person).catch(() => null);
      cached = { at: Date.now(), bytes: photo ? Buffer.from(photo, "base64") : undefined };
      photoCache.set(id, cached);
      while (photoCache.size > 2000) photoCache.delete(photoCache.keys().next().value!);
    }
    if (!cached.bytes) return res.status(404).send({ error: "no_photo" });
    res.set("Cache-Control", "private, max-age=86400");
    res.type(imageType(cached.bytes)).send(cached.bytes);
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
