import test from "node:test";
import assert from "node:assert/strict";

import { FakeContacts } from "./fakeContacts";
import { executeMerge, MergeBackup, MergeError, planMerge, undoMerge } from "./merge";
import { Person, toCleanupContact } from "./people";

const meta = (updateTime: string) => ({ sources: [{ type: "CONTACT", id: "x", updateTime }] });
const label = (group: string) => ({ contactGroupMembership: { contactGroupResourceName: group } });

const marcoA: Person = {
  resourceName: "people/a",
  etag: "ea",
  metadata: meta("2026-09-30T10:00:00Z"),
  names: [{ displayName: "Marco Rossi", givenName: "Marco", familyName: "Rossi", metadata: { primary: true } }],
  phoneNumbers: [{ value: "+39 333 812 5517", type: "mobile", metadata: { primary: true } }],
  emailAddresses: [{ value: "marco.rossi@example.com" }],
  birthdays: [{ date: { month: 3, day: 12 } }],
  // A user label, and a read-only system group that can't be written back.
  memberships: [label("contactGroups/myContacts"), label("contactGroups/1a2b"), label("contactGroups/chatBuddies")],
};
const marcoB: Person = {
  resourceName: "people/b",
  etag: "eb",
  metadata: meta("2019-05-01T10:00:00Z"),
  names: [{ displayName: "Marco R.", givenName: "Marco R." }],
  phoneNumbers: [{ value: "333 8125517" }, { value: "+39 02 4455 6677", type: "work" }],
  emailAddresses: [{ value: "m.rossi@studio.example" }],
  organizations: [{ name: "Studio Rossi" }],
  memberships: [label("contactGroups/3c4d")],
};

const request = { groupId: "g", keepId: "people/a", phones: ["people/a", "people/b"], emails: ["people/a", "people/b"], addresses: [] };

test("the plan combines lists, picks single values and keeps every label", () => {
  const plan = planMerge([marcoA, marcoB], { ...request, company: "people/b" }, "IT");
  // What updateContact needs to accept the change.
  assert.equal(plan.update.etag, "ea");
  assert.deepEqual(plan.update.metadata, { sources: [{ type: "CONTACT", id: "x", etag: undefined }] });
  assert.deepEqual(plan.update.names, [{ displayName: "Marco Rossi", givenName: "Marco", familyName: "Rossi" }]);
  // "333 8125517" is the same number as "+39 333 812 5517" in Italy.
  assert.deepEqual(plan.update.phoneNumbers!.map((p) => p.value), ["+39 333 812 5517", "+39 02 4455 6677"]);
  assert.deepEqual(plan.update.emailAddresses!.map((e) => e.value), ["marco.rossi@example.com", "m.rossi@studio.example"]);
  assert.deepEqual(plan.update.organizations, [{ name: "Studio Rossi" }]);
  assert.deepEqual(plan.update.birthdays, [{ date: { month: 3, day: 12 } }]);
  assert.deepEqual(plan.update.memberships!.map((m) => m.contactGroupMembership!.contactGroupResourceName), ["contactGroups/myContacts", "contactGroups/1a2b", "contactGroups/3c4d"]);
  assert.deepEqual(plan.deleteIds, ["people/b"]);
  assert.deepEqual(plan.photo, { action: "keep" });
});

test("the plan drops what isn't chosen", () => {
  const plan = planMerge([marcoA, marcoB], { ...request, name: "people/b", birthday: null, phones: ["people/b"], emails: [] }, "IT");
  assert.equal(plan.update.names![0].displayName, "Marco R.");
  assert.deepEqual(plan.update.birthdays, []);
  assert.deepEqual(plan.update.organizations, []);
  assert.deepEqual(plan.update.phoneNumbers!.map((p) => p.value), ["333 8125517", "+39 02 4455 6677"]);
  assert.deepEqual(plan.update.emailAddresses, []);
});

test("the plan writes only what is saved on the contact, never its Google profile", () => {
  const profile = { metadata: { source: { type: "PROFILE", id: "p1" } } };
  const contact = { metadata: { source: { type: "CONTACT", id: "x" } } };
  const linked: Person = {
    ...marcoA,
    names: [{ ...contact, displayName: "Marco Rossi" }, { ...profile, displayName: "Marco R. (profile)" }],
    phoneNumbers: [{ ...contact, value: "+39 333 812 5517" }, { ...profile, value: "+39 345 000 0000" }],
    birthdays: [{ ...profile, date: { month: 1, day: 1 } }],
  };
  const plan = planMerge([linked, marcoB], { ...request, phones: ["people/a"] }, "IT");
  assert.deepEqual(plan.update.names, [{ displayName: "Marco Rossi" }]);
  assert.deepEqual(plan.update.phoneNumbers, [{ value: "+39 333 812 5517" }]);
  assert.deepEqual(plan.update.birthdays, []);
});

test("a contact without labels stays in My Contacts", () => {
  const plan = planMerge([{ ...marcoA, memberships: [] }, { ...marcoB, memberships: [] }], request, "IT");
  assert.deepEqual(plan.update.memberships, [{ contactGroupMembership: { contactGroupResourceName: "contactGroups/myContacts" } }]);
});

test("the plan refuses contacts outside the group", () => {
  assert.throws(() => planMerge([marcoA, marcoB], { ...request, keepId: "people/z" }), MergeError);
  assert.throws(() => planMerge([marcoA, marcoB], { ...request, phones: ["people/z"] }), MergeError);
  assert.throws(() => planMerge([marcoA, marcoB], { ...request, emails: undefined as unknown as string[] }), MergeError);
});

const scanned = { "people/a": "2026-09-30T10:00:00Z", "people/b": "2019-05-01T10:00:00Z" };

test("merge: backup first, then update, photo, delete; undo puts everything back", async () => {
  const google = new FakeContacts([marcoA, marcoB], { "people/b": "QkJC" });
  const saved: string[] = [];
  const backup = await executeMerge(google, ["people/a", "people/b"], { ...request, photo: "people/b" }, {
    region: "IT",
    expectedUpdates: scanned,
    save: (b) => saved.push(JSON.stringify(b.steps)),
  });
  assert.equal(saved[0], JSON.stringify({ updated: false, photo: false, deleted: [] }));
  assert.deepEqual(google.calls, ["update people/a", "setPhoto people/a", "delete people/b"]);
  assert.equal(google.photos.get("people/a"), "QkJC");
  assert.deepEqual(backup.photos, [null, "QkJC"]);
  assert.equal(google.people.has("people/b"), false);
  assert.equal((await google.get("people/a")).phoneNumbers!.length, 2);

  google.calls = [];
  await undoMerge(google, backup, () => undefined);
  assert.deepEqual(google.calls, ["update people/a", "deletePhoto people/a", "create people/new1", "setPhoto people/new1"]);
  const a = await google.get("people/a");
  assert.deepEqual(a.phoneNumbers!.map((p) => p.value), ["+39 333 812 5517"]);
  assert.deepEqual(a.memberships!.map((m) => m.contactGroupMembership!.contactGroupResourceName), ["contactGroups/myContacts", "contactGroups/1a2b"]);
  const restored = await google.get(backup.restored!["people/b"]);
  assert.equal(toCleanupContact(restored).name, "Marco R.");
  assert.equal(toCleanupContact(restored).company, "Studio Rossi");
  assert.equal(google.photos.get(restored.resourceName!), "QkJC");
  assert.deepEqual(backup.steps, { updated: false, photo: false, deleted: [] });
});

test("merge stops when a contact changed after the scan", async () => {
  const google = new FakeContacts([marcoA, marcoB]);
  await assert.rejects(
    executeMerge(google, ["people/a", "people/b"], request, { expectedUpdates: { ...scanned, "people/b": "2018-01-01T00:00:00Z" }, save: () => undefined }),
    (e: unknown) => e instanceof MergeError && e.code === "changed_since_scan"
  );
  assert.deepEqual(google.calls, []);
});

test("a merge that failed half-way can still be undone", async () => {
  const google = new FakeContacts([marcoA, marcoB]);
  google.remove = async () => {
    throw new Error("quota");
  };
  let last: MergeBackup | undefined;
  await assert.rejects(executeMerge(google, ["people/a", "people/b"], request, { expectedUpdates: scanned, save: (b) => (last = structuredClone(b)) }), /quota/);
  assert.deepEqual(last!.steps, { updated: true, photo: false, deleted: [] });
  google.calls = [];
  await undoMerge(google, last!, () => undefined);
  assert.deepEqual(google.calls, ["update people/a"]);
  assert.equal((await google.get("people/a")).emailAddresses!.length, 1);
});
