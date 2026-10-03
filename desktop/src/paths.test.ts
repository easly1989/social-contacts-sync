import test from "node:test";
import assert from "node:assert/strict";
import path from "path";

import { resolvePaths } from "./paths";

const userData = path.resolve("/home/ada/.config/Social Contacts Sync");
const writable = () => true;

test("installed builds use the user data folder", () => {
  const p = resolvePaths({ env: {}, userData, isWritable: writable });
  assert.deepEqual(p, { configDir: userData, configFile: path.join(userData, "config.env"), dataDir: userData, portable: false });
});

test("the Windows portable build keeps everything next to the .exe", () => {
  const dir = path.resolve("/apps/scs");
  const p = resolvePaths({ env: { PORTABLE_EXECUTABLE_DIR: dir }, userData, isWritable: writable });
  assert.equal(p.portable, true);
  assert.equal(p.configFile, path.join(dir, "config.env"));
  assert.equal(p.dataDir, path.join(dir, "social-contacts-sync-data"));
});

test("an AppImage keeps everything next to the AppImage file", () => {
  const p = resolvePaths({ env: { APPIMAGE: path.resolve("/home/ada/Apps/Social-Contacts-Sync.AppImage") }, userData, isWritable: writable });
  assert.equal(p.portable, true);
  assert.equal(p.configDir, path.resolve("/home/ada/Apps"));
});

test("a read-only launcher folder falls back to the user data folder", () => {
  const p = resolvePaths({ env: { PORTABLE_EXECUTABLE_DIR: path.resolve("/cdrom") }, userData, isWritable: () => false });
  assert.equal(p.portable, false);
  assert.equal(p.configDir, userData);
});

test("SCS_DATA_DIR overrides everything", () => {
  const dir = path.resolve("/tmp/scs");
  const p = resolvePaths({ env: { SCS_DATA_DIR: dir, PORTABLE_EXECUTABLE_DIR: "/apps" }, userData, isWritable: writable });
  assert.equal(p.configFile, path.join(dir, "config.env"));
  assert.equal(p.dataDir, dir);
});
