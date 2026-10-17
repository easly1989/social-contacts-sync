import crypto from "crypto";

import { ContactResult, PhotoPin, ReviewCandidate, RunRecord, SourceId, SyncCounters, SyncProgress } from "../../interfaces/api";
import { SimpleContact } from "./interfaces";
import { photoKey } from "./contacts/model";
import { photoHash } from "./contacts/photoPins";
import { parseProfileLink, shortLink } from "./sources/links";
import { FoundPhoto, PhotoSource } from "./sources/types";
import { Base64 } from "./types";
import { googleErrorMessage } from "./googleRetry";

/*
  The photo sync, independent of WhatsApp, Google and the WebSocket: they
  come in as a target, sources and callbacks, which keeps it testable.
*/

export type SyncMode = "fill" | "replace" | "review";

/** Where photos are written: the user's Google contacts. */
export interface SyncTarget {
  listContacts(): Promise<SimpleContact[]>;
  currentPhoto(contact: SimpleContact): Promise<Base64 | null>;
  /** Resolves with Google's address for the new photo, when it gives one. */
  setPhoto(contactId: string, photo: Base64): Promise<string | undefined | void>;
  /** Saves a profile link on the contact (a photo picked from a link in review). */
  addLink?(contactId: string, url: string): Promise<void>;
  /** Saves where the contact's photo comes from (issue #78), or forgets it with `undefined`. */
  savePin?(contactId: string, pin: PhotoPin | undefined): void | Promise<void>;
}

export interface SyncCallbacks {
  progress(update: SyncProgress): void;
  /**
   * Review mode: which candidate to use, a photo the user looked up from a
   * profile link, or null to keep the current photo.
   */
  review?(request: { contact: SimpleContact; existingPhoto: Base64 | null; candidates: ReviewCandidate[] }): Promise<number | FoundPhoto | null>;
  /** Checked before each contact; a true answer ends the run early. */
  cancelled(): boolean;
  /** Called before each write, e.g. to respect Google's rate limit. */
  beforeWrite?(): Promise<void>;
}

/** Photos kept with the run so it can be reported and undone. */
export interface RunPhotos {
  photo?: Base64;
  previous?: Base64;
}

export interface SyncRunResult {
  run: RunRecord;
  photos: RunPhotos[];
}

const emptyCounters = (): SyncCounters => ({ added: 0, replaced: 0, kept: 0, alreadyHadPhoto: 0, noMatch: 0, errors: 0 });

function shuffle<T>(items: T[]): T[] {
  // Contacts without photos come first from Google; spreading them out makes
  // photos appear early in the progress view.
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function firstMatch(sources: PhotoSource[], contact: SimpleContact): Promise<FoundPhoto | null> {
  for (const source of sources) {
    const found = await source.find(contact);
    if (found) return found;
  }
  return null;
}

async function allMatches(sources: PhotoSource[], contact: SimpleContact): Promise<FoundPhoto[]> {
  const found: FoundPhoto[] = [];
  for (const source of sources) {
    if (source.findAll) {
      found.push(...(await source.findAll(contact)));
      continue;
    }
    const photo = await source.find(contact);
    if (photo) found.push(photo);
  }
  return found;
}

/** The photo of the source the contact is pinned to; for a profile, only that profile is read. */
async function pinnedPhoto(sources: PhotoSource[], contact: SimpleContact, pin: PhotoPin): Promise<FoundPhoto | null> {
  const source = sources.find((s) => s.id === pin.source);
  if (!source) return null;
  if (pin.source !== "links") return source.find(contact);
  const urls = (contact.urls ?? []).filter((u) => {
    const link = parseProfileLink(u);
    return link && shortLink(link) === pin.matchedBy;
  });
  return urls.length ? source.find({ ...contact, urls }) : null;
}

/** A pin to where a photo the user picked came from. */
function pinTo(photo: FoundPhoto, googleUrl: string | undefined | void): PhotoPin {
  const key = photoKey(googleUrl || undefined);
  return {
    source: photo.source,
    ...(photo.source === "links" ? { matchedBy: photo.matchedBy, ...(photo.network ? { network: photo.network } : {}) } : {}),
    hash: photoHash(photo.photo),
    ...(key ? { photoKey: key } : {}),
    readAt: new Date().toISOString(),
  };
}

export async function runSync(
  target: SyncTarget,
  sources: PhotoSource[],
  mode: SyncMode,
  callbacks: SyncCallbacks,
  options: { shuffle?: boolean } = {}
): Promise<SyncRunResult> {
  const counters = emptyCounters();
  const results: ContactResult[] = [];
  const photos: RunPhotos[] = [];
  const run: RunRecord = {
    id: `${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomBytes(3).toString("hex")}`,
    startedAt: new Date().toISOString(),
    mode,
    sources: sources.map((s) => s.id) as SourceId[],
    totalContacts: 0,
    counters,
    results,
  };

  const contacts = await target.listContacts();
  for (const source of sources) await source.prepare?.();
  const ordered = options.shuffle === false ? contacts : shuffle(contacts);
  run.totalContacts = ordered.length;

  const syncCount = () => counters.added + counters.replaced;
  callbacks.progress({ progress: 0, syncCount: 0, totalContacts: ordered.length, checked: 0, counters, isManualSync: mode === "review" });

  for (const [index, contact] of ordered.entries()) {
    if (callbacks.cancelled()) {
      run.cancelled = true;
      break;
    }

    const result: ContactResult = { contactId: contact.id, name: contact.name, outcome: "noMatch" };
    const kept: RunPhotos = {};
    let image: Base64 | undefined;
    const write = async (found: FoundPhoto, existing: Base64 | null) => {
      await callbacks.beforeWrite?.();
      const googleUrl = await target.setPhoto(contact.id, found.photo);
      Object.assign(result, { outcome: existing ? "replaced" : "added", source: found.source, matchedBy: found.matchedBy });
      Object.assign(kept, { photo: found.photo, previous: existing ?? undefined });
      image = found.photo;
      return googleUrl;
    };

    /** Follows the contact's pin (issue #78); false when it leaves the contact to the usual order. */
    const followPin = async (pin: PhotoPin): Promise<boolean> => {
      // A photo removed outside the app: the usual order may fill it.
      if (pin.suspended) return contact.hasPhoto;
      // Changed outside the app since it was applied: the user's choice, left alone.
      if (pin.photoKey && photoKey(contact.photoUrl) !== pin.photoKey) {
        if (!contact.hasPhoto) return false;
        await target.savePin?.(contact.id, { ...pin, suspended: true });
        return true;
      }
      const found = await pinnedPhoto(sources, contact, pin);
      // Nothing there for now: the photo stays, even with Replace.
      if (!found) return contact.hasPhoto;
      const hash = photoHash(found.photo);
      const readAt = new Date().toISOString();
      // Unchanged, or brought over from an earlier link without a hash: recorded, not written.
      if (contact.hasPhoto && (!pin.hash || pin.hash === hash)) {
        const key = pin.photoKey ?? photoKey(contact.photoUrl);
        await target.savePin?.(contact.id, { ...pin, hash, ...(key ? { photoKey: key } : {}), readAt });
        return true;
      }
      const existing = contact.hasPhoto ? await target.currentPhoto(contact) : null;
      const key = photoKey((await write(found, existing)) || undefined);
      const { photoKey: _old, ...rest } = pin;
      await target.savePin?.(contact.id, { ...rest, hash, ...(key ? { photoKey: key } : {}), readAt });
      return true;
    };

    try {
      // A kept photo is never replaced (issue #67), whatever the mode. A
      // placeholder uploaded by hand counts as no photo: a real one replaces it.
      if (contact.photoKept && contact.hasPhoto) {
        result.outcome = "alreadyHadPhoto";
      } else if (mode !== "review" && contact.pin && (await followPin(contact.pin))) {
        // Done by the pin.
      } else if (mode === "fill" && contact.hasPhoto && !contact.placeholder) {
        result.outcome = "alreadyHadPhoto";
      } else if (mode === "review") {
        const candidates = await allMatches(sources, contact);
        if (candidates.length) {
          const existing = await target.currentPhoto(contact);
          const choice = await callbacks.review!({ contact, existingPhoto: existing, candidates });
          const chosen = typeof choice === "number" ? candidates[choice] : choice ?? undefined;
          if (!chosen) {
            result.outcome = "kept";
          } else {
            const googleUrl = await write(chosen, existing);
            await target.savePin?.(contact.id, pinTo(chosen, googleUrl));
            if (chosen.newLink && target.addLink) {
              await target.addLink(contact.id, chosen.newLink);
              result.addedLink = chosen.newLink;
            }
          }
        }
      } else {
        const found = await firstMatch(sources, contact);
        if (found) {
          await write(found, contact.hasPhoto ? await target.currentPhoto(contact) : null);
          // Another source's photo: it no longer follows the pinned one.
          if (contact.pin) await target.savePin?.(contact.id, undefined);
        }
      }
      // Nothing new, but the contact keeps the photo it has in Google: it
      // isn't one of the contacts without a photo.
      if (result.outcome === "noMatch" && contact.hasPhoto) result.outcome = "alreadyHadPhoto";
    } catch (e) {
      // One contact's failure must not end the whole run.
      result.outcome = "error";
      result.error = googleErrorMessage(e);
      console.error(`Error syncing contact ${contact.id}:`, e);
    }

    counters[result.outcome === "error" ? "errors" : result.outcome]++;
    result.hasPhoto = Boolean(kept.photo);
    result.hasPrevious = Boolean(kept.previous);
    results.push(result);
    photos.push(kept);

    callbacks.progress({
      progress: ((index + 1) / ordered.length) * 100,
      syncCount: syncCount(),
      totalContacts: ordered.length,
      checked: index + 1,
      counters,
      image,
      latest: image ? { name: contact.name, source: result.source! } : undefined,
      isManualSync: mode === "review",
    });
  }

  run.finishedAt = new Date().toISOString();
  return { run, photos };
}
