import { ref, watch } from "vue";

import { ApiError } from "./api";

// Profile links (issue #51): which networks are read, and the user's choice
// for the unofficial ones, kept in this browser like the sync setup.
export const stableNetworks = ["X", "Telegram", "YouTube", "Bluesky", "Mastodon", "GitHub"];
export const bestEffortNetworks = ["Instagram", "Facebook", "LinkedIn"];

/** The message for a failed link lookup: `links.errors.<code>` with the network's name. */
export function lookupError(e: unknown, t: (key: string, values?: Record<string, unknown>) => string): string {
  const code = e instanceof ApiError ? e.code : undefined;
  const network = e instanceof ApiError ? String(e.body?.network ?? "") : "";
  return ["unsupported_link", "no_photo", "signin_required", "unreachable"].includes(code ?? "") ? t(`links.errors.${code}`, { network }) : t("links.errors.unknown");
}

const key = "scs.links.bestEffort";

function stored(): boolean {
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

/** Also try Instagram, Facebook and LinkedIn during syncs. Off by default. */
export const bestEffortLinks = ref(stored());

watch(bestEffortLinks, (on) => {
  try {
    localStorage.setItem(key, String(on));
  } catch {
    // Only a convenience.
  }
});
