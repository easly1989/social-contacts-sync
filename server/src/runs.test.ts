import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { RunRecord } from "../../interfaces/api";
import { getRun, getRunPhoto, historyUsage, listRuns, saveRun, updateRun } from "./runs";

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
