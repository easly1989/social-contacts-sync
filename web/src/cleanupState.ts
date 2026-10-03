import { ref } from "vue";

import { api } from "./api";
import { CleanupSummary } from "../../interfaces/api";

/** Clean-up counts for the sidebar badge and the dashboard, shared across pages. */
export const cleanupSummary = ref<CleanupSummary>();

let loading: Promise<void> | undefined;

export function loadCleanupSummary(): Promise<void> {
  loading ??= api
    .cleanupSummary()
    .then((summary) => {
      cleanupSummary.value = summary;
    })
    .catch(() => {
      loading = undefined;
    });
  return loading;
}

/** The region of the browser's language ("it-IT" → "IT"), for numbers saved without a country code. */
export function browserRegion(): string | undefined {
  try {
    return new Intl.Locale(navigator.language).maximize().region;
  } catch {
    return undefined;
  }
}
