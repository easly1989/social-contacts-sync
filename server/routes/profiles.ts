import crypto from "crypto";
import express, { Request, Response } from "express";
import { Client, WAState } from "whatsapp-web.js";

import { Contact, ContactResult, Coverage, LinkedNetworks, LoginSearchResult, LoginSearchState, PinnedProfiles, ProfileBulkState, ProfileLinkRequest, ProfileScanState, ProfileSearchState, ProfileSuggestion, ProfilesOverview, SocialNetwork, SocialPerson, SourceId } from "../../interfaces/api";
import { getFromCache, setInCache } from "../src/cache";
import { OAuth2Client } from "../src/gapi";
import { ContactsApi, peopleContactsApi } from "../src/cleanup/people";
import { addContactLinks, linkKey } from "../src/contactLinks";
import { toContact } from "../src/contacts/model";
import { clearPlaceholder, getPlaceholders } from "../src/contacts/placeholders";
import { getKeptPhotos } from "../src/contacts/keptPhotos";
import { askDesktop, desktopMode } from "../src/desktop";
import { answeredRevoked, expireGoogleSignIn, isRevokedSignIn } from "../src/googleSignIn";
import { googleErrorMessage } from "../src/googleRetry";
import { parseInstagramExport, parseLinkedInConnections } from "../src/profiles/imports";
import { candidatesFor } from "../src/profiles/match";
import { runSearch, SearchNetwork, searchNetworks } from "../src/profiles/search";
import { loadProfiles, mergePeople, ProfilesData, saveProfiles, StoredLinked, storedProfilePhotos } from "../src/profiles/store";
import { clientLookup, WhatsAppLookup, whatsappContacts } from "../src/sources/whatsapp";
import { downloadImage, lookupProfileLink, networkNames, parseProfileLink, ProfileLink, shortLink } from "../src/sources/links";
import { photoKey } from "../src/contacts/model";
import { getPins, photoHash, setPin } from "../src/contacts/photoPins";
import { desktopReader, getReads, lookupWithLogin, pinnedProfiles, ReadProfile, readsWithLogin, RereadNetwork } from "../src/profiles/rereads";
import { cachedPhoto, cachePhoto } from "../src/profiles/photoCache";
import { checkedQueue, loadQueue, publicEntry, QueueData, queuedImage, ReadLook, resolveEntry, saveQueue, StoredEntry } from "../src/profiles/queue";
import { photoFacts, PhotoFacts, worthOffering } from "../src/photoRules";
import { migrateReviewHistory } from "../src/profiles/history";
import { recordDecision } from "../src/runs";
import { getLookup } from "../src/linkLookups";

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
  /** People found by searching a name with the login (issue #104). */
  search(network: ScanNetwork, query: string): Promise<{ people: SocialPerson[]; stopped?: string; answer?: string }>;
}

const viaDesktopApp: SocialDesktop = {
  status: () => askDesktop("social-status"),
  login: (network) => askDesktop("social-login", { network }, 15 * 60 * 1000),
  logout: (network) => askDesktop("social-logout", { network }),
  scan: (network) => askDesktop("social-scan", { network }, 4 * 60 * 60 * 1000),
  stop: (network) => askDesktop("social-stop", { network }),
  search: (network, query) => askDesktop("social-search", { network, query }, 60_000),
};

interface Options {
  contactsApi?: (auth: OAuth2Client) => ContactsApi;
  desktop?: SocialDesktop | null;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** The desktop app's login reads; undefined in the web version. */
  loginReader?: () => ReadProfile | undefined;
  /** WhatsApp, while it's connected. */
  whatsapp?: (sessionId: string) => Promise<WhatsAppLookup | undefined>;
  /** Reads the look of a contact's Google photo (tests use a fake). */
  readLook?: ReadLook;
}

async function connectedWhatsApp(sessionId: string): Promise<WhatsAppLookup | undefined> {
  const client: Client | undefined = getFromCache(sessionId, "whatsapp");
  return client && (await client.getState().catch(() => undefined)) === WAState.CONNECTED ? clientLookup(client) : undefined;
}

/** What the desktop app read, checked like any link: known profile addresses only. */
export function scannedPeople(network: ScanNetwork, people: SocialPerson[], source: "scan" | "loginSearch" = "scan"): SocialPerson[] {
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
      source,
      relation,
      detail: short(p.detail),
    }];
  });
}

/** Where a photo from a profile link comes from, for its pin. */
function profilePin(url: string): { source: "links"; matchedBy: string; network?: string } {
  const link = parseProfileLink(url);
  return { source: "links", matchedBy: link ? shortLink(link) : url.replace(/^https:\/\//, ""), ...(link ? { network: networkNames[link.network] } : {}) };
}

/** What "No photo" remembers of a contact: a change in its phones, emails or links brings its card back. */
export function contactFingerprint(c: Contact): string {
  const values = [...c.phones, ...c.emails, ...c.urls].map((v) => v.value.trim().toLowerCase()).sort();
  return crypto.createHash("sha1").update(values.join("\n")).digest("hex").slice(0, 16);
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
    const kept = getKeptPhotos(req.sessionID);
    const list = (await api.list()).filter((p) => p.resourceName).map((p) => toContact(p, placeholders, kept));
    setInCache(req.sessionID, "profiles_contacts", { at: Date.now(), contacts: list });
    return list;
  }
  const forget = (req: Request) => setInCache(req.sessionID, "profiles_contacts", undefined);

  /** The profiles already on the contact that were read with a photo (issue #81): photo candidates too. */
  function linkedPeople(data: ProfilesData): (contact: Contact) => SocialPerson[] {
    const byUrl = new Map(data.people.flatMap((p) => (p.photoUrl ? [[parseProfileLink(p.url)?.url ?? p.url, p] as const] : [])));
    return (contact) => [...new Set(contact.urls.flatMap((u) => byUrl.get(parseProfileLink(u.value)?.url ?? "") ?? []))];
  }

  // Size and look of the profiles' cached photos, by profile and photo address; one not cached yet is looked for again.
  const profileFacts = new Map<string, PhotoFacts>();
  function factsOf(person: SocialPerson): PhotoFacts | undefined {
    const key = `${person.id} ${person.photoUrl ?? ""}`;
    if (!profileFacts.has(key)) {
      const bytes = cachedPhoto(person);
      if (bytes) profileFacts.set(key, photoFacts(bytes));
    }
    return profileFacts.get(key);
  }

  /** The queue, with what To review's rules need filled in for cards an older sync sent. */
  const reviewQueue = (sessionId: string, list: Contact[]) => checkedQueue(sessionId, list, options.readLook);

  /** Profiles never suggested for a contact: turned down for it, linked from the app, or already on any contact. */
  function exclusions(data: ProfilesData, list: Contact[]) {
    const linked = new Set(data.linked.filter((l) => !l.undone).map((l) => l.person.id));
    // A profile already on a contact, linked here or written in Google, isn't suggested for another one.
    const taken = new Set(list.flatMap((c) => c.urls.map((u) => linkKey(u.value))));
    return { rejected: data.rejected, linked, taken };
  }

  /**
   * To review: one card per contact with suggested profiles or photos a sync sent there (issue #82),
   * offering only photos worth it, and one per contact without a photo (issue #104).
   */
  function suggestions(sessionId: string, data: ProfilesData, list: Contact[], queue: QueueData): ProfileSuggestion[] {
    const excluded = exclusions(data, list);
    const skipped = new Set(data.skipped);
    const onContact = linkedPeople(data);
    const pins = getPins(sessionId);
    const real = (c: Contact) => c.hasPhoto && !c.placeholder;
    const worth = (c: Contact, entry: StoredEntry | undefined): StoredEntry | undefined => {
      if (entry?.kind !== "photo") return entry;
      const current = entry.current?.key && entry.current.key === photoKey(c.photoUrl) ? entry.current.visual : undefined;
      const photos = entry.photos.flatMap((p) => {
        const verdict = worthOffering(p, { hasPhoto: real(c), current });
        return verdict.offer ? [{ ...p, small: verdict.small }] : [];
      });
      return photos.length ? { ...entry, photos } : undefined;
    };
    // A profile's photo on a contact with a photo: only when known to be large enough (the rules can't check the others).
    const worthPerson = (c: Contact) => (p: SocialPerson) => {
      if (!real(c)) return true;
      const facts = factsOf(p);
      return Boolean(facts?.width) && worthOffering({ source: "links", network: networkNames[p.network], ...facts }, { hasPhoto: true }).offer;
    };
    const fromPin = (c: Contact): ProfileSuggestion["currentFrom"] => {
      const pin = pins[c.id];
      return pin && !pin.suspended && pin.photoKey && pin.photoKey === photoKey(c.photoUrl) ? { source: pin.source, ...(pin.network ? { network: pin.network } : {}) } : undefined;
    };
    return list
      // A kept photo is never replaced: its contact only gets profiles.
      .map((c) => ({ contact: c, candidates: candidatesFor(c, data.people, excluded), entry: c.photoKept ? undefined : worth(c, queue.entries[c.id]) }))
      // Skipped until the next sync; "No photo" until the contact changes.
      .filter((s) => !skipped.has(s.contact.id) && data.noPhoto[s.contact.id] !== contactFingerprint(s.contact))
      .filter((s) => s.candidates.length || s.entry || (!real(s.contact) && !s.contact.photoKept))
      .sort(
        (a, b) =>
          Number(real(a.contact)) - Number(real(b.contact)) ||
          Number(!a.entry && !a.candidates.length) - Number(!b.entry && !b.candidates.length) ||
          (b.candidates[0]?.score ?? 0) - (a.candidates[0]?.score ?? 0) ||
          (a.contact.name ?? "").localeCompare(b.contact.name ?? "")
      )
      .map(({ contact: c, candidates, entry }) => ({
        contactId: c.id,
        name: c.name ?? "",
        photoUrl: c.photoUrl,
        hasPhoto: c.hasPhoto,
        placeholder: c.placeholder,
        photoKept: c.photoKept,
        detail: [c.phones[0]?.value, c.emails[0]?.value, c.company].filter(Boolean).join(" · ") || undefined,
        candidates,
        linked: onContact(c).filter((p) => !candidates.some((s) => s.person.id === p.id) && worthPerson(c)(p)),
        ...(entry ? { queue: publicEntry(entry) } : {}),
        ...(real(c) && fromPin(c) ? { currentFrom: fromPin(c) } : {}),
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
      suggestions: suggestions(req.sessionID, data, list, await reviewQueue(req.sessionID, list)),
      linked: data.linked.map(({ previousPhoto: _p, addedLink: _a, ...rest }) => rest).reverse(),
      bulk: getFromCache(req.sessionID, "profiles_bulk"),
      loginSearch: getFromCache(req.sessionID, "profiles_login_search"),
    };
  }

  // How many pinned profiles each network could read again with the login (issue #80).
  router.get("/profiles/pinned", (req: Request, res: Response) => {
    const counts: PinnedProfiles = Object.fromEntries([...pinnedProfiles(getPins(req.sessionID))].map(([network, urls]) => [network, urls.length]));
    res.send(counts);
  });

  // Sync › Sources (issue #83): the profiles linked on contacts, per network, and the oldest read with the login.
  router.get("/profiles/networks", async (req: Request, res: Response) => {
    const api = google(req, res);
    if (!api) return;
    try {
      const reads = getReads(req.sessionID);
      const byNetwork = new Map<string, Set<string>>();
      let withLinks = 0;
      for (const contact of await contacts(req, api)) {
        const links = contact.urls.map((u) => parseProfileLink(u.value)).filter((l): l is ProfileLink => Boolean(l));
        if (links.length) withLinks++;
        for (const link of links) byNetwork.set(link.network, (byNetwork.get(link.network) ?? new Set()).add(link.url));
      }
      const networks: LinkedNetworks["networks"] = {};
      for (const [network, urls] of byNetwork) {
        const oldestRead = [...urls].map((url) => reads[url]?.readAt).filter((at): at is string => Boolean(at)).sort()[0];
        networks[network] = { profiles: urls.size, ...(oldestRead ? { oldestRead } : {}) };
      }
      const body: LinkedNetworks = { contacts: withLinks, profiles: [...byNetwork.values()].reduce((n, urls) => n + urls.size, 0), networks };
      res.send(body);
    } catch (e) {
      failed(req, res, "Counting linked profiles", e);
    }
  });

  /** Contacts whose number WhatsApp knows, counted again at most every five minutes. */
  async function whatsappCount(sessionId: string, list: Contact[]): Promise<number | undefined> {
    const cached: { at: number; count: number } | undefined = getFromCache(sessionId, "whatsapp_count");
    if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.count;
    const whatsapp = await (options.whatsapp ?? connectedWhatsApp)(sessionId).catch(() => undefined);
    if (!whatsapp) return undefined;
    const count = await whatsappContacts(whatsapp, list).catch(() => undefined);
    if (count !== undefined) setInCache(sessionId, "whatsapp_count", { at: Date.now(), count });
    return count;
  }

  // The Dashboard (issue #85): the address book in three parts and what to do next, from what is stored, never asking the sites.
  router.get("/profiles/coverage", async (req: Request, res: Response) => {
    const api = google(req, res);
    if (!api) return;
    try {
      const sessionId = req.sessionID;
      const list = await contacts(req, api, req.query.refresh !== undefined);
      const data = loadProfiles(sessionId);
      const queue = await reviewQueue(sessionId, list);
      const pins = getPins(sessionId);
      const reads = getReads(sessionId);
      const scanned = storedProfilePhotos(data.people);
      const readySources = new Set<SourceId>();
      let withPhoto = 0;
      let ready = 0;
      let linkedProfiles = 0;
      let linkedContacts = 0;
      for (const contact of list) {
        const links = contact.urls.map((u) => parseProfileLink(u.value)).filter((l): l is ProfileLink => Boolean(l));
        linkedProfiles += new Set(links.map((l) => l.url)).size;
        if (links.length) linkedContacts++;
        if (contact.hasPhoto) {
          withPhoto++;
          continue;
        }
        const pin = pins[contact.id];
        const entry = queue.entries[contact.id];
        const sources: SourceId[] = [
          ...(links.some((l) => reads[l.url]?.photoUrl || scanned(l)) ? ["links" as const] : []),
          ...(pin?.hash ? [pin.source] : []),
          ...(entry?.kind === "photo" ? entry.photos.map((p) => p.source) : []),
        ];
        if (!sources.length) continue;
        ready++;
        for (const source of sources) readySources.add(source);
      }
      const cards = suggestions(sessionId, data, list, queue);
      const waiting = cards.filter((s) => s.queue?.kind !== "changed" || s.candidates.length);
      const lastSearch = Object.values(data.searches).sort().pop();
      const whatsapp = await whatsappCount(sessionId, list);
      const body: Coverage = {
        total: list.length,
        withPhoto,
        ready,
        readySources: [...readySources].sort(),
        noSource: list.length - withPhoto - ready,
        toReview: waiting.length,
        toReviewWithoutPhoto: waiting.filter((s) => !s.hasPhoto).length,
        changed: cards.filter((s) => s.queue?.kind === "changed").length,
        ...(lastSearch ? { lastSearch } : {}),
        linkedProfiles,
        linkedContacts,
        ...(whatsapp !== undefined ? { whatsapp } : {}),
      };
      res.send(body);
    } catch (e) {
      failed(req, res, "Reading the Dashboard", e);
    }
  });

  // Desktop: which sites the app is signed in to, without reading the address book (issue #80).
  router.get("/profiles/logins", async (req: Request, res: Response) => {
    res.send((await scanStates(req, loadProfiles(req.sessionID))) ?? []);
  });

  // How many contacts wait in To review, for the sidebar (issue #81); contacts without a photo are cards too (issue #104).
  router.get("/profiles/count", async (req: Request, res: Response) => {
    const data = loadProfiles(req.sessionID);
    const api = google(req, res);
    if (!api) return;
    try {
      const list = await contacts(req, api);
      res.send({ count: suggestions(req.sessionID, data, list, await reviewQueue(req.sessionID, list)).length });
    } catch (e) {
      failed(req, res, "Counting profiles to review", e);
    }
  });

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
    // Older answers first, so this one joins the right Review entry (issue #84).
    migrateReviewHistory(sessionId);
    const data = loadProfiles(sessionId);
    const notFound = () => Object.assign(new Error("not_found"), { status: 404 });
    const persons = request.personIds.map((id) => data.people.find((p) => p.id === id)).filter((p): p is SocialPerson => Boolean(p));
    if (!persons.length && !request.photoFrom && !request.link) throw notFound();
    const { contactId } = request;
    const before = toContact(await api.get(contactId), getPlaceholders(sessionId), getKeptPhotos(sessionId));
    // The photo comes from a ticked profile or one already on the contact (issue #81), one a sync sent to To review, or a link typed on the card (issue #82).
    const photoOffered = [...persons, ...linkedPeople(data)(before)].find((p) => p.id === request.photoFrom);
    const fromQueue = loadQueue(sessionId).entries[contactId]?.photos.find((p) => p.id === request.photoFrom);
    const lookup = request.link ? getLookup(sessionId, request.link) : undefined;
    if (!persons.length && !photoOffered && !fromQueue && !lookup) throw notFound();
    const added = await addContactLinks(api, contactId, [...persons.map((p) => p.url), ...(lookup ? [lookup.link.url] : [])]);
    let photoSet = false;
    let previousPhoto: string | null | undefined;
    const previousPin = getPins(sessionId)[contactId] ?? null;
    // A kept photo (issue #67) is never replaced: only the links are added.
    const photoPerson = before.photoKept ? undefined : photoOffered;
    const chosen = before.photoKept
      ? undefined
      : photoPerson
        ? // What the card showed, when the site's address for it has expired.
          { photo: (await profilePhoto(sessionId, photoPerson, true)) ?? cachedPhoto(photoPerson)?.toString("base64"), ...profilePin(photoPerson.url) }
        : fromQueue
          ? { photo: queuedImage(fromQueue), source: fromQueue.source, matchedBy: fromQueue.matchedBy, network: fromQueue.network }
          : lookup
            ? { photo: lookup.photo, ...profilePin(lookup.link.url) }
            : undefined;
    if (chosen?.photo) {
      previousPhoto = before.hasPhoto ? await api.photo(await api.get(contactId)) : null;
      const googleUrl = await api.setPhoto(contactId, chosen.photo);
      clearPlaceholder(sessionId, contactId);
      photoSet = true;
      // The photo now follows where it came from (issue #78).
      const key = photoKey(googleUrl);
      setPin(sessionId, contactId, {
        source: chosen.source,
        ...(chosen.source === "links" ? { matchedBy: chosen.matchedBy, ...(chosen.network ? { network: chosen.network } : {}) } : {}),
        hash: photoHash(chosen.photo),
        ...(key ? { photoKey: key } : {}),
        readAt: new Date().toISOString(),
      });
    }
    // Read again: a sync running meanwhile may have sent more contacts to To review.
    const latest = loadQueue(sessionId);
    // Answered: the contact leaves To review, and the photos not used there aren't offered again.
    const entry = resolveEntry(latest, contactId, photoSet && Boolean(fromQueue));
    // "Keep this" on a photo changed outside the app: it no longer follows its source.
    if (entry?.kind === "changed" && !photoSet) setPin(sessionId, contactId, undefined);
    saveQueue(sessionId, latest);
    const at = new Date().toISOString();
    const name = before.name ?? request.name ?? "";
    const people = photoSet && photoPerson && !persons.includes(photoPerson) ? [...persons, photoPerson] : persons;
    const linked = people.map(
      (person): StoredLinked => ({ contactId, name, person, at, photoSet: photoSet && person === photoPerson, addedLink: added.includes(person.url), recorded: true })
    );
    // What changed is a decision in History, where undo puts the photo, the links and the pin back (issue #84).
    const profiles = [...people.map((p) => ({ url: p.url, network: p.network as string })), ...(lookup ? [{ url: lookup.link.url, network: lookup.link.network as string }] : [])].map((p) => ({ ...p, ...(added.includes(p.url) ? { added: true } : {}) }));
    if (photoSet || added.length) {
      const result: ContactResult = {
        contactId,
        ...(name ? { name } : {}),
        outcome: photoSet ? (previousPhoto ? "replaced" : "added") : "linked",
        ...(photoSet ? { source: chosen!.source, ...(chosen!.matchedBy ? { matchedBy: chosen!.matchedBy } : {}), previousPin } : {}),
        ...(profiles.length ? { profiles } : {}),
      };
      recordDecision(sessionId, result, { photo: photoSet ? chosen!.photo : undefined, previous: previousPhoto ?? undefined }, new Date(at));
    }
    const current = loadProfiles(sessionId);
    current.linked.push(...linked);
    current.skipped = current.skipped.filter((id) => id !== contactId);
    if (request.rejectIds?.length) current.rejected[contactId] = [...new Set([...(current.rejected[contactId] ?? []), ...request.rejectIds])];
    saveProfiles(sessionId, current);
    return { linked, photoSet };
  }

  /**
   * The profile's photo: the one read with it, else the one its page shows
   * now. The desktop app reads Instagram and Facebook with the login when
   * linking (`withLogin`), never anonymously, and never LinkedIn from here
   * (a read may show as a visit).
   */
  async function profilePhoto(sessionId: string, person: SocialPerson, withLogin = false): Promise<string | null> {
    const fetchImpl = options.fetchImpl ?? fetch;
    const stored = person.photoUrl ? await downloadImage(person.photoUrl, person.network, fetchImpl).catch(() => null) : null;
    if (stored) return stored;
    const link = parseProfileLink(person.url);
    const reader = link && readsWithLogin(link.network) ? (options.loginReader ?? desktopReader)() : undefined;
    if (link && reader) {
      if (!withLogin || link.network === "linkedin") return null;
      return (await lookupWithLogin(sessionId, link as typeof link & { network: RereadNetwork }, reader, { fetchImpl, sleep: options.sleep }).catch(() => null))?.photo ?? null;
    }
    return (await lookupProfileLink(person.url, { fetchImpl }).catch(() => null))?.photo ?? null;
  }

  const strings = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").slice(0, 50) : []);
  function linkRequest(body: Record<string, unknown> | undefined): ProfileLinkRequest | undefined {
    const contactId = typeof body?.contactId === "string" && /^people\/[\w-]+$/.test(body.contactId) ? body.contactId : undefined;
    // `personId` and `usePhoto`: one profile, as before.
    const personIds = typeof body?.personId === "string" ? [body.personId] : strings(body?.personIds);
    const photoFrom = typeof body?.photoFrom === "string" ? body.photoFrom : body?.usePhoto === true ? personIds[0] : undefined;
    const link = typeof body?.link === "string" ? body.link : undefined;
    // Only a photo is a request too: from a profile on the contact (issue #81), To review or a typed link (issue #82).
    if (!contactId || (!personIds.length && !photoFrom && !link)) return undefined;
    const name = typeof body?.name === "string" ? body.name.slice(0, 120) : undefined;
    return { contactId, personIds, photoFrom, rejectIds: strings(body?.rejectIds), name, ...(link ? { link } : {}) };
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
      res.send({ linked: linked.map(publicLinked), photoWanted: Boolean(request.photoFrom || request.link), photoSet });
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
          state.profiles += linked.filter((l) => request.personIds.includes(l.person.id)).length;
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
    Kept for 90 days (photoCache.ts).
  */
  const misses = new Map<string, number>();
  router.get("/profiles/photo", async (req: Request, res: Response) => {
    const id = String(req.query.id ?? "");
    const person = loadProfiles(req.sessionID).people.find((p) => p.id === id);
    if (!person) return res.status(404).send({ error: "not_found" });
    let bytes = cachedPhoto(person);
    // A miss is tried again after ten minutes, or when the profile is read again.
    const miss = `${id} ${person.photoUrl ?? ""}`;
    if (!bytes && Date.now() - (misses.get(miss) ?? 0) > 10 * 60 * 1000) {
      // A preview: never a login read, which would run for every card shown.
      const photo = await profilePhoto(req.sessionID, person).catch(() => null);
      bytes = photo ? Buffer.from(photo, "base64") : undefined;
      if (bytes) {
        cachePhoto(person, bytes);
        misses.delete(miss);
      } else {
        misses.set(miss, Date.now());
        while (misses.size > 2000) misses.delete(misses.keys().next().value!);
      }
    }
    if (!bytes) return res.status(404).send({ error: "no_photo" });
    res.set("Cache-Control", "private, max-age=86400");
    res.type(imageType(bytes)).send(bytes);
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

  // "No photo" (issue #104): the contact leaves To review until its phones, emails or links change.
  router.post("/profiles/no-photo", async (req: Request, res: Response) => {
    if (!jsonOnly(req, res)) return;
    const api = google(req, res);
    if (!api) return;
    try {
      const contact = (await contacts(req, api)).find((c) => c.id === req.body?.contactId);
      if (!contact) return res.status(404).send({ error: "not_found" });
      const data = loadProfiles(req.sessionID);
      data.noPhoto[contact.id] = contactFingerprint(contact);
      saveProfiles(req.sessionID, data);
      const queue = loadQueue(req.sessionID);
      if (resolveEntry(queue, contact.id, false)) saveQueue(req.sessionID, queue);
      res.send({ ok: true });
    } catch (e) {
      failed(req, res, "Leaving a contact without a photo", e);
    }
  });

  router.post("/profiles/skip", (req: Request, res: Response) => {
    if (!jsonOnly(req, res)) return;
    const contactId = String(req.body?.contactId ?? "");
    const data = loadProfiles(req.sessionID);
    data.skipped = [...data.skipped.filter((id) => id !== contactId), contactId];
    saveProfiles(req.sessionID, data);
    res.send({ ok: true });
  });

  // "Keep current" (another photo) or "Keep this" (changed outside the app): the contact leaves To review (issue #82).
  router.post("/profiles/keep", (req: Request, res: Response) => {
    if (!jsonOnly(req, res)) return;
    const contactId = String(req.body?.contactId ?? "");
    const queue = loadQueue(req.sessionID);
    const entry = resolveEntry(queue, contactId, false);
    if (!entry) return res.status(404).send({ error: "not_found" });
    // Its photo no longer follows the source.
    if (entry.kind === "changed") setPin(req.sessionID, contactId, undefined);
    saveQueue(req.sessionID, queue);
    res.send({ ok: true });
  });

  // A photo a sync sent to To review.
  router.get("/profiles/queue-photo", (req: Request, res: Response) => {
    const photo = Object.values(loadQueue(req.sessionID).entries)
      .flatMap((e) => e.photos)
      .find((p) => p.id === req.query.id);
    const image = photo && queuedImage(photo);
    if (!image) return res.status(404).send({ error: "not_found" });
    const bytes = Buffer.from(image, "base64");
    res.set("Cache-Control", "private, max-age=86400");
    res.type(imageType(bytes)).send(bytes);
  });

  /*
    Searching a contact's name with the login (issue #104), desktop only:
    one card at a time, or the selected cards in the background, one search
    every 3–7 seconds per site. What is found joins the profiles, and the
    card's suggestions come from it like from a scan.
  */
  const lastLoginSearch = new Map<string, number>();
  async function searchWithLogin(sessionId: string, contact: Contact, list: Contact[], network: ScanNetwork): Promise<LoginSearchResult> {
    const key = `${sessionId}:${network}`;
    const wait = (lastLoginSearch.get(key) ?? 0) + 3000 + 4000 * Math.random() - Date.now();
    if (lastLoginSearch.has(key) && wait > 0) await (options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms))))(wait);
    lastLoginSearch.set(key, Date.now());
    const answer: { people: SocialPerson[]; stopped?: string; answer?: string } = await desktop!
      .search(network, contact.name ?? "")
      .catch((e: unknown) => ({ people: [], stopped: `error:${e instanceof Error ? e.message : String(e)}` }));
    if (answer.stopped && answer.stopped !== "notSignedIn") console.warn(`Searching ${network} stopped (${answer.stopped}): ${answer.answer ?? "no answer from the site"}`);
    const people = scannedPeople(network, answer.people, "loginSearch");
    const data = loadProfiles(sessionId);
    if (people.length) {
      mergePeople(data, people);
      saveProfiles(sessionId, data);
    }
    const ids = new Set(people.map((p) => p.id));
    const suggested = candidatesFor(contact, data.people, exclusions(data, list)).filter((c) => ids.has(c.person.id)).length;
    return { found: people.length, suggested, ...(answer.stopped ? { stopped: answer.stopped } : {}) };
  }
  const loginSearchState = (req: Request): LoginSearchState | undefined => getFromCache(req.sessionID, "profiles_login_search");

  router.post("/profiles/login-search", async (req: Request, res: Response) => {
    if (!jsonOnly(req, res)) return;
    if (!desktop) return res.status(404).send({ error: "desktop_only" });
    const network = scanNetwork(req);
    if (!network) return res.status(400).send({ error: "unsupported_network" });
    if (loginSearchState(req)?.running) return res.status(409).send({ error: "busy" });
    const api = google(req, res);
    if (!api) return;
    try {
      const list = await contacts(req, api);
      const contact = list.find((c) => c.id === req.body?.contactId);
      if (!contact?.name) return res.status(404).send({ error: "not_found" });
      res.send(await searchWithLogin(req.sessionID, contact, list, network));
    } catch (e) {
      failed(req, res, "Searching with the login", e);
    }
  });

  // The selected cards, at most 25 per run, in the background.
  router.post("/profiles/login-search/bulk", async (req: Request, res: Response) => {
    if (!jsonOnly(req, res)) return;
    if (!desktop) return res.status(404).send({ error: "desktop_only" });
    if (loginSearchState(req)?.running) return res.status(409).send({ error: "busy" });
    const asked: unknown[] = Array.isArray(req.body?.networks) ? req.body.networks : [];
    const networks = scanNetworks.filter((n) => asked.includes(n));
    const ids = new Set((Array.isArray(req.body?.contactIds) ? req.body.contactIds : []).filter((id: unknown): id is string => typeof id === "string").slice(0, 25));
    if (!networks.length || !ids.size) return res.status(400).send({ error: "invalid_request" });
    const api = google(req, res);
    if (!api) return;
    let list: Contact[];
    try {
      list = await contacts(req, api);
    } catch (e) {
      return failed(req, res, "Reading contacts", e);
    }
    const chosen = list.filter((c) => ids.has(c.id) && c.name);
    const sessionId = req.sessionID;
    const state: LoginSearchState = { running: true, networks, done: 0, total: chosen.length * networks.length, found: 0, suggested: 0 };
    setInCache(sessionId, "profiles_login_search", state);
    setInCache(sessionId, "profiles_login_search_stop", false);
    void (async () => {
      const left = new Set(networks);
      for (const contact of chosen) {
        for (const network of networks) {
          if (getFromCache(sessionId, "profiles_login_search_stop") === true) break;
          if (left.has(network)) {
            const result = await searchWithLogin(sessionId, contact, list, network);
            state.found += result.found;
            state.suggested += result.suggested;
            // A limit or a sign-in page: that site rests for the rest of the run.
            if (result.stopped && !result.stopped.startsWith("error:")) {
              left.delete(network);
              state.stopped = [...(state.stopped ?? []), `${result.stopped}:${network}`];
            }
          }
          state.done++;
        }
      }
      state.running = false;
    })().catch((e) => Object.assign(state, { running: false, stopped: [...(state.stopped ?? []), `error:${String((e as Error)?.message ?? e)}`] }));
    res.send(state);
  });

  router.post("/profiles/login-search/stop", (req: Request, res: Response) => {
    setInCache(req.sessionID, "profiles_login_search_stop", true);
    res.send(loginSearchState(req) ?? { running: false, networks: [], done: 0, total: 0, found: 0, suggested: 0 });
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
