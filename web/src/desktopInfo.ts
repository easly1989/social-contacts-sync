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
      })
      .catch(() => {
        loading = undefined;
      });
  }
  return loading;
}

export const checkingUpdates = ref(false);

/** "Check for updates" in Settings; the result also shows in the sidebar. */
export async function checkForUpdates(): Promise<void> {
  checkingUpdates.value = true;
  try {
    const result = await api.checkUpdates();
    if (desktopInfo.value) desktopInfo.value = { ...desktopInfo.value, lastUpdate: result };
  } catch {
    if (desktopInfo.value) desktopInfo.value = { ...desktopInfo.value, lastUpdate: { status: "error", checkedAt: new Date().toISOString() } };
  }
  checkingUpdates.value = false;
}

/** i18n key suffix for a package kind (settings.packages.*). */
export function packageKey(kind: string): string {
  return kind.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
}
