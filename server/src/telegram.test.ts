import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { AddressInfo } from "net";

import telegramRouter from "../routes/telegram";
import { telegramSource } from "./sources/telegram";
import { setTelegramFactory, TelegramConnection, telegramCredentials, TelegramError, toTelegramError } from "./telegram";

test("credentials need a numeric ID and a 32-character hash", () => {
  assert.deepEqual(telegramCredentials({ TELEGRAM_API_ID: "123456", TELEGRAM_API_HASH: "0123456789abcdef0123456789abcdef" }), {
    apiId: 123456,
    apiHash: "0123456789abcdef0123456789abcdef",
  });
  assert.equal(telegramCredentials({ TELEGRAM_API_ID: "abc", TELEGRAM_API_HASH: "0123456789abcdef0123456789abcdef" }), undefined);
  assert.equal(telegramCredentials({ TELEGRAM_API_ID: "1", TELEGRAM_API_HASH: "short" }), undefined);
  assert.equal(telegramCredentials({}), undefined);
});

test("Telegram's RPC errors map to ours", () => {
  assert.equal(toTelegramError({ errorMessage: "PHONE_CODE_INVALID" }).code, "invalid_code");
  assert.equal(toTelegramError({ errorMessage: "SESSION_PASSWORD_NEEDED" }).code, "password_needed");
  assert.equal(toTelegramError({ errorMessage: "PASSWORD_HASH_INVALID" }).code, "invalid_password");
  assert.equal(toTelegramError({ errorMessage: "PHONE_NUMBER_INVALID" }).code, "invalid_phone");
  const flood = toTelegramError({ errorMessage: "FLOOD_WAIT_X", seconds: 42 });
  assert.equal(flood.code, "flood_wait");
  assert.equal(flood.waitSeconds, 42);
  assert.equal(toTelegramError(new Error("socket hang up")).code, "unavailable");
});

class FakeTelegram implements TelegramConnection {
  calls: string[] = [];
  password?: string;
  constructor(private people: { id: string; phone: string; photo?: string }[] = [], private own = "393400000000") {}
  async sendCode(phone: string) {
    this.calls.push(`sendCode ${phone}`);
    return { phoneCodeHash: "hash" };
  }
  async signIn(_phone: string, hash: string, code: string) {
    this.calls.push(`signIn ${code}`);
    if (hash !== "hash" || code !== "12345") throw new TelegramError("invalid_code");
    if (this.password) throw new TelegramError("password_needed");
  }
  async checkPassword(password: string) {
    if (password !== this.password) throw new TelegramError("invalid_password");
  }
  async me() {
    return { phone: this.own, name: "Ada" };
  }
  async contacts() {
    return this.people.map(({ id, phone }) => ({ id, phone }));
  }
  async photo(id: string) {
    return this.people.find((p) => p.id === id)?.photo ?? null;
  }
  async logOut() {
    this.calls.push("logOut");
  }
  async disconnect() {
    this.calls.push("disconnect");
  }
  session() {
    return "saved-session";
  }
}

test("the source matches Telegram contacts by number, in any spelling", async () => {
  const source = telegramSource(
    new FakeTelegram([
      { id: "1", phone: "393331234567", photo: "QUJD" },
      { id: "2", phone: "447700900123" },
    ])
  );
  await source.prepare!();
  // Saved without a country code: the user's own Italian number supplies it.
  assert.deepEqual(await source.find({ id: "c1", numbers: ["333 123 4567"], hasPhoto: false }), { photo: "QUJD", source: "telegram", matchedBy: "333 123 4567" });
  assert.equal(await source.find({ id: "c2", numbers: ["+44 7700 900123"], hasPhoto: false }), null);
  assert.equal(await source.find({ id: "c3", numbers: ["+1 202 555 0100"], hasPhoto: false }), null);
});

async function start(t: { after(fn: () => void): void }, sessionId: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { sessionID: string }).sessionID = sessionId;
    next();
  });
  app.use("/api", telegramRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  return async (route: string, body?: unknown) => {
    const response = await fetch(`${base}${route}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, json: (await response.json()) as any };
  };
}

function withCredentials(t: { after(fn: () => void): void }, set = true) {
  const previous = { id: process.env.TELEGRAM_API_ID, hash: process.env.TELEGRAM_API_HASH };
  if (set) Object.assign(process.env, { TELEGRAM_API_ID: "123456", TELEGRAM_API_HASH: "0123456789abcdef0123456789abcdef" });
  else delete process.env.TELEGRAM_API_ID;
  t.after(() => {
    for (const [k, v] of [["TELEGRAM_API_ID", previous.id], ["TELEGRAM_API_HASH", previous.hash]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    setTelegramFactory(undefined);
  });
}

test("sign-in: phone, code, connected, sign out", async (t) => {
  withCredentials(t);
  const fake = new FakeTelegram();
  setTelegramFactory(async () => fake);
  const call = await start(t, "tg-1");

  assert.deepEqual((await call("/telegram")).json, { available: true, connected: false });
  assert.deepEqual((await call("/telegram/send_code", { phone: "12" })).json, { error: "invalid_phone" });
  assert.deepEqual((await call("/telegram/send_code", { phone: "+39 340 000 0000" })).json, { available: true, connected: false, step: "code", phone: "+393400000000" });
  assert.deepEqual((await call("/telegram/sign_in", { code: "00000" })), { status: 400, json: { error: "invalid_code" } });
  assert.deepEqual((await call("/telegram/sign_in", { code: "12 345" })).json, { available: true, connected: true, phone: "+393400000000", name: "Ada" });
  assert.deepEqual(fake.calls, ["sendCode +393400000000", "signIn 00000", "signIn 12345"]);

  assert.deepEqual((await call("/telegram/sign_out", {})).json, { available: true, connected: false });
  assert.deepEqual(fake.calls.slice(-2), ["logOut", "disconnect"]);
});

test("sign-in with two-step verification", async (t) => {
  withCredentials(t);
  const fake = new FakeTelegram();
  fake.password = "secret";
  setTelegramFactory(async () => fake);
  const call = await start(t, "tg-2");

  await call("/telegram/send_code", { phone: "+393400000000" });
  assert.equal((await call("/telegram/sign_in", { code: "12345" })).json.step, "password");
  assert.deepEqual((await call("/telegram/password", { password: "nope" })), { status: 400, json: { error: "invalid_password" } });
  assert.equal((await call("/telegram/password", { password: "secret" })).json.connected, true);
  assert.deepEqual((await call("/telegram/password", { password: "secret" })), { status: 400, json: { error: "code_expired" } });
});

test("without app credentials Telegram is unavailable", async (t) => {
  withCredentials(t, false);
  const call = await start(t, "tg-3");
  assert.deepEqual((await call("/telegram")).json, { available: false, connected: false });
  assert.deepEqual((await call("/telegram/send_code", { phone: "+393400000000" })), { status: 400, json: { error: "not_configured" } });
});
