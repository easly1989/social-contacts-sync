import { ContactResult } from "../../../interfaces/api";
import { setInCache } from "../cache";
import { recordDecision } from "../runs";
import { parseProfileLink, shortLink } from "../sources/links";
import { RunPhotos } from "../syncEngine";
import { cachedPhoto } from "./photoCache";
import { loadQueue, saveQueue } from "./queue";
import { loadProfiles, saveProfiles } from "./store";

/*
  Decisions made in To review are Review entries in History (issue #84).
  Links and photos from before were kept in profiles.json and the review
  queue: they become Review entries once, with the same 30-minute rule.
*/

interface Decision {
  at: string;
  result: ContactResult;
  photos: RunPhotos;
}

export function migrateReviewHistory(sessionId: string): void {
  const data = loadProfiles(sessionId);
  const queue = loadQueue(sessionId);
  const linked = data.linked.filter((l) => !l.recorded);
  if (!linked.length && !queue.applied?.length) return;
  const decisions: Decision[] = [];
  const decision = (contactId: string, at: string, near: number) => {
    let found = decisions.find((d) => d.result.contactId === contactId && Math.abs(Date.parse(d.at) - Date.parse(at)) <= near);
    if (!found) decisions.push((found = { at, result: { contactId, outcome: "linked", profiles: [] }, photos: {} }));
    return found;
  };
  for (const l of linked) {
    const { previousPhoto } = l;
    l.recorded = true;
    delete l.previousPhoto;
    if (l.undone || (!l.photoSet && !l.addedLink)) continue;
    // One answer saved its profiles with the same time.
    const d = decision(l.contactId, l.at, 0);
    d.result.name ??= l.name || undefined;
    d.result.profiles!.push({ url: l.person.url, network: l.person.network, ...(l.addedLink ? { added: true } : {}) });
    if (l.photoSet) {
      const link = parseProfileLink(l.person.url);
      Object.assign(d.result, { outcome: previousPhoto ? "replaced" : "added", source: "links", ...(link ? { matchedBy: shortLink(link) } : {}) });
      if (previousPhoto) d.photos.previous = previousPhoto;
    }
  }
  for (const a of queue.applied ?? []) {
    // A photo from the queue or a typed link was kept a moment apart from the profiles ticked with it.
    const d = decision(a.contactId, a.at, 5000);
    const link = a.link ? parseProfileLink(a.link) : undefined;
    if (link) d.result.profiles!.push({ url: link.url, network: link.network, added: true });
    Object.assign(d.result, { outcome: a.previous ? "replaced" : "added", source: a.source, ...(a.matchedBy ? { matchedBy: a.matchedBy } : {}) });
    const previous = a.previous ? cachedPhoto({ id: a.previous })?.toString("base64") : undefined;
    if (previous) d.photos.previous = previous;
  }
  for (const d of decisions.sort((a, b) => a.at.localeCompare(b.at))) {
    if (!d.result.profiles!.length) delete d.result.profiles;
    recordDecision(sessionId, d.result, d.photos, new Date(d.at));
  }
  saveProfiles(sessionId, data);
  queue.applied = [];
  saveQueue(sessionId, queue);
}

/** An undone decision's profiles are suggested again. */
export function reviewUndone(sessionId: string, result: ContactResult): void {
  setInCache(sessionId, "profiles_contacts", undefined);
  const urls = new Set((result.profiles ?? []).map((p) => p.url));
  if (!urls.size) return;
  const data = loadProfiles(sessionId);
  for (const l of data.linked) if (l.contactId === result.contactId && urls.has(l.person.url)) l.undone = true;
  saveProfiles(sessionId, data);
}
