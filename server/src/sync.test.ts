import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "whatsapp-web.js";

import { linkNetworks, readsCap, requestedSources, runOptions, withoutSharedNumbers } from "./sync";

test("run options: each as asked, else its default (issue #82)", () => {
  assert.deepEqual(runOptions({}), { fillMissing: true, updatePinned: true, lookDifferent: true, decideAll: false });
  assert.deepEqual(runOptions({ fill_missing: "false", look_different: "false", decide_all: "true" }), { fillMissing: false, updatePinned: true, lookDifferent: false, decideAll: true });
});

test("profile link networks: those turned on in Sources, else the public ones (issue #83)", () => {
  assert.deepEqual([...linkNetworks({})].sort(), ["bluesky", "github", "mastodon", "x", "youtube"]);
  assert.deepEqual([...linkNetworks({ link_networks: "instagram, github,bogus" })].sort(), ["github", "instagram"]);
  assert.deepEqual([...linkNetworks({ link_networks: "" })], []);
});

test("profiles read per network: the Run tab's cap, within 1–1000, else 100", () => {
  assert.equal(readsCap({ reads_cap: "40" }), 40);
  assert.equal(readsCap({ reads_cap: "5000" }), 1000);
  assert.equal(readsCap({ reads_cap: "-3" }), 100);
  assert.equal(readsCap({}), 100);
});

const client = {} as Client;

test("without a sources option only WhatsApp is used, as before", () => {
  assert.deepEqual(requestedSources({}, client).map((s) => s.id), ["whatsapp"]);
});

test("sources follow the requested order, ignoring unknown and repeated ones", () => {
  assert.deepEqual(requestedSources({ sources: "gravatar, whatsapp,bogus,gravatar" }, client).map((s) => s.id), ["gravatar", "whatsapp"]);
});

test("profile networks in the order are sources of their own, in place (issue #107)", () => {
  const options = { sources: "instagram,whatsapp,gravatar,linkedin,bogus" };
  assert.deepEqual(
    requestedSources(options, client).map((s) => [s.id, s.network]),
    [
      ["links", "instagram"],
      ["whatsapp", undefined],
      ["gravatar", undefined],
      ["links", "linkedin"],
    ]
  );
  assert.deepEqual([...linkNetworks(options)], ["instagram", "linkedin"]);
  // "links", as older pages send it: every network turned on, in one source.
  assert.deepEqual(requestedSources({ sources: "links", link_networks: "github,x" }, client).map((s) => [s.id, s.network]), [["links", undefined]]);
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

test("Telegram is used only when signed in", () => {
  assert.deepEqual(requestedSources({ sources: "telegram,gravatar" }, client).map((s) => s.id), ["gravatar"]);
  const telegram = {} as Parameters<typeof requestedSources>[2];
  assert.deepEqual(requestedSources({ sources: "telegram,gravatar" }, client, telegram).map((s) => s.id), ["telegram", "gravatar"]);
});
