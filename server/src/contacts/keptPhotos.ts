import fs from "fs";
import path from "path";

import { getFromCache, setInCache } from "../cache";

/*
  Kept photos (issue #67): contacts whose photo the app never replaces, not
  in a sync (whatever the mode) and not from Find profiles. Links to
  WhatsApp and to social profiles still work for them.
*/

function file(): string | undefined {
  return process.env.SCS_DESKTOP === "1" && process.env.SCS_DATA_DIR ? path.join(process.env.SCS_DATA_DIR, "kept-photos.json") : undefined;
}

export function getKeptPhotos(sessionId: string): Set<string> {
  const f = file();
  if (!f) return new Set((getFromCache(sessionId, "kept_photos") as string[] | undefined) ?? []);
  try {
    const ids = JSON.parse(fs.readFileSync(f, "utf8"));
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

export function setKeptPhoto(sessionId: string, contactId: string, kept: boolean): void {
  const ids = getKeptPhotos(sessionId);
  if (kept === ids.has(contactId)) return;
  if (kept) ids.add(contactId);
  else ids.delete(contactId);
  const f = file();
  if (!f) return setInCache(sessionId, "kept_photos", [...ids]);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(`${f}.tmp`, JSON.stringify([...ids].sort(), null, 2));
  fs.renameSync(`${f}.tmp`, f);
}
