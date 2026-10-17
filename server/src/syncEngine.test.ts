import test from "node:test";
import assert from "node:assert/strict";

import { PhotoPin, SyncProgress } from "../../interfaces/api";
import { photoHash } from "./contacts/photoPins";
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

test("replace and review: a contact keeping its Google photo isn't counted as without a photo", async () => {
  for (const mode of ["replace", "review"] as const) {
    const { target, writes } = fakeTarget();
    const { run } = await runSync(target, [gravatar], mode, callbacks({ review: async () => null }).callbacks, { shuffle: false });
    assert.deepEqual(
      run.results.map((r) => [r.contactId, r.outcome]),
      [
        ["c/ada", mode === "replace" ? "added" : "kept"],
        ["c/bob", "alreadyHadPhoto"],
        ["c/cy", mode === "replace" ? "added" : "kept"],
        ["c/dee", "noMatch"],
      ],
      mode
    );
    assert.equal(run.counters.alreadyHadPhoto, 1);
    assert.equal(run.counters.noMatch, 1);
    assert.equal(writes.length, mode === "replace" ? 2 : 0);
  }
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

test("review offers every photo a source has, one per linked profile (issue #77)", async () => {
  const { target } = fakeTarget();
  const profiles: PhotoSource = {
    id: "links",
    find: async () => assert.fail("review asks for every profile"),
    findAll: async (c) =>
      c.name === "Ada"
        ? [
            { photo: "ig-Ada", source: "links", matchedBy: "instagram.com/ada", network: "Instagram" },
            { photo: "bsky-Ada", source: "links", matchedBy: "bsky.app/profile/ada", network: "Bluesky" },
          ]
        : [],
  };
  const offered: string[][] = [];
  const { callbacks: cb } = callbacks({ review: async ({ candidates }) => (offered.push(candidates.map((c) => c.photo)), 2) });
  const { run } = await runSync(target, [whatsapp, profiles], "review", cb, { shuffle: false });
  assert.deepEqual(offered[0], ["wa-Ada", "ig-Ada", "bsky-Ada"]);
  assert.deepEqual(
    run.results.find((r) => r.contactId === "c/ada"),
    { contactId: "c/ada", name: "Ada", outcome: "added", source: "links", matchedBy: "bsky.app/profile/ada", hasPhoto: true, hasPrevious: false }
  );
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
  const target: SyncTarget = {
    listContacts: async () => [contact],
    currentPhoto: async () => "old",
    setPhoto: async (id, photo) => {
      writes.push([id, photo]);
      return "https://photos.example/c/pia/v2=s100";
    },
    savePin: (id, pin) => void pins.push([id, pin]),
  };
  return { target, writes, pins };
}
const at = "2026-10-01T00:00:00.000Z";
const grPin: PhotoPin = { source: "gravatar", hash: photoHash("gr-old"), photoKey: "https://photos.example/c/pia/v1", readAt: at };

test("pins: the pinned source wins over the order and its new photo is applied, in fill mode too", async () => {
  const { target, writes, pins } = pinTarget(pia(grPin));
  const { run } = await runSync(target, [pinWa, pinGr], "fill", callbacks().callbacks);
  assert.deepEqual(writes, [["c/pia", "gr-Pia"]]);
  assert.equal(run.results[0].outcome, "replaced");
  assert.equal(run.results[0].source, "gravatar");
  assert.equal(pins.length, 1);
  assert.deepEqual({ ...pins[0][1], readAt: at }, { source: "gravatar", hash: photoHash("gr-Pia"), photoKey: "https://photos.example/c/pia/v2", readAt: at });
});

test("pins: an unchanged photo is not written again", async () => {
  const { target, writes } = pinTarget(pia({ ...grPin, hash: photoHash("gr-Pia") }));
  const { run } = await runSync(target, [pinWa, pinGr], "replace", callbacks().callbacks);
  assert.deepEqual(writes, []);
  assert.equal(run.results[0].outcome, "alreadyHadPhoto");
});

test("pins: a photo changed outside the app suspends the pin and is left alone, also by Replace", async () => {
  const { target, writes, pins } = pinTarget(pia(grPin, { photoUrl: "https://photos.example/c/pia/v9=s100" }));
  await runSync(target, [pinWa, pinGr], "replace", callbacks().callbacks);
  assert.deepEqual(writes, []);
  assert.deepEqual(pins, [["c/pia", { ...grPin, suspended: true }]]);

  const suspended = pinTarget(pia({ ...grPin, suspended: true }, { photoUrl: "https://photos.example/c/pia/v9=s100" }));
  const { run } = await runSync(suspended.target, [pinWa, pinGr], "replace", callbacks().callbacks);
  assert.deepEqual(suspended.writes, []);
  assert.equal(run.results[0].outcome, "alreadyHadPhoto");
});

test("pins: when the pinned source has nothing, the photo stays, also with Replace", async () => {
  const { target, writes, pins } = pinTarget(pia(grPin));
  const { run } = await runSync(target, [pinWa], "replace", callbacks().callbacks);
  assert.deepEqual(writes, []);
  assert.deepEqual(pins, []);
  assert.equal(run.results[0].outcome, "alreadyHadPhoto");
});

test("pins: a photo removed outside the app is filled by the usual order, which ends the pin", async () => {
  for (const pin of [grPin, { ...grPin, suspended: true }]) {
    const { target, writes, pins } = pinTarget(pia(pin, { hasPhoto: false, photoUrl: undefined }));
    await runSync(target, [pinWa, pinGr], "fill", callbacks().callbacks);
    assert.deepEqual(writes, [["c/pia", "wa-Pia"]]);
    assert.deepEqual(pins, [["c/pia", undefined]]);
  }
});

test("pins: a kept photo is never written, pinned or not", async () => {
  const { target, writes } = pinTarget(pia(grPin, { photoKept: true }));
  await runSync(target, [pinWa, pinGr], "replace", callbacks().callbacks);
  assert.deepEqual(writes, []);
});

test("pins: a pin brought over from an earlier link records the photo without writing it", async () => {
  const { target, writes, pins } = pinTarget(pia({ source: "gravatar", readAt: at }));
  await runSync(target, [pinWa, pinGr], "fill", callbacks().callbacks);
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
  await runSync(target, [pinWa, profiles], "fill", callbacks().callbacks);
  assert.deepEqual(asked, [["https://x.com/pia"]]);
  assert.deepEqual(writes, [["c/pia", "photo of https://x.com/pia"]]);
});

test("pins: the photo picked in review is pinned to its source", async () => {
  const { target, pins } = pinTarget(pia(undefined, { hasPhoto: false, photoUrl: undefined }));
  const candidate = { photo: "ig-Pia", source: "links" as const, matchedBy: "instagram.com/pia", network: "Instagram" };
  await runSync(target, [pinWa], "review", callbacks({ review: async () => candidate }).callbacks);
  assert.deepEqual({ ...pins[0][1], readAt: at }, {
    source: "links",
    matchedBy: "instagram.com/pia",
    network: "Instagram",
    hash: photoHash("ig-Pia"),
    photoKey: "https://photos.example/c/pia/v2",
    readAt: at,
  });
});
