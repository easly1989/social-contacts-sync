import fs from "fs";
import path from "path";

import { deleteFromCache, getFromCache, setInCache } from "./cache";
import { desktopMode } from "./desktop";
import { OAuth2Client, oauth2ClientFromTokens } from "./gapi";
import { deleteSecret, readSecret, secretStoreAvailable, writeSecret } from "./secretStore";

/*
  Keeps the desktop app's single user signed in across restarts: Google
  tokens are saved encrypted (secretStore) and WhatsApp keeps its linked-
  device session in the data folder (whatsapp-web.js LocalAuth).
*/

/** The desktop app has one user, so it uses one fixed session ID. */
export const desktopSessionId = "desktop";

const googleTokenFile = "google-token";

/** Saves the tokens now and whenever Google refreshes them. */
export function persistGoogleAuth(client: OAuth2Client): void {
  if (!desktopMode || !secretStoreAvailable()) return;
  writeSecret(googleTokenFile, client.credentials);
  client.on("tokens", (tokens) => {
    // Refreshes usually omit the refresh token: keep the saved one.
    writeSecret(googleTokenFile, { ...readSecret<object>(googleTokenFile), ...tokens });
  });
}

export function restoreGoogleAuth(): OAuth2Client | undefined {
  const tokens = readSecret<{ refresh_token?: string }>(googleTokenFile);
  if (!tokens?.refresh_token) return undefined;
  const client = oauth2ClientFromTokens(tokens);
  persistGoogleAuth(client);
  return client;
}

export async function signOutGoogle(sessionId: string): Promise<void> {
  const client: OAuth2Client | undefined = getFromCache(sessionId, "gauth");
  deleteFromCache(sessionId, "gauth");
  deleteSecret(googleTokenFile);
  // Best effort: also invalidate the token at Google.
  await client?.revokeCredentials().catch(() => undefined);
}

/** Folder for whatsapp-web.js's LocalAuth, or undefined outside the desktop app. */
export function whatsappDataPath(): string | undefined {
  if (!desktopMode || !process.env.SCS_DATA_DIR) return undefined;
  return path.join(process.env.SCS_DATA_DIR, "whatsapp");
}

/** A linked-device session saved by a previous run. */
export function hasSavedWhatsAppSession(): boolean {
  const dir = whatsappDataPath();
  return Boolean(dir && fs.existsSync(path.join(dir, "session")));
}

/** Called once at startup in desktop mode. */
export function restoreDesktopSession(startWhatsApp: (sessionId: string) => unknown): void {
  const gAuth = restoreGoogleAuth();
  if (gAuth) setInCache(desktopSessionId, "gauth", gAuth);
  if (hasSavedWhatsAppSession()) setInCache(desktopSessionId, "whatsapp", startWhatsApp(desktopSessionId));
}
