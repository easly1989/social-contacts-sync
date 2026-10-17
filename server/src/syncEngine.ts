import crypto from "crypto";

import { ContactResult, PhotoPin, RunOptions, RunRecord, SourceId, SyncCounters, SyncProgress } from "../../interfaces/api";
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

  It applies what is safe on its own and sends what needs a person to
  Sync's To review (issue #82): it never waits for an answer.
*/

export const defaultRunOptions: RunOptions = { fillMissing: true, updatePinned: true, lookDifferent: true, decideAll: false };

/** Where photos are written: the user's Google contacts. */
export interface SyncTarget {
  listContacts(): Promise<SimpleContact[]>;
  currentPhoto(contact: SimpleContact): Promise<Base64 | null>;
  /** Resolves with Google's address for the new photo, when it gives one. */
  setPhoto(contactId: string, photo: Base64): Promise<string | undefined | void>;
  /** Saves where the contact's photo comes from (issue #78), or forgets it with `undefined`. */
  savePin?(contactId: string, pin: PhotoPin | undefined): void | Promise<void>;
  /** Sends the contact's photos to To review: "photo" to pick one, "changed" when a pinned photo was changed outside the app. */
  queue?(contact: SimpleContact, kind: "photo" | "changed", photos: FoundPhoto[]): void | Promise<void>;
}

export interface SyncCallbacks {
  progress(update: SyncProgress): void;
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

const emptyCounters = (): SyncCounters => ({ added: 0, replaced: 0, kept: 0, queued: 0, alreadyHadPhoto: 0, noMatch: 0, errors: 0 });

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

export async function runSync(
  target: SyncTarget,
  sources: PhotoSource[],
  options: RunOptions,
  callbacks: SyncCallbacks,
  settings: { shuffle?: boolean } = {}
): Promise<SyncRunResult> {
  const counters = emptyCounters();
  const results: ContactResult[] = [];
  const photos: RunPhotos[] = [];
  const run: RunRecord = {
    id: `${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomBytes(3).toString("hex")}`,
    startedAt: new Date().toISOString(),
    mode: "sync",
    options,
    sources: sources.map((s) => s.id) as SourceId[],
    totalContacts: 0,
    counters,
    results,
  };

  const contacts = await target.listContacts();
  for (const source of sources) await source.prepare?.();
  const ordered = settings.shuffle === false ? contacts : shuffle(contacts);
  run.totalContacts = ordered.length;

  const syncCount = () => counters.added + counters.replaced;
  callbacks.progress({ progress: 0, phase: "photos", syncCount: 0, totalContacts: ordered.length, checked: 0, counters });

  for (const [index, contact] of ordered.entries()) {
    if (callbacks.cancelled()) {
      run.cancelled = true;
      break;
    }

    const result: ContactResult = { contactId: contact.id, name: contact.name, outcome: "noMatch" };
    const kept: RunPhotos = {};
    let latest: SyncProgress["latest"];
    const realPhoto = contact.hasPhoto && !contact.placeholder;
    const write = async (found: FoundPhoto, pinned = false) => {
      const existing = contact.hasPhoto ? await target.currentPhoto(contact) : null;
      await callbacks.beforeWrite?.();
      const googleUrl = await target.setPhoto(contact.id, found.photo);
      Object.assign(result, { outcome: existing ? "replaced" : "added", source: found.source, matchedBy: found.matchedBy });
      Object.assign(kept, { photo: found.photo, previous: existing ?? undefined });
      latest = { name: contact.name, source: found.source, ...(found.network ? { network: found.network } : {}), ...(pinned ? { pinned } : {}) };
      return googleUrl;
    };
    const queue = async (kind: "photo" | "changed", found: FoundPhoto[]) => {
      await target.queue?.(contact, kind, found);
      result.outcome = "queued";
    };
    // Photos the user already turned down for this contact ("Keep current") aren't offered again.
    const dismissed = new Set(contact.dismissed ?? []);
    const offered = (found: FoundPhoto[]) => found.filter((f) => !dismissed.has(photoHash(f.photo)) && photoHash(f.photo) !== contact.pin?.hash);

    /** Follows the contact's pin (issue #78); false when it leaves the contact to the rules below. */
    const followPin = async (pin: PhotoPin): Promise<boolean> => {
      // Waiting in To review since it was changed outside the app, or removed there: then the rules below may fill it.
      if (pin.suspended) return contact.hasPhoto;
      if (pin.photoKey && photoKey(contact.photoUrl) !== pin.photoKey) {
        if (!contact.hasPhoto) return false;
        // Changed outside the app since it was applied: the user decides in To review.
        await target.savePin?.(contact.id, { ...pin, suspended: true });
        const back = await pinnedPhoto(sources, contact, pin);
        await queue("changed", back ? [back] : []);
        return true;
      }
      // Pinned photos left as they are: only a contact without one takes the pinned source.
      if (!options.updatePinned && contact.hasPhoto) return false;
      const found = await pinnedPhoto(sources, contact, pin);
      // Nothing there for now: the photo stays.
      if (!found) return contact.hasPhoto;
      const hash = photoHash(found.photo);
      const readAt = new Date().toISOString();
      // Unchanged, or brought over from an earlier link without a hash: recorded, not written.
      if (contact.hasPhoto && (!pin.hash || pin.hash === hash)) {
        const key = pin.photoKey ?? photoKey(contact.photoUrl);
        await target.savePin?.(contact.id, { ...pin, hash, ...(key ? { photoKey: key } : {}), readAt });
        return true;
      }
      if (options.decideAll || (!realPhoto && !options.fillMissing)) {
        await queue("photo", [found]);
        return true;
      }
      const key = photoKey((await write(found, true)) || undefined);
      const { photoKey: _old, ...rest } = pin;
      await target.savePin?.(contact.id, { ...rest, hash, ...(key ? { photoKey: key } : {}), readAt });
      return true;
    };

    try {
      // A kept photo is never replaced (issue #67). A placeholder uploaded
      // by hand counts as no photo: a real one replaces it.
      if (contact.photoKept && contact.hasPhoto) {
        result.outcome = "alreadyHadPhoto";
      } else if (contact.pin && (await followPin(contact.pin))) {
        // Done by the pin.
      } else if (!realPhoto) {
        if (options.fillMissing && !options.decideAll) {
          const found = await firstMatch(sources, contact);
          if (found) {
            await write(found);
            // Another source's photo: it no longer follows the pinned one.
            if (contact.pin) await target.savePin?.(contact.id, undefined);
          }
        } else {
          const found = offered(await allMatches(sources, contact));
          if (found.length) await queue("photo", found);
        }
      } else if (options.lookDifferent || options.decideAll) {
        const found = offered(await allMatches(sources, contact));
        if (found.length) await queue("photo", found);
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

    if (result.outcome === "error") counters.errors++;
    else counters[result.outcome] = (counters[result.outcome] ?? 0) + 1;
    result.hasPhoto = Boolean(kept.photo);
    result.hasPrevious = Boolean(kept.previous);
    results.push(result);
    photos.push(kept);

    callbacks.progress({
      progress: ((index + 1) / ordered.length) * 100,
      phase: "photos",
      syncCount: syncCount(),
      totalContacts: ordered.length,
      checked: index + 1,
      counters,
      image: kept.photo,
      latest,
    });
  }

  run.finishedAt = new Date().toISOString();
  return { run, photos };
}
