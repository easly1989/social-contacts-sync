import test from "node:test";
import assert from "node:assert/strict";

import { SyncProgress } from "../../interfaces/api";
import { SimpleContact } from "./interfaces";
import { PhotoSource } from "./sources/types";
import { runSync, SyncCallbacks, SyncTarget } from "./syncEngine";

const contacts: SimpleContact[] = [
  { id: "c/ada", name: "Ada", numbers: ["+391"], emails: ["ada@example.com"], hasPhoto: false },
  { id: "c/bob", name: "Bob", numbers: ["+392"], emails: [], hasPhoto: true, photoUrl: "https://photo/bob" },
  { id: "c/cy", name: "Cy", numbers: [], emails: ["cy@example.com"], hasPhoto: false },
  { id: "c/dee", name: "Dee", numbers: ["+394"], hasPhoto: false },
];

function fakeTarget(failOn: string[] = []) {
  const writes: [string, string][] = [];
  const target: SyncTarget = {
    listContacts: async () => contacts,
    currentPhoto: async (c) => (c.hasPhoto ? `old-${c.name}` : null),
    setPhoto: async (id, photo) => {
      if (failOn.includes(id)) throw new Error("Google said no");
      writes.push([id, photo]);
    },
  };
  return { target, writes };
}

// WhatsApp knows Ada and Bob by phone; Gravatar knows Ada and Cy by email.
const whatsapp: PhotoSource = {
  id: "whatsapp",
  find: async (c) => (["+391", "+392"].includes(c.numbers[0]) ? { photo: `wa-${c.name}`, source: "whatsapp", matchedBy: c.numbers[0] } : null),
};
const gravatar: PhotoSource = {
  id: "gravatar",
  find: async (c) => (c.emails?.length ? { photo: `gr-${c.name}`, source: "gravatar", matchedBy: c.emails[0] } : null),
};

function callbacks(overrides: Partial<SyncCallbacks> = {}) {
  const events: SyncProgress[] = [];
  return { events, callbacks: { progress: (e: SyncProgress) => events.push(structuredClone(e)), cancelled: () => false, ...overrides } };
}

test("fill mode: first source in priority order wins, existing photos are left alone", async () => {
  const { target, writes } = fakeTarget();
  const { events, callbacks: cb } = callbacks();
  const { run, photos } = await runSync(target, [whatsapp, gravatar], "fill", cb, { shuffle: false });

  assert.deepEqual(writes, [
    ["c/ada", "wa-Ada"],
    ["c/cy", "gr-Cy"],
  ]);
  assert.deepEqual(run.counters, { added: 2, replaced: 0, kept: 0, alreadyHadPhoto: 1, noMatch: 1, errors: 0 });
  assert.deepEqual(
    run.results.map((r) => [r.contactId, r.outcome, r.source, r.matchedBy]),
    [
      ["c/ada", "added", "whatsapp", "+391"],
      ["c/bob", "alreadyHadPhoto", undefined, undefined],
      ["c/cy", "added", "gravatar", "cy@example.com"],
      ["c/dee", "noMatch", undefined, undefined],
    ]
  );
  assert.deepEqual(photos[0], { photo: "wa-Ada", previous: undefined });
  assert.deepEqual(run.sources, ["whatsapp", "gravatar"]);

  assert.equal(events.length, 5);
  assert.equal(events[events.length - 1].progress, 100);
  assert.equal(events[events.length - 1].syncCount, 2);
  assert.equal(events[1].image, "wa-Ada");
  assert.deepEqual(events[1].latest, { name: "Ada", source: "whatsapp" });
});

test("priority order is respected", async () => {
  const { target, writes } = fakeTarget();
  await runSync(target, [gravatar, whatsapp], "fill", callbacks().callbacks, { shuffle: false });
  assert.deepEqual(writes[0], ["c/ada", "gr-Ada"]);
});

test("replace mode overwrites existing photos and keeps the previous one", async () => {
  const { target, writes } = fakeTarget();
  const { run, photos } = await runSync(target, [whatsapp], "replace", callbacks().callbacks, { shuffle: false });
  assert.deepEqual(writes, [
    ["c/ada", "wa-Ada"],
    ["c/bob", "wa-Bob"],
  ]);
  assert.equal(run.counters.replaced, 1);
  assert.equal(run.results[1].outcome, "replaced");
  assert.equal(run.results[1].hasPrevious, true);
  assert.deepEqual(photos[1], { photo: "wa-Bob", previous: "old-Bob" });
});

test("review mode offers every source's photo and applies the choice", async () => {
  const { target, writes } = fakeTarget();
  const offered: string[][] = [];
  const answers = [1, null]; // Ada: Gravatar's photo; Cy: keep
  const { callbacks: cb } = callbacks({
    review: async ({ candidates }) => {
      offered.push(candidates.map((c) => c.photo));
      return answers.shift() ?? null;
    },
  });
  const { run } = await runSync(target, [whatsapp, gravatar], "review", cb, { shuffle: false });

  assert.deepEqual(offered, [["wa-Ada", "gr-Ada"], ["wa-Bob"], ["gr-Cy"]]);
  assert.deepEqual(writes, [["c/ada", "gr-Ada"]]);
  assert.deepEqual(run.counters, { added: 1, replaced: 0, kept: 2, alreadyHadPhoto: 0, noMatch: 1, errors: 0 });
});

test("review: a photo looked up from a profile link is used and its link saved", async () => {
  const { target, writes } = fakeTarget();
  const links: [string, string][] = [];
  target.addLink = async (id, url) => void links.push([id, url]);
  const answers = [{ photo: "link-Ada", source: "links" as const, matchedBy: "instagram.com/ada", newLink: "https://instagram.com/ada" }, null, null];
  const { callbacks: cb } = callbacks({ review: async () => answers.shift() ?? null });
  const { run } = await runSync(target, [whatsapp, gravatar], "review", cb, { shuffle: false });

  assert.deepEqual(writes, [["c/ada", "link-Ada"]]);
  assert.deepEqual(links, [["c/ada", "https://instagram.com/ada"]]);
  assert.deepEqual(run.results[0], {
    contactId: "c/ada",
    name: "Ada",
    outcome: "added",
    source: "links",
    matchedBy: "instagram.com/ada",
    addedLink: "https://instagram.com/ada",
    hasPhoto: true,
    hasPrevious: false,
  });
});

test("an error on one contact is counted and the run continues", async () => {
  const { target, writes } = fakeTarget(["c/ada"]);
  const { run } = await runSync(target, [whatsapp, gravatar], "fill", callbacks().callbacks, { shuffle: false });
  assert.equal(run.results[0].outcome, "error");
  assert.equal(run.results[0].error, "Google said no");
  assert.deepEqual(writes, [["c/cy", "gr-Cy"]]);
  assert.equal(run.counters.errors, 1);
});

test("a cancelled run stops before the next contact", async () => {
  const { target, writes } = fakeTarget();
  let checks = 0;
  const { run } = await runSync(target, [whatsapp], "fill", callbacks({ cancelled: () => ++checks > 1 }).callbacks, { shuffle: false });
  assert.equal(run.cancelled, true);
  assert.equal(run.results.length, 1);
  assert.deepEqual(writes, [["c/ada", "wa-Ada"]]);
});

test("writes wait for the rate limiter", async () => {
  const { target } = fakeTarget();
  let waits = 0;
  await runSync(target, [whatsapp, gravatar], "fill", callbacks({ beforeWrite: async () => void waits++ }).callbacks, { shuffle: false });
  assert.equal(waits, 2);
});

test("contacts are shuffled by default but all processed", async () => {
  const { target } = fakeTarget();
  const { run } = await runSync(target, [whatsapp], "fill", callbacks().callbacks);
  assert.deepEqual(run.results.map((r) => r.contactId).sort(), contacts.map((c) => c.id).sort());
});
