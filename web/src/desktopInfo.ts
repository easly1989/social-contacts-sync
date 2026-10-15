import { ref } from "vue";

import { api } from "./api";
import { DesktopInfo } from "../../interfaces/api";

/** The desktop app's details for Settings and the sidebar, loaded once and shared. */
export const desktopInfo = ref<DesktopInfo>();

let loading: Promise<void> | undefined;

export function loadDesktopInfo(refresh = false): Promise<void> {
  if (!loading || refresh) {
    loading = api
      .desktopInfo()
      .then((info) => {
        desktopInfo.value = info;
        watchUpdate();
      })
      .catch(() => {
        loading = undefined;
      });
  }
  return loading;
}

let watching: number | undefined;
let unchecked = 0;

/**
 * While the start-up check runs, or an update downloads, its progress comes
 * in for Settings and the sidebar (issue #63).
 */
function watchUpdate(): void {
  if (watching !== undefined) return;
  unchecked = 0;
  const done = () => {
    const info = desktopInfo.value;
    if (!info || info.updates === "none") return true;
    if (!info.lastUpdate) return ++unchecked > 30;
    return info.lastUpdate.status !== "downloading";
  };
  if (done()) return;
  watching = window.setInterval(async () => {
    try {
      desktopInfo.value = await api.desktopInfo();
    } catch {
      // Tried again on the next tick.
    }
    if (done()) {
      window.clearInterval(watching);
      watching = undefined;
    }
  }, 2000);
}

export const checkingUpdates = ref(false);

/** "Automatic updates" in Settings; turning it on looks for one right away. */
export async function setAutoUpdates(enabled: boolean): Promise<void> {
  desktopInfo.value = await api.setAutoUpdates(enabled);
  watchUpdate();
}

/** "Check for updates" in Settings; the result also shows in the sidebar. */
export async function checkForUpdates(): Promise<void> {
  checkingUpdates.value = true;
  try {
    const result = await api.checkUpdates();
    if (desktopInfo.value) desktopInfo.value = { ...desktopInfo.value, lastUpdate: result };
    watchUpdate();
  } catch {
    if (desktopInfo.value) desktopInfo.value = { ...desktopInfo.value, lastUpdate: { status: "error", checkedAt: new Date().toISOString() } };
  }
  checkingUpdates.value = false;
}

/** i18n key suffix for a package kind (settings.packages.*). */
export function packageKey(kind: string): string {
  return kind.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
}
