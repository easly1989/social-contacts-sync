import crypto from "crypto";
import { CountryCode, parsePhoneNumberFromString } from "libphonenumber-js";

import { CleanupContact, CleanupScan, DuplicateGroup, DuplicateReason, MissingCountryCode, SharedNumber } from "../../../interfaces/api";

/*
  Clean-up findings from one pass over the address book (issue #28):
  duplicate contacts, numbers shared by different people, and numbers saved
  without a country code. Pure functions; reading Google is in people.ts.
*/

/** Lower case, no accents, punctuation or extra spaces: "Élena  Contì" → "elena conti". */
export function normalizeName(name: string | undefined): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Could these be the same person? Equal names, or the same number of words
 * where each pair is equal or one abbreviates the other ("Marco R." and
 * "Marco Rossi"). A missing name is compatible with anything.
 */
export function namesCompatible(a: string | undefined, b: string | undefined): boolean {
  const x = normalizeName(a).split(" ").filter(Boolean);
  const y = normalizeName(b).split(" ").filter(Boolean);
  if (!x.length || !y.length) return true;
  if (x.length !== y.length) return false;
  return x.every((word, i) => word === y[i] || word.startsWith(y[i]) || y[i].startsWith(word));
}

/** Case-insensitive; Gmail ignores dots and "+tags" in the local part. */
export function normalizeEmail(email: string): string {
  const value = email.trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at < 0) return value;
  let local = value.slice(0, at);
  let domain = value.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.split("+")[0].replace(/\./g, "");
  return `${local}@${domain}`;
}

/** E.164 ("+393331234567") for a number as saved, using `region` when it has no country code. */
export function toE164(value: string, region?: CountryCode): string | undefined {
  const parsed = parsePhoneNumberFromString(value, region);
  return parsed?.isPossible() ? parsed.number : undefined;
}

export function hasCountryCode(value: string): boolean {
  const v = value.trim();
  return v.startsWith("+") || v.startsWith("00");
}

/** Same pair in either order, for remembering "Not duplicates". */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function groupId(contactIds: string[]): string {
  return crypto.createHash("sha1").update([...contactIds].sort().join(",")).digest("hex").slice(0, 12);
}

export interface ScanOptions {
  region?: CountryCode;
  /** Pairs marked "Not duplicates" (pairKey). */
  ignoredPairs?: Set<string>;
  /** Numbers marked as shared (E.164): neither duplicates nor findings. */
  sharedNumbers?: Set<string>;
  now?: Date;
}

export function scanContacts(contacts: CleanupContact[], options: ScanOptions = {}): CleanupScan {
  const { region, ignoredPairs = new Set(), sharedNumbers = new Set() } = options;
  const byId = new Map(contacts.map((c) => [c.id, c]));
  for (const c of contacts) for (const phone of c.phones) phone.e164 ??= toE164(phone.value, region);

  // Union-find over contacts linked by a duplicate signal.
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    while (parent.get(id) !== id) id = parent.get(id) ?? id;
    return id;
  };
  contacts.forEach((c) => parent.set(c.id, c.id));
  const edgeReasons = new Map<string, Set<DuplicateReason>>();
  const link = (a: string, b: string, reason: DuplicateReason) => {
    if (a === b || ignoredPairs.has(pairKey(a, b))) return;
    const key = pairKey(a, b);
    if (!edgeReasons.has(key)) edgeReasons.set(key, new Set());
    edgeReasons.get(key)!.add(reason);
    parent.set(find(a), find(b));
  };
  const linkAll = (index: Map<string, string[]>, reason: DuplicateReason, compatible?: (a: string, b: string) => boolean) => {
    for (const ids of index.values()) {
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) if (!compatible || compatible(ids[i], ids[j])) link(ids[i], ids[j], reason);
    }
  };
  const index = (key: (c: CleanupContact) => string[]) => {
    const map = new Map<string, string[]>();
    for (const c of contacts)
      for (const k of new Set(key(c))) {
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(c.id);
      }
    return map;
  };

  const byPhone = index((c) => c.phones.map((p) => p.e164).filter((e): e is string => Boolean(e)));
  for (const shared of sharedNumbers) byPhone.delete(shared);
  const sameName = (a: string, b: string) => namesCompatible(byId.get(a)!.name, byId.get(b)!.name);
  linkAll(byPhone, "phone", sameName);
  linkAll(index((c) => c.emails.map((e) => normalizeEmail(e.value))), "email");
  linkAll(
    index((c) => {
      const name = normalizeName(c.name);
      return name.split(" ").length >= 2 ? [name] : [];
    }),
    "name"
  );

  const members = new Map<string, string[]>();
  for (const c of contacts) {
    const root = find(c.id);
    if (!members.has(root)) members.set(root, []);
    members.get(root)!.push(c.id);
  }
  const recentFirst = (a: string, b: string) => (byId.get(b)!.updatedAt ?? "").localeCompare(byId.get(a)!.updatedAt ?? "");
  const duplicates: DuplicateGroup[] = [...members.values()]
    .filter((ids) => ids.length > 1)
    .map((ids) => {
      const reasons = new Set<DuplicateReason>();
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) edgeReasons.get(pairKey(ids[i], ids[j]))?.forEach((r) => reasons.add(r));
      const contactIds = [...ids].sort(recentFirst);
      return { id: groupId(contactIds), contactIds, reasons: (["phone", "email", "name"] as const).filter((r) => reasons.has(r)) };
    })
    .sort((a, b) => normalizeName(byId.get(a.contactIds[0])!.name).localeCompare(normalizeName(byId.get(b.contactIds[0])!.name)));

  // A number on contacts that aren't all in one duplicate group.
  const shared: SharedNumber[] = [...byPhone.entries()]
    .filter(([, ids]) => ids.length > 1 && new Set(ids.map(find)).size > 1)
    .map(([e164, ids]) => ({ e164, contactIds: ids }))
    .sort((a, b) => a.e164.localeCompare(b.e164));

  const missingCountryCode: MissingCountryCode[] = contacts.flatMap((c) =>
    c.phones
      .filter((p) => !hasCountryCode(p.value))
      .map((p) => ({ contactId: c.id, value: p.value, suggestion: p.e164 }))
  );

  const involved = new Set([
    ...duplicates.flatMap((g) => g.contactIds),
    ...shared.flatMap((s) => s.contactIds),
    ...missingCountryCode.map((m) => m.contactId),
  ]);
  return {
    scannedAt: (options.now ?? new Date()).toISOString(),
    totalContacts: contacts.length,
    region,
    contacts: Object.fromEntries([...involved].map((id) => [id, byId.get(id)!])),
    duplicates,
    sharedNumbers: shared,
    missingCountryCode,
  };
}
