import fs from "fs";
import path from "path";

import { RunRecord, RunSummary } from "../../interfaces/api";
import { RunPhotos, SyncRunResult } from "./syncEngine";
import { Base64 } from "./types";

/*
  Finished sync runs with the photos they wrote and replaced, for reports,
  history and undo. The desktop app keeps them in history/ in its data folder
  for 90 days; the web server keeps the last few per session in memory.
*/

const retentionDays = 90;
const memoryRunsPerSession = 5;
const memory = new Map<string, SyncRunResult[]>();

// Read at call time (not at import) so tests can switch modes.
function historyDir(): string | undefined {
  return process.env.SCS_DESKTOP === "1" && process.env.SCS_DATA_DIR ? path.join(process.env.SCS_DATA_DIR, "history") : undefined;
}

function summary(run: RunRecord): RunSummary {
  const { results: _results, ...rest } = run;
  return rest;
}

function photoFile(dir: string, index: number, kind: keyof RunPhotos): string {
  return path.join(dir, "photos", `${index}-${kind}.jpg`);
}

function pruneHistory(dir: string, now = Date.now()): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const runFile = path.join(dir, entry.name, "run.json");
    try {
      const { startedAt } = JSON.parse(fs.readFileSync(runFile, "utf8"));
      if (now - Date.parse(startedAt) > retentionDays * 86_400_000) fs.rmSync(path.join(dir, entry.name), { recursive: true, force: true });
    } catch {
      // Not a run folder; leave it.
    }
  }
}

/** Number and total size of the runs kept on disk (desktop app). */
export function historyUsage(): { runs: number; bytes: number } {
  const dir = historyDir();
  if (!dir || !fs.existsSync(dir)) return { runs: 0, bytes: 0 };
  const size = (target: string): number => {
    const stat = fs.statSync(target);
    if (!stat.isDirectory()) return stat.size;
    return fs.readdirSync(target).reduce((total, entry) => total + size(path.join(target, entry)), 0);
  };
  const runs = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, "run.json")));
  return { runs: runs.length, bytes: runs.reduce((total, e) => total + size(path.join(dir, e.name)), 0) };
}

export function saveRun(sessionId: string, result: SyncRunResult): void {
  const dir = historyDir();
  if (!dir) {
    const runs = [result, ...(memory.get(sessionId) ?? [])].slice(0, memoryRunsPerSession);
    memory.set(sessionId, runs);
    return;
  }
  const runDir = path.join(dir, result.run.id);
  fs.mkdirSync(path.join(runDir, "photos"), { recursive: true });
  result.photos.forEach((photos, index) => {
    for (const kind of ["photo", "previous"] as const) {
      const data = photos[kind];
      if (data) fs.writeFileSync(photoFile(runDir, index, kind), Buffer.from(data, "base64"));
    }
  });
  writeRun(result.run);
  pruneHistory(dir);
}

function writeRun(run: RunRecord): void {
  const dir = historyDir();
  if (!dir) return; // memory runs are updated in place
  fs.writeFileSync(path.join(dir, run.id, "run.json"), JSON.stringify(run));
}

export function listRuns(sessionId: string): RunSummary[] {
  const dir = historyDir();
  if (!dir) return (memory.get(sessionId) ?? []).map((r) => summary(r.run));
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((name) => getRun(sessionId, name))
    .filter((run): run is RunRecord => Boolean(run))
    .map(summary)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function getRun(sessionId: string, id: string): RunRecord | undefined {
  if (!/^[\w.-]+$/.test(id)) return undefined;
  const dir = historyDir();
  if (!dir) return memory.get(sessionId)?.find((r) => r.run.id === id)?.run;
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, id, "run.json"), "utf8"));
  } catch {
    return undefined;
  }
}

export function getRunPhoto(sessionId: string, id: string, index: number, kind: keyof RunPhotos): Base64 | undefined {
  const dir = historyDir();
  if (!dir) return memory.get(sessionId)?.find((r) => r.run.id === id)?.photos[index]?.[kind];
  if (!/^[\w.-]+$/.test(id) || !Number.isInteger(index)) return undefined;
  try {
    return fs.readFileSync(photoFile(path.join(dir, id), index, kind)).toString("base64");
  } catch {
    return undefined;
  }
}

/** Keeps a photo of one entry, written after the run (a profile link added from the report). */
export function setRunPhoto(sessionId: string, id: string, index: number, kind: keyof RunPhotos, photo: Base64): void {
  const dir = historyDir();
  if (!dir) {
    const run = memory.get(sessionId)?.find((r) => r.run.id === id);
    if (run) run.photos[index] = { ...run.photos[index], [kind]: photo };
    return;
  }
  if (!/^[\w.-]+$/.test(id) || !Number.isInteger(index)) return;
  fs.mkdirSync(path.join(dir, id, "photos"), { recursive: true });
  fs.writeFileSync(photoFile(path.join(dir, id), index, kind), Buffer.from(photo, "base64"));
}

/** Persists changes made to a run (e.g. entries marked as undone). */
export function updateRun(run: RunRecord): void {
  writeRun(run);
}
