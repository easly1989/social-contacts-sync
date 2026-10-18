import test from "node:test";
import assert from "node:assert/strict";

import { PhotoPin, RunOptions, SyncProgress } from "../../interfaces/api";
import { photoHash } from "./contacts/photoPins";
import { SimpleContact } from "./interfaces";
import { PhotoSource } from "./sources/types";
import { defaultRunOptions, runSync, SyncCallbacks, SyncTarget } from "./syncEngine";

const contacts: SimpleContact[] = [
  { id: "c/ada", name: "Ada", numbers: ["+391"], emails: ["ada@example.com"], hasPhoto: false },
  { id: "c/bob", name: "Bob", numbers: ["+392"], emails: [], hasPhoto: true, photoUrl: "https://photo/bob" },
  { id: "c/cy", name: "Cy", numbers: [], emails: ["cy@example.com"], hasPhoto: false },
  { id: "c/dee", name: "Dee", numbers: ["+394"], hasPhoto: false },
];

function fakeTarget(failOn: string[] = [], list = contacts) {
  const writes: [string, string][] = [];
  const queued: [string, string, string[]][] = [];
  const target: SyncTarget = {
    listContacts: async () => list,
    currentPhoto: async (c) => (c.hasPhoto ? `old-${c.name}` : null),
    setPhoto: async (id, photo) => {
      if (failOn.includes(id)) throw new Error("Google said no");
      writes.push([id, photo]);
    },
    queue: (c, kind, found) => void queued.push([c.id, kind, found.map((f) => f.photo)]),
  };
  return { target, writes, queued };
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
const options = (o: Partial<RunOptions> = {}): RunOptions => ({ ...defaultRunOptions, ...o });

test("by default: missing photos are filled in source order; a contact with a photo and another one goes to To review (issue #82)", async () => {
  const { target, writes, queued } = fakeTarget();
  const { events, callbacks: cb } = callbacks();
  const { run, photos } = await runSync(target, [whatsapp, gravatar], options(), cb, { shuffle: false });

  assert.deepEqual(writes, [
    ["c/ada", "wa-Ada"],
    ["c/cy", "gr-Cy"],
  ]);
  assert.deepEqual(queued, [["c/bob", "photo", ["wa-Bob"]]]);
  assert.deepEqual(run.counters, { added: 2, replaced: 0, kept: 0, queued: 1, alreadyHadPhoto: 0, noMatch: 1, errors: 0 });
  assert.deepEqual(
    run.results.map((r) => [r.contactId, r.outcome, r.source, r.matchedBy]),
    [
      ["c/ada", "added", "whatsapp", "+391"],
      ["c/bob", "queued", undefined, undefined],
      ["c/cy", "added", "gravatar", "cy@example.com"],
      ["c/dee", "noMatch", undefined, undefined],
    ]
  );
  assert.deepEqual(photos[0], { photo: "wa-Ada", previous: undefined });
  assert.deepEqual([run.mode, run.options, run.sources], ["sync", options(), ["whatsapp", "gravatar"]]);

  assert.equal(events.length, 5);
  assert.ok(events.every((e) => e.phase === "photos"));
  assert.equal(events[events.length - 1].progress, 100);
  assert.equal(events[events.length - 1].syncCount, 2);
  assert.equal(events[1].image, "wa-Ada");
  assert.deepEqual(events[1].latest, { name: "Ada", source: "whatsapp" });
});

test("priority order is respected", async () => {
  const { target, writes } = fakeTarget();
  await runSync(target, [gravatar, whatsapp], options(), callbacks().callbacks, { shuffle: false });
  assert.deepEqual(writes[0], ["c/ada", "gr-Ada"]);
});

test("without Look for different photos, a contact with a photo is left alone", async () => {
  const { target, queued } = fakeTarget();
  const { run } = await runSync(target, [whatsapp], options({ lookDifferent: false }), callbacks().callbacks, { shuffle: false });
  assert.deepEqual(queued, []);
  assert.equal(run.results[1].outcome, "alreadyHadPhoto");
});

test("I decide every contact: nothing is written, every photo goes to To review", async () => {
  const { target, writes, queued } = fakeTarget();
  const { run } = await runSync(target, [whatsapp, gravatar], options({ decideAll: true, lookDifferent: false }), callbacks().callbacks, { shuffle: false });
  assert.deepEqual(writes, []);
  assert.deepEqual(queued, [
    ["c/ada", "photo", ["wa-Ada", "gr-Ada"]],
    ["c/bob", "photo", ["wa-Bob"]],
    ["c/cy", "photo", ["gr-Cy"]],
  ]);
  assert.deepEqual(run.counters, { added: 0, replaced: 0, kept: 0, queued: 3, alreadyHadPhoto: 0, noMatch: 1, errors: 0 });
});

test("without Fill in missing photos, contacts without one go to To review instead", async () => {
  const { target, writes, queued } = fakeTarget();
  await runSync(target, [whatsapp, gravatar], options({ fillMissing: false, lookDifferent: false }), callbacks().callbacks, { shuffle: false });
  assert.deepEqual(writes, []);
  assert.deepEqual(queued.map(([id]) => id), ["c/ada", "c/cy"]);
});

test("a placeholder is replaced like a missing photo, and keeps the previous one", async () => {
  const { target, writes } = fakeTarget([], [{ ...contacts[1], placeholder: true }]);
  const { run, photos } = await runSync(target, [whatsapp], options(), callbacks().callbacks, { shuffle: false });
  assert.deepEqual(writes, [["c/bob", "wa-Bob"]]);
  assert.equal(run.results[0].outcome, "replaced");
  assert.deepEqual(photos[0], { photo: "wa-Bob", previous: "old-Bob" });
});

test("a photo turned down in To review isn't offered again; a new one is", async () => {
  const bob = { ...contacts[1], dismissed: [photoHash("wa-Bob")] };
  const { target, queued } = fakeTarget([], [bob]);
  const { run } = await runSync(target, [whatsapp, gravatar], options(), callbacks().callbacks, { shuffle: false });
  assert.deepEqual(queued, []);
  assert.equal(run.results[0].outcome, "alreadyHadPhoto");

  const changed = fakeTarget([], [{ ...bob, emails: ["bob@example.com"] }]);
  await runSync(changed.target, [whatsapp, gravatar], options(), callbacks().callbacks, { shuffle: false });
  assert.deepEqual(changed.queued, [["c/bob", "photo", ["gr-Bob"]]]);
});

test("every photo a source has goes to To review, one per linked profile (issue #77)", async () => {
  const { target, queued } = fakeTarget([], [contacts[1]]);
  const profiles: PhotoSource = {
    id: "links",
    find: async () => assert.fail("To review gets every profile"),
    findAll: async () => [
      { photo: "ig-Bob", source: "links", matchedBy: "instagram.com/bob", network: "Instagram" },
      { photo: "bsky-Bob", source: "links", matchedBy: "bsky.app/profile/bob", network: "Bluesky" },
    ],
  };
  await runSync(target, [whatsapp, profiles], options(), callbacks().callbacks, { shuffle: false });
  assert.deepEqual(queued, [["c/bob", "photo", ["wa-Bob", "ig-Bob", "bsky-Bob"]]]);
});

test("an error on one contact is counted and the run continues", async () => {
  const { target, writes } = fakeTarget(["c/ada"]);
  const { run } = await runSync(target, [whatsapp, gravatar], options(), callbacks().callbacks, { shuffle: false });
  assert.equal(run.results[0].outcome, "error");
  assert.equal(run.results[0].error, "Google said no");
  assert.deepEqual(writes, [["c/cy", "gr-Cy"]]);
  assert.equal(run.counters.errors, 1);
});

// A source call that never answers, like a WhatsApp Web page that stopped responding.
const silent: PhotoSource = { id: "whatsapp", find: () => new Promise(() => {}) };

test("a source that doesn't answer in time is an error for that contact, and the run goes on", async () => {
  const { target, writes } = fakeTarget([], contacts.slice(0, 3));
  const { run } = await runSync(target, [silent, gravatar], options({ lookDifferent: false }), callbacks().callbacks, { shuffle: false, deadline: 50 });
  assert.deepEqual(
    run.results.map((r) => [r.name, r.outcome, r.error]),
    [
      ["Ada", "error", "WhatsApp didn't answer within 0.05 seconds."],
      ["Bob", "alreadyHadPhoto", undefined],
      ["Cy", "error", "WhatsApp didn't answer within 0.05 seconds."],
    ]
  );
  assert.deepEqual(writes, []);
});

test("Stop ends the wait for a source at once, without an error for that contact", async () => {
  const { target } = fakeTarget([], contacts.slice(0, 1));
  let stop = false;
  setTimeout(() => (stop = true), 30);
  const started = Date.now();
  const { run } = await runSync(target, [silent], options(), callbacks({ cancelled: () => stop }).callbacks, { shuffle: false });
  assert.ok(Date.now() - started < 2000);
  assert.equal(run.cancelled, true);
  assert.deepEqual(run.results, []);
  assert.equal(run.counters.errors, 0);
});

test("a cancelled run stops before the next contact", async () => {
  const { target, writes } = fakeTarget();
  let checks = 0;
  const { run } = await runSync(target, [whatsapp], options(), callbacks({ cancelled: () => ++checks > 1 }).callbacks, { shuffle: false });
  assert.equal(run.cancelled, true);
  assert.equal(run.results.length, 1);
  assert.deepEqual(writes, [["c/ada", "wa-Ada"]]);
});

test("writes wait for the rate limiter", async () => {
  const { target } = fakeTarget();
  let waits = 0;
  await runSync(target, [whatsapp, gravatar], options(), callbacks({ beforeWrite: async () => void waits++ }).callbacks, { shuffle: false });
  assert.equal(waits, 2);
});

test("contacts are shuffled by default but all processed", async () => {
  const { target } = fakeTarget();
  const { run } = await runSync(target, [whatsapp], options(), callbacks().callbacks);
  assert.deepEqual(run.results.map((r) => r.contactId).sort(), contacts.map((c) => c.id).sort());
});

// Photo pins (issue #78): a photo picked from a source follows that source.
const pinWa: PhotoSource = { id: "whatsapp", find: async (c) => (c.numbers.includes("+391") ? { photo: "wa-Pia", source: "whatsapp", matchedBy: "+391" } : null) };
const pinGr: PhotoSource = { id: "gravatar", find: async (c) => (c.emails?.length ? { photo: "gr-Pia", source: "gravatar", matchedBy: c.emails[0] } : null) };
const pia = (pin: PhotoPin | undefined, c: Partial<SimpleContact> = {}): SimpleContact => ({
  id: "c/pia",
  name: "Pia",
  numbers: ["+391"],
  emails: ["pia@example.com"],
  hasPhoto: true,
  photoUrl: "https://photos.example/c/pia/v1=s100",
  pin,
  ...c,
});
function pinTarget(contact: SimpleContact) {
  const writes: [string, string][] = [];
  const pins: [string, PhotoPin | undefined][] = [];
  const queued: [string, string, string[]][] = [];
  const target: SyncTarget = {
    listContacts: async () => [contact],
    currentPhoto: async () => "old",
    setPhoto: async (id, photo) => {
      writes.push([id, photo]);
      return "https://photos.example/c/pia/v2=s100";
    },
    savePin: (id, pin) => void pins.push([id, pin]),
    queue: (c, kind, found) => void queued.push([c.id, kind, found.map((f) => f.photo)]),
  };
  return { target, writes, pins, queued };
}
const at = "2026-10-01T00:00:00.000Z";
const grPin: PhotoPin = { source: "gravatar", hash: photoHash("gr-old"), photoKey: "https://photos.example/c/pia/v1", readAt: at };

test("pins: the pinned source wins over the order and its new photo is applied without asking", async () => {
  const { target, writes, pins, queued } = pinTarget(pia(grPin));
  const { events, callbacks: cb } = callbacks();
  const { run } = await runSync(target, [pinWa, pinGr], options(), cb);
  assert.deepEqual(writes, [["c/pia", "gr-Pia"]]);
  assert.deepEqual(queued, []);
  assert.equal(run.results[0].outcome, "replaced");
  assert.equal(run.results[0].source, "gravatar");
  assert.deepEqual(events[1].latest, { name: "Pia", source: "gravatar", pinned: true });
  assert.equal(pins.length, 1);
  assert.deepEqual({ ...pins[0][1], readAt: at }, { source: "gravatar", hash: photoHash("gr-Pia"), photoKey: "https://photos.example/c/pia/v2", readAt: at });
});

test("pins: without Update pinned photos, a new pinned photo goes to To review", async () => {
  const { target, writes, queued } = pinTarget(pia(grPin));
  await runSync(target, [pinWa, pinGr], options({ updatePinned: false }), callbacks().callbacks);
  assert.deepEqual(writes, []);
  assert.deepEqual(queued, [["c/pia", "photo", ["wa-Pia", "gr-Pia"]]]);
});

test("pins: with I decide every contact, a new pinned photo goes to To review", async () => {
  const { target, writes, queued } = pinTarget(pia(grPin));
  await runSync(target, [pinWa, pinGr], options({ decideAll: true }), callbacks().callbacks);
  assert.deepEqual(writes, []);
  assert.deepEqual(queued, [["c/pia", "photo", ["gr-Pia"]]]);
});

test("pins: an unchanged photo is not written again, nor offered", async () => {
  const { target, writes, queued } = pinTarget(pia({ ...grPin, hash: photoHash("gr-Pia") }));
  const { run } = await runSync(target, [pinWa, pinGr], options(), callbacks().callbacks);
  assert.deepEqual(writes, []);
  assert.deepEqual(queued, []);
  assert.equal(run.results[0].outcome, "alreadyHadPhoto");
});

test("pins: a photo changed outside the app suspends the pin and goes to To review with the source's photo", async () => {
  const { target, writes, pins, queued } = pinTarget(pia(grPin, { photoUrl: "https://photos.example/c/pia/v9=s100" }));
  const { run } = await runSync(target, [pinWa, pinGr], options(), callbacks().callbacks);
  assert.deepEqual(writes, []);
  assert.deepEqual(pins, [["c/pia", { ...grPin, suspended: true }]]);
  assert.deepEqual(queued, [["c/pia", "changed", ["gr-Pia"]]]);
  assert.equal(run.results[0].outcome, "queued");

  // Waiting there: left alone by the next syncs.
  const suspended = pinTarget(pia({ ...grPin, suspended: true }, { photoUrl: "https://photos.example/c/pia/v9=s100" }));
  const next = await runSync(suspended.target, [pinWa, pinGr], options(), callbacks().callbacks);
  assert.deepEqual([suspended.writes, suspended.queued], [[], []]);
  assert.equal(next.run.results[0].outcome, "alreadyHadPhoto");
});

test("pins: changed outside the app while the source has nothing: still to review", async () => {
  const { target, queued } = pinTarget(pia(grPin, { photoUrl: "https://photos.example/c/pia/v9=s100", emails: [] }));
  await runSync(target, [pinWa, pinGr], options(), callbacks().callbacks);
  assert.deepEqual(queued, [["c/pia", "changed", []]]);
});

test("pins: when the pinned source has nothing, the photo stays", async () => {
  const { target, writes, pins } = pinTarget(pia(grPin));
  const { run } = await runSync(target, [pinWa], options(), callbacks().callbacks);
  assert.deepEqual(writes, []);
  assert.deepEqual(pins, []);
  assert.equal(run.results[0].outcome, "alreadyHadPhoto");
});

test("pins: a photo removed outside the app is filled by the usual order, which ends the pin", async () => {
  for (const pin of [grPin, { ...grPin, suspended: true }]) {
    const { target, writes, pins } = pinTarget(pia(pin, { hasPhoto: false, photoUrl: undefined }));
    await runSync(target, [pinWa, pinGr], options(), callbacks().callbacks);
    assert.deepEqual(writes, [["c/pia", "wa-Pia"]]);
    assert.deepEqual(pins, [["c/pia", undefined]]);
  }
});

test("pins: a kept photo is never written nor sent to To review, pinned or not", async () => {
  for (const o of [options(), options({ decideAll: true })]) {
    const { target, writes, queued } = pinTarget(pia(grPin, { photoKept: true }));
    await runSync(target, [pinWa, pinGr], o, callbacks().callbacks);
    assert.deepEqual([writes, queued], [[], []]);
  }
});

test("pins: a pin brought over from an earlier link records the photo without writing it", async () => {
  const { target, writes, pins } = pinTarget(pia({ source: "gravatar", readAt: at }));
  await runSync(target, [pinWa, pinGr], options(), callbacks().callbacks);
  assert.deepEqual(writes, []);
  assert.equal(pins[0][1]?.hash, photoHash("gr-Pia"));
});

test("pins: a profile pin reads only that profile", async () => {
  const asked: string[][] = [];
  const profiles: PhotoSource = {
    id: "links",
    find: async (c) => (asked.push(c.urls ?? []), c.urls?.length ? { photo: `photo of ${c.urls[0]}`, source: "links", matchedBy: c.urls[0].replace(/^https:\/\/(www\.)?/, "") } : null),
  };
  const pin: PhotoPin = { source: "links", matchedBy: "x.com/pia", network: "X", hash: photoHash("old"), readAt: at };
  const { target, writes } = pinTarget(pia(pin, { photoUrl: undefined, hasPhoto: false, urls: ["https://www.instagram.com/pia/", "https://x.com/pia"] }));
  await runSync(target, [pinWa, profiles], options(), callbacks().callbacks);
  assert.deepEqual(asked, [["https://x.com/pia"]]);
  assert.deepEqual(writes, [["c/pia", "photo of https://x.com/pia"]]);
});
