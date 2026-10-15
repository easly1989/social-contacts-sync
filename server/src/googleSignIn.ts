import { deleteFromCache, getFromCache, setInCache } from "./cache";
import { forgetSavedGoogleAuth } from "./desktopSession";
import { OAuth2Client } from "./gapi";

/*
  A Google sign-in can stop working while the app still holds it: Google
  ends the sign-ins of a project left in "Testing" after 7 days, and the
  user can remove the app's access from their account. The refresh then
  fails with invalid_grant. The app checks for that and forgets the
  sign-in, so it asks for a new one instead of failing on every page.
*/

const checkEvery = 5 * 60 * 1000;
const timeout = 8000;

/** Google refused the saved sign-in itself, not just this request. */
export function isRevokedSignIn(e: unknown): boolean {
  const error = e as { response?: { data?: { error?: unknown } }; message?: unknown };
  return error?.response?.data?.error === "invalid_grant" || (typeof error?.message === "string" && error.message.includes("invalid_grant"));
}

/** Forgets a sign-in Google no longer accepts, and remembers why for the sign-in page. */
export function expireGoogleSignIn(sessionId: string): void {
  deleteFromCache(sessionId, "gauth");
  deleteFromCache(sessionId, "gauth_checked");
  forgetSavedGoogleAuth();
  setInCache(sessionId, "google_expired", true);
}

/**
 * Checks, at most every few minutes, that Google still accepts the sign-in.
 * Only a refusal counts: being offline or a slow answer leaves it as it is.
 */
export async function checkGoogleSignIn(sessionId: string, now = Date.now()): Promise<void> {
  const client: OAuth2Client | undefined = getFromCache(sessionId, "gauth");
  if (!client || now - (getFromCache(sessionId, "gauth_checked") ?? 0) < checkEvery) return;
  try {
    await Promise.race([client.getAccessToken(), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeout).unref?.())]);
    setInCache(sessionId, "gauth_checked", now);
  } catch (e) {
    if (isRevokedSignIn(e) && getFromCache(sessionId, "gauth") === client) expireGoogleSignIn(sessionId);
  }
}

/** Answers a request that failed because the sign-in is gone; false for any other failure. */
export function answeredRevoked(sessionId: string, e: unknown, res: { status(code: number): { send(body: unknown): unknown } }): boolean {
  if (!isRevokedSignIn(e)) return false;
  expireGoogleSignIn(sessionId);
  res.status(401).send({ error: "google_signin_expired" });
  return true;
}
