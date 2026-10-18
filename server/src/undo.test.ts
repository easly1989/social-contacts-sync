import test from "node:test";
import assert from "node:assert/strict";

import { RunRecord } from "../../interfaces/api";
import { undoRun } from "./undo";

function run(): RunRecord {
  return {
    id: "r1",
    startedAt: "2026-10-03T10:00:00.000Z",
    mode: "replace",
    sources: ["whatsapp"],
    totalContacts: 4,
    counters: { added: 1, replaced: 1, kept: 0, alreadyHadPhoto: 0, noMatch: 1, errors: 1 },
    results: [
      { contactId: "c/added", outcome: "added" },
      { contactId: "c/replaced", outcome: "replaced", hasPrevious: true },
      { contactId: "c/none", outcome: "noMatch" },
      { contactId: "c/error", outcome: "error" },
    ],
  };
}

function target() {
  const calls: string[] = [];
  return {
    calls,
    target: {
      setPhoto: async (id: string, photo: string) => void calls.push(`set ${id} ${photo}`),
      deletePhoto: async (id: string) => void calls.push(`delete ${id}`),
    },
  };
}

test("undoing a run removes added photos and restores replaced ones", async () => {
  const r = run();
  const { calls, target: t } = target();
  const undone = await undoRun(r, (i) => (i === 1 ? "old-photo" : undefined), t);
  assert.equal(undone, 2);
  assert.deepEqual(calls, ["delete c/added", "set c/replaced old-photo"]);
  assert.equal(r.results[0].undone, true);
  assert.equal(r.undone, true);
});

test("a single contact can be undone, and only once", async () => {
  const r = run();
  const { calls, target: t } = target();
  assert.equal(await undoRun(r, () => "old", t, { indexes: [1] }), 1);
  assert.equal(await undoRun(r, () => "old", t, { indexes: [1] }), 0);
  assert.deepEqual(calls, ["set c/replaced old"]);
  assert.equal(r.undone, undefined);
});

test("a replaced photo without a backup is left alone", async () => {
  const r = run();
  const { calls, target: t } = target();
  await undoRun(r, () => undefined, t, { indexes: [1] });
  assert.deepEqual(calls, []);
  assert.equal(r.results[1].undone, undefined);
});

test("writes wait for the rate limiter", async () => {
  let waits = 0;
  await undoRun(run(), () => "old", target().target, { beforeWrite: async () => void waits++ });
  assert.equal(waits, 2);
});

test("undo also removes a profile link the run saved", async () => {
  const r = run();
  r.results[0].addedLink = "https://instagram.com/ada";
  const { calls, target: t } = target();
  const removed: string[] = [];
  await undoRun(r, () => undefined, { ...t, removeLink: async (id, url) => void removed.push(`${id} ${url}`) }, { indexes: [0] });
  assert.deepEqual(calls, ["delete c/added"]);
  assert.deepEqual(removed, ["c/added https://instagram.com/ada"]);
});

test("a review session: links come off with the photo, and the previous pin comes back (issue #84)", async () => {
  const r = run();
  r.mode = "session";
  const pin = { source: "whatsapp" as const, readAt: "2026-10-01T00:00:00.000Z" };
  r.results = [
    { contactId: "c/photo", outcome: "replaced", previousPin: pin, profiles: [{ url: "https://instagram.com/ada", network: "Instagram", added: true }, { url: "https://x.com/ada", network: "X" }] },
    { contactId: "c/links", outcome: "linked", profiles: [{ url: "https://github.com/bea", network: "GitHub", added: true }] },
    { contactId: "c/old", outcome: "added" },
  ];
  const { calls, target: t } = target();
  const pins: string[] = [];
  const undone: string[] = [];
  await undoRun(r, () => "old", {
    ...t,
    removeLink: async (id, url) => void calls.push(`unlink ${id} ${url}`),
    restorePin: (id, p) => void pins.push(`${id} ${p === undefined ? "unknown" : p ? p.source : "none"}`),
    afterUndo: (result) => void undone.push(result.contactId),
  });
  assert.deepEqual(calls, ["set c/photo old", "unlink c/photo https://instagram.com/ada", "unlink c/links https://github.com/bea", "delete c/old"]);
  // A link only: the photo and its pin stay. A run from before issue #84: the pin is cleared, as it was.
  assert.deepEqual(pins, ["c/photo whatsapp", "c/old unknown"]);
  assert.deepEqual(undone, ["c/photo", "c/links", "c/old"]);
  assert.equal(r.undone, true);
});

test("a pin on the source that sent the undone photo isn't put back: the next sync would bring the photo back", async () => {
  const r = run();
  r.results = [{ contactId: "c/wa", outcome: "replaced", source: "whatsapp", matchedBy: "+39 1", previousPin: { source: "whatsapp", matchedBy: "+39 1", readAt: "2026-10-01T00:00:00.000Z" } }];
  const pins: unknown[] = [];
  await undoRun(r, () => "old", { ...target().target, restorePin: (_id, p) => void pins.push(p) });
  assert.deepEqual(pins, [null]);
});
