import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { RunRecord } from "../../interfaces/api";
import { getRun, getRunPhoto, historyUsage, listRuns, recordDecision, saveRun, updateRun } from "./runs";

function result(id: string, startedAt: string) {
  const run: RunRecord = {
    id,
    startedAt,
    mode: "fill",
    sources: ["whatsapp"],
    totalContacts: 2,
    counters: { added: 1, replaced: 1, kept: 0, alreadyHadPhoto: 0, noMatch: 0, errors: 0 },
    results: [
      { contactId: "c/1", outcome: "added", hasPhoto: true },
      { contactId: "c/2", outcome: "replaced", hasPhoto: true, hasPrevious: true },
    ],
  };
  return { run, photos: [{ photo: Buffer.from("new1").toString("base64") }, { photo: Buffer.from("new2").toString("base64"), previous: Buffer.from("old2").toString("base64") }] };
}

function withEnv(env: Record<string, string | undefined>, t: { after(fn: () => void): void }) {
  const previous = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  Object.assign(process.env, env);
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
  t.after(() => {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

test("web: runs are kept in memory per session", (t) => {
  withEnv({ SCS_DESKTOP: undefined }, t);
  saveRun("s1", result("run-a", "2026-10-01T10:00:00.000Z"));
  saveRun("s1", result("run-b", "2026-10-02T10:00:00.000Z"));
  assert.deepEqual(listRuns("s1").map((r) => r.id), ["run-b", "run-a"]);
  assert.deepEqual(listRuns("s2"), []);
  assert.equal(getRun("s1", "run-a")!.results.length, 2);
  assert.equal(Buffer.from(getRunPhoto("s1", "run-b", 1, "previous")!, "base64").toString(), "old2");
});

test("desktop: runs and their photos are files in history/, kept for 90 days", (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "scs-runs-"));
  withEnv({ SCS_DESKTOP: "1", SCS_DATA_DIR: dataDir }, t);

  const old = new Date(Date.now() - 91 * 86_400_000).toISOString();
  saveRun("desktop", result("run-old", old));
  saveRun("desktop", result("run-new", new Date().toISOString()));

  assert.deepEqual(listRuns("desktop").map((r) => r.id), ["run-new"]);
  assert.equal(fs.existsSync(path.join(dataDir, "history", "run-old")), false);
  assert.equal(Buffer.from(getRunPhoto("desktop", "run-new", 0, "photo")!, "base64").toString(), "new1");
  assert.equal(getRunPhoto("desktop", "run-new", 0, "previous"), undefined);

  const run = getRun("desktop", "run-new")!;
  run.results[0].undone = true;
  updateRun(run);
  assert.equal(getRun("desktop", "run-new")!.results[0].undone, true);
  assert.equal("results" in listRuns("desktop")[0], false);
});

test("desktop: history usage counts the runs and their files", (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "scs-usage-"));
  withEnv({ SCS_DESKTOP: "1", SCS_DATA_DIR: dataDir }, t);
  assert.deepEqual(historyUsage(), { runs: 0, bytes: 0 });

  saveRun("desktop", result("run-1", new Date().toISOString()));
  saveRun("desktop", result("run-2", new Date().toISOString()));
  fs.mkdirSync(path.join(dataDir, "history", "not-a-run"));
  const usage = historyUsage();
  assert.equal(usage.runs, 2);
  const runJson = fs.statSync(path.join(dataDir, "history", "run-1", "run.json")).size;
  // run.json plus "new1", "new2" and "old2" (4 bytes each), per run.
  assert.equal(usage.bytes, 2 * (runJson + 12));
});

test("run IDs can't escape the history folder", (t) => {
  withEnv({ SCS_DESKTOP: "1", SCS_DATA_DIR: os.tmpdir() }, t);
  assert.equal(getRun("desktop", "../../etc"), undefined);
  assert.equal(getRunPhoto("desktop", "../x", 0, "photo"), undefined);
});

for (const mode of ["web", "desktop"] as const) {
  test(`${mode}: decisions in To review are one Review entry per session, a new one after 30 minutes (issue #84)`, (t) => {
    withEnv(mode === "web" ? { SCS_DESKTOP: undefined } : { SCS_DESKTOP: "1", SCS_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "scs-session-")) }, t);
    const session = `review-${mode}`;
    const at = (minute: number) => new Date(Date.UTC(2026, 9, 17, 10, minute));
    const photo = Buffer.from("new").toString("base64");
    const previous = Buffer.from("old").toString("base64");
    recordDecision(session, { contactId: "c/1", name: "Ada", outcome: "replaced", source: "whatsapp", previousPin: null }, { photo, previous }, at(0));
    recordDecision(session, { contactId: "c/2", outcome: "linked", profiles: [{ url: "https://instagram.com/bea", network: "Instagram", added: true }] }, {}, at(25));
    recordDecision(session, { contactId: "c/3", outcome: "added", source: "links" }, { photo }, at(56));

    const runs = listRuns(session);
    assert.deepEqual(runs.map((r) => [r.mode, "results" in r, r.totalContacts]), [["session", false, 1], ["session", false, 2]]);
    const first = getRun(session, runs[1].id)!;
    assert.deepEqual(first.results.map((r) => r.contactId), ["c/1", "c/2"]);
    assert.deepEqual([first.startedAt, first.finishedAt], [at(0).toISOString(), at(25).toISOString()]);
    assert.deepEqual(first.counters, { added: 0, replaced: 1, linked: 1, kept: 0, alreadyHadPhoto: 0, noMatch: 0, errors: 0 });
    assert.deepEqual(first.sources, ["whatsapp"]);
    assert.equal(Buffer.from(getRunPhoto(session, first.id, 0, "previous")!, "base64").toString(), "old");
    assert.equal(getRunPhoto(session, first.id, 1, "photo"), undefined);
    assert.equal(Buffer.from(getRunPhoto(session, runs[0].id, 0, "photo")!, "base64").toString(), "new");

    // An entry undone as a whole takes a new decision: it can be undone again.
    const latest = getRun(session, runs[0].id)!;
    Object.assign(latest, { undone: true, results: latest.results.map((r) => ({ ...r, undone: true })) });
    updateRun(latest);
    recordDecision(session, { contactId: "c/4", outcome: "linked" }, {}, at(58));
    assert.equal(listRuns(session)[0].undone, undefined);
  });
}
