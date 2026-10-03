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
