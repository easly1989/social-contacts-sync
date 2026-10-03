import crypto from "crypto";

/*
  Pending Google sign-ins, keyed by the OAuth `state` parameter.

  The desktop app opens Google's consent page in the system browser, which
  does not share cookies with the app window, so the callback cannot be tied
  to the session through its cookie. Instead each state remembers the session
  that started the sign-in. States are random, single use and expire.
*/

const ttl = 10 * 60 * 1000; // 10 minutes
const pending = new Map<string, { sessionId: string; expires: number }>();

function purge(now: number): void {
  for (const [state, entry] of pending) if (entry.expires <= now) pending.delete(state);
}

/** Creates a state for a sign-in started by `sessionId`. */
export function createOAuthState(sessionId: string, now = Date.now()): string {
  purge(now);
  const state = crypto.randomBytes(16).toString("hex");
  pending.set(state, { sessionId, expires: now + ttl });
  return state;
}

/** Returns the session that created `state` and forgets it, or undefined. */
export function consumeOAuthState(state: unknown, now = Date.now()): string | undefined {
  purge(now);
  if (typeof state !== "string") return undefined;
  const entry = pending.get(state);
  pending.delete(state);
  return entry?.sessionId;
}
