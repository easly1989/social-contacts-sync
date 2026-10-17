import crypto from "crypto";
import fs from "fs";
import path from "path";

import { PhotoPin } from "../../../interfaces/api";
import { getFromCache, setInCache } from "../cache";
import { loadProfiles } from "../profiles/store";
import { networkNames, parseProfileLink, shortLink } from "../sources/links";
import { Base64 } from "../types";

/*
  Photo pins (issue #78): a photo picked from a source follows that source.
  Kept like placeholders and kept photos: photo-pins.json in the desktop
  app's data folder, the session in the web version.
*/

function file(): string | undefined {
  return process.env.SCS_DESKTOP === "1" && process.env.SCS_DATA_DIR ? path.join(process.env.SCS_DATA_DIR, "photo-pins.json") : undefined;
}

export function photoHash(photo: Base64): string {
  return crypto.createHash("sha256").update(photo).digest("hex");
}

/** Find profiles links that set a photo, from before pins existed: they become pins once. */
function migrated(sessionId: string): Record<string, PhotoPin> {
  const pins: Record<string, PhotoPin> = {};
  for (const l of loadProfiles(sessionId).linked) {
    const link = parseProfileLink(l.person.url);
    if (!l.photoSet || l.undone || !link) continue;
    pins[l.contactId] = { source: "links", matchedBy: shortLink(link), network: networkNames[link.network], readAt: l.at };
  }
  return pins;
}

/** Contact → its pin. */
export function getPins(sessionId: string): Record<string, PhotoPin> {
  const f = file();
  if (!f) {
    const cached: Record<string, PhotoPin> | undefined = getFromCache(sessionId, "photo_pins");
    if (cached) return { ...cached };
  } else {
    try {
      return JSON.parse(fs.readFileSync(f, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") return {};
    }
  }
  const pins = migrated(sessionId);
  save(sessionId, pins);
  return pins;
}

function save(sessionId: string, pins: Record<string, PhotoPin>): void {
  const f = file();
  if (!f) return setInCache(sessionId, "photo_pins", pins);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(`${f}.tmp`, JSON.stringify(pins, null, 2));
  fs.renameSync(`${f}.tmp`, f);
}

/** Pins the contact's photo, or unpins it with `undefined`. */
export function setPin(sessionId: string, contactId: string, pin: PhotoPin | undefined): void {
  const pins = getPins(sessionId);
  if (pin) pins[contactId] = pin;
  else if (contactId in pins) delete pins[contactId];
  else return;
  save(sessionId, pins);
}
