import WebSocket from "ws";
import { RateLimiter } from "limiter";
import { Client } from "whatsapp-web.js";

import { EventType, ReviewAnswer, ReviewRequest, SourceId, SyncOptions } from "../../interfaces/api";
import { downloadContactPhoto, listContacts, OAuth2Client, updateContactPhoto } from "./gapi";
import { sendEvent, sendMessageAndWait } from "./ws";
import { deleteFromCache, getFromCache, setInCache } from "./cache";
import { runSync, SyncMode } from "./syncEngine";
import { saveRun } from "./runs";
import { PhotoSource } from "./sources/types";
import { whatsappSource } from "./sources/whatsapp";
import { gravatarSource } from "./sources/gravatar";
import { telegramSource } from "./sources/telegram";
import { linksSource, shortLink } from "./sources/links";
import { getLookup } from "./linkLookups";
import { addContactLink } from "./contactLinks";
import { peopleContactsApi } from "./cleanup/people";
import { TelegramConnection } from "./telegram";
import { telegramConnection } from "./telegramSession";
import { getPrefs } from "./cleanup/store";
import { inferRegion, toE164Digits } from "./phone";
import { SimpleContact } from "./interfaces";

const knownSources: SourceId[] = ["whatsapp", "telegram", "gravatar", "links"];

// Google allows about 60 photo uploads per minute per user; stay below it.
export function googleRateLimiter(): RateLimiter {
  return new RateLimiter({ tokensPerInterval: 1, interval: 1500 });
}

export function syncMode(options: SyncOptions): SyncMode {
  if (options.manual_sync === "true") return "review";
  return options.overwrite_photos === "true" ? "replace" : "fill";
}

/** Sources asked for, in priority order, that are usable in this session. */
export function requestedSources(options: SyncOptions, whatsapp: Client | undefined, telegram?: TelegramConnection): PhotoSource[] {
  const ids = (options.sources ?? "whatsapp")
    .split(",")
    .map((s) => s.trim())
    .filter((s, i, all): s is SourceId => knownSources.includes(s as SourceId) && all.indexOf(s) === i);
  return ids.flatMap((id) => {
    if (id === "whatsapp") return whatsapp ? [whatsappSource(whatsapp)] : [];
    if (id === "telegram") return telegram ? [telegramSource(telegram)] : [];
    if (id === "links") return [linksSource({ bestEffort: options.links_best_effort === "true" })];
    return [gravatarSource()];
  });
}

/**
 * Numbers marked as shared in Clean up belong to several people, so no
 * photo is matched through them.
 */
export function withoutSharedNumbers(contacts: SimpleContact[], shared: string[], region?: Parameters<typeof toE164Digits>[1]): SimpleContact[] {
  if (!shared.length) return contacts;
  const skip = new Set(shared.map((n) => n.replace(/\D/g, "")));
  return contacts.map((c) => ({ ...c, numbers: c.numbers.filter((n) => !skip.has(toE164Digits(n, region) ?? n.replace(/\D/g, ""))) }));
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
        listContacts: async () =>
          withoutSharedNumbers(await listContacts(gAuth), getPrefs(id).sharedNumbers, inferRegion(whatsappClient?.info?.wid?.user)),
        currentPhoto: downloadContactPhoto,
        setPhoto: (contactId, photo) => updateContactPhoto(gAuth, contactId, photo),
        addLink: async (contactId, url) => void (await addContactLink(peopleContactsApi(gAuth), contactId, url)),
      },
      requestedSources(syncOptions, whatsappClient, telegramConnection(id)),
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
            const answer: ReviewAnswer | undefined = await sendMessageAndWait(ws, EventType.SyncConfirm, EventType.SyncPhotoConfirm, request, 10 * 60 * 1000);
            if (!answer?.accept) return null;
            // A photo the user looked up from a profile link (issue #51).
            const fromLink = answer.link ? getLookup(id, answer.link) : undefined;
            if (fromLink) return { photo: fromLink.photo, source: "links", matchedBy: shortLink(fromLink.link), newLink: fromLink.link.url };
            const choice = Number.isInteger(answer.choice) ? answer.choice! : 0;
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
