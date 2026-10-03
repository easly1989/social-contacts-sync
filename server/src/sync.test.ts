import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "whatsapp-web.js";

import { requestedSources, syncMode } from "./sync";

test("the existing option flags map to modes", () => {
  assert.equal(syncMode({}), "fill");
  assert.equal(syncMode({ overwrite_photos: "false", manual_sync: "false" }), "fill");
  assert.equal(syncMode({ overwrite_photos: "true" }), "replace");
  assert.equal(syncMode({ manual_sync: "true" }), "review");
  assert.equal(syncMode({ manual_sync: "true", overwrite_photos: "true" }), "review");
});

const client = {} as Client;

test("without a sources option only WhatsApp is used, as before", () => {
  assert.deepEqual(requestedSources({}, client).map((s) => s.id), ["whatsapp"]);
});

test("sources follow the requested order, ignoring unknown and repeated ones", () => {
  assert.deepEqual(requestedSources({ sources: "gravatar, whatsapp,bogus,gravatar" }, client).map((s) => s.id), ["gravatar", "whatsapp"]);
});

test("WhatsApp is skipped when it isn't connected", () => {
  assert.deepEqual(requestedSources({ sources: "whatsapp,gravatar" }, undefined).map((s) => s.id), ["gravatar"]);
});
