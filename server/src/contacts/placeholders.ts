import fs from "fs";
import path from "path";

import { getFromCache, setInCache } from "../cache";
import { photoKey } from "./model";

/*
  Photos uploaded by hand on the Contacts page are placeholders (issue #55):
  a sync replaces them as soon as a source has a real photo. What's kept is
  the address Google gave the uploaded photo, so a photo changed since, in
  the app or anywhere else, is no longer taken for the placeholder.
*/

function file(): string | undefined {
  return process.env.SCS_DESKTOP === "1" && process.env.SCS_DATA_DIR ? path.join(process.env.SCS_DATA_DIR, "placeholders.json") : undefined;
}

/** Contact → photo address of its placeholder. */
export function getPlaceholders(sessionId: string): Record<string, string> {
  const f = file();
  if (!f) return { ...getFromCache(sessionId, "placeholders") };
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return {};
  }
}

function save(sessionId: string, placeholders: Record<string, string>): void {
  const f = file();
  if (!f) return setInCache(sessionId, "placeholders", placeholders);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(`${f}.tmp`, JSON.stringify(placeholders, null, 2));
  fs.renameSync(`${f}.tmp`, f);
}

export function markPlaceholder(sessionId: string, contactId: string, photoUrl: string | undefined): void {
  const key = photoKey(photoUrl);
  const placeholders = getPlaceholders(sessionId);
  if (key) placeholders[contactId] = key;
  else delete placeholders[contactId];
  save(sessionId, placeholders);
}

export function clearPlaceholder(sessionId: string, contactId: string): void {
  const placeholders = getPlaceholders(sessionId);
  if (!(contactId in placeholders)) return;
  delete placeholders[contactId];
  save(sessionId, placeholders);
}

export function isPlaceholder(placeholders: Record<string, string>, contactId: string, photoUrl: string | undefined): boolean {
  return Boolean(photoUrl && placeholders[contactId] && placeholders[contactId] === photoKey(photoUrl));
}

/** Forgets placeholders whose contact is gone or whose photo has changed. */
export function prunePlaceholders(sessionId: string, photos: Map<string, string | undefined>): void {
  const placeholders = getPlaceholders(sessionId);
  const kept = Object.fromEntries(Object.entries(placeholders).filter(([id, key]) => photos.has(id) && photoKey(photos.get(id)) === key));
  if (Object.keys(kept).length !== Object.keys(placeholders).length) save(sessionId, kept);
}
