import { computed, reactive } from "vue";

import { api } from "./api";
import { addHandler } from "./services/ws";
import { linkedinRereads } from "./profileLinks";
import { syncPrefs } from "./syncPrefs";
import { EventType, SourceId, SourceKey, SyncCounters, SyncIssue, SyncProgress } from "../../interfaces/api";

/*
  The sync in progress (issue #82), kept outside the pages: it goes on while
  the user moves to To review or elsewhere in the app, and stops only when
  the window closes (the server stops when the page's connection goes).
*/

export interface AppliedPhoto {
  image: string;
  name?: string;
  source: SourceId;
  network?: string;
  pinned?: boolean;
  key: number;
}

const emptyCounters = (): SyncCounters => ({ added: 0, replaced: 0, kept: 0, queued: 0, alreadyHadPhoto: 0, noMatch: 0, errors: 0 });

export const run = reactive({
  started: false,
  startedAt: 0,
  phase: undefined as SyncProgress["phase"],
  reads: {} as NonNullable<SyncProgress["reads"]>,
  progress: 0,
  checked: 0,
  total: undefined as number | undefined,
  counters: emptyCounters(),
  latest: [] as AppliedPhoto[],
  runId: undefined as string | undefined,
  cancelled: false,
  stopping: false,
  error: undefined as string | undefined,
  lastEventAt: undefined as number | undefined,
  /** Sources left out so far (issue #107). */
  issues: [] as SyncIssue[],
});

export const running = computed(() => run.started && !run.runId && !run.error);

function onProgress(update: SyncProgress): void {
  run.lastEventAt = Date.now();
  if (update.phase) run.phase = update.phase;
  if (update.reads) run.reads = update.reads;
  if (update.phase !== "profiles") run.progress = update.progress;
  if (update.checked !== undefined) run.checked = update.checked;
  if (update.totalContacts !== undefined) run.total = update.totalContacts;
  if (update.counters) run.counters = { ...emptyCounters(), ...update.counters };
  run.error = update.error;
  if (update.issues) run.issues = update.issues;
  if (update.image && update.latest) run.latest = [{ image: update.image, ...update.latest, key: run.checked }, ...run.latest].slice(0, 12);
  if (update.runId) {
    run.runId = update.runId;
    run.cancelled = Boolean(update.cancelled);
  }
}
addHandler(EventType.SyncProgress, onProgress);

/** Starts a sync with the sources (and networks, issue #107) chosen in the Sync page, in order. */
export function startRun(sources: SourceKey[]): void {
  Object.assign(run, {
    started: true,
    startedAt: Date.now(),
    phase: undefined,
    reads: {},
    progress: 0,
    checked: 0,
    total: undefined,
    counters: emptyCounters(),
    latest: [],
    runId: undefined,
    cancelled: false,
    stopping: false,
    error: undefined,
    lastEventAt: undefined,
    issues: [],
  });
  const { options, readsCap } = syncPrefs.value;
  const params = new URLSearchParams({
    sources: sources.join(","),
    fill_missing: String(options.fillMissing),
    update_pinned: String(options.updatePinned),
    look_different: String(options.lookDifferent),
    decide_all: String(options.decideAll),
    reads_cap: String(readsCap),
    linkedin_rereads: String(linkedinRereads.value),
  });
  void fetch(`/api/init_sync?${params}`, { credentials: "include" });
}

export async function stopRun(): Promise<void> {
  run.stopping = true;
  await api.stopSync().catch(() => undefined);
}

/** Leaves a network's profile reads out of this sync (issue #107). */
export async function skipNetwork(network: string): Promise<void> {
  await api.skipNetwork(network).catch(() => undefined);
}

/** Back to the options, for another sync. */
export function resetRun(): void {
  run.started = false;
}
