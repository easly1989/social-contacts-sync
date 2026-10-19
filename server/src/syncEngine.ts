import crypto from "crypto";

import { ContactResult, PhotoPin, RunOptions, RunRecord, SourceId, SyncCounters, SyncIssue, SyncProgress } from "../../interfaces/api";
import { SimpleContact } from "./interfaces";
import { photoKey } from "./contacts/model";
import { photoHash } from "./contacts/photoPins";
import { parseProfileLink, shortLink } from "./sources/links";
import { FoundPhoto, PhotoSource } from "./sources/types";
import { photoFacts, worthOffering } from "./photoRules";
import { Base64 } from "./types";
import { googleErrorMessage } from "./googleRetry";

/** A History entry's id: when it started, and a few random characters. */
export const newRunId = (at = new Date()) => `${at.toISOString().replace(/[:.]/g, "-")}-${crypto.randomBytes(3).toString("hex")}`;

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
  /**
   * Sends the contact's photos to To review: "photo" to pick one, "changed" when a pinned photo was changed outside the app.
   * `current` is the look of the contact's photo, when it was read.
   */
  queue?(contact: SimpleContact, kind: "photo" | "changed", photos: FoundPhoto[], current?: string): void | Promise<void>;
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

/** Thrown when the run is stopped while a source is still answering. */
class RunStopped extends Error {}

const sourceNames: Record<SourceId, string> = { whatsapp: "WhatsApp", telegram: "Telegram", gravatar: "Gravatar", links: "Profile links" };

/** Failures in a row after which a source is left out of the run (issue #107). */
const failuresToLeave = 3;

/**
 * The source's answer, or an error once it takes longer than `deadline`; a
 * stop ends the wait at once. A WhatsApp or Telegram call that never answers
 * would otherwise hold the whole run, Stop included. After a few failures in
 * a row the source is left out: `down` is told once, and it answers nothing.
 */
function guarded(source: PhotoSource, deadline: number, cancelled: () => boolean, down: (message: string) => void): PhotoSource {
  let failures = 0;
  const wait = async <T>(work: () => Promise<T>, nothing: T): Promise<T> => {
    if (failures >= failuresToLeave) return nothing;
    try {
      const answer = await timed(work());
      failures = 0;
      return answer;
    } catch (e) {
      if (!(e instanceof RunStopped) && ++failures === failuresToLeave) down(e instanceof Error ? e.message : String(e));
      throw e;
    }
  };
  const timed = <T>(work: Promise<T>): Promise<T> => {
    let timer: NodeJS.Timeout | undefined;
    let poll: NodeJS.Timeout | undefined;
    const limit = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${sourceNames[source.id] ?? source.id} didn't answer within ${deadline / 1000} seconds.`)), deadline);
      poll = setInterval(() => cancelled() && reject(new RunStopped()), 250);
    });
    return Promise.race([work, limit]).finally(() => {
      clearTimeout(timer);
      clearInterval(poll);
    });
  };
  return {
    id: source.id,
    network: source.network,
    find: (contact) => wait(() => source.find(contact), null),
    ...(source.findAll ? { findAll: (contact: SimpleContact) => wait(() => source.findAll!(contact), []) } : {}),
  };
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

/** The photo of the source the contact is pinned to; for a profile, only that profile is read, by its network's source. */
async function pinnedPhoto(sources: PhotoSource[], contact: SimpleContact, pin: PhotoPin): Promise<FoundPhoto | null> {
  if (pin.source !== "links") return sources.find((s) => s.id === pin.source)?.find(contact) ?? null;
  const links = (contact.urls ?? []).flatMap((u) => {
    const link = parseProfileLink(u);
    return link && shortLink(link) === pin.matchedBy ? [link] : [];
  });
  const source = links.length && sources.find((s) => s.id === "links" && (!s.network || s.network === links[0].network));
  return source ? source.find({ ...contact, urls: links.map((l) => l.url) }) : null;
}

export async function runSync(
  target: SyncTarget,
  sources: PhotoSource[],
  options: RunOptions,
  callbacks: SyncCallbacks,
  settings: { shuffle?: boolean; deadline?: number } = {}
): Promise<SyncRunResult> {
  const counters = emptyCounters();
  const results: ContactResult[] = [];
  const photos: RunPhotos[] = [];
  const run: RunRecord = {
    id: newRunId(),
    startedAt: new Date().toISOString(),
    mode: "sync",
    options,
    sources: [...new Set(sources.map((s) => s.id))] as SourceId[],
    totalContacts: 0,
    counters,
    results,
  };
  // Sources that stopped answering are left out, the others go on (issue #107).
  const issues: SyncIssue[] = [];
  const leave = (source: PhotoSource, message: string) => {
    issues.push({ source: source.id, ...(source.network ? { network: source.network } : {}), reason: "disconnected", message, checked: results.length });
    console.warn(`${sourceNames[source.id] ?? source.id}${source.network ? ` (${source.network})` : ""} left out of this sync: ${message}`);
  };

  const contacts = await target.listContacts();
  const ready: PhotoSource[] = [];
  for (const source of sources) {
    try {
      await source.prepare?.();
      ready.push(source);
    } catch (e) {
      leave(source, e instanceof Error ? e.message : String(e));
    }
  }
  // 90 seconds leaves room for a profile read with the login, which the desktop app gives 60.
  sources = ready.map((source) => guarded(source, settings.deadline ?? 90_000, callbacks.cancelled, (message) => leave(source, message)));
  const ordered = settings.shuffle === false ? contacts : shuffle(contacts);
  run.totalContacts = ordered.length;

  const syncCount = () => counters.added + counters.replaced;
  callbacks.progress({ progress: 0, phase: "photos", syncCount: 0, totalContacts: ordered.length, checked: 0, counters, issues });

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
      Object.assign(result, { outcome: existing ? "replaced" : "added", source: found.source, matchedBy: found.matchedBy, previousPin: contact.pin ?? null });
      Object.assign(kept, { photo: found.photo, previous: existing ?? undefined });
      latest = { name: contact.name, source: found.source, ...(found.network ? { network: found.network } : {}), ...(pinned ? { pinned } : {}) };
      return googleUrl;
    };
    // The look of the contact's photo, read once and only when a found photo needs it; unread, nothing counts as the same.
    let current: Promise<string | undefined> | undefined;
    const currentLook = () =>
      (current ??= target.currentPhoto(contact).then(
        (photo) => (photo ? photoFacts(photo).visual : undefined),
        () => undefined
      ));
    const queue = async (kind: "photo" | "changed", found: FoundPhoto[]) => {
      await target.queue?.(contact, kind, found, realPhoto && current ? await current : undefined);
      result.outcome = "queued";
    };
    // Photos the user already turned down for this contact ("Keep current") aren't offered again, nor
    // ones not worth it (issue #104): blurred previews, smaller than the photo it has, or the same picture.
    const dismissed = new Set(contact.dismissed ?? []);
    const offered = async (found: FoundPhoto[]): Promise<FoundPhoto[]> => {
      const fresh = found.filter((f) => !dismissed.has(photoHash(f.photo)) && photoHash(f.photo) !== contact.pin?.hash);
      const look = realPhoto && fresh.length ? await currentLook() : undefined;
      return fresh.flatMap((f) => {
        const checked = { ...f, ...photoFacts(f.photo) };
        const verdict = worthOffering(checked, { hasPhoto: realPhoto, current: look });
        return verdict.offer ? [verdict.small ? { ...checked, small: true } : checked] : [];
      });
    };

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
          const found = await offered(await allMatches(sources, contact));
          if (found.length) await queue("photo", found);
        }
      } else if (options.lookDifferent || options.decideAll) {
        const found = await offered(await allMatches(sources, contact));
        if (found.length) await queue("photo", found);
      }
      // Nothing new, but the contact keeps the photo it has in Google: it
      // isn't one of the contacts without a photo.
      if (result.outcome === "noMatch" && contact.hasPhoto) result.outcome = "alreadyHadPhoto";
    } catch (e) {
      if (e instanceof RunStopped) {
        run.cancelled = true;
        break;
      }
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
      issues,
    });
  }

  run.finishedAt = new Date().toISOString();
  if (issues.length) run.issues = issues;
  return { run, photos };
}
