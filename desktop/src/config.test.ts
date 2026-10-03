import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { loadConfig, parseConfig, saveConfig, updateConfigText } from "./config";

test("parses KEY=value lines, quotes, export and comments", () => {
  const config = parseConfig(`# comment\nA=1\nexport B = two \nC="with space"\nD='x#y'\nnot a line\n`);
  assert.deepEqual(config, { A: "1", B: "two", C: "with space", D: "x#y" });
});

test("updates values in place and keeps comments and unknown keys", () => {
  const text = "# Google\nGOOGLE_CLIENT_ID=\nOTHER=keep\n";
  const updated = updateConfigText(text, { GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com", NEW: "a b" });
  assert.equal(updated, '# Google\nGOOGLE_CLIENT_ID=123.apps.googleusercontent.com\nOTHER=keep\nNEW="a b"\n');
  assert.deepEqual(parseConfig(updated), { GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com", OTHER: "keep", NEW: "a b" });
});

test("first start creates config.env with a session secret, later starts keep it", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scs-config-"));
  const file = path.join(dir, "nested", "config.env");
  const first = loadConfig(file);
  assert.match(first.SESSION_SECRET, /^[0-9a-f]{64}$/);
  assert.equal(first.GOOGLE_CLIENT_ID, "");
  assert.equal(loadConfig(file).SESSION_SECRET, first.SESSION_SECRET);

  saveConfig(file, { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" });
  const saved = loadConfig(file);
  assert.equal(saved.GOOGLE_CLIENT_ID, "id");
  assert.equal(saved.SESSION_SECRET, first.SESSION_SECRET);
  assert.match(fs.readFileSync(file, "utf8"), /^# Social Contacts Sync settings/);
});

test("a hand-written config without a secret gets one", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scs-config-"));
  const file = path.join(dir, "config.env");
  fs.writeFileSync(file, "GOOGLE_CLIENT_ID=abc\n");
  const config = loadConfig(file);
  assert.equal(config.GOOGLE_CLIENT_ID, "abc");
  assert.match(config.SESSION_SECRET, /^[0-9a-f]{64}$/);
  assert.equal(parseConfig(fs.readFileSync(file, "utf8")).SESSION_SECRET, config.SESSION_SECRET);
});
