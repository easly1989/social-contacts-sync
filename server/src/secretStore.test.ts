import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

import { decrypt, deleteSecret, encrypt, readSecret, secretStoreAvailable, writeSecret } from "./secretStore";

const key = crypto.randomBytes(32);

test("encrypts and decrypts a value", () => {
  const text = encrypt({ refresh_token: "1//abc" }, key);
  assert.ok(!text.includes("1//abc"));
  assert.deepEqual(decrypt(text, key), { refresh_token: "1//abc" });
});

test("a wrong key or a tampered file is rejected", () => {
  const text = encrypt({ a: 1 }, key);
  assert.throws(() => decrypt(text, crypto.randomBytes(32)));
  const parsed = JSON.parse(text);
  const data = Buffer.from(parsed.data, "base64");
  data[0] ^= 1;
  assert.throws(() => decrypt(JSON.stringify({ ...parsed, data: data.toString("base64") }), key));
});

test("files in the data folder: write, read, delete", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scs-secrets-"));
  const previous = { dir: process.env.SCS_DATA_DIR, key: process.env.SCS_DATA_KEY };
  process.env.SCS_DATA_DIR = dir;
  process.env.SCS_DATA_KEY = key.toString("base64");
  t.after(() => {
    process.env.SCS_DATA_DIR = previous.dir;
    process.env.SCS_DATA_KEY = previous.key;
  });

  assert.ok(secretStoreAvailable());
  assert.equal(readSecret("google-token"), undefined);
  writeSecret("google-token", { refresh_token: "r" });
  assert.deepEqual(readSecret("google-token"), { refresh_token: "r" });
  assert.ok(!fs.readFileSync(path.join(dir, "google-token.enc"), "utf8").includes('"r"'));

  // Another key (e.g. the folder copied to another computer) reads nothing.
  process.env.SCS_DATA_KEY = crypto.randomBytes(32).toString("base64");
  assert.equal(readSecret("google-token"), undefined);
  process.env.SCS_DATA_KEY = key.toString("base64");

  deleteSecret("google-token");
  assert.equal(readSecret("google-token"), undefined);
});

test("without a key nothing is stored", (t) => {
  const previous = process.env.SCS_DATA_KEY;
  delete process.env.SCS_DATA_KEY;
  t.after(() => (process.env.SCS_DATA_KEY = previous));
  assert.equal(secretStoreAvailable(), false);
});
