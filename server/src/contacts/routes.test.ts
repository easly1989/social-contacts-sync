import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { AddressInfo } from "net";
import { RateLimiter } from "limiter";

import { contactsRouter } from "../../routes/contacts";
import { cleanupRouter } from "../../routes/cleanup";
import { setInCache } from "../cache";
import { FakeContacts } from "../cleanup/fakeContacts";
import { Person } from "../cleanup/people";
import { saveLookup } from "../linkLookups";
import { parseProfileLink } from "../sources/links";
import { getPlaceholders } from "./placeholders";
import { runSync } from "../syncEngine";
import { withPlaceholders } from "../sync";

// The Contacts page (issue #55) against the fake address book, which applies
// Google's rules for updateContact.
const meta = (updateTime: string) => ({ sources: [{ type: "CONTACT", id: "x", updateTime }] });
const people: Person[] = [
  { resourceName: "people/a", metadata: meta("2026-09-30T10:00:00Z"), names: [{ displayName: "Francesco Greco", givenName: "Francesco", familyName: "Greco" }], phoneNumbers: [{ value: "+39 335 210 4471" }], memberships: [{ contactGroupMembership: { contactGroupResourceName: "contactGroups/myContacts" } }] },
  { resourceName: "people/b", metadata: meta("2019-05-01T10:00:00Z"), names: [{ displayName: "Francesco G.", givenName: "Francesco G." }], phoneNumbers: [{ value: "335 2104471" }], urls: [{ value: "https://instagram.com/fra.greco" }], biographies: [{ value: "Volley" }] },
  { resourceName: "people/c", metadata: meta("2026-01-01T10:00:00Z"), names: [{ displayName: "Elena Conti", givenName: "Elena", familyName: "Conti" }], emailAddresses: [{ value: "elena@example.com" }] },
];

async function start(t: { after(fn: () => void): void }, sessionId: string) {
  delete process.env.SCS_DESKTOP; // in memory
  const google = new FakeContacts(people, { "people/c": "UkVBTA==" });
  google.labels = [{ id: "contactGroups/work", name: "Work" }];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { sessionID: string }).sessionID = sessionId;
    next();
  });
  const noWait = () => new RateLimiter({ tokensPerInterval: 1000, interval: 1 });
  app.use("/api", contactsRouter(() => google, noWait), cleanupRouter(() => google));
  setInCache(sessionId, "gauth", {});
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const call = async (method: string, route: string, body?: unknown, type = "application/json") => {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: body === undefined ? {} : { "Content-Type": type },
      body: body === undefined ? undefined : Buffer.isBuffer(body) ? new Uint8Array(body) : JSON.stringify(body),
    });
    return { status: response.status, json: (await response.json()) as any };
  };
  return { google, call };
}

test("list, create, edit and a change made elsewhere in the meantime", async (t) => {
  const { google, call } = await start(t, "contacts-1");
  const list = await call("GET", "/contacts");
  assert.equal(list.status, 200);
  assert.deepEqual(list.json.labels, [{ id: "contactGroups/work", name: "Work" }]);
  assert.deepEqual(list.json.contacts.map((c: any) => [c.name, c.hasPhoto]), [["Francesco Greco", false], ["Francesco G.", false], ["Elena Conti", true]]);

  assert.deepEqual(await call("POST", "/contacts", { contact: { phones: [] } }), { status: 400, json: { error: "empty_contact" } });
  const created = await call("POST", "/contacts", { contact: { givenName: "Sara", familyName: "Bruno", phones: [{ value: "+39 320 555 0101", type: "mobile" }], labels: ["contactGroups/work"] } });
  assert.equal(created.status, 200);
  assert.deepEqual(created.json.labels, ["contactGroups/work"]);
  assert.deepEqual(google.people.get(created.json.id)!.phoneNumbers, [{ value: "+39 320 555 0101", type: "mobile" }]);

  const elena = list.json.contacts[2];
  const saved = await call("PUT", "/contacts/c", { contact: { ...elena, company: "Studio Conti", birthday: { month: 5, day: 2 }, notes: "Architect" }, updatedAt: elena.updatedAt });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.company, "Studio Conti");
  assert.deepEqual(saved.json.birthday, { month: 5, day: 2 });
  assert.deepEqual(google.people.get("people/c")!.emailAddresses, [{ value: "elena@example.com" }]); // untouched
  assert.equal(google.calls.filter((c) => c === "update people/c").length, 1);

  // Saved again from the old copy: refused, with the contact as it is now.
  const stale = await call("PUT", "/contacts/c", { contact: { ...elena, notes: "Old" }, updatedAt: elena.updatedAt });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.contact.notes, "Architect");
  assert.deepEqual(await call("PUT", "/contacts/..%2Fx", { contact: elena }), { status: 404, json: { error: "not_found" } });
});

test("placeholder photos: uploaded by hand, then replaced by the next sync, even in fill mode", async (t) => {
  const { google, call } = await start(t, "contacts-2");
  assert.deepEqual(await call("PUT", "/contacts/a/photo", Buffer.from("not an image"), "text/plain"), { status: 415, json: { error: "image_required" } });
  const uploaded = await call("PUT", "/contacts/a/photo", Buffer.alloc(2048, 1), "image/jpeg");
  assert.equal(uploaded.status, 200);
  assert.equal(uploaded.json.placeholder, true);
  assert.equal(google.photos.get("people/a"), Buffer.alloc(2048, 1).toString("base64"));
  assert.equal((await call("GET", "/contacts")).json.contacts[0].placeholder, true);

  // A fill sync treats the placeholder as no photo.
  const contacts = withPlaceholders(
    (await google.list()).map((p) => ({ id: p.resourceName!, name: p.names?.[0]?.displayName ?? undefined, numbers: [], hasPhoto: google.photos.has(p.resourceName!), photoUrl: p.photos?.[0]?.url ?? undefined })),
    getPlaceholders("contacts-2")
  );
  const { run } = await runSync(
    { listContacts: async () => contacts, currentPhoto: async (c) => google.photos.get(c.id) ?? null, setPhoto: (id, photo) => google.setPhoto(id, photo) },
    [{ id: "whatsapp", find: async (c) => (c.id === "people/a" || c.id === "people/c" ? { photo: "V0E=", source: "whatsapp", matchedBy: "+39" } : null) }],
    "fill",
    { progress: () => {}, cancelled: () => false },
    { shuffle: false }
  );
  assert.deepEqual(run.results.map((r) => [r.contactId, r.outcome]), [["people/a", "replaced"], ["people/b", "noMatch"], ["people/c", "alreadyHadPhoto"]]);
  // A new photo: no longer a placeholder, and forgotten on the next listing.
  assert.equal((await call("GET", "/contacts")).json.contacts[0].placeholder, undefined);
  assert.deepEqual(getPlaceholders("contacts-2"), {});

  // Removing a photo.
  const removed = await call("DELETE", "/contacts/c/photo");
  assert.equal(removed.json.hasPhoto, false);
});

test("a photo from a profile link is a real photo and saves the link", async (t) => {
  const { google, call } = await start(t, "contacts-3");
  await call("PUT", "/contacts/c/photo", Buffer.alloc(2048, 2), "image/png");
  const lookup = saveLookup("contacts-3", { photo: "TElOSw==", link: parseProfileLink("https://x.com/elena")! });
  assert.deepEqual(await call("POST", "/contacts/c/photo_from_link", { token: "nope" }), { status: 410, json: { error: "lookup_expired" } });
  const saved = await call("POST", "/contacts/c/photo_from_link", { token: lookup.token });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.placeholder, undefined);
  assert.deepEqual(saved.json.urls, [{ value: "https://x.com/elena", type: "profile" }]);
  assert.equal(google.photos.get("people/c"), "TElOSw==");
});

test("duplicate, labels, merge and delete with undo from History", async (t) => {
  const { google, call } = await start(t, "contacts-4");
  const copy = await call("POST", "/contacts/c/duplicate");
  assert.equal(copy.json.name, "Elena Conti");
  assert.deepEqual(google.people.get(copy.json.id)!.emailAddresses, [{ value: "elena@example.com" }]);
  assert.equal(google.photos.get(copy.json.id), "UkVBTA==");

  const label = await call("POST", "/contacts/labels", { name: "Volley" });
  assert.deepEqual(label.json, { id: "contactGroups/label2", name: "Volley" });
  assert.deepEqual((await call("POST", "/contacts/labels", { name: "volley" })).json, label.json); // not twice
  const applied = await call("POST", "/contacts/labels/apply", { contactIds: ["people/a", "people/b"], label: label.json.id, add: true });
  assert.deepEqual(applied.json.contacts.map((c: any) => c.labels), [[label.json.id], [label.json.id]]);
  const removed = await call("POST", "/contacts/labels/apply", { contactIds: ["people/b"], label: label.json.id, add: false });
  assert.deepEqual(removed.json.contacts[0].labels, []);
  assert.deepEqual(await call("POST", "/contacts/labels/apply", { contactIds: ["people/b"], label: "contactGroups/myContacts" }), { status: 400, json: { error: "invalid_request" } });

  // Merge two picked contacts: the notes and the link come along.
  const list = (await call("GET", "/contacts")).json.contacts as any[];
  const updatedAt = Object.fromEntries(list.map((c) => [c.id, c.updatedAt]));
  const request = { keepId: "people/a", phones: ["people/a"], emails: [], addresses: [] };
  assert.deepEqual(await call("POST", "/contacts/merge", { contactIds: ["people/a", "people/b"], request, updatedAt: { ...updatedAt, "people/b": "2000-01-01" } }), { status: 409, json: { error: "changed_since_scan" } });
  const merged = await call("POST", "/contacts/merge", { contactIds: ["people/a", "people/b"], request, updatedAt });
  assert.equal(merged.status, 200);
  assert.deepEqual(merged.json.deleted, ["people/b"]);
  assert.equal(merged.json.contact.notes, "Volley");
  assert.deepEqual(merged.json.contact.urls, [{ value: "https://instagram.com/fra.greco" }]);

  // Delete, then undo from History: the contact comes back with its photo.
  const deleted = await call("POST", "/contacts/delete", { contactIds: ["people/c"] });
  assert.deepEqual(deleted.json.deleted, ["people/c"]);
  assert.equal(google.people.has("people/c"), false);
  const actions = (await call("GET", "/cleanup/actions")).json;
  assert.deepEqual(actions.map((a: any) => [a.kind, a.title, a.contacts]), [["delete", "Elena Conti", 1], ["merge", "Francesco Greco", 2]]);
  assert.equal((await call("POST", `/cleanup/actions/${deleted.json.actionId}/undo`, {})).status, 200);
  const back = [...google.people.values()].find((p) => p.names?.[0]?.displayName === "Elena Conti" && p.resourceName !== copy.json.id)!;
  assert.deepEqual(back.emailAddresses, [{ value: "elena@example.com" }]);
  assert.equal(google.photos.get(back.resourceName!), "UkVBTA==");
});
