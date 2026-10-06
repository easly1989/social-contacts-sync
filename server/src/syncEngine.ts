import crypto from "crypto";

import { ContactResult, ReviewCandidate, RunRecord, SourceId, SyncCounters, SyncProgress } from "../../interfaces/api";
import { SimpleContact } from "./interfaces";
import { FoundPhoto, PhotoSource } from "./sources/types";
import { Base64 } from "./types";

/*
  The photo sync, independent of WhatsApp, Google and the WebSocket: they
  come in as a target, sources and callbacks, which keeps it testable.
*/

export type SyncMode = "fill" | "replace" | "review";

/** Where photos are written: the user's Google contacts. */
export interface SyncTarget {
  listContacts(): Promise<SimpleContact[]>;
  currentPhoto(contact: SimpleContact): Promise<Base64 | null>;
  setPhoto(contactId: string, photo: Base64): Promise<void>;
  /** Saves a profile link on the contact (a photo picked from a link in review). */
  addLink?(contactId: string, url: string): Promise<void>;
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
    const photo = await source.find(contact);
    if (photo) found.push(photo);
  }
  return found;
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
    try {
      if (mode === "fill" && contact.hasPhoto) {
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
            await callbacks.beforeWrite?.();
            await target.setPhoto(contact.id, chosen.photo);
            Object.assign(result, { outcome: existing ? "replaced" : "added", source: chosen.source, matchedBy: chosen.matchedBy });
            Object.assign(kept, { photo: chosen.photo, previous: existing ?? undefined });
            image = chosen.photo;
            if (chosen.newLink && target.addLink) {
              await target.addLink(contact.id, chosen.newLink);
              result.addedLink = chosen.newLink;
            }
          }
        }
      } else {
        const found = await firstMatch(sources, contact);
        if (found) {
          const existing = contact.hasPhoto ? await target.currentPhoto(contact) : null;
          await callbacks.beforeWrite?.();
          await target.setPhoto(contact.id, found.photo);
          Object.assign(result, { outcome: existing ? "replaced" : "added", source: found.source, matchedBy: found.matchedBy });
          Object.assign(kept, { photo: found.photo, previous: existing ?? undefined });
          image = found.photo;
        }
      }
    } catch (e) {
      // One contact's failure must not end the whole run.
      result.outcome = "error";
      result.error = e instanceof Error ? e.message : String(e);
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
