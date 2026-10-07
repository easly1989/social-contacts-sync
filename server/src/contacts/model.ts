import { Contact, ContactAddress, ContactField, ContactInput } from "../../../interfaces/api";
import { contactEntries, restorable, writable } from "../cleanup/merge";
import { ownPhotoUrl, Person, updateHeader } from "../cleanup/people";

/*
  The Contacts page (issue #55): a Google person as the page shows and edits
  it, and back. Only the entries saved on the contact itself are shown and
  written (not those of a linked Google profile), and an update only writes
  the fields that changed, so whatever the editor doesn't show (a second
  organization, a birthday saved as text…) is left as it is.
*/

const myContacts = "contactGroups/myContacts";
const userGroup = /^contactGroups\/(?!(myContacts|starred|friends|family|coworkers|chatBuddies|all|blocked)$)\w+$/;

const clean = (s: string | null | undefined) => (s ?? "").trim() || undefined;
const field = (e: { value?: string | null; type?: string | null; formattedType?: string | null }): ContactField | undefined =>
  clean(e.value) ? { value: clean(e.value)!, ...(clean(e.type) ? { type: clean(e.type) } : {}) } : undefined;

/** The photo address without its size suffix: Google serves one photo under several. */
export function photoKey(url: string | undefined | null): string | undefined {
  return url ? url.replace(/[?#].*$/, "").replace(/=[^/=]*$/, "") : undefined;
}

export function toContact(person: Person, placeholders: Record<string, string> = {}): Contact {
  const name = contactEntries(person.names)[0];
  const org = contactEntries(person.organizations)[0];
  const date = contactEntries(person.birthdays).find((b) => b.date?.month && b.date.day)?.date;
  const photoUrl = ownPhotoUrl(person);
  const id = person.resourceName!;
  const updatedAt = person.metadata?.sources?.map((s) => s.updateTime).filter((t): t is string => Boolean(t)).sort().pop();
  const placeholder = Boolean(photoUrl && placeholders[id] && placeholders[id] === photoKey(photoUrl));
  return {
    id,
    name: clean(person.names?.find((n) => n.displayName)?.displayName),
    honorificPrefix: clean(name?.honorificPrefix),
    givenName: clean(name?.givenName),
    middleName: clean(name?.middleName),
    familyName: clean(name?.familyName),
    honorificSuffix: clean(name?.honorificSuffix),
    company: clean(org?.name),
    jobTitle: clean(org?.title),
    phones: contactEntries(person.phoneNumbers).map(field).filter((f): f is ContactField => Boolean(f)),
    emails: contactEntries(person.emailAddresses).map(field).filter((f): f is ContactField => Boolean(f)),
    urls: contactEntries(person.urls).map(field).filter((f): f is ContactField => Boolean(f)),
    addresses: contactEntries(person.addresses)
      .map((a) =>
        Object.fromEntries(
          Object.entries({
            street: clean(a.streetAddress) ?? (a.streetAddress === undefined && !a.city && !a.postalCode ? clean(a.formattedValue) : undefined),
            extended: clean(a.extendedAddress),
            poBox: clean(a.poBox),
            postalCode: clean(a.postalCode),
            city: clean(a.city),
            region: clean(a.region),
            country: clean(a.country),
            countryCode: clean(a.countryCode),
            type: clean(a.type),
          }).filter(([, v]) => v !== undefined)
        ) as ContactAddress
      )
      .filter((a) => Object.keys(a).some((k) => k !== "type")),
    ...(date ? { birthday: { ...(date.year ? { year: date.year } : {}), month: date.month!, day: date.day! } } : {}),
    notes: clean(contactEntries(person.biographies)[0]?.value),
    labels: (person.memberships ?? []).map((m) => m.contactGroupMembership?.contactGroupResourceName ?? "").filter((g) => userGroup.test(g)),
    hasPhoto: Boolean(photoUrl),
    photoUrl,
    ...(placeholder ? { placeholder } : {}),
    updatedAt,
  };
}

/** What the editor can change, from untrusted JSON: strings trimmed, empties dropped. */
export function parseInput(body: unknown): ContactInput | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as Record<string, unknown>;
  const text = (v: unknown, max = 500) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
  const list = (v: unknown): ContactField[] =>
    (Array.isArray(v) ? v : [])
      .slice(0, 50)
      .flatMap((e): ContactField[] => {
        const value = text(e?.value);
        const type = text(e?.type, 50);
        return value ? [type ? { value, type } : { value }] : [];
      });
  const addresses = (Array.isArray(b.addresses) ? b.addresses : []).slice(0, 20).map((a) => {
    const entry: ContactAddress = {};
    for (const key of ["street", "extended", "poBox", "postalCode", "city", "region", "country", "countryCode", "type"] as const) {
      const value = text(a?.[key], 200);
      if (value) entry[key] = value;
    }
    return entry;
  });
  const bd = b.birthday as Record<string, unknown> | undefined;
  const int = (v: unknown, min: number, max: number) => (Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : undefined);
  const month = int(bd?.month, 1, 12);
  const day = int(bd?.day, 1, 31);
  const year = int(bd?.year, 1, 9999);
  return {
    honorificPrefix: text(b.honorificPrefix, 200),
    givenName: text(b.givenName, 200),
    middleName: text(b.middleName, 200),
    familyName: text(b.familyName, 200),
    honorificSuffix: text(b.honorificSuffix, 200),
    company: text(b.company, 200),
    jobTitle: text(b.jobTitle, 200),
    phones: list(b.phones),
    emails: list(b.emails),
    urls: list(b.urls),
    addresses: addresses.filter((a) => Object.keys(a).some((k) => k !== "type")),
    ...(month && day ? { birthday: { ...(year ? { year } : {}), month, day } } : {}),
    notes: text(b.notes, 5000),
    labels: (Array.isArray(b.labels) ? b.labels : []).filter((l): l is string => typeof l === "string" && userGroup.test(l)).slice(0, 50),
  };
}

type Field = "names" | "organizations" | "phoneNumbers" | "emailAddresses" | "urls" | "addresses" | "birthdays" | "biographies" | "memberships";

const nameKeys = ["honorificPrefix", "givenName", "middleName", "familyName", "honorificSuffix"] as const;

/** Whether the input has any part of a name. */
export function hasName(input: ContactInput): boolean {
  return nameKeys.some((k) => input[k]);
}

/** The phonetic name isn't in the editor: it stays. */
function phoneticParts(current?: Person) {
  const name = contactEntries(current?.names)[0];
  return Object.fromEntries((["phoneticGivenName", "phoneticMiddleName", "phoneticFamilyName"] as const).filter((k) => name?.[k]).map((k) => [k, name![k]]));
}

/** The People API entries for each editable field. */
function entries(input: ContactInput, current?: Person): Required<Pick<Person, Field>> {
  const fields = (list: ContactField[]) => list.map((f) => ({ value: f.value, ...(f.type ? { type: f.type } : {}) }));
  // The organization the editor shows is the first; the others stay.
  const otherOrgs = contactEntries(current?.organizations).slice(1).map(writable);
  // Starred and My Contacts are kept; the labels are what the editor says.
  const system = (restorable(current ?? {}).memberships ?? []).filter((m) => !userGroup.test(m.contactGroupMembership!.contactGroupResourceName!));
  const groups = [...system.map((m) => m.contactGroupMembership!.contactGroupResourceName!), ...input.labels];
  if (!groups.includes(myContacts)) groups.unshift(myContacts);
  return {
    names: hasName(input) ? [{ ...phoneticParts(current), ...Object.fromEntries(nameKeys.map((k) => [k, input[k] ?? ""])) }] : [],
    organizations: [...(input.company || input.jobTitle ? [{ name: input.company ?? "", title: input.jobTitle ?? "" }] : []), ...otherOrgs],
    phoneNumbers: fields(input.phones),
    emailAddresses: fields(input.emails),
    urls: fields(input.urls),
    addresses: input.addresses.map((a) => ({
      streetAddress: a.street,
      extendedAddress: a.extended,
      poBox: a.poBox,
      postalCode: a.postalCode,
      city: a.city,
      region: a.region,
      country: a.country,
      countryCode: a.countryCode,
      type: a.type,
    })),
    birthdays: input.birthday ? [{ date: { year: input.birthday.year ?? 0, month: input.birthday.month, day: input.birthday.day } }] : [],
    biographies: input.notes ? [{ value: input.notes, contentType: "TEXT_PLAIN" }] : [],
    memberships: [...new Set(groups)].map((g) => ({ contactGroupMembership: { contactGroupResourceName: g } })),
  };
}

/** The body for createContact. */
export function newPerson(input: ContactInput): Person {
  return entries(input);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The body and field list for updateContact: only the fields whose value
 * differs from the contact as it is now. Nothing changed: no fields.
 */
export function personUpdate(current: Person, input: ContactInput): { body: Person; fields: Field[] } {
  const now = toContact(current);
  const changed: Record<Field, boolean> = {
    names: nameKeys.some((k) => now[k] !== input[k]),
    organizations: now.company !== input.company || now.jobTitle !== input.jobTitle,
    phoneNumbers: !same(now.phones, input.phones),
    emailAddresses: !same(now.emails, input.emails),
    urls: !same(now.urls, input.urls),
    addresses: !same(now.addresses, input.addresses),
    birthdays: !same(now.birthday, input.birthday),
    biographies: now.notes !== input.notes,
    memberships: !same([...now.labels].sort(), [...input.labels].sort()),
  };
  const fields = (Object.keys(changed) as Field[]).filter((f) => changed[f]);
  const all = entries(input, current);
  const body: Person = { ...updateHeader(current) };
  for (const f of fields) (body as Record<string, unknown>)[f] = all[f];
  return { body, fields };
}

/** A copy of a contact, for createContact. */
export function duplicatePerson(person: Person): Person {
  const body = restorable(person);
  if (!body.memberships?.length) body.memberships = [{ contactGroupMembership: { contactGroupResourceName: myContacts } }];
  return body;
}

/** The contact's memberships with a label added or removed, or undefined if nothing changes. */
export function withLabel(person: Person, label: string, add: boolean): Person | undefined {
  const memberships = restorable(person).memberships ?? [];
  const has = memberships.some((m) => m.contactGroupMembership?.contactGroupResourceName === label);
  if (has === add) return undefined;
  const next = add
    ? [...memberships, { contactGroupMembership: { contactGroupResourceName: label } }]
    : memberships.filter((m) => m.contactGroupMembership?.contactGroupResourceName !== label);
  if (!next.length) next.push({ contactGroupMembership: { contactGroupResourceName: myContacts } });
  return { ...updateHeader(person), memberships: next };
}

export { userGroup };
