import bigInt from "big-integer";
import { Api, TelegramClient } from "telegram";
import { LogLevel } from "telegram/extensions/Logger";
import { computeCheck } from "telegram/Password";
import { StringSession } from "telegram/sessions";

import { Base64 } from "./types";

/*
  Telegram as a photo source (issue #36), over MTProto with GramJS. The app
  identifies itself with TELEGRAM_API_ID / TELEGRAM_API_HASH (built into the
  desktop releases, or set in config.env / the environment); each user signs
  in with their own phone number. Only the user's existing Telegram contacts
  are read: nothing is imported into their account.
*/

export interface TelegramCredentials {
  apiId: number;
  apiHash: string;
}

export function telegramCredentials(env: NodeJS.ProcessEnv = process.env): TelegramCredentials | undefined {
  const apiId = Number(env.TELEGRAM_API_ID);
  const apiHash = env.TELEGRAM_API_HASH?.trim();
  return Number.isInteger(apiId) && apiId > 0 && apiHash && /^[0-9a-f]{32}$/i.test(apiHash) ? { apiId, apiHash } : undefined;
}

export interface TelegramContact {
  id: string;
  /** International digits without "+", as Telegram stores them. */
  phone: string;
}

/** What the app needs from a Telegram connection; tests use a fake. */
export interface TelegramConnection {
  sendCode(phone: string): Promise<{ phoneCodeHash: string }>;
  /** Throws a TelegramError("password_needed") when two-step verification is on. */
  signIn(phone: string, phoneCodeHash: string, code: string): Promise<void>;
  checkPassword(password: string): Promise<void>;
  me(): Promise<{ phone?: string; name?: string } | undefined>;
  /** Contacts with a phone number and a profile photo. */
  contacts(): Promise<TelegramContact[]>;
  photo(contactId: string): Promise<Base64 | null>;
  logOut(): Promise<void>;
  disconnect(): Promise<void>;
  /** The session to save, to stay signed in. */
  session(): string;
}

export type TelegramErrorCode =
  | "not_configured"
  | "invalid_phone"
  | "invalid_code"
  | "code_expired"
  | "password_needed"
  | "invalid_password"
  | "no_account"
  | "flood_wait"
  | "unavailable";

export class TelegramError extends Error {
  constructor(public code: TelegramErrorCode, public waitSeconds?: number) {
    super(code);
  }
}

/** Maps Telegram's RPC errors (e.g. "PHONE_CODE_INVALID", "FLOOD_WAIT_X") to ours. */
export function toTelegramError(error: unknown): TelegramError {
  if (error instanceof TelegramError) return error;
  const e = error as { errorMessage?: string; seconds?: number; message?: string };
  const message = e?.errorMessage ?? e?.message ?? "";
  if (/FLOOD/.test(message)) return new TelegramError("flood_wait", e.seconds);
  if (/PHONE_NUMBER_(INVALID|BANNED|FLOOD)/.test(message)) return new TelegramError("invalid_phone");
  if (/PHONE_CODE_(INVALID|EMPTY)/.test(message)) return new TelegramError("invalid_code");
  if (/PHONE_CODE_EXPIRED/.test(message)) return new TelegramError("code_expired");
  if (/SESSION_PASSWORD_NEEDED/.test(message)) return new TelegramError("password_needed");
  if (/PASSWORD_HASH_INVALID/.test(message)) return new TelegramError("invalid_password");
  if (/PHONE_NUMBER_UNOCCUPIED/.test(message)) return new TelegramError("no_account");
  return new TelegramError("unavailable");
}

async function gramjsConnection(credentials: TelegramCredentials, session = ""): Promise<TelegramConnection> {
  const client = new TelegramClient(new StringSession(session), credentials.apiId, credentials.apiHash, {
    connectionRetries: 3,
    deviceModel: "Social Contacts Sync",
    appVersion: process.env.SCS_APP_VERSION || "1.0",
  });
  client.setLogLevel(LogLevel.ERROR);
  await client.connect();
  const users = new Map<string, Api.User>();
  const call = async <T>(run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (e) {
      throw toTelegramError(e);
    }
  };

  return {
    sendCode: (phone) => call(() => client.sendCode(credentials, phone)),
    signIn: (phone, phoneCodeHash, code) =>
      call(async () => {
        const result = await client.invoke(new Api.auth.SignIn({ phoneNumber: phone, phoneCodeHash, phoneCode: code }));
        if (result instanceof Api.auth.AuthorizationSignUpRequired) throw new TelegramError("no_account");
      }),
    checkPassword: (password) =>
      call(async () => {
        const settings = await client.invoke(new Api.account.GetPassword());
        await client.invoke(new Api.auth.CheckPassword({ password: await computeCheck(settings, password) }));
      }),
    me: () =>
      call(async () => {
        const me = await client.getMe();
        if (!(me instanceof Api.User)) return undefined;
        return { phone: me.phone ?? undefined, name: [me.firstName, me.lastName].filter(Boolean).join(" ") || undefined };
      }),
    contacts: () =>
      call(async () => {
        const result = await client.invoke(new Api.contacts.GetContacts({ hash: bigInt(0) }));
        if (!(result instanceof Api.contacts.Contacts)) return [];
        users.clear();
        return result.users.flatMap((user) => {
          if (!(user instanceof Api.User) || !user.phone || !(user.photo instanceof Api.UserProfilePhoto)) return [];
          users.set(user.id.toString(), user);
          return [{ id: user.id.toString(), phone: user.phone }];
        });
      }),
    photo: (contactId) =>
      call(async () => {
        const user = users.get(contactId);
        if (!user) return null;
        const data = await client.downloadProfilePhoto(user, { isBig: true });
        return Buffer.isBuffer(data) && data.length ? data.toString("base64") : null;
      }),
    logOut: () => call(async () => void (await client.invoke(new Api.auth.LogOut()))),
    disconnect: async () => {
      await client.destroy().catch(() => undefined);
    },
    session: () => (client.session as StringSession).save(),
  };
}

type ConnectionFactory = (credentials: TelegramCredentials, session?: string) => Promise<TelegramConnection>;
let factory: ConnectionFactory = gramjsConnection;

/** Opens a Telegram connection; `session` resumes a saved sign-in. */
export function connectTelegram(session?: string): Promise<TelegramConnection> {
  const credentials = telegramCredentials();
  if (!credentials) return Promise.reject(new TelegramError("not_configured"));
  return factory(credentials, session).catch((e) => {
    throw toTelegramError(e);
  });
}

/** Tests replace GramJS with a fake. */
export function setTelegramFactory(next: ConnectionFactory | undefined): void {
  factory = next ?? gramjsConnection;
}
