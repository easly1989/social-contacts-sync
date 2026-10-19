import fs from "fs";
import path from "path";

import { QueueEntry, QueuePhoto, SourceId } from "../../../interfaces/api";
import { getFromCache, setInCache } from "../cache";
import { photoKey } from "../contacts/model";
import { photoHash } from "../contacts/photoPins";
import { photoFacts } from "../photoRules";
import { FoundPhoto } from "../sources/types";
import { readVersion, staleFacebook } from "./rereads";
import { Base64 } from "../types";
import { cachedPhoto, cachePhoto } from "./photoCache";

/*
  The photos a sync sends to Sync's To review (issue #82), per contact, and
  the photos the user turned down there. The desktop app keeps them in
  review-queue.json in the data folder; the web version per session. The
  images are in the review photo cache, kept 90 days like the entries.
*/

const retentionDays = 90;

export interface StoredPhoto extends QueuePhoto {
  hash: string;
  version?: number;
  /** Its look (photoRules.ts), checked again when To review is read. */
  visual?: string;
  /** Read from the site's public page, without the login. */
  anonymous?: boolean;
}

export interface StoredEntry extends QueueEntry {
  name?: string;
  photos: StoredPhoto[];
  /** The look of the contact's photo when it was read, and that photo's address without the size (photoKey). */
  current?: { key?: string; visual?: string };
}

export interface QueueData {
  entries: Record<string, StoredEntry>;
  /** Contact → hashes of photos turned down ("Keep current"): a sync doesn't offer them again. */
  dismissed: Record<string, string[]>;
  /** Photos applied from To review before issue #84, with the photo each replaced (in the photo cache): they become Review entries in History once. */
  applied?: { contactId: string; at: string; source: SourceId; matchedBy?: string; previous?: string; link?: string }[];
}

const empty = (): QueueData => ({ entries: {}, dismissed: {} });

function file(): string | undefined {
  return process.env.SCS_DESKTOP === "1" && process.env.SCS_DATA_DIR ? path.join(process.env.SCS_DATA_DIR, "review-queue.json") : undefined;
}

export function loadQueue(sessionId: string, now = Date.now()): QueueData {
  const f = file();
  let data: QueueData;
  if (!f) data = getFromCache(sessionId, "review_queue") ?? empty();
  else {
    try {
      data = { ...empty(), ...JSON.parse(fs.readFileSync(f, "utf8")) };
    } catch {
      data = empty();
    }
  }
  // Older entries have lost their photos: they leave the queue.
  for (const [id, entry] of Object.entries(data.entries)) {
    if (now - Date.parse(entry.addedAt) > retentionDays * 86_400_000) delete data.entries[id];
    // Facebook photos queued before the fix are blurred: the next sync reads them again.
    else entry.photos = entry.photos.filter((p) => !(p.source === "links" && p.matchedBy && staleFacebook(`https://${p.matchedBy}`, p.version)));
  }
  return data;
}

export function saveQueue(sessionId: string, data: QueueData): void {
  const f = file();
  if (!f) return setInCache(sessionId, "review_queue", data);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(`${f}.tmp`, JSON.stringify(data));
  fs.renameSync(`${f}.tmp`, f);
}

const photoId = (hash: string) => `photo:${hash}`;

/** Sends a contact's photos to To review, in place of what was waiting for it. */
export function queuePhotos(
  sessionId: string,
  contact: { id: string; name?: string; photoUrl?: string },
  kind: QueueEntry["kind"],
  found: FoundPhoto[],
  pinned?: QueueEntry["pinned"],
  current?: string
): void {
  const at = new Date().toISOString();
  const photos = found.map((f): StoredPhoto => {
    const hash = photoHash(f.photo);
    cachePhoto({ id: photoId(hash) }, Buffer.from(f.photo, "base64"));
    const facts = { width: f.width, height: f.height, visual: f.visual, small: f.small, anonymous: f.anonymous };
    const known = Object.fromEntries(Object.entries(facts).filter(([, v]) => v !== undefined));
    return { id: photoId(hash), hash, source: f.source, matchedBy: f.matchedBy, ...(f.network ? { network: f.network } : {}), readAt: at, version: readVersion, ...known };
  });
  const data = loadQueue(sessionId);
  const key = photoKey(contact.photoUrl);
  data.entries[contact.id] = { kind, name: contact.name, photos, ...(pinned ? { pinned } : {}), ...(current ? { current: { key, visual: current } } : {}), addedAt: at };
  saveQueue(sessionId, data);
}

/** A waiting photo's image, by its id. */
export function queuedImage(photo: QueuePhoto): Base64 | undefined {
  return cachedPhoto({ id: photo.id })?.toString("base64");
}

/** What a card shows: the entry without the hashes. */
export function publicEntry({ name: _name, photos, current: _current, ...entry }: StoredEntry): QueueEntry {
  return { ...entry, photos: photos.map(({ hash: _hash, version: _version, visual: _visual, anonymous: _anonymous, ...photo }) => photo) };
}

/**
 * The contact leaves To review. Its photos were turned down unless one was
 * used: a sync won't offer them again.
 */
export function resolveEntry(data: QueueData, contactId: string, used: boolean): StoredEntry | undefined {
  const entry = data.entries[contactId];
  if (!entry) return undefined;
  delete data.entries[contactId];
  if (!used && entry.kind === "photo") data.dismissed[contactId] = [...new Set([...(data.dismissed[contactId] ?? []), ...entry.photos.map((p) => p.hash)])];
  return entry;
}

/** The look of a contact's photo, read from its address; undefined when it can't be read. */
export type ReadLook = (photoUrl: string) => Promise<string | undefined>;

export const readLook: ReadLook = async (photoUrl) => {
  const response = await fetch(photoUrl, { signal: AbortSignal.timeout(15_000) }).catch(() => undefined);
  return response?.ok ? photoFacts(Buffer.from(await response.arrayBuffer())).visual : undefined;
};

/**
 * The queue with what To review's rules need (issue #104) filled in where
 * an older sync left it out: each photo's size and look, from the photo
 * cache, and the look of each contact's photo, read once per photo the
 * contact has. Saved, so the next read is quick.
 */
export async function checkedQueue(sessionId: string, contacts: { id: string; photoUrl?: string; hasPhoto: boolean; placeholder?: boolean }[], look: ReadLook = readLook): Promise<QueueData> {
  const data = loadQueue(sessionId);
  const byId = new Map(contacts.map((c) => [c.id, c]));
  // null: the image is gone from the cache, so the photo can't be shown any more.
  const facts = new Map<string, Partial<StoredPhoto> | null>();
  const wanted: [string, string, string][] = [];
  for (const [id, entry] of Object.entries(data.entries)) {
    if (entry.kind !== "photo") continue;
    for (const p of entry.photos) {
      if (p.version !== undefined || facts.has(p.id)) continue;
      const bytes = cachedPhoto({ id: p.id });
      facts.set(p.id, bytes ? photoFacts(bytes) : null);
    }
    const contact = byId.get(id);
    const key = photoKey(contact?.photoUrl);
    if (contact?.photoUrl && key && contact.hasPhoto && !contact.placeholder && entry.current?.key !== key) wanted.push([id, key, contact.photoUrl]);
  }
  const looks = new Map<string, StoredEntry["current"]>();
  // A few at a time: the first read after an update may have hundreds to do.
  for (let i = 0; i < wanted.length; i += 8) {
    await Promise.all(wanted.slice(i, i + 8).map(async ([id, key, url]) => looks.set(id, { key, visual: await look(url).catch(() => undefined) })));
  }
  if (!facts.size && !looks.size) return data;
  // A sync may have changed the queue meanwhile: these go onto the latest one.
  const latest = loadQueue(sessionId);
  for (const [id, entry] of Object.entries(latest.entries)) {
    entry.photos = entry.photos.filter((p) => !(p.version === undefined && facts.get(p.id) === null));
    for (const p of entry.photos) if (p.version === undefined && facts.has(p.id)) Object.assign(p, facts.get(p.id), { version: readVersion });
    if (looks.has(id)) entry.current = looks.get(id);
  }
  saveQueue(sessionId, latest);
  return latest;
}
