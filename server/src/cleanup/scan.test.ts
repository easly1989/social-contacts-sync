import test from "node:test";
import assert from "node:assert/strict";

import { CleanupContact } from "../../../interfaces/api";
import { hasCountryCode, namesCompatible, normalizeEmail, normalizeName, pairKey, scanContacts } from "./scan";

function contact(id: string, name: string | undefined, extra: Partial<CleanupContact> = {}): CleanupContact {
  return { id, name, phones: [], emails: [], addresses: [], hasPhoto: false, ...extra };
}
const phones = (...values: string[]) => values.map((value) => ({ value }));
const emails = (...values: string[]) => values.map((value) => ({ value }));

test("names are compared without accents, case or punctuation", () => {
  assert.equal(normalizeName("  Élena   Contì "), "elena conti");
  assert.equal(normalizeName("Marco R."), "marco r");
  assert.equal(normalizeName(undefined), "");
});

test("compatible names: equal, abbreviated, or missing", () => {
  assert.equal(namesCompatible("Marco Rossi", "marco rossi"), true);
  assert.equal(namesCompatible("Marco R.", "Marco Rossi"), true);
  assert.equal(namesCompatible(undefined, "Marco Rossi"), true);
  assert.equal(namesCompatible("Mamma", "Maria Esposito"), false);
  assert.equal(namesCompatible("Luca", "Luca Romano"), false);
  assert.equal(namesCompatible("Marco Rossi", "Mario Rossi"), false);
});

test("emails: case, Gmail dots and tags", () => {
  assert.equal(normalizeEmail(" Ada.Lovelace+work@GoogleMail.com"), "adalovelace@gmail.com");
  assert.equal(normalizeEmail("a.b+c@example.com"), "a.b+c@example.com");
});

test("country codes", () => {
  assert.equal(hasCountryCode("+39 333 1234567"), true);
  assert.equal(hasCountryCode("0039 333 1234567"), true);
  assert.equal(hasCountryCode("333 1234567"), false);
});

test("duplicates by phone (compatible names), email and full name; groups join", () => {
  const scan = scanContacts(
    [
      contact("a", "Marco Rossi", { phones: phones("+39 333 812 5517"), updatedAt: "2026-09-30T00:00:00Z" }),
      contact("b", "Marco R.", { phones: phones("333 8125517"), emails: emails("m.rossi@studio.example"), updatedAt: "2019-01-01T00:00:00Z" }),
      contact("c", undefined, { emails: emails("M.Rossi@studio.example") }),
      contact("d", "Giulia Bianchi", { emails: emails("giulia@example.com") }),
      contact("e", "Giulia  Bianchi"),
      contact("f", "Luca"),
      contact("g", "Luca"),
    ],
    { region: "IT" }
  );
  assert.deepEqual(
    scan.duplicates.map((g) => ({ ids: g.contactIds, reasons: g.reasons })),
    [
      { ids: ["d", "e"], reasons: ["name"] },
      { ids: ["a", "b", "c"], reasons: ["phone", "email"] },
    ]
  );
  assert.equal(scan.duplicates[1].id.length, 12);
  // Single-word names alone don't make a duplicate.
  assert.equal(scan.contacts.f, undefined);
});

test("a number on different people is shared, not a duplicate", () => {
  const scan = scanContacts(
    [
      contact("m", "Mamma", { phones: phones("+39 340 221 6527") }),
      contact("e", "Maria Esposito", { phones: phones("+393402216527") }),
      contact("x", "Marco Rossi", { phones: phones("+39 333 812 5517") }),
      contact("y", "Marco Rossi", { phones: phones("+39 333 812 5517") }),
    ],
    { region: "IT" }
  );
  assert.deepEqual(scan.sharedNumbers, [{ e164: "+393402216527", contactIds: ["m", "e"] }]);
  assert.deepEqual(scan.duplicates.map((g) => g.contactIds.sort()), [["x", "y"]]);
});

test("ignored pairs and numbers marked as shared drop out", () => {
  const people = [
    contact("a", "Sara Bruno", { phones: phones("+39 328 309 7537") }),
    contact("b", "Sara Bruno"),
    contact("c", "Studio", { phones: phones("+39 02 8899 1100") }),
    contact("d", "Paolo Bianchi", { phones: phones("+39 02 8899 1100") }),
  ];
  const scan = scanContacts(people, { region: "IT", ignoredPairs: new Set([pairKey("b", "a")]), sharedNumbers: new Set(["+390288991100"]) });
  assert.deepEqual(scan.duplicates, []);
  assert.deepEqual(scan.sharedNumbers, []);
});

test("numbers without a country code get a suggestion from the region", () => {
  const scan = scanContacts([contact("a", "Ada", { phones: phones("333 1234567", "+44 20 7946 0958") }), contact("b", "Bob", { phones: phones("12") })], {
    region: "IT",
    now: new Date("2026-10-03T12:00:00Z"),
  });
  assert.deepEqual(scan.missingCountryCode, [
    { contactId: "a", value: "333 1234567", suggestion: "+39 333 123 4567" },
    { contactId: "b", value: "12", suggestion: undefined },
  ]);
  assert.equal(scan.scannedAt, "2026-10-03T12:00:00.000Z");
  assert.equal(scan.totalContacts, 2);
});
