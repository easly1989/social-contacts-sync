import fs from "fs";
import path from "path";

import { QueueEntry, QueuePhoto, SourceId } from "../../../interfaces/api";
import { getFromCache, setInCache } from "../cache";
import { photoHash } from "../contacts/photoPins";
import { FoundPhoto } from "../sources/types";
import { Base64 } from "../types";
import { cachedPhoto, cachePhoto } from "./photoCache";

/*
  The photos a sync sends to Sync's To review (issue #82), per contact, and
  the photos the user turned down there. The desktop app keeps them in
  review-queue.json in the data folder; the web version per session. The
  images are in the review photo cache, kept 90 days like the entries.
*/

const retentionDays = 90;

interface StoredPhoto extends QueuePhoto {
  hash: string;
}

export interface StoredEntry extends QueueEntry {
  name?: string;
  photos: StoredPhoto[];
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
  for (const [id, entry] of Object.entries(data.entries)) if (now - Date.parse(entry.addedAt) > retentionDays * 86_400_000) delete data.entries[id];
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
export function queuePhotos(sessionId: string, contact: { id: string; name?: string }, kind: QueueEntry["kind"], found: FoundPhoto[], pinned?: QueueEntry["pinned"]): void {
  const at = new Date().toISOString();
  const photos = found.map((f): StoredPhoto => {
    const hash = photoHash(f.photo);
    cachePhoto({ id: photoId(hash) }, Buffer.from(f.photo, "base64"));
    return { id: photoId(hash), hash, source: f.source, matchedBy: f.matchedBy, ...(f.network ? { network: f.network } : {}), readAt: at };
  });
  const data = loadQueue(sessionId);
  data.entries[contact.id] = { kind, name: contact.name, photos, ...(pinned ? { pinned } : {}), addedAt: at };
  saveQueue(sessionId, data);
}

/** A waiting photo's image, by its id. */
export function queuedImage(photo: QueuePhoto): Base64 | undefined {
  return cachedPhoto({ id: photo.id })?.toString("base64");
}

/** What a card shows: the entry without the hashes. */
export function publicEntry({ name: _name, photos, ...entry }: StoredEntry): QueueEntry {
  return { ...entry, photos: photos.map(({ hash: _hash, ...photo }) => photo) };
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
