import { Router } from "vue-router";

import { api } from "./api";
import { applyStatus } from "./settings";

/**
 * After a Google request failed: when Google no longer accepts the sign-in
 * (the server then forgets it), go straight to signing in again instead of
 * leaving the page with an error it can't fix.
 */
export async function signInAgainIfNeeded(router: Router): Promise<boolean> {
  const status = await api.status().catch(() => undefined);
  if (!status || status.googleConnected) return false;
  // Set up once: the app frame asks for the sign-in where the user is.
  if (status.setupDone) applyStatus(status);
  else await router.replace(status.desktop ? "/setup/signin" : "/gauth");
  return true;
}
