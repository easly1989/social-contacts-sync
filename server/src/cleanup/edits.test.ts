import test from "node:test";
import assert from "node:assert/strict";

import { editNumbers, undoEdits, withCountryCode, withCountryCodes, withoutNumber } from "./edits";
import { FakeContacts } from "./fakeContacts";
import { Person } from "./people";

const mamma: Person = { resourceName: "people/m", names: [{ displayName: "Mamma" }], phoneNumbers: [{ value: "340 221 6527", type: "mobile" }, { value: "+39 06 1234 5678" }] };
const maria: Person = { resourceName: "people/e", names: [{ displayName: "Maria Esposito" }], phoneNumbers: [{ value: "+393402216527", canonicalForm: "+393402216527" }] };

test("a number is removed however it was saved", () => {
  assert.deepEqual(withoutNumber(mamma, "+393402216527", "IT"), [{ value: "+39 06 1234 5678" }]);
  assert.deepEqual(withoutNumber(maria, "+393402216527", "IT"), []);
  assert.equal(withoutNumber(maria, "+390000000000", "IT"), undefined);
});

test("country codes: only the chosen numbers that parse", () => {
  assert.equal(withCountryCode("333 1234567", "IT"), "+39 333 123 4567");
  assert.equal(withCountryCode("+39 333 1234567", "IT"), undefined);
  assert.equal(withCountryCode("12", "IT"), undefined);
  const person: Person = { phoneNumbers: [{ value: "340 221 6527", canonicalForm: "+393402216527", type: "mobile" }, { value: "06 1234 5678" }] };
  assert.deepEqual(withCountryCodes(person, new Set(["340 221 6527"]), "IT"), [{ value: "+39 340 221 6527", type: "mobile" }, { value: "06 1234 5678" }]);
  assert.equal(withCountryCodes(person, new Set(["nope"]), "IT"), undefined);
});

test("edits back up first, skip unchanged contacts, and undo restores the numbers", async () => {
  const google = new FakeContacts([mamma, maria]);
  const saves: string[][] = [];
  const backup = await editNumbers(google, ["people/m", "people/e"], (p) => (p.resourceName === "people/e" ? withoutNumber(p, "+393402216527", "IT") : undefined), {
    save: (b) => saves.push([...b.updated]),
  });
  assert.deepEqual(saves, [[], ["people/e"]]);
  assert.deepEqual(google.calls, ["update people/e"]);
  assert.deepEqual((await google.get("people/e")).phoneNumbers, []);
  assert.equal(backup.people.length, 1);

  await undoEdits(google, backup, { save: () => undefined });
  assert.deepEqual((await google.get("people/e")).phoneNumbers, [{ value: "+393402216527", canonicalForm: "+393402216527" }]);
  assert.deepEqual(backup.updated, []);
});
