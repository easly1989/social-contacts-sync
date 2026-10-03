import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { deleteLocalData, packageKind, safeToDelete, writableValues } from "./localData";

test("packageKind tells the builds apart", () => {
  assert.equal(packageKind("win32", {}, true), "windows-installer");
  assert.equal(packageKind("win32", { PORTABLE_EXECUTABLE_DIR: "D:\\Apps" }, true), "windows-portable");
  assert.equal(packageKind("linux", { APPIMAGE: "/opt/app.AppImage" }, true), "appimage");
  assert.equal(packageKind("linux", {}, true), "deb");
  assert.equal(packageKind("darwin", {}, true), "macos");
  assert.equal(packageKind("linux", { APPIMAGE: "/x" }, false), "development");
});

test("writableValues keeps only known keys with single-line string values", () => {
  assert.deepEqual(
    writableValues({ GOOGLE_CLIENT_ID: "id", REMEMBER_SIGN_INS: "false", SESSION_SECRET: "x", GOOGLE_CLIENT_SECRET: "a\nB=1", PATH: "/" }),
    { GOOGLE_CLIENT_ID: "id", REMEMBER_SIGN_INS: "false" }
  );
  assert.deepEqual(writableValues(undefined), {});
  assert.deepEqual(writableValues({ GOOGLE_CLIENT_ID: 3 }), {});
});

test("safeToDelete refuses roots, the home folder and its parents", () => {
  const home = path.join(os.tmpdir(), "home", "me");
  assert.equal(safeToDelete(path.parse(process.cwd()).root, home), false);
  assert.equal(safeToDelete(home, home), false);
  assert.equal(safeToDelete(path.dirname(home), home), false);
  assert.equal(safeToDelete(path.join(home, ".config", "social-contacts-sync"), home), true);
  assert.equal(safeToDelete(path.join(os.tmpdir(), "scs-data"), home), true);
});

test("deleteLocalData removes config.env and the data folder only", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scs-delete-"));
  const configFile = path.join(root, "config.env");
  const dataDir = path.join(root, "social-contacts-sync-data");
  const neighbour = path.join(root, "photos.zip");
  fs.writeFileSync(configFile, "A=1\n");
  fs.writeFileSync(neighbour, "keep");
  fs.mkdirSync(path.join(dataDir, "history", "run"), { recursive: true });
  fs.writeFileSync(path.join(dataDir, "secret.key"), "k");

  assert.deepEqual(deleteLocalData({ configFile, dataDir }), []);
  assert.equal(fs.existsSync(configFile), false);
  assert.equal(fs.existsSync(dataDir), false);
  assert.equal(fs.readFileSync(neighbour, "utf8"), "keep");
  // Nothing left to delete is fine.
  assert.deepEqual(deleteLocalData({ configFile, dataDir }), []);
});
