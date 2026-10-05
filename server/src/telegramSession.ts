import { getFromCache, setInCache, deleteFromCache } from "./cache";
import { desktopMode } from "./desktop";
import { rememberSignIns } from "./desktopSession";
import { deleteSecret, readSecret, secretStoreAvailable, writeSecret } from "./secretStore";
import { connectTelegram, TelegramConnection, TelegramError, telegramCredentials } from "./telegram";
import { TelegramState } from "../../interfaces/api";

/*
  Signing in to Telegram (issue #36): phone → code sent in the Telegram app
  → optional two-step verification password. The connection lives in the
  session cache; the desktop app saves it encrypted (like Google's) while
  "Remember sign-ins" is on.
*/

const sessionFile = "telegram-session";


interface Pending {
  connection: TelegramConnection;
  phone: string;
  phoneCodeHash: string;
  step: "code" | "password";
}

export function telegramConnection(sessionId: string): TelegramConnection | undefined {
  return getFromCache(sessionId, "telegram");
}

export function telegramState(sessionId: string): TelegramState {
  const pending: Pending | undefined = getFromCache(sessionId, "telegram_pending");
  const me: { phone?: string; name?: string } | undefined = getFromCache(sessionId, "telegram_me");
  return {
    available: Boolean(telegramCredentials()),
    connected: Boolean(telegramConnection(sessionId)),
    step: pending?.step,
    phone: me?.phone ? `+${me.phone}` : pending?.phone,
    name: me?.name,
  };
}

/** A sign-in saved by the desktop app, which reconnects with it at start. */
export function hasSavedTelegram(): boolean {
  return desktopMode && secretStoreAvailable() && Boolean(readSecret<{ session?: string }>(sessionFile)?.session);
}

function save(connection: TelegramConnection): void {
  if (desktopMode && secretStoreAvailable() && rememberSignIns()) writeSecret(sessionFile, { session: connection.session() });
}

async function finish(sessionId: string, connection: TelegramConnection): Promise<void> {
  deleteFromCache(sessionId, "telegram_pending");
  setInCache(sessionId, "telegram", connection);
  setInCache(sessionId, "telegram_me", await connection.me().catch(() => undefined));
  save(connection);
}

/** Step 1: Telegram sends a login code to the user's Telegram app. */
export async function sendTelegramCode(sessionId: string, phone: string): Promise<void> {
  const normalized = phone.replace(/[^\d+]/g, "");
  if (!/^\+\d{6,15}$/.test(normalized)) throw new TelegramError("invalid_phone");
  const previous: Pending | undefined = getFromCache(sessionId, "telegram_pending");
  await previous?.connection.disconnect();
  const connection = await connectTelegram();
  try {
    const { phoneCodeHash } = await connection.sendCode(normalized);
    setInCache(sessionId, "telegram_pending", { connection, phone: normalized, phoneCodeHash, step: "code" } satisfies Pending);
  } catch (e) {
    await connection.disconnect();
    throw e;
  }
}

/** Step 2: the code. Moves to the password step when two-step verification is on. */
export async function submitTelegramCode(sessionId: string, code: string): Promise<TelegramState> {
  const pending: Pending | undefined = getFromCache(sessionId, "telegram_pending");
  if (!pending || pending.step !== "code") throw new TelegramError("code_expired");
  try {
    await pending.connection.signIn(pending.phone, pending.phoneCodeHash, code.replace(/\D/g, ""));
  } catch (e) {
    if (e instanceof TelegramError && e.code === "password_needed") {
      pending.step = "password";
      return telegramState(sessionId);
    }
    throw e;
  }
  await finish(sessionId, pending.connection);
  return telegramState(sessionId);
}

/** Step 3 (two-step verification only). */
export async function submitTelegramPassword(sessionId: string, password: string): Promise<TelegramState> {
  const pending: Pending | undefined = getFromCache(sessionId, "telegram_pending");
  if (!pending || pending.step !== "password") throw new TelegramError("code_expired");
  await pending.connection.checkPassword(password);
  await finish(sessionId, pending.connection);
  return telegramState(sessionId);
}

/** Logs the session out at Telegram and forgets it here. */
export async function signOutTelegram(sessionId: string): Promise<void> {
  const connection = telegramConnection(sessionId);
  const pending: Pending | undefined = getFromCache(sessionId, "telegram_pending");
  deleteFromCache(sessionId, "telegram");
  deleteFromCache(sessionId, "telegram_me");
  deleteFromCache(sessionId, "telegram_pending");
  deleteSecret(sessionFile);
  await connection?.logOut().catch(() => undefined);
  await connection?.disconnect();
  await pending?.connection.disconnect();
}

/** Desktop start: reconnect with the saved session, if any. */
export async function restoreTelegram(sessionId: string): Promise<void> {
  const saved = readSecret<{ session?: string }>(sessionFile);
  if (!saved?.session || !telegramCredentials()) return;
  try {
    const connection = await connectTelegram(saved.session);
    setInCache(sessionId, "telegram", connection);
    setInCache(sessionId, "telegram_me", await connection.me().catch(() => undefined));
  } catch (e) {
    console.error("Reconnecting to Telegram failed:", e);
  }
}

export function forgetSavedTelegram(): void {
  deleteSecret(sessionFile);
}

/** "Remember sign-ins" turned on: save the current Telegram session too. */
export function saveTelegram(sessionId: string): void {
  const connection = telegramConnection(sessionId);
  if (connection) save(connection);
}
