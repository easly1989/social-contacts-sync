import { ProfileCandidate, ProfileLinkRequest, ProfileSuggestion, SocialPerson } from "../../interfaces/api";

/*
  What a contact's card has ticked (issue #65): several profiles can be
  linked at once, and at most one of them gives its photo.
*/

export interface ProfilePick {
  ticked: string[];
  photoFrom?: string;
}

/**
 * Ticked to begin with: each network's only suggestion, when the name
 * matches well. Its photo, when the contact has none or a placeholder.
 */
export function initialPick(suggestion: ProfileSuggestion): ProfilePick {
  const perNetwork = new Map<string, ProfileCandidate[]>();
  for (const c of suggestion.candidates) perNetwork.set(c.person.network, [...(perNetwork.get(c.person.network) ?? []), c]);
  const ticked = suggestion.candidates.filter((c) => c.score >= 0.85 && perNetwork.get(c.person.network)!.length === 1).map((c) => c.person.id);
  const wantsPhoto = !suggestion.hasPhoto || Boolean(suggestion.placeholder);
  const photoFrom = wantsPhoto ? suggestion.candidates.find((c) => ticked.includes(c.person.id) && c.person.photoUrl)?.person.id : undefined;
  return { ticked, photoFrom };
}

/**
 * Ticks or unticks a profile. An unticked profile can't give the photo: when
 * the contact wants one, the next ticked profile with a photo gives it.
 */
export function toggle(pick: ProfilePick, id: string, wantsPhoto: boolean, candidates: ProfileCandidate[]): ProfilePick {
  if (pick.ticked.includes(id)) {
    const ticked = pick.ticked.filter((t) => t !== id);
    if (pick.photoFrom !== id) return { ticked, photoFrom: pick.photoFrom };
    const next = wantsPhoto ? candidates.find((c) => ticked.includes(c.person.id) && c.person.photoUrl)?.person.id : undefined;
    return { ticked, photoFrom: next };
  }
  const person = candidates.find((c) => c.person.id === id)?.person;
  return { ticked: [...pick.ticked, id], photoFrom: pick.photoFrom ?? (wantsPhoto && person?.photoUrl ? id : undefined) };
}

/** The request for one card: the ticked profiles, and the others as not this contact. */
export function linkRequest(suggestion: ProfileSuggestion, pick: ProfilePick): ProfileLinkRequest {
  return {
    contactId: suggestion.contactId,
    name: suggestion.name,
    personIds: suggestion.candidates.map((c) => c.person.id).filter((id) => pick.ticked.includes(id)),
    photoFrom: pick.photoFrom,
    rejectIds: suggestion.candidates.map((c) => c.person.id).filter((id) => !pick.ticked.includes(id)),
  };
}

/** The profile's photo, through the app's server (some sites refuse to be shown elsewhere). */
export function profilePhotoSrc(person: SocialPerson): string | undefined {
  return person.photoUrl ? `/api/profiles/photo?id=${encodeURIComponent(person.id)}` : undefined;
}
