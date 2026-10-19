import { LinkLookup, ProfileCandidate, ProfileLinkRequest, ProfileSuggestion, QueuePhoto, SocialPerson } from "../../interfaces/api";

/*
  What a contact's card has ticked (issue #65): several profiles can be
  linked at once, and one photo is picked among the suggested profiles and
  those already on the contact (issue #81), the photos a sync sent to To
  review, and one behind a profile link typed on the card (issue #82).
*/

export interface ProfilePick {
  ticked: string[];
  /** A profile's id, a queued photo's id, or "link" for `link`. */
  photoFrom?: string;
  link?: LinkLookup;
}

/** One photo a card offers. */
export interface PhotoOption {
  id: string;
  person?: SocialPerson;
  /** The person is a suggestion, not a profile already on the contact. */
  suggested?: boolean;
  queued?: QueuePhoto;
  lookup?: LinkLookup;
}

/** The contact has no photo, or a placeholder; a kept photo (issue #67) is never replaced. */
export function wantsPhotoFor(suggestion: ProfileSuggestion): boolean {
  return !suggestion.photoKept && (!suggestion.hasPhoto || Boolean(suggestion.placeholder));
}

/**
 * The photos a card offers, in key order (1–9): those a sync found, the
 * suggested profiles', those already linked, then a typed link's. A photo
 * changed outside the app has its own choice instead (issue #82).
 */
export function photoCandidates(suggestion: ProfileSuggestion, pick?: ProfilePick): PhotoOption[] {
  if (suggestion.photoKept || suggestion.queue?.kind === "changed") return [];
  const queued = suggestion.queue?.photos ?? [];
  // A linked profile whose photo the sync just read from the same link is offered once, as the sync's.
  const read = new Set(queued.filter((q) => q.source === "links").map((q) => sameLink(q.matchedBy)));
  return [
    ...queued.map((q) => ({ id: q.id, queued: q })),
    ...suggestion.candidates.filter((c) => c.person.photoUrl).map((c) => ({ id: c.person.id, person: c.person, suggested: true })),
    ...(suggestion.linked ?? []).filter((person) => !read.has(sameLink(person.url))).map((person) => ({ id: person.id, person, suggested: false })),
    ...(pick?.link ? [{ id: "link", lookup: pick.link }] : []),
  ];
}

/** A profile address as the sync's links write it: no protocol, www or trailing slash. */
const sameLink = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "").toLowerCase();

/** The photo a sync offers (unless the current one comes from a source), else when the contact wants one: a ticked profile's, else a linked one's. */
function firstPhoto(suggestion: ProfileSuggestion, ticked: string[]): string | undefined {
  // The current photo comes from a source already: keeping it is the safe choice (issue #104).
  if (!wantsPhotoFor(suggestion)) return suggestion.currentFrom ? undefined : photoCandidates(suggestion).find((c) => c.queued)?.id;
  return photoCandidates(suggestion).find((c) => !c.suggested || ticked.includes(c.id))?.id;
}

/**
 * Ticked to begin with: each network's only suggestion, when the name
 * matches well. Its photo, when the contact has none or a placeholder.
 */
export function initialPick(suggestion: ProfileSuggestion): ProfilePick {
  const perNetwork = new Map<string, ProfileCandidate[]>();
  for (const c of suggestion.candidates) perNetwork.set(c.person.network, [...(perNetwork.get(c.person.network) ?? []), c]);
  const ticked = suggestion.candidates.filter((c) => c.score >= 0.85 && perNetwork.get(c.person.network)!.length === 1).map((c) => c.person.id);
  return { ticked, photoFrom: firstPhoto(suggestion, ticked) };
}

/**
 * Ticks or unticks a profile. An unticked profile can't give the photo: when
 * the contact wants one, the next ticked profile with a photo gives it.
 */
export function toggle(pick: ProfilePick, id: string, suggestion: ProfileSuggestion): ProfilePick {
  if (pick.ticked.includes(id)) {
    const ticked = pick.ticked.filter((t) => t !== id);
    return { ...pick, ticked, photoFrom: pick.photoFrom === id ? firstPhoto(suggestion, ticked) : pick.photoFrom };
  }
  const person = suggestion.candidates.find((c) => c.person.id === id)?.person;
  const takesPhoto = !pick.photoFrom && wantsPhotoFor(suggestion) && person?.photoUrl;
  return { ...pick, ticked: [...pick.ticked, id], photoFrom: takesPhoto ? id : pick.photoFrom };
}

/** Picks a photo (none: the contact's own); a suggested profile's photo ticks that profile too. */
export function pickPhoto(pick: ProfilePick, id: string | undefined, suggestion: ProfileSuggestion): ProfilePick {
  const suggested = suggestion.candidates.some((c) => c.person.id === id);
  return { ...pick, ticked: id && suggested && !pick.ticked.includes(id) ? [...pick.ticked, id] : pick.ticked, photoFrom: id };
}

/** The photo behind a typed profile link becomes one more choice, and the chosen one. */
export function addLink(pick: ProfilePick, lookup: LinkLookup): ProfilePick {
  return { ...pick, link: lookup, photoFrom: "link" };
}

/** Something to confirm: a profile to link, or a photo. */
export function hasChoice(pick: ProfilePick): boolean {
  return pick.ticked.length > 0 || Boolean(pick.photoFrom);
}

/** The request for one card: the ticked profiles, the photo, and the other suggestions as not this contact. */
export function linkRequest(suggestion: ProfileSuggestion, pick: ProfilePick): ProfileLinkRequest {
  const photoFrom = photoCandidates(suggestion, pick).find((c) => c.id === pick.photoFrom && (!c.suggested || pick.ticked.includes(c.id)))?.id;
  return {
    contactId: suggestion.contactId,
    name: suggestion.name,
    personIds: suggestion.candidates.map((c) => c.person.id).filter((id) => pick.ticked.includes(id)),
    ...(photoFrom === "link" ? { link: pick.link!.token } : photoFrom ? { photoFrom } : {}),
    rejectIds: suggestion.candidates.map((c) => c.person.id).filter((id) => !pick.ticked.includes(id)),
  };
}

/** The profile's photo, through the app's server (some sites refuse to be shown elsewhere). */
export function profilePhotoSrc(person: SocialPerson): string | undefined {
  return person.photoUrl ? `/api/profiles/photo?id=${encodeURIComponent(person.id)}` : undefined;
}
