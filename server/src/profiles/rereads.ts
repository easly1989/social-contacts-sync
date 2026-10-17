import fs from "fs";
import path from "path";

import { PhotoPin, ProfileReadsReport } from "../../../interfaces/api";
import { getFromCache, setInCache } from "../cache";
import { parseProfileLink, ProfileLink } from "../sources/links";
import { PhotoSource } from "../sources/types";

/*
  Pinned Instagram and Facebook profiles read again (issue #79): in the
  desktop app a sync asks for each one's photo address with the user's own
  login, one profile every few seconds, the ones read longest ago first, up
  to a cap per network. A network stops at its first limit or sign-in page;
  the rest wait for the next sync. What was read is kept in
  profile-reads.json, and the links source uses it before the address a
  scan read.
*/

export type RereadNetwork = "instagram" | "facebook";
const rereadNetworks: readonly string[] = ["instagram", "facebook"];

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
}

/** Which pinned profiles this sync reads again: per network, those read longest ago (never read first), up to the cap. */
export function planRereads(pins: Record<string, PhotoPin>, reads: Record<string, StoredRead>, cap: number): RereadPlan {
  const byNetwork = new Map<RereadNetwork, string[]>();
  for (const pin of Object.values(pins)) {
    if (pin.source !== "links" || !pin.matchedBy || pin.suspended) continue;
    const link = parseProfileLink(`https://${pin.matchedBy}`);
    if (!link || !rereadNetworks.includes(link.network)) continue;
    const urls = byNetwork.get(link.network as RereadNetwork) ?? [];
    if (!urls.includes(link.url)) urls.push(link.url);
    byNetwork.set(link.network as RereadNetwork, urls);
  }
  const plan: RereadPlan = { selected: new Set(), waiting: {} };
  for (const [network, urls] of byNetwork) {
    urls.sort((a, b) => (reads[a]?.readAt ?? "").localeCompare(reads[b]?.readAt ?? ""));
    for (const url of urls.slice(0, cap)) plan.selected.add(url);
    plan.waiting[network] = Math.max(0, urls.length - cap);
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
 * The links source, reading each planned profile again before its photo is
 * looked up, 3–7 seconds after the previous read.
 */
export function rereading(inner: PhotoSource, plan: RereadPlan, read: ReadProfile, options: RereadOptions): { source: PhotoSource; report(): RunReads } {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const random = options.random ?? Math.random;
  const done = new Set<string>();
  const stats: RunReads = {};
  let last = 0;

  async function reread(link: ProfileLink): Promise<void> {
    const network = link.network as RereadNetwork;
    if (!plan.selected.has(link.url) || done.has(link.url) || stats[network]?.stopped) return;
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
      for (const network of ["instagram", "facebook"] as const) {
        const planned = [...plan.selected].filter((url) => parseProfileLink(url)?.network === network);
        const entry = stats[network];
        // After a stop, the planned profiles not read wait for the next sync.
        const notReached = entry?.stopped ? planned.filter((url) => !done.has(url)).length + 1 : 0;
        const waiting = (plan.waiting[network] ?? 0) + notReached;
        if (entry || waiting) report[network] = { read: entry?.read ?? 0, waiting, ...(entry?.stopped ? { stopped: entry.stopped } : {}) };
      }
      return report;
    },
  };
}

export type RunReads = Partial<Record<RereadNetwork, ProfileReadsReport>>;
