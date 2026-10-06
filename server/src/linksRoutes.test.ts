import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { AddressInfo } from "net";

import { linksRouter } from "../routes/links";
import { setInCache } from "./cache";
import { removeContactLink } from "./contactLinks";
import { FakeContacts } from "./cleanup/fakeContacts";
import { getRun, getRunPhoto, saveRun } from "./runs";
import { LinkBlockedError, parseProfileLink } from "./sources/links";

// Profile links from the report (issue #51), against the fake address book,
// which applies Google's rules for updateContact.
async function start(t: { after(fn: () => void): void }, sessionId: string) {
  delete process.env.SCS_DESKTOP; // runs in memory
  const google = new FakeContacts([
    { resourceName: "people/elena", names: [{ displayName: "Elena Conti" }], phoneNumbers: [{ value: "+39 340 111 2222" }], urls: [{ value: "https://elena.example.com" }] },
    { resourceName: "people/davide", names: [{ displayName: "Davide Gallo" }], urls: [{ value: "https://www.instagram.com/davide/" }] },
  ]);
  const lookups: string[] = [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { sessionID: string }).sessionID = sessionId;
    next();
  });
  app.use(
    "/api",
    linksRouter(
      () => google,
      async (url) => {
        lookups.push(url);
        if (url.includes("blocked")) throw new LinkBlockedError("linkedin");
        if (url.includes("nopic")) return null;
        return { photo: "TElOSw==", link: parseProfileLink(url)! };
      }
    )
  );
  setInCache(sessionId, "gauth", {});
  saveRun(sessionId, {
    run: {
      id: "run-1",
      startedAt: "2026-10-06T10:00:00.000Z",
      mode: "fill",
      sources: ["whatsapp"],
      totalContacts: 2,
      counters: { added: 0, replaced: 0, kept: 0, alreadyHadPhoto: 0, noMatch: 2, errors: 0 },
      results: [
        { contactId: "people/elena", name: "Elena Conti", outcome: "noMatch" },
        { contactId: "people/davide", name: "Davide Gallo", outcome: "noMatch" },
      ],
    },
    photos: [{}, {}],
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const post = async (route: string, body: unknown) => {
    const response = await fetch(`${base}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, json: (await response.json()) as any };
  };
  return { google, post, lookups };
}

test("lookup: unsupported links, profiles without a photo and sites asking to sign in", async (t) => {
  const { post, lookups } = await start(t, "links-1");
  assert.deepEqual(await post("/links/lookup", { url: "https://example.com/about" }), { status: 400, json: { error: "unsupported_link" } });
  assert.deepEqual(await post("/links/lookup", { url: "https://x.com/nopic" }), { status: 404, json: { error: "no_photo", network: "X" } });
  assert.deepEqual(await post("/links/lookup", { url: "https://www.linkedin.com/in/blocked" }), { status: 409, json: { error: "signin_required", network: "LinkedIn" } });
  // The link is normalized before the lookup.
  assert.deepEqual(lookups, ["https://x.com/nopic", "https://linkedin.com/in/blocked"]);
});

test("report: save a link and its photo on a contact, then undo it", async (t) => {
  const { google, post } = await start(t, "links-2");
  const lookup = await post("/links/lookup", { url: "https://www.instagram.com/elena.conti.ph/?hl=it" });
  assert.equal(lookup.status, 200);
  assert.deepEqual({ ...lookup.json, token: "…" }, { token: "…", photo: "TElOSw==", network: "Instagram", url: "https://instagram.com/elena.conti.ph" });

  const saved = await post("/runs/run-1/results/0/link", { token: lookup.json.token });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.json.result, {
    contactId: "people/elena",
    name: "Elena Conti",
    outcome: "added",
    source: "links",
    matchedBy: "instagram.com/elena.conti.ph",
    hasPhoto: true,
    hasPrevious: false,
    addedLink: "https://instagram.com/elena.conti.ph",
  });
  assert.equal(saved.json.counters.noMatch, 1);
  assert.equal(saved.json.counters.added, 1);
  // In Google: the existing website kept, the profile link added, the photo set.
  assert.deepEqual(google.people.get("people/elena")!.urls, [{ value: "https://elena.example.com" }, { value: "https://instagram.com/elena.conti.ph", type: "profile" }]);
  assert.equal(google.photos.get("people/elena"), "TElOSw==");
  assert.equal(getRunPhoto("links-2", "run-1", 0, "photo"), "TElOSw==");
  assert.equal(getRun("links-2", "run-1")!.results[0].outcome, "added");

  // Only entries without a photo, once.
  assert.deepEqual(await post("/runs/run-1/results/0/link", { token: lookup.json.token }), { status: 409, json: { error: "already_changed" } });
  assert.deepEqual(await post("/runs/run-1/results/1/link", { token: "made-up" }), { status: 410, json: { error: "lookup_expired" } });

  // Undo's part for the link.
  await removeContactLink(google, "people/elena", "https://instagram.com/elena.conti.ph");
  assert.deepEqual(google.people.get("people/elena")!.urls, [{ value: "https://elena.example.com" }]);
});

test("report: a link already on the contact isn't added twice, nor removed by undo", async (t) => {
  const { google, post } = await start(t, "links-3");
  const lookup = await post("/links/lookup", { url: "instagram.com/davide" });
  const saved = await post("/runs/run-1/results/1/link", { token: lookup.json.token });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.result.addedLink, undefined);
  assert.deepEqual(google.people.get("people/davide")!.urls, [{ value: "https://www.instagram.com/davide/" }]);
});
