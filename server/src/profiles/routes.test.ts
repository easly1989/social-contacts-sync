import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { AddressInfo } from "net";

import { ProfileScanState, SocialPerson } from "../../../interfaces/api";
import { profilesRouter, ScanNetwork } from "../../routes/profiles";
import { runsRouter } from "../../routes/runs";
import { deleteFromCache, setInCache } from "../cache";
import { setKeptPhoto } from "../contacts/keptPhotos";
import { getPins, photoHash, setPin } from "../contacts/photoPins";
import { ReadProfile, saveReads } from "./rereads";
import { loadProfiles, mergePeople, saveProfiles } from "./store";
import { loadQueue, queuePhotos, ReadLook, saveQueue } from "./queue";
import { photoFacts } from "../photoRules";
import { photoKey } from "../contacts/model";
import { cachePhoto } from "./photoCache";
import { saveLookup } from "../linkLookups";
import { parseProfileLink } from "../sources/links";
import { WhatsAppLookup } from "../sources/whatsapp";
import { FakeContacts } from "../cleanup/fakeContacts";
import { Person } from "../cleanup/people";
import { testJpeg } from "../fakeImages";

// Find profiles (issue #61) against the fake address book, a fake web and a fake desktop app.
const people: Person[] = [
  { resourceName: "people/dg", names: [{ displayName: "Davide Gallo", givenName: "Davide", familyName: "Gallo" }], phoneNumbers: [{ value: "+39 338 555 0412" }] },
  { resourceName: "people/ec", names: [{ displayName: "Elena Conti", givenName: "Elena", familyName: "Conti" }] },
  { resourceName: "people/m", names: [{ displayName: "Mamma", givenName: "Mamma" }] },
];
// A real 400 px picture, so To review's rules (issue #104) can read its size.
const jpeg = testJpeg(400, 400, 1);

async function start(t: { after(fn: () => void): void }, sessionId: string, loginReader?: ReadProfile, readLook: ReadLook = async () => undefined) {
  delete process.env.SCS_DESKTOP; // in memory
  const google = new FakeContacts(people, { "people/ec": "T0xE" });
  const scanned: SocialPerson[] = [{ id: "instagram:elena_conti", network: "instagram", url: "https://instagram.com/elena_conti", handle: "elena_conti", name: "Elena Conti", photoUrl: "https://scontent.cdninstagram.com/e.jpg", source: "scan", relation: "follower" }];
  const desktopCalls: string[] = [];
  // What a search with the login finds (issue #104), by network.
  const searchResults: Partial<Record<ScanNetwork, { people: SocialPerson[]; stopped?: string }>> = {};
  // `down`: the sites' image addresses have expired.
  const web = { down: false };
  // The connected WhatsApp, if any (issue #85).
  const whatsapp: { lookup?: WhatsAppLookup } = {};
  const desktop = {
    status: async (): Promise<ProfileScanState[]> => [{ network: "instagram", loggedIn: true, account: "easly1989" }],
    login: async (network: ScanNetwork) => (desktopCalls.push(`login ${network}`), { network, loggedIn: true }),
    logout: async (network: ScanNetwork) => void desktopCalls.push(`logout ${network}`),
    scan: async (network: ScanNetwork) => (desktopCalls.push(`scan ${network}`), { people: scanned }),
    stop: async (network: ScanNetwork) => void desktopCalls.push(`stop ${network}`),
    search: async (network: ScanNetwork, query: string) => (desktopCalls.push(`search ${network} ${query}`), searchResults[network] ?? { people: [] }),
  };
  const fetchImpl = (async (url: string) => {
    if (web.down) return new Response("{}", { status: 404 });
    if (url.includes("cdninstagram")) return new Response(new Uint8Array(jpeg), { headers: { "content-type": "image/jpeg" } });
    if (url.includes("bsky")) return new Response(JSON.stringify({ actors: [{ handle: "dgallo.bsky.social", displayName: "Davide Gallo" }] }), { headers: { "content-type": "application/json" } });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { sessionID: string }).sessionID = sessionId;
    next();
  });
  app.use("/api", profilesRouter({ contactsApi: () => google, desktop, fetchImpl, sleep: async () => {}, loginReader: () => loginReader, whatsapp: async () => whatsapp.lookup, readLook }));
  app.use("/api", runsRouter({ contactsApi: () => google }));
  setInCache(sessionId, "gauth", {});
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const call = async (method: string, route: string, body?: unknown, type = "application/json") => {
    const response = await fetch(`${base}${route}`, { method, headers: body === undefined ? {} : { "Content-Type": type }, body: typeof body === "string" ? body : body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, json: (await response.json()) as any };
  };
  // Undo in History (issue #84) runs in the background: wait until the entries are undone.
  const undo = async (runId: string, indexes?: number[]) => {
    assert.equal((await call("POST", `/runs/${runId}/undo`, indexes ? { indexes } : {})).status, 202);
    for (let i = 0; i < 100; i++) {
      const run = (await call("GET", `/runs/${runId}`)).json;
      if ((indexes ?? run.results.map((_: unknown, n: number) => n)).every((n: number) => run.results[n].undone)) return run;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.fail("undo didn't finish");
  };
  return { google, call, desktopCalls, base, web, undo, whatsapp, searchResults };
}

test("import, search and scan feed one review queue; link with photo, then undo", async (t) => {
  const { google, call, desktopCalls, undo } = await start(t, "profiles-1");
  const csv = "First Name,Last Name,URL,Email Address,Company,Position,Connected On\nDavide,Gallo,https://www.linkedin.com/in/davidegallo,,Gallo Ceramiche,Owner,01 Oct 2026";
  assert.deepEqual(await call("POST", "/profiles/import?network=linkedin", csv, "text/plain"), { status: 200, json: { read: 1, added: 1 } });
  assert.deepEqual(await call("POST", "/profiles/import?network=facebook", csv, "text/plain"), { status: 400, json: { error: "unsupported_network" } });
  assert.deepEqual(await call("POST", "/profiles/import?network=linkedin", "nope", "text/plain"), { status: 400, json: { error: "unreadable_file" } });

  // Public search, in the background.
  assert.equal((await call("POST", "/profiles/search", { networks: ["bluesky"] })).status, 200);
  await new Promise((resolve) => setTimeout(resolve, 50));
  let overview = (await call("GET", "/profiles")).json;
  assert.equal(overview.search.running, false);
  assert.deepEqual(overview.search.found, { bluesky: 1 });

  // The login scan: only once the risk is accepted.
  assert.deepEqual(await call("POST", "/profiles/scan/start", { network: "instagram" }), { status: 400, json: { error: "risk_not_accepted" } });
  assert.equal((await call("POST", "/profiles/scan/start", { network: "instagram", acceptRisk: true })).status, 200);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(desktopCalls, ["scan instagram"]);

  overview = (await call("GET", "/profiles")).json;
  assert.deepEqual(overview.scans[0].account, "easly1989");
  assert.equal(overview.scans[0].read, 1);
  // Elena has a real photo, so Davide (none) comes first; Mamma has one word and no suggestions, and no photo (issue #104).
  assert.deepEqual(
    overview.suggestions.map((s: any) => [s.name, s.candidates.map((c: any) => `${c.person.id}:${c.reason}`)]),
    [
      ["Davide Gallo", ["bluesky:dgallo.bsky.social:sameName", "linkedin:davidegallo:sameName"]],
      ["Mamma", []],
      ["Elena Conti", ["instagram:elena_conti:sameName"]],
    ]
  );
  assert.equal(overview.sources.find((s: any) => s.network === "linkedin").people, 1);

  // Link Elena's Instagram with its photo; her old photo is kept for undo.
  const linked = await call("POST", "/profiles/link", { contactId: "people/ec", personId: "instagram:elena_conti", usePhoto: true });
  assert.equal(linked.status, 200);
  assert.equal(linked.json.linked[0].photoSet, true);
  assert.equal(linked.json.photoSet, true);
  assert.deepEqual(google.people.get("people/ec")!.urls, [{ value: "https://instagram.com/elena_conti", type: "profile" }]);
  assert.equal(google.photos.get("people/ec"), jpeg.toString("base64"));
  overview = (await call("GET", "/profiles")).json;
  assert.deepEqual(overview.suggestions.map((s: any) => s.name), ["Davide Gallo", "Mamma"]);
  assert.equal(overview.linked[0].person.id, "instagram:elena_conti");
  // The photo now follows that profile (issue #78).
  const pin = getPins("profiles-1")["people/ec"];
  assert.deepEqual([pin.source, pin.network, pin.matchedBy, pin.hash], ["links", "Instagram", "instagram.com/elena_conti", photoHash(jpeg.toString("base64"))]);
  assert.ok(pin.photoKey);

  // Undone from History, where the decision is a Review entry (issue #84).
  const [review] = (await call("GET", "/runs")).json;
  assert.deepEqual([review.mode, review.counters.replaced], ["session", 1]);
  await undo(review.id, [0]);
  assert.deepEqual(google.people.get("people/ec")!.urls, []);
  assert.equal(google.photos.get("people/ec"), "T0xE");
  assert.equal(getPins("profiles-1")["people/ec"], undefined);

  // "None of these", and "Skip" until the next sync (issue #104).
  await call("POST", "/profiles/reject", { contactId: "people/dg", personIds: ["bluesky:dgallo.bsky.social"] });
  await call("POST", "/profiles/skip", { contactId: "people/dg" });
  overview = (await call("GET", "/profiles")).json;
  assert.deepEqual(
    overview.suggestions.map((s: any) => [s.name, s.candidates.length]),
    [["Mamma", 0], ["Elena Conti", 1]]
  );
  // "No photo": Mamma leaves To review until her phones, emails or links change.
  assert.deepEqual(await call("POST", "/profiles/no-photo", { contactId: "people/m" }), { status: 200, json: { ok: true } });
  assert.deepEqual((await call("GET", "/profiles")).json.suggestions.map((s: any) => s.name), ["Elena Conti"]);
  google.people.get("people/m")!.phoneNumbers = [{ value: "+39 333 999 0000" }];
  deleteFromCache("profiles-1", "profiles_contacts"); // the address book is read again
  assert.deepEqual((await call("GET", "/profiles")).json.suggestions.map((s: any) => s.name), ["Mamma", "Elena Conti"]);
});

test("several profiles per contact, in bulk, and photos through the server (issue #65)", async (t) => {
  const { google, call, base } = await start(t, "profiles-65");
  const csv = "First Name,Last Name,URL\nDavide,Gallo,https://www.linkedin.com/in/davidegallo\nElena,Conti,https://www.linkedin.com/in/elenaconti";
  await call("POST", "/profiles/import?network=linkedin", csv, "text/plain");
  await call("POST", "/profiles/scan/start", { network: "instagram", acceptRisk: true });
  await call("POST", "/profiles/search", { networks: ["bluesky"] });
  await new Promise((resolve) => setTimeout(resolve, 50));
  let overview = (await call("GET", "/profiles")).json;
  assert.ok(overview.sources.find((s: any) => s.network === "bluesky").searched);

  // Davide: LinkedIn and Bluesky in one change, no photo; nothing else left for him.
  const one = await call("POST", "/profiles/link", { contactId: "people/dg", personIds: ["linkedin:davidegallo", "bluesky:dgallo.bsky.social"] });
  assert.equal(one.status, 200);
  assert.deepEqual(one.json.linked.map((l: any) => [l.person.id, l.photoSet]), [["linkedin:davidegallo", false], ["bluesky:dgallo.bsky.social", false]]);
  assert.deepEqual(google.people.get("people/dg")!.urls!.map((u) => u.value), ["https://linkedin.com/in/davidegallo", "https://bsky.app/profile/dgallo.bsky.social"]);

  // Elena in bulk: Instagram with its photo, LinkedIn not her.
  const bulk = await call("POST", "/profiles/link_many", { items: [{ contactId: "people/ec", name: "Elena Conti", personIds: ["instagram:elena_conti"], photoFrom: "instagram:elena_conti", rejectIds: ["linkedin:elenaconti"] }, { contactId: "people/nobody", personIds: ["instagram:elena_conti"] }] });
  assert.equal(bulk.status, 200);
  assert.equal(bulk.json.total, 2);
  for (let i = 0; i < 50 && (await call("GET", "/profiles")).json.bulk.running; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  overview = (await call("GET", "/profiles")).json;
  assert.equal(overview.bulk.contacts, 1);
  assert.equal(overview.bulk.profiles, 1);
  assert.equal(overview.bulk.failed.length, 1);
  assert.equal(google.photos.get("people/ec"), jpeg.toString("base64"));
  // Only the contacts still without a photo (issue #104).
  assert.deepEqual(overview.suggestions.map((s: any) => [s.contactId, s.candidates.length, Boolean(s.queue)]), [["people/dg", 0, false], ["people/m", 0, false]]);

  // The Instagram photo, through the server; a profile without one is a 404.
  const photo = await fetch(`${base}/profiles/photo?id=${encodeURIComponent("instagram:elena_conti")}`);
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get("content-type"), "image/jpeg");
  assert.equal(Buffer.from(await photo.arrayBuffer()).length, jpeg.length);
  assert.equal((await call("GET", "/profiles/photo?id=linkedin:davidegallo")).status, 404);
  assert.equal((await call("GET", "/profiles/photo?id=nobody")).status, 404);
});

test("a kept photo is never replaced from Find profiles; the links are added (issue #67)", async (t) => {
  const { google, call } = await start(t, "profiles-67");
  await call("POST", "/profiles/scan/start", { network: "instagram", acceptRisk: true });
  setKeptPhoto("profiles-67", "people/ec", true);
  const overview = (await call("GET", "/profiles")).json;
  assert.equal(overview.suggestions.find((s: any) => s.contactId === "people/ec").photoKept, true);
  const linked = await call("POST", "/profiles/link", { contactId: "people/ec", personIds: ["instagram:elena_conti"], photoFrom: "instagram:elena_conti" });
  assert.equal(linked.json.photoSet, false);
  assert.equal(google.photos.get("people/ec"), "T0xE");
  assert.deepEqual(google.people.get("people/ec")!.urls, [{ value: "https://instagram.com/elena_conti", type: "profile" }]);
});

test("links with a photo from before pins become pins once (issue #78)", async (t) => {
  const { call } = await start(t, "profiles-78");
  await call("POST", "/profiles/scan/start", { network: "instagram", acceptRisk: true });
  await call("POST", "/profiles/link", { contactId: "people/ec", personIds: ["instagram:elena_conti"], photoFrom: "instagram:elena_conti" });
  // As if the link was made by an older version: no pins saved yet.
  deleteFromCache("profiles-78", "photo_pins");
  const pins = getPins("profiles-78");
  assert.deepEqual(Object.keys(pins), ["people/ec"]);
  assert.deepEqual([pins["people/ec"].matchedBy, pins["people/ec"].network, pins["people/ec"].hash], ["instagram.com/elena_conti", "Instagram", undefined]);
  // Unpinned, it stays unpinned.
  setPin("profiles-78", "people/ec", undefined);
  assert.deepEqual(getPins("profiles-78"), {});
});

test("desktop: linking reads an Instagram photo with the login; a preview never does (issue #80)", async (t) => {
  const asked: string[] = [];
  const { call, google } = await start(t, "profiles-80b", async (network, handle) => (asked.push(`${network}:${handle}`), { profile: { photoUrl: "https://scontent.cdninstagram.com/fresh.jpg" } }));
  // Read from an export: no photo with it.
  const data = loadProfiles("profiles-80b");
  mergePeople(data, [{ id: "instagram:anna.m", network: "instagram", url: "https://instagram.com/anna.m", handle: "anna.m", source: "export" }]);
  saveProfiles("profiles-80b", data);

  assert.equal((await call("GET", "/profiles/photo?id=instagram:anna.m")).status, 404);
  assert.deepEqual(asked, []);
  const linked = await call("POST", "/profiles/link", { contactId: "people/m", personIds: ["instagram:anna.m"], photoFrom: "instagram:anna.m" });
  assert.equal(linked.json.photoSet, true);
  assert.deepEqual(asked, ["instagram:anna.m"]);
  assert.equal(google.photos.get("people/m"), jpeg.toString("base64"));
});

test("To review: a linked profile's photo is a candidate, applied and pinned without linking again (issue #81)", async (t) => {
  const { google, call, undo, base } = await start(t, "profiles-81");
  // Before any profile is read, the contacts without a photo are cards already (issue #104).
  assert.deepEqual(await call("GET", "/profiles/count"), { status: 200, json: { count: 2 } });
  await call("POST", "/profiles/scan/start", { network: "instagram", acceptRisk: true });
  await call("POST", "/profiles/link", { contactId: "people/ec", personIds: ["instagram:elena_conti"] });
  await call("POST", "/profiles/import?network=linkedin", "First Name,Last Name,URL\nElena,Conti,https://www.linkedin.com/in/elenaconti", "text/plain");

  // Elena has a photo: a linked profile's is offered once its size is known (issue #104), e.g. after it was shown.
  assert.equal((await fetch(`${base}/profiles/photo?id=instagram:elena_conti`)).status, 200);
  const elena = (await call("GET", "/profiles")).json.suggestions.find((s: any) => s.contactId === "people/ec");
  assert.deepEqual(elena.candidates.map((c: any) => c.person.id), ["linkedin:elenaconti"]);
  assert.deepEqual(elena.linked.map((p: any) => p.id), ["instagram:elena_conti"]);
  assert.deepEqual(await call("GET", "/profiles/count"), { status: 200, json: { count: 3 } });

  // Only the photo: LinkedIn isn't her, Instagram is linked already.
  const confirmed = await call("POST", "/profiles/link", { contactId: "people/ec", personIds: [], photoFrom: "instagram:elena_conti", rejectIds: ["linkedin:elenaconti"] });
  assert.equal(confirmed.json.photoSet, true);
  assert.deepEqual(confirmed.json.linked.map((l: any) => [l.person.id, l.photoSet]), [["instagram:elena_conti", true]]);
  assert.equal(google.photos.get("people/ec"), jpeg.toString("base64"));
  assert.equal(google.people.get("people/ec")!.urls!.length, 1);
  assert.equal(getPins("profiles-81")["people/ec"].matchedBy, "instagram.com/elena_conti");
  assert.deepEqual(await call("GET", "/profiles/count"), { status: 200, json: { count: 2 } });

  // Undo puts the photo back and leaves the link that was there.
  const [review] = (await call("GET", "/runs")).json;
  assert.deepEqual((await call("GET", `/runs/${review.id}`)).json.results.map((r: any) => r.outcome), ["linked", "replaced"]);
  await undo(review.id, [1]);
  assert.equal(google.photos.get("people/ec"), "T0xE");
  assert.equal(google.people.get("people/ec")!.urls!.length, 1);
  assert.equal(getPins("profiles-81")["people/ec"], undefined);

  // A photo from a profile that is neither ticked nor on the contact isn't applied.
  assert.equal((await call("POST", "/profiles/link", { contactId: "people/dg", personIds: [], photoFrom: "instagram:elena_conti" })).status, 404);
  assert.equal((await call("POST", "/profiles/link", { contactId: "people/dg", personIds: [] })).status, 404);
});

test("the photo a card showed is applied when the site's address for it has expired (issue #81)", async (t) => {
  const { google, call, base, web } = await start(t, "profiles-81b");
  const data = loadProfiles("profiles-81b");
  mergePeople(data, [{ id: "instagram:anna.m", network: "instagram", url: "https://instagram.com/anna.m", handle: "anna.m", photoUrl: "https://scontent.cdninstagram.com/anna.jpg", source: "scan" }]);
  saveProfiles("profiles-81b", data);
  // The card shows it while the address works...
  assert.equal((await fetch(`${base}/profiles/photo?id=instagram:anna.m`)).status, 200);
  // ...then the address expires.
  web.down = true;
  const linked = await call("POST", "/profiles/link", { contactId: "people/m", personIds: ["instagram:anna.m"], photoFrom: "instagram:anna.m" });
  assert.equal(linked.json.photoSet, true);
  assert.equal(google.photos.get("people/m"), jpeg.toString("base64"));
});

test("To review: photos a sync sent there are cards; Use applies and pins, Keep current turns them down (issue #82)", async (t) => {
  const { google, call, base } = await start(t, "profiles-82");
  const wa = Buffer.alloc(1500, 4).toString("base64");
  const gr = Buffer.alloc(1500, 5).toString("base64");
  queuePhotos("profiles-82", { id: "people/ec", name: "Elena Conti" }, "photo", [
    { photo: wa, source: "whatsapp", matchedBy: "+39 333 1" },
    { photo: gr, source: "gravatar", matchedBy: "elena@example.com" },
  ]);
  queuePhotos("profiles-82", { id: "people/m", name: "Mamma" }, "photo", [{ photo: wa, source: "whatsapp", matchedBy: "+39 333 2" }]);
  // Davide, without a photo, is a card too.
  assert.deepEqual(await call("GET", "/profiles/count"), { status: 200, json: { count: 3 } });

  const cards = (await call("GET", "/profiles")).json.suggestions;
  const elena = cards.find((s: any) => s.contactId === "people/ec");
  assert.deepEqual(elena.candidates, []);
  assert.equal(elena.queue.kind, "photo");
  assert.deepEqual(elena.queue.photos.map((p: any) => [p.source, p.matchedBy, p.id.startsWith("photo:")]), [["whatsapp", "+39 333 1", true], ["gravatar", "elena@example.com", true]]);
  assert.equal(elena.queue.photos[0].hash, undefined);
  const image = await fetch(`${base}/profiles/queue-photo?id=${encodeURIComponent(elena.queue.photos[1].id)}`);
  assert.equal(Buffer.from(await image.arrayBuffer()).toString("base64"), gr);
  assert.equal((await call("GET", "/profiles/queue-photo?id=photo:nope")).status, 404);

  // Use Gravatar's: applied, pinned to it, the photo it replaced kept for undo.
  const used = await call("POST", "/profiles/link", { contactId: "people/ec", personIds: [], photoFrom: elena.queue.photos[1].id });
  assert.equal(used.json.photoSet, true);
  assert.equal(google.photos.get("people/ec"), gr);
  assert.deepEqual([getPins("profiles-82")["people/ec"].source, getPins("profiles-82")["people/ec"].hash], ["gravatar", photoHash(gr)]);
  const queue = loadQueue("profiles-82");
  assert.equal(queue.entries["people/ec"], undefined);
  assert.equal(queue.dismissed["people/ec"], undefined);
  const [review] = (await call("GET", "/runs")).json;
  const decided = (await call("GET", `/runs/${review.id}`)).json.results[0];
  assert.deepEqual([decided.contactId, decided.outcome, decided.source, decided.hasPrevious, decided.previousPin], ["people/ec", "replaced", "gravatar", true, null]);

  // Keep current: nothing changes, and WhatsApp's photo isn't offered again.
  assert.deepEqual(await call("POST", "/profiles/keep", { contactId: "people/m" }), { status: 200, json: { ok: true } });
  assert.deepEqual(loadQueue("profiles-82").dismissed["people/m"], [photoHash(wa)]);
  assert.equal(google.photos.has("people/m"), false);
  // Mamma is still without a photo: her card stays, without the sync's photo.
  assert.deepEqual(await call("GET", "/profiles/count"), { status: 200, json: { count: 2 } });
  assert.equal((await call("POST", "/profiles/keep", { contactId: "people/m" })).status, 404);
});

test("To review: a photo changed outside the app; Keep this unpins, Back to the source re-applies (issue #82)", async (t) => {
  const { google, call } = await start(t, "profiles-82b");
  const ig = Buffer.alloc(1500, 6).toString("base64");
  const pin = { source: "links" as const, matchedBy: "instagram.com/elena_conti", network: "Instagram", hash: "old", readAt: "2026-10-01T00:00:00.000Z", suspended: true };
  const changed = () => queuePhotos("profiles-82b", { id: "people/ec" }, "changed", [{ photo: ig, source: "links", matchedBy: "instagram.com/elena_conti", network: "Instagram" }], { source: "links", network: "Instagram", matchedBy: "instagram.com/elena_conti" });
  setPin("profiles-82b", "people/ec", pin);
  changed();
  const elena = async () => (await call("GET", "/profiles")).json.suggestions.find((s: any) => s.contactId === "people/ec");
  const card = await elena();
  assert.deepEqual([card.queue.kind, card.queue.pinned.network], ["changed", "Instagram"]);

  await call("POST", "/profiles/keep", { contactId: "people/ec" });
  assert.equal(getPins("profiles-82b")["people/ec"], undefined);
  assert.equal(google.photos.get("people/ec"), "T0xE");

  setPin("profiles-82b", "people/ec", pin);
  changed();
  const back = (await elena()).queue.photos[0].id;
  await call("POST", "/profiles/link", { contactId: "people/ec", personIds: [], photoFrom: back });
  assert.equal(google.photos.get("people/ec"), ig);
  assert.deepEqual([getPins("profiles-82b")["people/ec"].suspended, getPins("profiles-82b")["people/ec"].hash], [undefined, photoHash(ig)]);
});

test("To review: a photo looked up from a link typed on the card is applied and its link saved (issue #82)", async (t) => {
  const { google, call } = await start(t, "profiles-82c");
  queuePhotos("profiles-82c", { id: "people/m" }, "photo", [{ photo: Buffer.alloc(1500, 4).toString("base64"), source: "whatsapp", matchedBy: "+39 333 2" }]);
  const lookup = saveLookup("profiles-82c", { photo: jpeg.toString("base64"), link: parseProfileLink("https://instagram.com/mamma.r")! });
  const done = await call("POST", "/profiles/link", { contactId: "people/m", personIds: [], link: lookup.token });
  assert.equal(done.json.photoSet, true);
  assert.equal(google.photos.get("people/m"), jpeg.toString("base64"));
  assert.deepEqual(google.people.get("people/m")!.urls, [{ value: "https://instagram.com/mamma.r", type: "profile" }]);
  assert.equal(getPins("profiles-82c")["people/m"].matchedBy, "instagram.com/mamma.r");
  // WhatsApp's photo, not used, isn't offered again.
  assert.equal(loadQueue("profiles-82c").dismissed["people/m"].length, 1);
  const [review] = (await call("GET", "/runs")).json;
  const decided = (await call("GET", `/runs/${review.id}`)).json.results[0];
  assert.deepEqual([decided.outcome, decided.profiles], ["added", [{ url: "https://instagram.com/mamma.r", network: "instagram", added: true }]]);
});

test("To review: a photo used while a sync runs keeps what the sync queued meanwhile (issue #82)", async (t) => {
  const { google, call } = await start(t, "profiles-82e");
  const wa = Buffer.alloc(1500, 4).toString("base64");
  queuePhotos("profiles-82e", { id: "people/ec" }, "photo", [{ photo: wa, source: "whatsapp", matchedBy: "+39 333 1" }]);
  const write = google.setPhoto.bind(google);
  // The sync queues Mamma while Google saves Elena's photo.
  google.setPhoto = async (id, photo) => (queuePhotos("profiles-82e", { id: "people/m" }, "photo", [{ photo: wa, source: "whatsapp", matchedBy: "+39 333 2" }]), write(id, photo));
  const id = loadQueue("profiles-82e").entries["people/ec"].photos[0].id;
  assert.equal((await call("POST", "/profiles/link", { contactId: "people/ec", personIds: [], photoFrom: id })).json.photoSet, true);
  assert.deepEqual(Object.keys(loadQueue("profiles-82e").entries), ["people/m"]);
});

test("To review: a contact whose photo is kept shows no waiting photos (issue #82)", async (t) => {
  const { call } = await start(t, "profiles-82d");
  queuePhotos("profiles-82d", { id: "people/ec" }, "photo", [{ photo: Buffer.alloc(1500, 4).toString("base64"), source: "whatsapp", matchedBy: "+39 333 1" }]);
  setKeptPhoto("profiles-82d", "people/ec", true);
  assert.equal((await call("GET", "/profiles")).json.suggestions.find((s: any) => s.contactId === "people/ec"), undefined);
});

test("Sources: the profiles linked on contacts per network, and the oldest read (issue #83)", async (t) => {
  const { google, call } = await start(t, "profiles-83");
  google.people.get("people/dg")!.urls = [{ value: "https://www.instagram.com/davide.gallo/" }, { value: "https://github.com/dgallo" }, { value: "https://example.com" }];
  google.people.get("people/ec")!.urls = [{ value: "instagram.com/elena_conti" }, { value: "https://instagram.com/elena_conti?hl=it" }];
  saveReads("profiles-83", { "https://instagram.com/davide.gallo": { readAt: "2026-10-08T10:00:00.000Z" }, "https://instagram.com/elena_conti": { readAt: "2026-10-12T10:00:00.000Z" } });
  assert.deepEqual(await call("GET", "/profiles/networks"), {
    status: 200,
    json: { contacts: 2, profiles: 3, networks: { instagram: { profiles: 2, oldestRead: "2026-10-08T10:00:00.000Z" }, github: { profiles: 1 } } },
  });
});

test("pinned profiles each network could read again (issue #80)", async (t) => {
  const { call } = await start(t, "profiles-80");
  setPin("profiles-80", "people/ec", { source: "links", matchedBy: "instagram.com/elena_conti", readAt: "2026-10-01T00:00:00.000Z" });
  setPin("profiles-80", "people/dg", { source: "links", matchedBy: "linkedin.com/in/davidegallo", readAt: "2026-10-01T00:00:00.000Z" });
  setPin("profiles-80", "people/m", { source: "whatsapp", readAt: "2026-10-01T00:00:00.000Z" });
  assert.deepEqual(await call("GET", "/profiles/pinned"), { status: 200, json: { instagram: 1, linkedin: 1 } });
});

test("History: decisions in To review are one Review entry; undo puts photo, links and pin back (issue #84)", async (t) => {
  const { google, call, undo, base } = await start(t, "profiles-84");
  await call("POST", "/profiles/scan/start", { network: "instagram", acceptRisk: true });
  await call("POST", "/profiles/import?network=linkedin", "First Name,Last Name,URL\nDavide,Gallo,https://www.linkedin.com/in/davidegallo", "text/plain");
  await new Promise((resolve) => setTimeout(resolve, 50));
  const whatsapp = { source: "whatsapp" as const, matchedBy: "+39 333 1", hash: "wa", readAt: "2026-10-01T00:00:00.000Z" };
  setPin("profiles-84", "people/ec", whatsapp);

  await call("POST", "/profiles/link", { contactId: "people/ec", personIds: ["instagram:elena_conti"], photoFrom: "instagram:elena_conti" });
  await call("POST", "/profiles/link", { contactId: "people/dg", personIds: ["linkedin:davidegallo"] });
  // None of these changes nothing: not recorded.
  await call("POST", "/profiles/reject", { contactId: "people/m", personIds: ["instagram:elena_conti"] });
  const runs = (await call("GET", "/runs")).json;
  assert.equal(runs.length, 1);
  assert.deepEqual([runs[0].mode, runs[0].totalContacts, runs[0].counters.replaced, runs[0].counters.linked], ["session", 2, 1, 1]);
  const record = (await call("GET", `/runs/${runs[0].id}`)).json;
  assert.deepEqual(record.results.map((r: any) => [r.contactId, r.outcome, r.profiles]), [
    ["people/ec", "replaced", [{ url: "https://instagram.com/elena_conti", network: "instagram", added: true }]],
    ["people/dg", "linked", [{ url: "https://linkedin.com/in/davidegallo", network: "linkedin", added: true }]],
  ]);
  assert.deepEqual(record.results[0].previousPin, whatsapp);
  assert.equal((await fetch(`${base}/runs/${runs[0].id}/photos/0/previous`)).status, 200);

  // The whole entry: photo, links and pin as they were; the profiles are suggested again.
  assert.equal((await undo(runs[0].id)).undone, true);
  assert.equal(google.photos.get("people/ec"), "T0xE");
  assert.deepEqual([google.people.get("people/ec")!.urls, google.people.get("people/dg")!.urls], [[], []]);
  assert.deepEqual(getPins("profiles-84")["people/ec"], whatsapp);
  const suggested = (await call("GET", "/profiles")).json.suggestions.map((s: any) => [s.contactId, s.candidates.map((c: any) => c.person.id)]);
  assert.deepEqual(suggested.sort(), [["people/dg", ["linkedin:davidegallo"]], ["people/ec", ["instagram:elena_conti"]], ["people/m", []]]);
});

test("History: links and photos from To review before issue #84 become Review entries once", async (t) => {
  const { call, undo, google } = await start(t, "profiles-84m");
  const data = loadProfiles("profiles-84m");
  const elena: SocialPerson = { id: "instagram:elena_conti", network: "instagram", url: "https://instagram.com/elena_conti", handle: "elena_conti", source: "scan" };
  const davide: SocialPerson = { id: "linkedin:davidegallo", network: "linkedin", url: "https://linkedin.com/in/davidegallo", handle: "davidegallo", source: "export" };
  mergePeople(data, [elena, davide]);
  data.linked.push(
    { contactId: "people/ec", name: "Elena Conti", person: elena, at: "2026-10-01T10:00:00.000Z", photoSet: true, addedLink: true, previousPhoto: "T0xE" },
    { contactId: "people/dg", name: "Davide Gallo", person: davide, at: "2026-10-01T10:20:00.000Z", photoSet: false, addedLink: true },
    // Undone already: nothing to undo again.
    { contactId: "people/dg", name: "Davide Gallo", person: davide, at: "2026-10-01T10:25:00.000Z", photoSet: false, addedLink: true, undone: true }
  );
  saveProfiles("profiles-84m", data);
  google.people.get("people/dg")!.urls = [{ value: "https://linkedin.com/in/davidegallo", type: "profile" }];
  cachePhoto({ id: "previous:people/m:2026-10-01T12:00:00.000Z" }, Buffer.from("T0xE", "base64"));
  const queue = loadQueue("profiles-84m");
  queue.applied = [{ contactId: "people/m", at: "2026-10-01T12:00:00.000Z", source: "whatsapp", matchedBy: "+39 333 2", previous: "previous:people/m:2026-10-01T12:00:00.000Z" }];
  saveQueue("profiles-84m", queue);

  // Two hours apart: two entries.
  const runs = (await call("GET", "/runs")).json;
  assert.deepEqual(runs.map((r: any) => [r.mode, r.startedAt, r.totalContacts]), [
    ["session", "2026-10-01T12:00:00.000Z", 1],
    ["session", "2026-10-01T10:00:00.000Z", 2],
  ]);
  const morning = (await call("GET", `/runs/${runs[1].id}`)).json;
  assert.deepEqual(morning.results.map((r: any) => [r.contactId, r.outcome, r.hasPrevious]), [["people/ec", "replaced", true], ["people/dg", "linked", false]]);
  const noon = (await call("GET", `/runs/${runs[0].id}`)).json;
  assert.deepEqual(noon.results.map((r: any) => [r.contactId, r.outcome, r.source, r.hasPrevious]), [["people/m", "replaced", "whatsapp", true]]);
  // Once: asking again adds nothing.
  assert.equal((await call("GET", "/runs")).json.length, 2);
  assert.equal(loadQueue("profiles-84m").applied?.length ?? 0, 0);

  await undo(runs[1].id, [1]);
  assert.deepEqual(google.people.get("people/dg")!.urls, []);
});

test("Dashboard: the address book in three parts and what to do next, from stored state (issue #85)", async (t) => {
  const { google, call, whatsapp } = await start(t, "profiles-85");
  // Mamma: a linked Instagram profile whose photo a scan read. Davide: a WhatsApp photo waiting in To review, and a LinkedIn suggestion.
  google.people.get("people/m")!.urls = [{ value: "https://www.instagram.com/mamma.r/", type: "profile" }];
  google.people.set("people/nn", { resourceName: "people/nn", names: [{ displayName: "Nora Neri" }], phoneNumbers: [{ value: "+39 333 000 0000" }] });
  const data = loadProfiles("profiles-85");
  mergePeople(data, [{ id: "instagram:mamma.r", network: "instagram", url: "https://instagram.com/mamma.r", handle: "mamma.r", photoUrl: "https://scontent.cdninstagram.com/m.jpg", source: "scan" }]);
  data.searches.bluesky = "2026-10-10T09:00:00.000Z";
  saveProfiles("profiles-85", data);
  await call("POST", "/profiles/import?network=linkedin", "First Name,Last Name,URL\nDavide,Gallo,https://www.linkedin.com/in/davidegallo", "text/plain");
  queuePhotos("profiles-85", { id: "people/dg", name: "Davide Gallo" }, "photo", [{ photo: Buffer.alloc(1500, 4).toString("base64"), source: "whatsapp", matchedBy: "+39 338 555 0412" }]);
  // Elena's photo was changed outside the app.
  queuePhotos("profiles-85", { id: "people/ec" }, "changed", [], { source: "links", network: "Instagram", matchedBy: "instagram.com/elena_conti" });

  const before = await call("GET", "/profiles/coverage");
  assert.deepEqual(before, {
    status: 200,
    json: {
      total: 4, withPhoto: 1, ready: 2, readySources: ["links", "whatsapp"], noSource: 1,
      // Davide's photo, and Mamma and Nora without one (issue #104).
      toReview: 3, toReviewWithoutPhoto: 3, changed: 1,
      lastSearch: "2026-10-10T09:00:00.000Z", linkedProfiles: 1, linkedContacts: 1,
    },
  });

  // WhatsApp connected: the contacts whose number it knows, in any spelling.
  whatsapp.lookup = { contacts: async () => new Map([["393385550412", "393385550412@c.us"]]), numberId: async () => null, photo: async () => null, ownNumber: () => "393400000000" };
  assert.equal((await call("GET", "/profiles/coverage")).json.whatsapp, 1);
});

test("cards already waiting follow To review's rules when read, and say where the photo comes from (issue #104)", async (t) => {
  const looks: string[] = [];
  const current = photoFacts(testJpeg(100, 100, 7)).visual;
  const { call } = await start(t, "profiles-104", undefined, async (url) => (looks.push(url), current));
  const photo = (id: string, bytes: Buffer, extra: object = {}) => {
    cachePhoto({ id }, bytes);
    return { id, hash: id, source: "links" as const, matchedBy: id, readAt: "2026-10-01T00:00:00.000Z", ...extra };
  };
  // As an older sync left them: no sizes, no looks.
  const queue = loadQueue("profiles-104");
  queue.entries["people/ec"] = { kind: "photo", addedAt: new Date().toISOString(), photos: [photo("photo:small", testJpeg(150, 150, 2)), photo("photo:same", testJpeg(640, 640, 7, 50)), photo("photo:sharp", testJpeg(640, 640, 4))] };
  queue.entries["people/dg"] = { kind: "photo", addedAt: new Date().toISOString(), photos: [photo("photo:small-dg", testJpeg(150, 150, 2))] };
  queue.entries["people/m"] = { kind: "photo", addedAt: new Date().toISOString(), photos: [photo("photo:fb", testJpeg(640, 640, 5), { network: "Facebook", anonymous: true, version: 2 })] };
  saveQueue("profiles-104", queue);
  const elenaUrl = (await call("GET", "/profiles")).json.suggestions.find((s: any) => s.contactId === "people/ec").photoUrl;
  setPin("profiles-104", "people/ec", { source: "whatsapp", photoKey: photoKey(elenaUrl), hash: "wa", readAt: "2026-10-01T00:00:00.000Z" });

  const cards = (await call("GET", "/profiles")).json.suggestions;
  const card = (id: string) => cards.find((s: any) => s.contactId === id);
  // Elena has a photo: neither the small one nor her own photo saved again.
  assert.deepEqual(card("people/ec").queue.photos.map((p: any) => [p.id, p.width, p.small]), [["photo:sharp", 640, undefined]]);
  assert.deepEqual(card("people/ec").currentFrom, { source: "whatsapp" });
  // Davide has none: the small photo is better than nothing.
  assert.deepEqual(card("people/dg").queue.photos.map((p: any) => [p.id, p.small]), [["photo:small-dg", true]]);
  // Mamma's only photo was a Facebook preview: her card has no photo to offer.
  assert.equal(card("people/m").queue, undefined);
  // Her photo's look was read once, and kept.
  assert.equal(looks.length, 1);
  assert.equal(loadQueue("profiles-104").entries["people/ec"].current?.visual, current);
});

test("To review: searching a contact's name with the login, one card or the selected ones (issue #104)", async (t) => {
  const { google, call, desktopCalls, searchResults } = await start(t, "profiles-104s");
  const person = (network: "instagram" | "facebook", handle: string, name: string): SocialPerson => ({ id: `${network}:${handle}`, network, url: `https://${network}.com/${handle}`, handle, name, source: "scan" });
  // Davide's Instagram, someone else, and a profile already on Elena.
  google.people.get("people/ec")!.urls = [{ value: "https://instagram.com/davide.g" }];
  searchResults.instagram = { people: [person("instagram", "davide.gallo", "Davide Gallo"), person("instagram", "davidegx", "Davide Gx"), person("instagram", "davide.g", "Davide Gallo")] };

  const found = await call("POST", "/profiles/login-search", { contactId: "people/dg", network: "instagram" });
  assert.deepEqual(found, { status: 200, json: { found: 3, suggested: 1 } });
  assert.deepEqual(desktopCalls, ["search instagram Davide Gallo"]);
  const davide = (await call("GET", "/profiles")).json.suggestions.find((s: any) => s.contactId === "people/dg");
  assert.deepEqual(davide.candidates.map((c: any) => [c.person.id, c.person.source]), [["instagram:davide.gallo", "loginSearch"]]);
  assert.deepEqual((await call("POST", "/profiles/login-search", { contactId: "people/dg", network: "x" })).status, 400);

  // The selected cards in the background; a site that says no rests for the rest of the run.
  searchResults.facebook = { people: [], stopped: "limited" };
  const bulk = await call("POST", "/profiles/login-search/bulk", { contactIds: ["people/dg", "people/m", "people/ec"], networks: ["instagram", "facebook"] });
  assert.deepEqual([bulk.status, bulk.json.total], [200, 6]);
  for (let i = 0; i < 100 && (await call("GET", "/profiles")).json.loginSearch.running; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  const state = (await call("GET", "/profiles")).json.loginSearch;
  assert.deepEqual([state.done, state.stopped], [6, ["limited:facebook"]]);
  assert.equal(desktopCalls.filter((c) => c.startsWith("search facebook")).length, 1);
  assert.equal(desktopCalls.filter((c) => c.startsWith("search instagram")).length, 4);
});
