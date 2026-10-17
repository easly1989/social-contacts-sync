import { ref, watch } from "vue";

import { RunOptions, SourceId } from "../../interfaces/api";

/*
  What the next sync uses, kept in this browser (issue #8): the sources in
  priority order and which are on (Sources tab), and what the run does (Run
  tab, issue #82).
*/

export interface SyncPrefs {
  order: SourceId[];
  enabled: SourceId[];
  options: RunOptions;
  /** Desktop: profiles read with the login per network and sync. */
  readsCap: number;
}

const prefsKey = "scs.syncSetup";
export const defaultOptions: RunOptions = { fillMissing: true, updatePinned: true, lookDifferent: true, decideAll: false };

function readPrefs(): SyncPrefs {
  const defaults: SyncPrefs = { order: ["whatsapp", "gravatar", "telegram", "links"], enabled: ["whatsapp", "gravatar", "links"], options: defaultOptions, readsCap: 100 };
  try {
    const stored = JSON.parse(localStorage.getItem(prefsKey) ?? "{}");
    const order = Array.isArray(stored.order) ? stored.order.filter((s: SourceId) => defaults.order.includes(s)) : [];
    // Sources added since the choice was saved start as they do for everyone.
    const added = defaults.order.filter((s) => !order.includes(s));
    const options = Object.fromEntries(Object.entries(defaultOptions).map(([key, on]) => [key, typeof stored.options?.[key] === "boolean" ? stored.options[key] : on])) as unknown as RunOptions;
    return {
      order: [...order, ...added],
      enabled: Array.isArray(stored.enabled) ? [...stored.enabled, ...added.filter((s) => defaults.enabled.includes(s))] : defaults.enabled,
      options,
      readsCap: Number.isInteger(stored.readsCap) && stored.readsCap > 0 ? Math.min(stored.readsCap, 1000) : defaults.readsCap,
    };
  } catch {
    return defaults;
  }
}

export const syncPrefs = ref<SyncPrefs>(readPrefs());

watch(
  syncPrefs,
  (value) => {
    try {
      localStorage.setItem(prefsKey, JSON.stringify(value));
    } catch {
      // Only a convenience.
    }
  },
  { deep: true }
);
