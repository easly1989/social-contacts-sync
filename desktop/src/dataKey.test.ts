import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { KeyProtector, loadDataKey } from "./dataKey";

// A reversible stand-in for the OS keychain.
const keychain = (secret = "k"): KeyProtector => ({
  isEncryptionAvailable: () => true,
  encryptString: (plain) => Buffer.from(`${secret}:${plain}`),
  decryptString: (encrypted) => {
    const [owner, plain] = encrypted.toString().split(":");
    if (owner !== secret) throw new Error("wrong keychain");
    return plain;
  },
});

const file = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "scs-key-")), "secret.key");

test("creates a 32-byte key protected by the keychain, then reuses it", () => {
  const f = file();
  const key = loadDataKey(f, keychain());
  assert.equal(Buffer.from(key, "base64").length, 32);
  const stored = JSON.parse(fs.readFileSync(f, "utf8"));
  assert.equal(stored.protected, true);
  assert.ok(!fs.readFileSync(f, "utf8").includes(key));
  assert.equal(loadDataKey(f, keychain()), key);
});

test("without a keychain the key is stored as is", () => {
  const f = file();
  const key = loadDataKey(f, { ...keychain(), isEncryptionAvailable: () => false });
  assert.equal(JSON.parse(fs.readFileSync(f, "utf8")).key, key);
  assert.equal(loadDataKey(f, keychain()), key);
});

test("a key from another keychain is replaced by a new one", () => {
  const f = file();
  const first = loadDataKey(f, keychain("this-pc"));
  const second = loadDataKey(f, keychain("other-pc"));
  assert.notEqual(second, first);
  assert.equal(loadDataKey(f, keychain("other-pc")), second);
});

test("a corrupt key file is replaced", () => {
  const f = file();
  fs.writeFileSync(f, "not json");
  assert.equal(Buffer.from(loadDataKey(f, keychain()), "base64").length, 32);
});
