import { CountryCode, parsePhoneNumberFromString } from "libphonenumber-js";

import { restorable } from "./merge";
import { ContactsApi, Person, updateHeader } from "./people";
import { hasCountryCode, toE164 } from "./scan";

/*
  Phone-number fixes from clean-up (issue #30): keeping a shared number on
  one contact, and adding country codes. Each changed contact is backed up
  before the first write so the whole action can be undone.
*/

type PhoneNumber = NonNullable<Person["phoneNumbers"]>[number];

export interface EditBackup {
  /** The changed contacts as they were. */
  people: Person[];
  /** Contacts written so far (undo restores these). */
  updated: string[];
}

/** The contact's numbers without `e164`, however it was saved; undefined when it doesn't have it. */
export function withoutNumber(person: Person, e164: string, region?: CountryCode): PhoneNumber[] | undefined {
  const numbers = person.phoneNumbers ?? [];
  const kept = numbers.filter((n) => toE164(n.value ?? "", region) !== e164);
  return kept.length === numbers.length ? undefined : kept;
}

/** The international spelling of a number saved without a country code, e.g. "+39 333 123 4567". */
export function withCountryCode(value: string, region?: CountryCode): string | undefined {
  if (hasCountryCode(value)) return undefined;
  const parsed = parsePhoneNumberFromString(value, region);
  return parsed?.isPossible() ? parsed.formatInternational() : undefined;
}

/** The contact's numbers with `values` given a country code; undefined when none of them changes. */
export function withCountryCodes(person: Person, values: Set<string>, region?: CountryCode): PhoneNumber[] | undefined {
  let changed = false;
  const numbers = (person.phoneNumbers ?? []).map((n) => {
    const fixed = values.has(n.value ?? "") ? withCountryCode(n.value!, region) : undefined;
    if (!fixed) return n;
    changed = true;
    // canonicalForm is Google's; it recomputes it from the new value.
    const { canonicalForm: _canonical, ...rest } = n;
    return { ...rest, value: fixed };
  });
  return changed ? numbers : undefined;
}

/**
 * Applies `edit` to each contact's phone numbers. Contacts it leaves alone
 * aren't written. `save` gets the backup before the first write and after each.
 */
export async function editNumbers(
  api: ContactsApi,
  contactIds: string[],
  edit: (person: Person) => PhoneNumber[] | undefined,
  options: { save: (backup: EditBackup) => void; beforeWrite?: () => Promise<void> }
): Promise<EditBackup> {
  const people = await Promise.all(contactIds.map((id) => api.get(id)));
  const changes = people.map((person) => ({ person, numbers: edit(person) })).filter((c) => c.numbers);
  const backup: EditBackup = { people: changes.map((c) => c.person), updated: [] };
  options.save(backup);
  for (const { person, numbers } of changes) {
    await options.beforeWrite?.();
    await api.update(person.resourceName!, { ...updateHeader(person), phoneNumbers: restorable({ phoneNumbers: numbers }).phoneNumbers }, ["phoneNumbers"]);
    backup.updated.push(person.resourceName!);
    options.save(backup);
  }
  return backup;
}

/** Puts back the phone numbers of every contact the action changed. */
export async function undoEdits(
  api: ContactsApi,
  backup: EditBackup,
  options: { save: (backup: EditBackup) => void; beforeWrite?: () => Promise<void> }
): Promise<void> {
  for (const id of [...backup.updated]) {
    const before = backup.people.find((p) => p.resourceName === id)!;
    const current = await api.get(id);
    await options.beforeWrite?.();
    await api.update(id, { ...updateHeader(current), phoneNumbers: restorable(before).phoneNumbers }, ["phoneNumbers"]);
    backup.updated = backup.updated.filter((u) => u !== id);
    options.save(backup);
  }
}
