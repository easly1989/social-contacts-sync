import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { afterUpdate, takePendingUpdate, updateLanguage, updateText, writePendingUpdate } from "./updateFlow";

test("the dialogs follow the app's language", () => {
  assert.equal(updateLanguage("it"), "it");
  assert.equal(updateLanguage("it-IT"), "it");
  assert.equal(updateLanguage("en"), "en");
  assert.equal(updateLanguage("de"), "en");
  assert.equal(updateLanguage(undefined), "en");
  assert.equal(updateText("en", "readyTitle", { version: "1.3.1" }), "Version 1.3.1 is ready to install");
  assert.equal(updateText("it", "installedTitle", { product: "Social Contacts Sync", version: "1.3.1" }), "Social Contacts Sync 1.3.1 è installato");
});

test("the choice made when closing reaches the new version once", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "scs-update-")), "update-pending.json");
  assert.equal(takePendingUpdate(file), undefined);
  writePendingUpdate(file, { version: "1.3.1", reopen: false, lang: "it" });
  assert.deepEqual(takePendingUpdate(file), { version: "1.3.1", reopen: false, lang: "it" });
  assert.equal(takePendingUpdate(file), undefined);
  fs.writeFileSync(file, "not json");
  assert.equal(takePendingUpdate(file), undefined);
  assert.ok(!fs.existsSync(file));
});

test("after an update: straight in, or ask first", () => {
  assert.equal(afterUpdate(undefined, "1.3.1"), "open");
  assert.equal(afterUpdate({ version: "1.3.1", reopen: true, lang: "en" }, "1.3.1"), "open");
  assert.equal(afterUpdate({ version: "1.3.1", reopen: false, lang: "en" }, "1.3.1"), "ask");
  // The update didn't install: the old version opens as usual.
  assert.equal(afterUpdate({ version: "1.3.1", reopen: false, lang: "en" }, "1.3.0"), "open");
});
