import fs from "fs";
import path from "path";

import { PhotoPin, ProfileReadsReport } from "../../../interfaces/api";
import { getFromCache, setInCache } from "../cache";
import { askDesktop } from "../desktop";
import { downloadImage, LinkBlockedError, LinkPhoto, parseProfileLink, ProfileLink } from "../sources/links";
import { PhotoSource } from "../sources/types";

/*
  Pinned Instagram, Facebook and LinkedIn profiles read again (issues #79
  and #80; LinkedIn only when the user leaves it on): in the
  desktop app a sync asks for each one's photo address with the user's own
  login, one profile every few seconds, the ones read longest ago first, up
  to a cap per network. A network stops at its first limit or sign-in page;
  the rest wait for the next sync. What was read is kept in
  profile-reads.json, and the links source uses it before the address a
  scan read.
*/

export type RereadNetwork = "instagram" | "facebook" | "linkedin";
export const rereadNetworks: readonly RereadNetwork[] = ["instagram", "facebook", "linkedin"];

/** Profiles read again per network and sync unless the environment says otherwise. */
export const defaultRereadCap = 100;

export interface StoredRead {
  name?: string;
  photoUrl?: string;
  readAt: string;
}

export type ReadProfile = (network: RereadNetwork, handle: string) => Promise<{ profile?: { name?: string; photoUrl?: string }; missing?: boolean; stopped?: string }>;

function file(): string | undefined {
  return process.env.SCS_DESKTOP === "1" && process.env.SCS_DATA_DIR ? path.join(process.env.SCS_DATA_DIR, "profile-reads.json") : undefined;
}

/** Profile address → what was read there last. */
export function getReads(sessionId: string): Record<string, StoredRead> {
  const f = file();
  if (!f) return getFromCache(sessionId, "profile_reads") ?? {};
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return {};
  }
}

export function saveReads(sessionId: string, reads: Record<string, StoredRead>): void {
  const f = file();
  if (!f) return setInCache(sessionId, "profile_reads", reads);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(`${f}.tmp`, JSON.stringify(reads));
  fs.renameSync(`${f}.tmp`, f);
}

export interface RereadPlan {
  /** Profile addresses this sync reads again. */
  selected: Set<string>;
  /** Per network, how many are left over the cap. */
  waiting: Partial<Record<RereadNetwork, number>>;
  /** Per network the sync reads with the login, what the cap leaves for links that aren't pinned. */
  spare: Partial<Record<RereadNetwork, number>>;
}

/** Pinned profiles that can be read with the login, by network (suspended pins aren't followed). */
export function pinnedProfiles(pins: Record<string, PhotoPin>, networks: readonly RereadNetwork[] = rereadNetworks): Map<RereadNetwork, string[]> {
  const byNetwork = new Map<RereadNetwork, string[]>();
  for (const pin of Object.values(pins)) {
    if (pin.source !== "links" || !pin.matchedBy || pin.suspended) continue;
    const link = parseProfileLink(`https://${pin.matchedBy}`);
    if (!link || !networks.includes(link.network as RereadNetwork)) continue;
    const urls = byNetwork.get(link.network as RereadNetwork) ?? [];
    if (!urls.includes(link.url)) urls.push(link.url);
    byNetwork.set(link.network as RereadNetwork, urls);
  }
  return byNetwork;
}

/**
 * Which profiles this sync reads with the login: per network the pinned
 * ones first, those read longest ago (never read first) up to the cap; what
 * the cap leaves goes to other links as the sync meets them.
 */
export function planRereads(pins: Record<string, PhotoPin>, reads: Record<string, StoredRead>, cap: number, networks: readonly RereadNetwork[] = rereadNetworks): RereadPlan {
  const byNetwork = pinnedProfiles(pins, networks);
  const plan: RereadPlan = { selected: new Set(), waiting: {}, spare: {} };
  for (const network of networks) {
    const urls = byNetwork.get(network) ?? [];
    urls.sort((a, b) => (reads[a]?.readAt ?? "").localeCompare(reads[b]?.readAt ?? ""));
    for (const url of urls.slice(0, cap)) plan.selected.add(url);
    if (urls.length) plan.waiting[network] = Math.max(0, urls.length - cap);
    plan.spare[network] = Math.max(0, cap - urls.length);
  }
  return plan;
}

export interface RereadOptions {
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** A profile read: kept for the next lookups and syncs. */
  record: (url: string, read: StoredRead) => void;
}

/**
 * The links source, reading each profile in the plan with the login before
 * its photo is looked up, 3–7 seconds after the previous read.
 */
export function rereading(inner: PhotoSource, plan: RereadPlan, read: ReadProfile, options: RereadOptions): { source: PhotoSource; report(): RunReads } {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const random = options.random ?? Math.random;
  const done = new Set<string>();
  const readOk = new Set<string>();
  const spare = { ...plan.spare };
  const stats: RunReads = {};
  let last = 0;

  async function reread(link: ProfileLink): Promise<void> {
    const network = link.network as RereadNetwork;
    if (done.has(link.url) || stats[network]?.stopped) return;
    if (!plan.selected.has(link.url)) {
      // A link that isn't pinned: read while the cap leaves room.
      if (!spare[network]) return;
      spare[network]!--;
    }
    done.add(link.url);
    const entry = (stats[network] ??= { read: 0, waiting: 0 });
    const wait = last + 3000 + 4000 * random() - Date.now();
    if (last && wait > 0) await sleep(wait);
    const answer = await read(network, link.handle).catch((e: unknown) => ({ stopped: `error:${e instanceof Error ? e.message : String(e)}` }) as Awaited<ReturnType<ReadProfile>>);
    last = Date.now();
    if (answer.stopped) {
      entry.stopped = answer.stopped;
      return;
    }
    entry.read++;
    readOk.add(link.url);
    // A missing profile is recorded too, so it waits its turn like the others.
    options.record(link.url, { ...answer.profile, readAt: new Date().toISOString() });
  }

  async function rereadAll(urls: string[] = []): Promise<void> {
    for (const url of urls) {
      const link = parseProfileLink(url);
      if (link) await reread(link);
    }
  }

  return {
    source: {
      ...inner,
      find: async (contact) => (await rereadAll(contact.urls), inner.find(contact)),
      ...(inner.findAll ? { findAll: async (contact) => (await rereadAll(contact.urls), inner.findAll!(contact)) } : {}),
    },
    report() {
      const report: RunReads = {};
      for (const network of rereadNetworks) {
        const planned = [...plan.selected].filter((url) => parseProfileLink(url)?.network === network);
        const entry = stats[network];
        // After a stop, the pinned profiles not read wait for the next sync.
        const notReached = entry?.stopped ? planned.filter((url) => !readOk.has(url)).length : 0;
        const waiting = (plan.waiting[network] ?? 0) + notReached;
        if (entry || waiting) report[network] = { read: entry?.read ?? 0, waiting, ...(entry?.stopped ? { stopped: entry.stopped } : {}) };
      }
      return report;
    },
  };
}

export type RunReads = Partial<Record<RereadNetwork, ProfileReadsReport>>;

/** Whether the desktop app reads this network with the login (never anonymously). */
export const readsWithLogin = (network: string): network is RereadNetwork => rereadNetworks.includes(network as RereadNetwork);

/** The desktop app's reader, or undefined in the web version, which has no login reads. */
export function desktopReader(): ReadProfile | undefined {
  return process.env.SCS_DESKTOP === "1" ? (network, handle) => askDesktop("social-profile", { network, handle }, 60_000) : undefined;
}

/** The app has no login for the site, or the site wants it again. */
export class LoginNeededError extends Error {
  constructor(public network: RereadNetwork) {
    super(`No login for ${network}`);
  }
}

// One lookup by hand every 3–7 seconds per session and site; after a limit or sign-in page the site rests a while.
const lastLookup = new Map<string, number>();
const restingUntil = new Map<string, number>();
const rest = 30 * 60 * 1000;

/**
 * A link's photo read with the login (the explicit "Find photo", and
 * linking in Find profiles): recorded like a sync's reads.
 */
export async function lookupWithLogin(
  sessionId: string,
  link: ProfileLink & { network: RereadNetwork },
  read: ReadProfile,
  options: { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; random?: () => number; now?: () => number } = {}
): Promise<LinkPhoto | null> {
  const now = options.now ?? Date.now;
  const key = `${sessionId}:${link.network}`;
  if ((restingUntil.get(key) ?? 0) > now()) throw new LinkBlockedError(link.network);
  const wait = (lastLookup.get(key) ?? 0) + 3000 + 4000 * (options.random ?? Math.random)() - now();
  if (lastLookup.has(key) && wait > 0) await (options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))))(wait);
  lastLookup.set(key, now());
  const answer = await read(link.network, link.handle);
  if (answer.stopped === "notSignedIn") throw new LoginNeededError(link.network);
  if (answer.stopped === "signin" || answer.stopped === "limited") {
    restingUntil.set(key, now() + rest);
    if (answer.stopped === "signin") throw new LoginNeededError(link.network);
    throw new LinkBlockedError(link.network);
  }
  if (answer.stopped) throw new Error(`Reading ${link.url} stopped: ${answer.stopped}`);
  const reads = getReads(sessionId);
  reads[link.url] = { ...answer.profile, readAt: new Date(now()).toISOString() };
  saveReads(sessionId, reads);
  const photo = answer.profile?.photoUrl ? await downloadImage(answer.profile.photoUrl, link.network, options.fetchImpl) : null;
  return photo ? { photo, link } : null;
}
