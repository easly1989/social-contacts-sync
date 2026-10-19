import { ref, watch } from "vue";

import { ApiError } from "./api";
import { brandColors } from "./brands";
import { networkInfo } from "./profileNetworks";

// Profile links (issue #51): which networks are read, and the user's choices, kept in this browser like the sync setup.
export const stableNetworks = ["X", "YouTube", "Bluesky", "Mastodon", "GitHub"];

/** Every network a profile link can be on (issue #83), as Sync › Sources lists them. */
export const linkNetworks: Record<string, { name: string; color: string }> = {
  ...networkInfo,
  x: { name: "X", color: brandColors.x },
  youtube: { name: "YouTube", color: brandColors.youtube },
};
/** Read with the login in the desktop app; on the web, as an anonymous visitor they often turn away. */
export const loginNetworks = ["instagram", "facebook", "linkedin"];

/** The message for a failed link lookup: `links.errors.<code>` with the network's name. */
export function lookupError(e: unknown, t: (key: string, values?: Record<string, unknown>) => string): string {
  const code = e instanceof ApiError ? e.code : undefined;
  const network = e instanceof ApiError ? String(e.body?.network ?? "") : "";
  return ["unsupported_link", "no_photo", "signin_required", "unreachable", "login_needed", "linkedin_off"].includes(code ?? "") ? t(`links.errors.${code}`, { network }) : t("links.errors.unknown");
}

/** A yes/no choice kept in this browser. */
export function storedFlag(key: string, fallback: boolean) {
  let initial = fallback;
  try {
    const value = localStorage.getItem(key);
    if (value !== null) initial = value === "true";
  } catch {
    // Only a convenience.
  }
  const flag = ref(initial);
  watch(flag, (on) => {
    try {
      localStorage.setItem(key, String(on));
    } catch {
      // Only a convenience.
    }
  });
  return flag;
}

/** Desktop: read pinned LinkedIn profiles one by one with the login (issue #80). On by default. */
export const linkedinRereads = storedFlag("scs.links.linkedinRereads", true);

/** The first-time notice about LinkedIn reads was answered. */
export const linkedinNoticeSeen = storedFlag("scs.links.linkedinNoticeSeen", false);
