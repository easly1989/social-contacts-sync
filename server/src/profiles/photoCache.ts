import crypto from "crypto";
import fs from "fs";
import path from "path";

/*
  The photos shown on review cards (issue #81), so a card still shows its
  photo after the site's address for it expired, and confirming applies the
  photo the user saw. The desktop app keeps them in review-photos/ in its
  data folder for 90 days; the web server keeps the latest in memory.
*/

const retentionDays = 90;
const memoryPhotos = 2000;
const memory = new Map<string, Buffer>();

/** A profile and the photo address read with it: a newer read gives a new photo. */
export interface CachedProfile {
  id: string;
  photoUrl?: string;
}

// Read at call time (not at import) so tests can switch modes.
function photosDir(): string | undefined {
  return process.env.SCS_DESKTOP === "1" && process.env.SCS_DATA_DIR ? path.join(process.env.SCS_DATA_DIR, "review-photos") : undefined;
}

const key = (p: CachedProfile) => crypto.createHash("sha1").update(`${p.id} ${p.photoUrl ?? ""}`).digest("hex");
const expired = (file: string, now: number) => now - fs.statSync(file).mtimeMs > retentionDays * 86_400_000;

export function cachedPhoto(profile: CachedProfile): Buffer | undefined {
  const dir = photosDir();
  if (!dir) return memory.get(key(profile));
  const file = path.join(dir, key(profile));
  try {
    return expired(file, Date.now()) ? undefined : fs.readFileSync(file);
  } catch {
    return undefined;
  }
}

export function cachePhoto(profile: CachedProfile, bytes: Buffer, now = Date.now()): void {
  const dir = photosDir();
  if (!dir) {
    memory.delete(key(profile));
    memory.set(key(profile), bytes);
    while (memory.size > memoryPhotos) memory.delete(memory.keys().next().value!);
    return;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, key(profile)), bytes);
  prunePhotos(dir, now);
}

let prunedAt = 0;
function prunePhotos(dir: string, now: number): void {
  // At most once a day: a card list writes many photos in a row.
  if (now - prunedAt < 86_400_000) return;
  prunedAt = now;
  for (const name of fs.readdirSync(dir)) {
    try {
      if (expired(path.join(dir, name), now)) fs.rmSync(path.join(dir, name), { force: true });
    } catch {
      // Gone already.
    }
  }
}
