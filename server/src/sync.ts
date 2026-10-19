import WebSocket from "ws";
import { RateLimiter } from "limiter";
import { Client } from "whatsapp-web.js";

import { EventType, PhotoPin, RunOptions, SourceId, SyncOptions } from "../../interfaces/api";
import { downloadContactPhoto, listContacts, OAuth2Client, updateContactPhoto } from "./gapi";
import { sendEvent } from "./ws";
import { deleteFromCache, getFromCache, setInCache } from "./cache";
import { defaultRunOptions, runSync } from "./syncEngine";
import { saveRun } from "./runs";
import { PhotoSource } from "./sources/types";
import { whatsappSource } from "./sources/whatsapp";
import { gravatarSource } from "./sources/gravatar";
import { telegramSource } from "./sources/telegram";
import { linksSource, LinksSourceOptions, Network, networkNames, publicNetworks } from "./sources/links";
import { loadProfiles, saveProfiles, storedProfilePhotos } from "./profiles/store";
import { TelegramConnection } from "./telegram";
import { telegramConnection } from "./telegramSession";
import { getPrefs } from "./cleanup/store";
import { inferRegion, toE164Digits } from "./phone";
import { SimpleContact } from "./interfaces";
import { getPlaceholders, isPlaceholder } from "./contacts/placeholders";
import { getKeptPhotos } from "./contacts/keptPhotos";
import { getPins, setPin } from "./contacts/photoPins";
import { defaultRereadCap, getReads, planRereads, rereading, rereadNetworks, saveReads } from "./profiles/rereads";
import { askDesktop } from "./desktop";
import { loadQueue, queuePhotos } from "./profiles/queue";

/** Marks the contacts whose photo is a placeholder, or kept, from the Contacts page, and the source each photo follows. */
export function withPlaceholders(
  contacts: SimpleContact[],
  placeholders: Record<string, string>,
  kept: Set<string> = new Set(),
  pins: Record<string, PhotoPin> = {}
): SimpleContact[] {
  return contacts.map((c) => {
    const marked = c.hasPhoto && kept.has(c.id) ? { ...c, photoKept: true } : isPlaceholder(placeholders, c.id, c.photoUrl) ? { ...c, placeholder: true } : c;
    return pins[c.id] ? { ...marked, pin: pins[c.id] } : marked;
  });
}

const knownSources: SourceId[] = ["whatsapp", "telegram", "gravatar", "links"];

// Google allows about 60 photo uploads per minute per user; stay below it.
export function googleRateLimiter(): RateLimiter {
  return new RateLimiter({ tokensPerInterval: 1, interval: 1500 });
}

/** What the run does (issue #82): each option as asked, else its default. */
export function runOptions(options: SyncOptions): RunOptions {
  const flag = (value: string | undefined, fallback: boolean) => (value === undefined ? fallback : value === "true");
  return {
    fillMissing: flag(options.fill_missing, defaultRunOptions.fillMissing),
    updatePinned: flag(options.update_pinned, defaultRunOptions.updatePinned),
    lookDifferent: flag(options.look_different, defaultRunOptions.lookDifferent),
    decideAll: flag(options.decide_all, defaultRunOptions.decideAll),
  };
}

/** Profiles read with the login per network and sync: the Run tab's choice, else the environment, else 100. */
export function readsCap(options: SyncOptions): number {
  const asked = Number(options.reads_cap);
  if (Number.isInteger(asked) && asked > 0) return Math.min(asked, 1000);
  return Number(process.env.SCS_PROFILE_READS) || defaultRereadCap;
}

/** The profile link networks turned on in Sync › Sources (issue #83), else the public ones. */
export function linkNetworks(options: SyncOptions): Set<Network> {
  if (options.link_networks === undefined) return new Set(publicNetworks);
  return new Set(options.link_networks.split(",").map((n) => n.trim() as Network).filter((n) => n in networkNames));
}

/** Sources asked for, in priority order, that are usable in this session. */
export function requestedSources(
  options: SyncOptions,
  whatsapp: Client | undefined,
  telegram?: TelegramConnection,
  storedPhoto?: LinksSourceOptions["storedPhoto"]
): PhotoSource[] {
  const ids = (options.sources ?? "whatsapp")
    .split(",")
    .map((s) => s.trim())
    .filter((s, i, all): s is SourceId => knownSources.includes(s as SourceId) && all.indexOf(s) === i);
  return ids.flatMap((id) => {
    if (id === "whatsapp") return whatsapp ? [whatsappSource(whatsapp)] : [];
    if (id === "telegram") return telegram ? [telegramSource(telegram)] : [];
    // The desktop app reads Instagram, Facebook and LinkedIn with the login only: never as an anonymous visitor.
    if (id === "links") return [linksSource({ networks: linkNetworks(options), bestEffort: process.env.SCS_DESKTOP !== "1", storedPhoto })];
    return [gravatarSource()];
  });
}

/**
 * Numbers marked as shared in Clean up belong to several people, so no
 * photo is matched through them.
 */
export function withoutSharedNumbers(contacts: SimpleContact[], shared: string[], region?: Parameters<typeof toE164Digits>[1]): SimpleContact[] {
  if (!shared.length) return contacts;
  const skip = new Set(shared.map((n) => n.replace(/\D/g, "")));
  return contacts.map((c) => ({ ...c, numbers: c.numbers.filter((n) => !skip.has(toE164Digits(n, region) ?? n.replace(/\D/g, ""))) }));
}

export async function initSync(id: string, syncOptions: SyncOptions) {
  const ws: WebSocket = getFromCache(id, "ws");
  const whatsappClient: Client | undefined = getFromCache(id, "whatsapp");
  const gAuth: OAuth2Client = getFromCache(id, "gauth");
  const limiter = googleRateLimiter();
  const run = runOptions(syncOptions);
  setInCache(id, "sync_stop", false);
  // Cards skipped in To review come back with this sync's.
  const profiles = loadProfiles(id);
  if (profiles.skipped.length) saveProfiles(id, { ...profiles, skipped: [] });

  // A profile read with the login (issues #79, #80) comes before the address a scan read.
  const reads = getReads(id);
  const scanned = storedProfilePhotos(loadProfiles(id).people);
  const desktop = process.env.SCS_DESKTOP === "1";
  const networks = linkNetworks(syncOptions);
  let sources = requestedSources(syncOptions, whatsappClient, telegramConnection(id), (link) => reads[link.url]?.photoUrl ?? scanned(link));
  const rereads =
    desktop && sources.some((s) => s.id === "links")
      ? rereading(
          sources.find((s) => s.id === "links")!,
          planRereads(
            getPins(id),
            reads,
            readsCap(syncOptions),
            // A LinkedIn read may show as a profile visit: only while the setting is on (issue #80).
            rereadNetworks.filter((n) => networks.has(n) && (n !== "linkedin" || syncOptions.linkedin_rereads !== "false"))
          ),
          (network, handle) => askDesktop("social-profile", { network, handle }, 60_000),
          {
            record: (url, read) => {
              reads[url] = read;
              saveReads(id, reads);
            },
          }
        )
      : undefined;
  if (rereads) sources = sources.map((s) => (s.id === "links" ? rereads.source : s));

  // Stop when asked to, or when the page went away.
  const cancelled = () => getFromCache(id, "sync_stop") === true || ws.readyState !== WebSocket.OPEN;
  const queue = loadQueue(id);

  try {
    // Phase 1 (issue #82): the pinned profiles first, so their photos are fresh for phase 2.
    await rereads?.readPlanned((reads) => sendEvent(ws, EventType.SyncProgress, { progress: 0, syncCount: 0, phase: "profiles", reads }), cancelled);
    const result = await runSync(
      {
        listContacts: async () =>
          withPlaceholders(
            withoutSharedNumbers(await listContacts(gAuth), getPrefs(id).sharedNumbers, inferRegion(whatsappClient?.info?.wid?.user)),
            getPlaceholders(id),
            getKeptPhotos(id),
            getPins(id)
          ).map((c) => (queue.dismissed[c.id] ? { ...c, dismissed: queue.dismissed[c.id] } : c)),
        currentPhoto: downloadContactPhoto,
        setPhoto: (contactId, photo) => updateContactPhoto(gAuth, contactId, photo),
        savePin: (contactId, pin) => setPin(id, contactId, pin),
        queue: (contact, kind, found, current) =>
          queuePhotos(id, contact, kind, found, kind === "changed" && contact.pin ? { source: contact.pin.source, network: contact.pin.network, matchedBy: contact.pin.matchedBy } : undefined, current),
      },
      sources,
      run,
      {
        progress: (update) => sendEvent(ws, EventType.SyncProgress, update),
        cancelled,
        beforeWrite: async () => void (await limiter.removeTokens(1)),
      }
    );
    if (rereads) result.run.profileReads = rereads.report();
    saveRun(id, result);
    // The dashboard's photo coverage is out of date now.
    deleteFromCache(id, "google_stats");
    sendEvent(ws, EventType.SyncProgress, {
      progress: 100,
      syncCount: result.run.counters.added + result.run.counters.replaced,
      totalContacts: result.run.totalContacts,
      checked: result.run.results.length,
      counters: result.run.counters,
      runId: result.run.id,
      cancelled: result.run.cancelled,
    });
  } catch (e) {
    // Loading the contacts (Google or a source) failed before anything changed.
    console.error(e);
    if (ws.readyState === WebSocket.OPEN) {
      sendEvent(ws, EventType.SyncProgress, {
        progress: 0,
        syncCount: 0,
        error: "Failed to load contacts, please try again.",
      });
    }
    return;
  }

  ws.close();
}
