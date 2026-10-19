import { ref, watch } from "vue";

import { LinkNetwork, RunOptions, SourceKey } from "../../interfaces/api";
import { linkNetworks, loginNetworks } from "./profileLinks";
import { isDesktop } from "./settings";

/*
  What the next sync uses, kept in this browser (issue #8): the sources in
  priority order and which are on, and what the run does (issue #82). Each
  profile network is a source of its own, in the same order (issue #107).
*/

export interface SyncPrefs {
  order: SourceKey[];
  enabled: SourceKey[];
  options: RunOptions;
  /** Desktop: profiles read with the login per network and sync. */
  readsCap: number;
}

const prefsKey = "scs.syncSetup";
export const defaultOptions: RunOptions = { fillMissing: true, updatePinned: true, lookDifferent: true, decideAll: false };

const networks = Object.keys(linkNetworks) as LinkNetwork[];
export const isNetwork = (key: string): key is LinkNetwork => networks.includes(key as LinkNetwork);

/**
 * The networks on for someone who never switched them. Before issue #83 one
 * Settings switch covered Instagram, Facebook and LinkedIn on the web, off
 * unless turned on; the desktop app always read them with the login.
 */
function networksOnBefore(off?: unknown): LinkNetwork[] {
  if (Array.isArray(off)) return networks.filter((n) => !off.includes(n));
  let tried = false;
  try {
    tried = localStorage.getItem("scs.links.bestEffort") === "true";
  } catch {
    // Only a convenience.
  }
  return isDesktop.value || tried ? networks : networks.filter((n) => !loginNetworks.includes(n));
}

function readPrefs(): SyncPrefs {
  const order: SourceKey[] = ["whatsapp", "gravatar", ...networks, "telegram"];
  const defaults: SyncPrefs = { order, enabled: ["whatsapp", "gravatar", ...networksOnBefore()], options: defaultOptions, readsCap: 100 };
  try {
    const stored = JSON.parse(localStorage.getItem(prefsKey) ?? "{}");
    // "links" stood for every network, where it was in the order (before issue #107).
    const expand = (keys: unknown, links: SourceKey[]) =>
      (Array.isArray(keys) ? keys : []).flatMap((k: string) => (k === "links" ? links : order.includes(k as SourceKey) ? [k as SourceKey] : []));
    const storedOrder = [...new Set(expand(stored.order, networks))];
    // Sources added since the choice was saved start as they do for everyone.
    const added = order.filter((s) => !storedOrder.includes(s));
    const enabled = Array.isArray(stored.enabled) ? expand(stored.enabled, networksOnBefore(stored.networksOff)) : defaults.enabled;
    const options = Object.fromEntries(Object.entries(defaultOptions).map(([key, on]) => [key, typeof stored.options?.[key] === "boolean" ? stored.options[key] : on])) as unknown as RunOptions;
    return {
      order: [...storedOrder, ...added],
      enabled: [...new Set([...enabled, ...added.filter((s) => defaults.enabled.includes(s) && !(isNetwork(s) && Array.isArray(stored.enabled)))])],
      options,
      readsCap: Number.isInteger(stored.readsCap) && stored.readsCap > 0 ? Math.min(stored.readsCap, 1000) : defaults.readsCap,
    };
  } catch {
    return defaults;
  }
}

export const syncPrefs = ref<SyncPrefs>(readPrefs());

export function setEnabled(key: SourceKey, on: boolean): void {
  syncPrefs.value.enabled = on ? [...new Set([...syncPrefs.value.enabled, key])] : syncPrefs.value.enabled.filter((k) => k !== key);
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
