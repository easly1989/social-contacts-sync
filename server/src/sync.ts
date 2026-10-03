import WebSocket from "ws";
import { RateLimiter } from "limiter";
import { Client } from "whatsapp-web.js";

import { EventType, ReviewRequest, SourceId, SyncOptions } from "../../interfaces/api";
import { downloadContactPhoto, listContacts, OAuth2Client, updateContactPhoto } from "./gapi";
import { sendEvent, sendMessageAndWait } from "./ws";
import { deleteFromCache, getFromCache, setInCache } from "./cache";
import { runSync, SyncMode } from "./syncEngine";
import { saveRun } from "./runs";
import { PhotoSource } from "./sources/types";
import { whatsappSource } from "./sources/whatsapp";
import { gravatarSource } from "./sources/gravatar";

const knownSources: SourceId[] = ["whatsapp", "gravatar"];

// Google allows about 60 photo uploads per minute per user; stay below it.
export function googleRateLimiter(): RateLimiter {
  return new RateLimiter({ tokensPerInterval: 1, interval: 1500 });
}

export function syncMode(options: SyncOptions): SyncMode {
  if (options.manual_sync === "true") return "review";
  return options.overwrite_photos === "true" ? "replace" : "fill";
}

/** Sources asked for, in priority order, that are usable in this session. */
export function requestedSources(options: SyncOptions, whatsapp: Client | undefined): PhotoSource[] {
  const ids = (options.sources ?? "whatsapp")
    .split(",")
    .map((s) => s.trim())
    .filter((s, i, all): s is SourceId => knownSources.includes(s as SourceId) && all.indexOf(s) === i);
  return ids.flatMap((id) => {
    if (id === "whatsapp") return whatsapp ? [whatsappSource(whatsapp)] : [];
    return [gravatarSource()];
  });
}

export async function initSync(id: string, syncOptions: SyncOptions) {
  const ws: WebSocket = getFromCache(id, "ws");
  const whatsappClient: Client | undefined = getFromCache(id, "whatsapp");
  const gAuth: OAuth2Client = getFromCache(id, "gauth");
  const limiter = googleRateLimiter();
  const mode = syncMode(syncOptions);
  setInCache(id, "sync_stop", false);

  try {
    const result = await runSync(
      {
        listContacts: () => listContacts(gAuth),
        currentPhoto: downloadContactPhoto,
        setPhoto: (contactId, photo) => updateContactPhoto(gAuth, contactId, photo),
      },
      requestedSources(syncOptions, whatsappClient),
      mode,
      {
        progress: (update) => sendEvent(ws, EventType.SyncProgress, update),
        // Stop when asked to, or when the page went away.
        cancelled: () => getFromCache(id, "sync_stop") === true || ws.readyState !== WebSocket.OPEN,
        beforeWrite: async () => void (await limiter.removeTokens(1)),
        review: async ({ contact, existingPhoto, candidates }) => {
          const request: ReviewRequest = {
            existingPhoto,
            newPhoto: candidates[0].photo,
            contactName: contact.name ?? null,
            candidates,
          };
          try {
            // A person decides here: give them time.
            const answer = await sendMessageAndWait(ws, EventType.SyncConfirm, EventType.SyncPhotoConfirm, request, 10 * 60 * 1000);
            if (!answer?.accept) return null;
            const choice = Number.isInteger(answer.choice) ? answer.choice : 0;
            return choice >= 0 && choice < candidates.length ? choice : 0;
          } catch (e) {
            console.error("No answer for manual sync confirmation", e);
            return null;
          }
        },
      }
    );
    saveRun(id, result);
    // The dashboard's photo coverage is out of date now.
    deleteFromCache(id, "google_stats");
    sendEvent(ws, EventType.SyncProgress, {
      progress: 100,
      syncCount: result.run.counters.added + result.run.counters.replaced,
      totalContacts: result.run.totalContacts,
      checked: result.run.results.length,
      counters: result.run.counters,
      runId: result.run.id,
      cancelled: result.run.cancelled,
    });
  } catch (e) {
    // Loading the contacts (Google or a source) failed before anything changed.
    console.error(e);
    if (ws.readyState === WebSocket.OPEN) {
      sendEvent(ws, EventType.SyncProgress, {
        progress: 0,
        syncCount: 0,
        error: "Failed to load contacts, please try again.",
      });
    }
    return;
  }

  ws.close();
}
