import { ref, watch } from "vue";

// Profile links (issue #51): which networks are read, and the user's choice
// for the unofficial ones, kept in this browser like the sync setup.
export const stableNetworks = ["X", "Telegram", "YouTube", "Bluesky", "Mastodon", "GitHub"];
export const bestEffortNetworks = ["Instagram", "Facebook", "LinkedIn"];

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
