import fs from "fs";
import path from "path";

import { CleanupActionSummary, CleanupScan } from "../../../interfaces/api";
import { getFromCache, setInCache } from "../cache";
import { Base64 } from "../types";
import { EditBackup } from "./edits";
import { MergeBackup } from "./merge";

/*
  What clean-up keeps between requests: the last scan, the user's choices
  ("Not duplicates", numbers marked as shared), and every merge with its
  backup for undo. The desktop app keeps choices and backups in its data
  folder (backups for 90 days, like sync runs); the web server per session.
*/

const retentionDays = 90;
const memoryActionsPerSession = 20;

export type CleanupAction =
  | (CleanupActionSummary & { kind: "merge"; backup: MergeBackup })
  | (CleanupActionSummary & { kind: "delete"; backup: MergeBackup })
  | (CleanupActionSummary & { kind: "keepNumber" | "countryCodes"; backup: EditBackup });

export interface CleanupPrefs {
  ignoredPairs: string[];
  sharedNumbers: string[];
}

function dataDir(): string | undefined {
  return process.env.SCS_DESKTOP === "1" && process.env.SCS_DATA_DIR ? process.env.SCS_DATA_DIR : undefined;
}

function actionsDir(): string | undefined {
  const dir = dataDir();
  return dir ? path.join(dir, "history", "cleanup") : undefined;
}

// The last scan, in memory for both: it is cheap to redo and goes stale.
export function getScan(sessionId: string): CleanupScan | undefined {
  return getFromCache(sessionId, "cleanup_scan");
}

export function setScan(sessionId: string, scan: CleanupScan): void {
  setInCache(sessionId, "cleanup_scan", scan);
}

export function getPrefs(sessionId: string): CleanupPrefs {
  const empty: CleanupPrefs = { ignoredPairs: [], sharedNumbers: [] };
  const dir = dataDir();
  if (!dir) return { ...empty, ...getFromCache(sessionId, "cleanup_prefs") };
  try {
    return { ...empty, ...JSON.parse(fs.readFileSync(path.join(dir, "cleanup.json"), "utf8")) };
  } catch {
    return empty;
  }
}

export function savePrefs(sessionId: string, prefs: CleanupPrefs): void {
  const dir = dataDir();
  if (!dir) return setInCache(sessionId, "cleanup_prefs", prefs);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "cleanup.json");
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(prefs, null, 2));
  fs.renameSync(`${file}.tmp`, file);
}

function summary(action: CleanupAction): CleanupActionSummary {
  const { backup: _backup, ...rest } = action;
  return rest;
}

/** Saves an action; photos are files next to it in the desktop app. */
export function saveAction(sessionId: string, action: CleanupAction): void {
  const dir = actionsDir();
  if (!dir) {
    const actions = (getFromCache(sessionId, "cleanup_actions") as CleanupAction[] | undefined) ?? [];
    setInCache(sessionId, "cleanup_actions", [action, ...actions.filter((a) => a.id !== action.id)].slice(0, memoryActionsPerSession));
    return;
  }
  const actionDir = path.join(dir, action.id);
  fs.mkdirSync(actionDir, { recursive: true });
  let stored: unknown = action;
  if (action.kind === "merge" || action.kind === "delete") {
    action.backup.photos.forEach((photo, i) => {
      const file = path.join(actionDir, `photo-${i}.jpg`);
      if (photo && !fs.existsSync(file)) fs.writeFileSync(file, Buffer.from(photo, "base64"));
    });
    stored = { ...action, backup: { ...action.backup, photos: action.backup.photos.map((p) => (p ? true : null)) } };
  }
  fs.writeFileSync(path.join(actionDir, "action.json"), JSON.stringify(stored));
  prune(dir);
}

export function getAction(sessionId: string, id: string): CleanupAction | undefined {
  const dir = actionsDir();
  if (!dir) return ((getFromCache(sessionId, "cleanup_actions") as CleanupAction[] | undefined) ?? []).find((a) => a.id === id);
  if (!/^[\w.-]+$/.test(id)) return undefined;
  try {
    const stored = JSON.parse(fs.readFileSync(path.join(dir, id, "action.json"), "utf8"));
    if (stored.kind !== "merge" && stored.kind !== "delete") return stored;
    stored.backup.photos = stored.backup.photos.map((has: boolean | null, i: number): Base64 | null =>
      has ? fs.readFileSync(path.join(dir, id, `photo-${i}.jpg`)).toString("base64") : null
    );
    return stored;
  } catch {
    return undefined;
  }
}

export function listActions(sessionId: string): CleanupActionSummary[] {
  const dir = actionsDir();
  if (!dir) return ((getFromCache(sessionId, "cleanup_actions") as CleanupAction[] | undefined) ?? []).map(summary);
  if (!fs.existsSync(dir)) return [];
  return readActions(dir).sort((a, b) => b.at.localeCompare(a.at));
}

function prune(dir: string, now = Date.now()): void {
  for (const action of readActions(dir))
    if (now - Date.parse(action.at) > retentionDays * 86_400_000) fs.rmSync(path.join(dir, action.id), { recursive: true, force: true });
}

/** Summaries of the actions saved in `dir`, skipping anything unreadable. */
function readActions(dir: string): CleanupActionSummary[] {
  return fs.readdirSync(dir).flatMap((id) => {
    try {
      return [summary(JSON.parse(fs.readFileSync(path.join(dir, id, "action.json"), "utf8")))];
    } catch {
      return [];
    }
  });
}
