import { computed, ref, watch } from "vue";

import { RunOptions, SourceId } from "../../interfaces/api";
import { linkNetworks, loginNetworks } from "./profileLinks";
import { isDesktop } from "./settings";

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
  /** Profile link networks turned off in Sources (issue #83); unset until one is switched. */
  networksOff?: string[];
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
      ...(Array.isArray(stored.networksOff) ? { networksOff: stored.networksOff } : {}),
    };
  } catch {
    return defaults;
  }
}

export const syncPrefs = ref<SyncPrefs>(readPrefs());

/**
 * The networks turned off. Before issue #83 one Settings switch covered
 * Instagram, Facebook and LinkedIn on the web, off unless turned on; the
 * desktop app always read them with the login.
 */
export const networksOff = computed(() => {
  if (syncPrefs.value.networksOff) return syncPrefs.value.networksOff;
  let tried = false;
  try {
    tried = localStorage.getItem("scs.links.bestEffort") === "true";
  } catch {
    // Only a convenience.
  }
  return isDesktop.value || tried ? [] : loginNetworks;
});

/** The networks a sync reads, for `link_networks`. */
export const networksOn = computed(() => Object.keys(linkNetworks).filter((n) => !networksOff.value.includes(n)));

export function setNetwork(network: string, on: boolean): void {
  syncPrefs.value.networksOff = on ? networksOff.value.filter((n) => n !== network) : [...new Set([...networksOff.value, network])];
}

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
