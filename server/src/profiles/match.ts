import { Contact, ProfileCandidate, SocialPerson } from "../../../interfaces/api";
import { sameLink } from "../contactLinks";

/*
  Which profiles may belong to which contact (issue #61), by name only:
  the user confirms every match. A contact needs two name words (first and
  last) to be matched at all, "Mamma" or "Luca" alone would match anyone.
*/

/** Lower case, no accents, words only. */
export function words(text: string | undefined): string[] {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 2);
}

/** The contact's own name words: no prefix like "(Volley)", no suffix after the comma. */
export function contactWords(c: Pick<Contact, "name" | "givenName" | "middleName" | "familyName">): string[] {
  const parts = c.givenName || c.familyName ? [c.givenName, c.middleName, c.familyName].join(" ") : (c.name ?? "").split(",")[0];
  return [...new Set(words(parts))];
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((w) => b.includes(w));
const within = (small: string[], big: string[]) => small.every((w) => big.includes(w));

/** How `person` matches a contact's name words, or undefined. */
export function scoreMatch(name: string[], person: SocialPerson): Pick<ProfileCandidate, "score" | "reason"> | undefined {
  if (name.length < 2) return undefined;
  const theirs = [...new Set(words(person.name))];
  if (theirs.length >= 2 && same(name, theirs)) return { score: 1, reason: "sameName" };
  // One word more or less (a middle name), not a sentence that happens to contain the name.
  if (theirs.length >= 2 && Math.abs(theirs.length - name.length) <= 1 && (within(name, theirs) || within(theirs, name))) return { score: 0.7, reason: "similarName" };
  // Usernames: "davide.gallo", "gallo_davide", "davidegallo89".
  // Bluesky handles are domains: "paulfrazee.bsky.social", "pfrazee.com".
  const raw = person.network === "bluesky" ? (person.handle ?? "").replace(/\.bsky\.social$/i, "").replace(/\.[a-z]+$/i, "") : person.handle ?? "";
  const handle = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (handle.length >= 5) {
    const [first, last] = [name[0], name[name.length - 1]];
    if (handle === first + last || handle === last + first) return { score: 0.85, reason: "handleMatchesName" };
    if (handle.includes(first) && handle.includes(last)) return { score: 0.6, reason: "handleMatchesName" };
  }
  return undefined;
}

export interface MatchOptions {
  /** contactId → person ids the user said aren't them. */
  rejected?: Record<string, string[]>;
  /** person ids already linked to some contact. */
  linked?: Set<string>;
  max?: number;
}

/** The candidates for one contact, best first, leaving out the networks it already has a link to. */
export function candidatesFor(contact: Contact, people: SocialPerson[], options: MatchOptions = {}): ProfileCandidate[] {
  const name = contactWords(contact);
  if (name.length < 2) return [];
  const rejected = new Set(options.rejected?.[contact.id] ?? []);
  const found: ProfileCandidate[] = [];
  for (const person of people) {
    if (rejected.has(person.id) || options.linked?.has(person.id)) continue;
    if (contact.urls.some((u) => sameLink(u.value, person.url))) continue;
    const match = scoreMatch(name, person);
    if (match) found.push({ person, ...match });
  }
  return found.sort((a, b) => b.score - a.score || a.person.network.localeCompare(b.person.network)).slice(0, options.max ?? 6);
}
