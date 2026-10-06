import { CountryCode } from "libphonenumber-js";

import { MergeRequest } from "../../../interfaces/api";
import { Base64 } from "../types";
import { ContactsApi, Person, toCleanupContact, updateHeader, writableFields } from "./people";
import { normalizeEmail, toE164 } from "./scan";

/*
  Merging duplicates (issue #28). Google has no merge, so the kept contact
  gets the chosen values and the others are deleted, after every contact
  in the group is backed up for undo.
*/

type Entry = { metadata?: { source?: { type?: string | null } | null } | null };

/** A field entry without Google's read-only metadata (sources, primary flags). */
export function writable<T extends Entry>(entry: T): T {
  const { metadata: _metadata, ...rest } = entry;
  return rest as T;
}

/**
 * The entries saved on the contact itself. A contact linked to a Google
 * profile also lists the profile's name, numbers and so on; writing those
 * back would copy them into the contact (and a second name is refused).
 */
export function contactEntries<T extends Entry>(entries: T[] | null | undefined): T[] {
  return (entries ?? []).filter((e) => !e.metadata?.source?.type || e.metadata.source.type === "CONTACT");
}

/** Fields Google allows only once on a contact. */
const singletons = new Set<string>(["names", "birthdays"]);

function dedupe<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export class MergeError extends Error {
  constructor(public code: "invalid_request" | "changed_since_scan") {
    super(code);
  }
}

export interface MergePlan {
  keepId: string;
  /** Body for updateContact on the kept contact (with its etag). */
  update: Person;
  deleteIds: string[];
  /** Keep the current photo, remove it, or copy another contact's. */
  photo: { action: "keep" } | { action: "delete" } | { action: "copy"; from: string };
}

/** The writable fields of a backup, for restoring it with update or create. */
export function restorable(person: Person): Person {
  const body: Record<string, unknown> = {};
  for (const field of writableFields) {
    const entries = contactEntries(person[field] as Entry[]).map(writable);
    body[field] =
      field === "memberships"
        ? // Only the group is writable; its ID is output only.
          (entries as Membership[]).filter(isWritableGroup).map((m) => ({ contactGroupMembership: { contactGroupResourceName: m.contactGroupMembership!.contactGroupResourceName } }))
        : singletons.has(field)
          ? entries.slice(0, 1)
          : entries;
  }
  return body as Person;
}

type Membership = NonNullable<Person["memberships"]>[number];

const myContacts = "contactGroups/myContacts";

/**
 * A group a contact can be put in: the user's labels, My Contacts and
 * Starred. Google's other system groups are read-only.
 */
function isWritableGroup(m: Membership): boolean {
  const group = m.contactGroupMembership?.contactGroupResourceName;
  if (!group) return false;
  const system = /^contactGroups\/(myContacts|starred|friends|family|coworkers|chatBuddies|all|blocked)$/.exec(group);
  return !system || system[1] === "myContacts" || system[1] === "starred";
}

export function planMerge(people: Person[], request: MergeRequest, region?: CountryCode): MergePlan {
  const byId = new Map(people.map((p) => [p.resourceName!, p]));
  const ids = [...byId.keys()];
  const kept = byId.get(request.keepId);
  const known = (id: string | null | undefined) => id === undefined || id === null || byId.has(id);
  const lists = [request.phones, request.emails, request.addresses];
  if (!kept || !known(request.name) || !known(request.photo) || !known(request.company) || !known(request.birthday) || !lists.every((l) => Array.isArray(l) && l.every((id) => byId.has(id))))
    throw new MergeError("invalid_request");

  const from = (id: string | null | undefined) => (id === undefined ? kept : id === null ? undefined : byId.get(id));
  // Kept contact first, then the others in the group's order.
  const ordered = (chosen: string[]) => [request.keepId, ...ids.filter((id) => id !== request.keepId)].filter((id) => chosen.includes(id)).map((id) => byId.get(id)!);

  const update: Person = {
    ...updateHeader(kept),
    names: contactEntries(from(request.name ?? request.keepId)?.names).slice(0, 1).map(writable),
    organizations: contactEntries(from(request.company)?.organizations).map(writable),
    birthdays: contactEntries(from(request.birthday)?.birthdays).slice(0, 1).map(writable),
    phoneNumbers: dedupe(
      ordered(request.phones).flatMap((p) => contactEntries(p.phoneNumbers).map(writable)),
      (n) => toE164(n.value ?? "", region) ?? (n.value ?? "").replace(/\D/g, "")
    ),
    emailAddresses: dedupe(
      ordered(request.emails).flatMap((p) => contactEntries(p.emailAddresses).map(writable)),
      (e) => normalizeEmail(e.value ?? "")
    ),
    addresses: dedupe(
      ordered(request.addresses).flatMap((p) => contactEntries(p.addresses).map(writable)),
      (a) => (a.formattedValue ?? JSON.stringify(a)).toLowerCase().replace(/\s+/g, " ")
    ),
    // Every link of the group: profile links are photo sources (issue #51).
    urls: dedupe(
      people.flatMap((p) => contactEntries(p.urls).map(writable)),
      (u) => (u.value ?? "").toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")
    ),
    // Labels of every contact in the group. Google refuses an update that
    // leaves a contact in no group, and connections are in My Contacts.
    memberships: dedupe(
      [...people.flatMap((p) => restorable(p).memberships ?? []), { contactGroupMembership: { contactGroupResourceName: myContacts } }],
      (m) => m.contactGroupMembership!.contactGroupResourceName!
    ),
  };

  const keptHasPhoto = toCleanupContact(kept).hasPhoto;
  let photo: MergePlan["photo"] = { action: "keep" };
  if (request.photo === null) photo = keptHasPhoto ? { action: "delete" } : { action: "keep" };
  else if (request.photo && request.photo !== request.keepId && toCleanupContact(byId.get(request.photo)!).hasPhoto) photo = { action: "copy", from: request.photo };

  return { keepId: request.keepId, update, deleteIds: ids.filter((id) => id !== request.keepId), photo };
}

/** What a merge did, saved before the first change so it can be undone. */
export interface MergeBackup {
  /** Every contact in the group as it was. */
  people: Person[];
  /** Their photos, by index in `people`. */
  photos: (Base64 | null)[];
  keptId: string;
  steps: { updated: boolean; photo: boolean; deleted: string[] };
  /** Undo: new IDs of the re-created contacts. */
  restored?: Record<string, string>;
}

/**
 * Re-reads the group, checks nothing changed since the scan (`expectedUpdates`:
 * contact → updatedAt seen by the scan), backs it up with `save`, then merges.
 * `save` is called again after each step, so a failure half-way can be undone.
 */
export async function executeMerge(
  api: ContactsApi,
  contactIds: string[],
  request: MergeRequest,
  options: { region?: CountryCode; expectedUpdates: Record<string, string | undefined>; save: (backup: MergeBackup) => void }
): Promise<MergeBackup> {
  const people = await Promise.all(contactIds.map((id) => api.get(id)));
  for (const person of people)
    if (toCleanupContact(person).updatedAt !== options.expectedUpdates[person.resourceName!]) throw new MergeError("changed_since_scan");
  const plan = planMerge(people, request, options.region);

  const photos = await Promise.all(people.map((p) => api.photo(p)));
  const backup: MergeBackup = { people, photos, keptId: plan.keepId, steps: { updated: false, photo: false, deleted: [] } };
  options.save(backup);

  await api.update(plan.keepId, plan.update, writableFields);
  backup.steps.updated = true;
  options.save(backup);

  if (plan.photo.action !== "keep") {
    if (plan.photo.action === "delete") await api.deletePhoto(plan.keepId);
    else {
      const from = plan.photo.from;
      const photo = photos[people.findIndex((p) => p.resourceName === from)];
      if (photo) await api.setPhoto(plan.keepId, photo);
    }
    backup.steps.photo = true;
    options.save(backup);
  }

  for (const id of plan.deleteIds) {
    await api.remove(id);
    backup.steps.deleted.push(id);
    options.save(backup);
  }
  return backup;
}

/** Google refuses to update memberships to none; contacts are at least in My Contacts. */
function withGroup(person: Person): Person {
  return person.memberships?.length ? person : { ...person, memberships: [{ contactGroupMembership: { contactGroupResourceName: myContacts } }] };
}

/** Puts the kept contact back as it was and re-creates the deleted ones. */
export async function undoMerge(api: ContactsApi, backup: MergeBackup, save: (backup: MergeBackup) => void): Promise<void> {
  const index = (id: string) => backup.people.findIndex((p) => p.resourceName === id);
  const keptIndex = index(backup.keptId);
  if (backup.steps.updated) {
    const current = await api.get(backup.keptId);
    await api.update(backup.keptId, withGroup({ ...restorable(backup.people[keptIndex]), ...updateHeader(current) }), writableFields);
    backup.steps.updated = false;
    save(backup);
  }
  if (backup.steps.photo) {
    const photo = backup.photos[keptIndex];
    if (photo) await api.setPhoto(backup.keptId, photo);
    else await api.deletePhoto(backup.keptId);
    backup.steps.photo = false;
    save(backup);
  }
  backup.restored ??= {};
  for (const id of [...backup.steps.deleted]) {
    const i = index(id);
    const created = await api.create(restorable(backup.people[i]));
    const photo = backup.photos[i];
    if (photo) await api.setPhoto(created.resourceName!, photo);
    backup.restored[id] = created.resourceName!;
    backup.steps.deleted = backup.steps.deleted.filter((d) => d !== id);
    save(backup);
  }
}
