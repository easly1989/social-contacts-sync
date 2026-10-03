import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { telegramEnv } from "./telegramApp";

test("Telegram credentials: config.env first, then the ones built into the release", () => {
  const appPath = fs.mkdtempSync(path.join(os.tmpdir(), "scs-app-"));
  assert.deepEqual(telegramEnv(appPath, {}), {});

  fs.writeFileSync(path.join(appPath, "telegram.json"), JSON.stringify({ apiId: "111", apiHash: "built-in" }));
  assert.deepEqual(telegramEnv(appPath, {}), { TELEGRAM_API_ID: "111", TELEGRAM_API_HASH: "built-in" });
  // Only half of the user's pair: the built-in one still applies.
  assert.deepEqual(telegramEnv(appPath, { TELEGRAM_API_ID: "222" }), { TELEGRAM_API_ID: "111", TELEGRAM_API_HASH: "built-in" });
  assert.deepEqual(telegramEnv(appPath, { TELEGRAM_API_ID: "222", TELEGRAM_API_HASH: "own" }), { TELEGRAM_API_ID: "222", TELEGRAM_API_HASH: "own" });

  fs.writeFileSync(path.join(appPath, "telegram.json"), "not json");
  assert.deepEqual(telegramEnv(appPath, {}), {});
});
