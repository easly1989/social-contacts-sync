import { contactEntries, writable } from "./cleanup/merge";
import { ContactsApi, Person, updateHeader } from "./cleanup/people";

/*
  Profile links saved on Google contacts (issue #51): added from the report
  and from review, removed again when that change is undone.
*/

type Url = NonNullable<Person["urls"]>[number];

/** Same link, however it was typed: no scheme, www. or trailing slash. */
export function sameLink(a: string, b: string): boolean {
  const key = (u: string) => u.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
  return key(a) === key(b);
}

function contactUrls(person: Person): Url[] {
  return contactEntries(person.urls).map(writable);
}

/** Adds `url` to the contact's websites; false when it was already there. */
export async function addContactLink(api: ContactsApi, contactId: string, url: string): Promise<boolean> {
  const person = await api.get(contactId);
  const urls = contactUrls(person);
  if (urls.some((u) => sameLink(u.value ?? "", url))) return false;
  await api.update(contactId, { ...updateHeader(person), urls: [...urls, { value: url, type: "profile" }] }, ["urls"]);
  return true;
}

/** Removes `url` from the contact's websites, if it's still there. */
export async function removeContactLink(api: ContactsApi, contactId: string, url: string): Promise<void> {
  const person = await api.get(contactId);
  const urls = contactUrls(person);
  const kept = urls.filter((u) => !sameLink(u.value ?? "", url));
  if (kept.length !== urls.length) await api.update(contactId, { ...updateHeader(person), urls: kept }, ["urls"]);
}
