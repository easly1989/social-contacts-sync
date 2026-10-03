import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "whatsapp-web.js";

import { requestedSources, syncMode, withoutSharedNumbers } from "./sync";

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

test("numbers marked as shared are not used for matching", () => {
  const contacts = [
    { id: "people/m", name: "Mamma", numbers: ["340 221 6527", "+39 06 1234 5678"], hasPhoto: false },
    { id: "people/e", name: "Maria", numbers: ["+393402216527"], hasPhoto: false },
  ];
  assert.deepEqual(
    withoutSharedNumbers(contacts, ["+393402216527"], "IT").map((c) => c.numbers),
    [["+39 06 1234 5678"], []]
  );
  assert.equal(withoutSharedNumbers(contacts, [], "IT"), contacts);
});
