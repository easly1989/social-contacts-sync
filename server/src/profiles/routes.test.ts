import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { AddressInfo } from "net";

import { ProfileScanState, SocialPerson } from "../../../interfaces/api";
import { profilesRouter, ScanNetwork } from "../../routes/profiles";
import { deleteFromCache, setInCache } from "../cache";
import { setKeptPhoto } from "../contacts/keptPhotos";
import { getPins, photoHash, setPin } from "../contacts/photoPins";
import { ReadProfile } from "./rereads";
import { loadProfiles, mergePeople, saveProfiles } from "./store";
import { FakeContacts } from "../cleanup/fakeContacts";
import { Person } from "../cleanup/people";

// Find profiles (issue #61) against the fake address book, a fake web and a fake desktop app.
const people: Person[] = [
  { resourceName: "people/dg", names: [{ displayName: "Davide Gallo", givenName: "Davide", familyName: "Gallo" }], phoneNumbers: [{ value: "+39 338 555 0412" }] },
  { resourceName: "people/ec", names: [{ displayName: "Elena Conti", givenName: "Elena", familyName: "Conti" }] },
  { resourceName: "people/m", names: [{ displayName: "Mamma", givenName: "Mamma" }] },
];
const jpeg = Buffer.alloc(2048, 9);

async function start(t: { after(fn: () => void): void }, sessionId: string, loginReader?: ReadProfile) {
  delete process.env.SCS_DESKTOP; // in memory
  const google = new FakeContacts(people, { "people/ec": "T0xE" });
  const scanned: SocialPerson[] = [{ id: "instagram:elena_conti", network: "instagram", url: "https://instagram.com/elena_conti", handle: "elena_conti", name: "Elena Conti", photoUrl: "https://scontent.cdninstagram.com/e.jpg", source: "scan", relation: "follower" }];
  const desktopCalls: string[] = [];
  // `down`: the sites' image addresses have expired.
  const web = { down: false };
  const desktop = {
    status: async (): Promise<ProfileScanState[]> => [{ network: "instagram", loggedIn: true, account: "easly1989" }],
    login: async (network: ScanNetwork) => (desktopCalls.push(`login ${network}`), { network, loggedIn: true }),
    logout: async (network: ScanNetwork) => void desktopCalls.push(`logout ${network}`),
    scan: async (network: ScanNetwork) => (desktopCalls.push(`scan ${network}`), { people: scanned }),
    stop: async (network: ScanNetwork) => void desktopCalls.push(`stop ${network}`),
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
  app.use("/api", profilesRouter({ contactsApi: () => google, desktop, fetchImpl, sleep: async () => {}, loginReader: () => loginReader }));
  setInCache(sessionId, "gauth", {});
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const call = async (method: string, route: string, body?: unknown, type = "application/json") => {
    const response = await fetch(`${base}${route}`, { method, headers: body === undefined ? {} : { "Content-Type": type }, body: typeof body === "string" ? body : body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, json: (await response.json()) as any };
  };
  return { google, call, desktopCalls, base, web };
}

test("import, search and scan feed one review queue; link with photo, then undo", async (t) => {
  const { google, call, desktopCalls } = await start(t, "profiles-1");
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
  // Elena has a real photo, so Davide (none) comes first; Mamma has one word and no suggestions.
  assert.deepEqual(
    overview.suggestions.map((s: any) => [s.name, s.candidates.map((c: any) => `${c.person.id}:${c.reason}`)]),
    [
      ["Davide Gallo", ["bluesky:dgallo.bsky.social:sameName", "linkedin:davidegallo:sameName"]],
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
  assert.deepEqual(overview.suggestions.map((s: any) => s.name), ["Davide Gallo"]);
  assert.equal(overview.linked[0].person.id, "instagram:elena_conti");
  // The photo now follows that profile (issue #78).
  const pin = getPins("profiles-1")["people/ec"];
  assert.deepEqual([pin.source, pin.network, pin.matchedBy, pin.hash], ["links", "Instagram", "instagram.com/elena_conti", photoHash(jpeg.toString("base64"))]);
  assert.ok(pin.photoKey);

  assert.deepEqual(await call("POST", "/profiles/undo", { contactId: "people/ec", personId: "instagram:elena_conti" }), { status: 200, json: { ok: true } });
  assert.deepEqual(google.people.get("people/ec")!.urls, []);
  assert.equal(google.photos.get("people/ec"), "T0xE");
  assert.equal(getPins("profiles-1")["people/ec"], undefined);

  // "None of these" and "Skip".
  await call("POST", "/profiles/reject", { contactId: "people/dg", personIds: ["bluesky:dgallo.bsky.social"] });
  await call("POST", "/profiles/skip", { contactId: "people/dg" });
  overview = (await call("GET", "/profiles")).json;
  assert.deepEqual(
    overview.suggestions.map((s: any) => [s.name, s.candidates.length]),
    [["Elena Conti", 1], ["Davide Gallo", 1]]
  );
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
  assert.deepEqual(overview.suggestions, []);

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
  const { google, call } = await start(t, "profiles-81");
  // No profiles read yet: nothing to review, and Google isn't asked.
  assert.deepEqual(await call("GET", "/profiles/count"), { status: 200, json: { count: 0 } });
  await call("POST", "/profiles/scan/start", { network: "instagram", acceptRisk: true });
  await call("POST", "/profiles/link", { contactId: "people/ec", personIds: ["instagram:elena_conti"] });
  await call("POST", "/profiles/import?network=linkedin", "First Name,Last Name,URL\nElena,Conti,https://www.linkedin.com/in/elenaconti", "text/plain");

  const elena = (await call("GET", "/profiles")).json.suggestions.find((s: any) => s.contactId === "people/ec");
  assert.deepEqual(elena.candidates.map((c: any) => c.person.id), ["linkedin:elenaconti"]);
  assert.deepEqual(elena.linked.map((p: any) => p.id), ["instagram:elena_conti"]);
  assert.deepEqual(await call("GET", "/profiles/count"), { status: 200, json: { count: 1 } });

  // Only the photo: LinkedIn isn't her, Instagram is linked already.
  const confirmed = await call("POST", "/profiles/link", { contactId: "people/ec", personIds: [], photoFrom: "instagram:elena_conti", rejectIds: ["linkedin:elenaconti"] });
  assert.equal(confirmed.json.photoSet, true);
  assert.deepEqual(confirmed.json.linked.map((l: any) => [l.person.id, l.photoSet]), [["instagram:elena_conti", true]]);
  assert.equal(google.photos.get("people/ec"), jpeg.toString("base64"));
  assert.equal(google.people.get("people/ec")!.urls!.length, 1);
  assert.equal(getPins("profiles-81")["people/ec"].matchedBy, "instagram.com/elena_conti");
  assert.deepEqual(await call("GET", "/profiles/count"), { status: 200, json: { count: 0 } });

  // Undo puts the photo back and leaves the link that was there.
  await call("POST", "/profiles/undo", { contactId: "people/ec", personId: "instagram:elena_conti" });
  assert.equal(google.photos.get("people/ec"), "T0xE");
  assert.equal(google.people.get("people/ec")!.urls!.length, 1);

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

test("pinned profiles each network could read again (issue #80)", async (t) => {
  const { call } = await start(t, "profiles-80");
  setPin("profiles-80", "people/ec", { source: "links", matchedBy: "instagram.com/elena_conti", readAt: "2026-10-01T00:00:00.000Z" });
  setPin("profiles-80", "people/dg", { source: "links", matchedBy: "linkedin.com/in/davidegallo", readAt: "2026-10-01T00:00:00.000Z" });
  setPin("profiles-80", "people/m", { source: "whatsapp", readAt: "2026-10-01T00:00:00.000Z" });
  assert.deepEqual(await call("GET", "/profiles/pinned"), { status: 200, json: { instagram: 1, linkedin: 1 } });
});
