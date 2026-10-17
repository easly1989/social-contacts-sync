import { ProfileCandidate, ProfileLinkRequest, ProfileSuggestion, SocialPerson } from "../../interfaces/api";

/*
  What a contact's card has ticked (issue #65): several profiles can be
  linked at once, and one photo is picked among the suggested profiles and
  those already on the contact (issue #81).
*/

export interface ProfilePick {
  ticked: string[];
  photoFrom?: string;
}

/** The contact has no photo, or a placeholder; a kept photo (issue #67) is never replaced. */
export function wantsPhotoFor(suggestion: ProfileSuggestion): boolean {
  return !suggestion.photoKept && (!suggestion.hasPhoto || Boolean(suggestion.placeholder));
}

/** The photos a card offers, in key order (1–9): the suggested profiles', then those already linked. */
export function photoCandidates(suggestion: ProfileSuggestion): { person: SocialPerson; suggested: boolean }[] {
  if (suggestion.photoKept) return [];
  return [
    ...suggestion.candidates.filter((c) => c.person.photoUrl).map((c) => ({ person: c.person, suggested: true })),
    ...(suggestion.linked ?? []).map((person) => ({ person, suggested: false })),
  ];
}

/** The photo given when the contact wants one: a ticked profile's, else a linked one's. */
function firstPhoto(suggestion: ProfileSuggestion, ticked: string[]): string | undefined {
  if (!wantsPhotoFor(suggestion)) return undefined;
  return photoCandidates(suggestion).find((c) => !c.suggested || ticked.includes(c.person.id))?.person.id;
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
    return { ticked, photoFrom: pick.photoFrom === id ? firstPhoto(suggestion, ticked) : pick.photoFrom };
  }
  const person = suggestion.candidates.find((c) => c.person.id === id)?.person;
  const takesPhoto = !pick.photoFrom && wantsPhotoFor(suggestion) && person?.photoUrl;
  return { ticked: [...pick.ticked, id], photoFrom: takesPhoto ? id : pick.photoFrom };
}

/** Picks a photo (none: the contact's own); a suggested profile's photo ticks that profile too. */
export function pickPhoto(pick: ProfilePick, id: string | undefined, suggestion: ProfileSuggestion): ProfilePick {
  const suggested = suggestion.candidates.some((c) => c.person.id === id);
  return { ticked: id && suggested && !pick.ticked.includes(id) ? [...pick.ticked, id] : pick.ticked, photoFrom: id };
}

/** Something to confirm: a profile to link, or a photo. */
export function hasChoice(pick: ProfilePick): boolean {
  return pick.ticked.length > 0 || Boolean(pick.photoFrom);
}

/** The request for one card: the ticked profiles, the photo, and the other suggestions as not this contact. */
export function linkRequest(suggestion: ProfileSuggestion, pick: ProfilePick): ProfileLinkRequest {
  const photoFrom = suggestion.photoKept ? undefined : photoCandidates(suggestion).find((c) => c.person.id === pick.photoFrom && (!c.suggested || pick.ticked.includes(c.person.id)))?.person.id;
  return {
    contactId: suggestion.contactId,
    name: suggestion.name,
    personIds: suggestion.candidates.map((c) => c.person.id).filter((id) => pick.ticked.includes(id)),
    ...(photoFrom ? { photoFrom } : {}),
    rejectIds: suggestion.candidates.map((c) => c.person.id).filter((id) => !pick.ticked.includes(id)),
  };
}

/** The profile's photo, through the app's server (some sites refuse to be shown elsewhere). */
export function profilePhotoSrc(person: SocialPerson): string | undefined {
  return person.photoUrl ? `/api/profiles/photo?id=${encodeURIComponent(person.id)}` : undefined;
}
