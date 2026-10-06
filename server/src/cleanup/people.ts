import { people as peopleApi, people_v1 } from "@googleapis/people";

import { CleanupContact } from "../../../interfaces/api";
import { OAuth2Client } from "../gapi";
import { Base64 } from "../types";
import { withGoogleRetry } from "../googleRetry";

/*
  The Google People API calls clean-up needs, behind a small interface so
  the merge and undo logic can be tested with a fake address book.
*/

export type Person = people_v1.Schema$Person;

/** Fields clean-up reads, merges, backs up and restores. */
export const personFields = "names,emailAddresses,phoneNumbers,photos,organizations,birthdays,addresses,urls,memberships,metadata";
/** Fields a merge or an undo writes with updateContact. */
export const writableFields = ["names", "emailAddresses", "phoneNumbers", "organizations", "birthdays", "addresses", "urls", "memberships"] as const;

/**
 * What updateContact needs besides the changed fields: the contact's etag
 * and its contact sources with their etags (Google refuses the update with
 * a 400 without them, and with failedPrecondition when they are stale).
 */
export function updateHeader(person: Person): Person {
  const sources = (person.metadata?.sources ?? []).filter((s) => s.type === "CONTACT").map(({ type, id, etag }) => ({ type, id, etag }));
  return { etag: person.etag, metadata: { sources } };
}

export interface ContactsApi {
  list(): Promise<Person[]>;
  get(resourceName: string): Promise<Person>;
  update(resourceName: string, person: Person, fields: readonly string[]): Promise<Person>;
  create(person: Person): Promise<Person>;
  remove(resourceName: string): Promise<void>;
  setPhoto(resourceName: string, photo: Base64): Promise<void>;
  deletePhoto(resourceName: string): Promise<void>;
  /** The contact's own photo (not Google's default letter), or null. */
  photo(person: Person): Promise<Base64 | null>;
}

export function ownPhotoUrl(person: Person): string | undefined {
  return person.photos?.find((p) => !p.default && p.url)?.url ?? undefined;
}

function birthdayText(person: Person): string | undefined {
  const date = person.birthdays?.find((b) => b.date)?.date;
  if (!date?.month || !date.day) return person.birthdays?.find((b) => b.text)?.text ?? undefined;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.year ? date.year : "-"}-${pad(date.month)}-${pad(date.day)}`;
}

export function toCleanupContact(person: Person): CleanupContact {
  const updatedAt = person.metadata?.sources?.map((s) => s.updateTime).filter((t): t is string => Boolean(t)).sort().pop();
  return {
    id: person.resourceName!,
    name: person.names?.find((n) => n.displayName)?.displayName ?? undefined,
    phones: (person.phoneNumbers ?? []).filter((p) => p.value).map((p) => ({ value: p.value!, type: p.formattedType ?? p.type ?? undefined })),
    emails: (person.emailAddresses ?? []).filter((e) => e.value).map((e) => ({ value: e.value!, type: e.formattedType ?? e.type ?? undefined })),
    company: person.organizations?.find((o) => o.name)?.name ?? undefined,
    birthday: birthdayText(person),
    addresses: (person.addresses ?? [])
      .map((a) => ({ value: a.formattedValue ?? [a.streetAddress, a.postalCode, a.city, a.country].filter(Boolean).join(", "), type: a.formattedType ?? a.type ?? undefined }))
      .filter((a) => a.value),
    hasPhoto: Boolean(ownPhotoUrl(person)),
    photoUrl: ownPhotoUrl(person),
    updatedAt,
  };
}

export function peopleContactsApi(auth: OAuth2Client): ContactsApi {
  const people = peopleApi({ version: "v1", auth }).people;
  return {
    async list() {
      const all: Person[] = [];
      let pageToken: string | undefined;
      do {
        const res = await people.connections.list({ resourceName: "people/me", pageSize: 1000, personFields, pageToken });
        all.push(...(res.data.connections ?? []));
        pageToken = res.data.nextPageToken ?? undefined;
      } while (pageToken);
      return all;
    },
    async get(resourceName) {
      return (await people.get({ resourceName, personFields })).data;
    },
    async update(resourceName, person, fields) {
      return (await people.updateContact({ resourceName, updatePersonFields: fields.join(","), personFields, requestBody: person })).data;
    },
    async create(person) {
      return (await people.createContact({ personFields, requestBody: person })).data;
    },
    async remove(resourceName) {
      await people.deleteContact({ resourceName });
    },
    async setPhoto(resourceName, photo) {
      await withGoogleRetry(() => people.updateContactPhoto({ resourceName, requestBody: { photoBytes: photo } }));
    },
    async deletePhoto(resourceName) {
      await withGoogleRetry(() => people.deleteContactPhoto({ resourceName }));
    },
    async photo(person) {
      const url = ownPhotoUrl(person);
      if (!url) return null;
      // Full size rather than the list's thumbnail.
      const response = await fetch(url.replace(/=s\d+$/, "=s0"));
      if (!response.ok) return null;
      const bytes = Buffer.from(await response.arrayBuffer());
      return bytes.length ? bytes.toString("base64") : null;
    },
  };
}
