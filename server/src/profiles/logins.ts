import { EventType, ProfileScanState } from "../../../interfaces/api";
import { getFromCache } from "../cache";
import { sendEvent } from "../ws";
import { RereadNetwork, readsWithLogin, Rereads } from "./rereads";

/*
  Desktop: the sites' sign-ins as they change (issue #107). The desktop app
  watches each login network's session cookie and tells the server; a
  session that ends without the app signing out was closed by the site. A
  sync in progress picks the network up again once it's back.
*/

const closed = new Map<string, string>();
const syncing = new Map<string, Rereads>();

/** When the site closed the app's session, if it did since the app started. */
export const closedAt = (network: string): string | undefined => closed.get(network);

/** The profile reads of the session's sync in progress, so a new sign-in or a Skip reaches them. */
export function trackRereads(sessionId: string, rereads: Rereads | undefined): void {
  if (rereads) syncing.set(sessionId, rereads);
  else syncing.delete(sessionId);
}

export function skipReads(sessionId: string, network: string): boolean {
  const rereads = syncing.get(sessionId);
  if (!rereads || !readsWithLogin(network)) return false;
  rereads.skip(network);
  return true;
}

/** A sign-in came or went; `byApp` when the app itself signed out. */
export function loginChanged(sessionId: string, change: { network: string; loggedIn: boolean; byApp?: boolean }): void {
  const { network, loggedIn } = change;
  if (loggedIn) closed.delete(network);
  else if (change.byApp) closed.delete(network);
  else closed.set(network, new Date().toISOString());
  if (loggedIn && readsWithLogin(network)) syncing.get(sessionId)?.resume(network as RereadNetwork);
  const state: ProfileScanState = { network: network as ProfileScanState["network"], loggedIn, ...(closed.has(network) ? { closedAt: closed.get(network) } : {}) };
  const ws = getFromCache(sessionId, "ws");
  if (ws) sendEvent(ws, EventType.LoginChanged, state);
}
