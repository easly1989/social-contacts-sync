import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import fs from "fs";
import { AddressInfo } from "net";
import os from "os";
import path from "path";

import { cleanupRouter } from "../../routes/cleanup";
import { setInCache } from "../cache";
import { FakeContacts } from "./fakeContacts";
import { Person } from "./people";

const meta = (updateTime: string) => ({ sources: [{ type: "CONTACT", id: "x", updateTime }] });
const people: Person[] = [
  { resourceName: "people/a", metadata: meta("2026-09-30T10:00:00Z"), names: [{ displayName: "Marco Rossi" }], phoneNumbers: [{ value: "+39 333 812 5517" }] },
  { resourceName: "people/b", metadata: meta("2019-05-01T10:00:00Z"), names: [{ displayName: "Marco R." }], phoneNumbers: [{ value: "333 8125517" }] },
  { resourceName: "people/c", metadata: meta("2026-01-01T10:00:00Z"), names: [{ displayName: "Giulia Bianchi" }], emailAddresses: [{ value: "g@example.com" }] },
  { resourceName: "people/d", metadata: meta("2025-01-01T10:00:00Z"), names: [{ displayName: "Giulia Bianchi" }] },
  { resourceName: "people/m", metadata: meta("2025-01-01T10:00:00Z"), names: [{ displayName: "Mamma" }], phoneNumbers: [{ value: "+39 340 221 6527" }] },
  { resourceName: "people/e", metadata: meta("2025-01-01T10:00:00Z"), names: [{ displayName: "Maria Esposito" }], phoneNumbers: [{ value: "+39 340 221 6527" }] },
];

async function start(t: { after(fn: () => void): void }, sessionId: string) {
  const google = new FakeContacts(people, { "people/b": "QkJC" });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { sessionID: string }).sessionID = sessionId;
    next();
  });
  app.use("/api", cleanupRouter(() => google));
  setInCache(sessionId, "gauth", {});
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const call = async (method: string, route: string, body?: unknown) => {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, json: (await response.json()) as any };
  };
  return { google, call };
}

function withEnv(env: Record<string, string | undefined>, t: { after(fn: () => void): void }) {
  const previous = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(env)) (v === undefined ? delete process.env[k] : (process.env[k] = v));
  t.after(() => {
    for (const [k, v] of Object.entries(previous)) (v === undefined ? delete process.env[k] : (process.env[k] = v));
  });
}

test("web: scan, ignore, merge and undo", async (t) => {
  withEnv({ SCS_DESKTOP: undefined }, t);
  const { google, call } = await start(t, "web-1");

  assert.deepEqual((await call("GET", "/cleanup")).json, { scan: null });
  assert.equal((await call("POST", "/cleanup/scan", { region: "IT" })).status, 200);
  let scan = (await call("GET", "/cleanup")).json.scan;
  assert.equal(scan.totalContacts, 6);
  assert.deepEqual(scan.duplicates.map((g: { contactIds: string[] }) => g.contactIds), [["people/c", "people/d"], ["people/a", "people/b"]]);
  assert.deepEqual(scan.sharedNumbers, [{ e164: "+393402216527", contactIds: ["people/m", "people/e"] }]);
  assert.deepEqual((await call("GET", "/cleanup/summary")).json, { scannedAt: scan.scannedAt, totalContacts: 6, duplicates: 2, sharedNumbers: 1, missingCountryCode: 1 });

  // Not duplicates: gone now and after the next scan.
  assert.equal((await call("POST", "/cleanup/ignore", { groupId: scan.duplicates[0].id })).json.duplicates, 1);
  scan = (await call("POST", "/cleanup/scan", { region: "IT" })).json;
  assert.equal(scan.duplicates.length, 1);

  const group = scan.duplicates[0];
  assert.equal((await call("POST", "/cleanup/merge", { groupId: "nope", keepId: "people/a", phones: [], emails: [], addresses: [] })).status, 404);
  const merged = await call("POST", "/cleanup/merge", { groupId: group.id, keepId: "people/a", photo: "people/b", phones: ["people/a", "people/b"], emails: [], addresses: [] });
  assert.equal(merged.status, 200);
  assert.equal(merged.json.summary.duplicates, 0);
  assert.deepEqual(google.calls.slice(-3), ["update people/a", "setPhoto people/a", "delete people/b"]);

  const actions = (await call("GET", "/cleanup/actions")).json;
  assert.deepEqual(actions.map((a: { id: string; kind: string; title: string; contacts: number }) => [a.id, a.kind, a.title, a.contacts]), [[merged.json.actionId, "merge", "Marco Rossi", 2]]);
  assert.deepEqual((await call("POST", `/cleanup/actions/${merged.json.actionId}/undo`, {})).json, { ok: true });
  assert.equal(google.people.size, 6);
  assert.equal((await call("GET", "/cleanup/actions")).json[0].undone, true);
  assert.equal((await call("GET", "/cleanup")).json.scan.stale, true);
});

test("a contact edited after the scan stops the merge", async (t) => {
  withEnv({ SCS_DESKTOP: undefined }, t);
  const { google, call } = await start(t, "web-2");
  const scan = (await call("POST", "/cleanup/scan", { region: "IT" })).json;
  google.people.get("people/b")!.metadata = meta("2026-10-02T09:00:00Z");
  const group = scan.duplicates.find((g: { contactIds: string[] }) => g.contactIds.includes("people/b"));
  const response = await call("POST", "/cleanup/merge", { groupId: group.id, keepId: "people/a", phones: [], emails: [], addresses: [] });
  assert.deepEqual(response, { status: 409, json: { error: "changed_since_scan" } });
  assert.equal(google.people.size, 6);
});

test("desktop: choices and merge backups are files in the data folder", async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "scs-cleanup-"));
  withEnv({ SCS_DESKTOP: "1", SCS_DATA_DIR: dataDir }, t);
  const { google, call } = await start(t, "desktop");
  const scan = (await call("POST", "/cleanup/scan", { region: "IT" })).json;
  await call("POST", "/cleanup/ignore", { groupId: scan.duplicates[0].id });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, "cleanup.json"), "utf8")).ignoredPairs, ["people/c|people/d"]);

  const group = scan.duplicates[1];
  const { json } = await call("POST", "/cleanup/merge", { groupId: group.id, keepId: "people/a", phones: ["people/a"], emails: [], addresses: [] });
  const actionDir = path.join(dataDir, "history", "cleanup", json.actionId);
  assert.equal(fs.readFileSync(path.join(actionDir, "photo-1.jpg"), "utf8"), "BBB");
  assert.equal(JSON.parse(fs.readFileSync(path.join(actionDir, "action.json"), "utf8")).backup.people.length, 2);

  assert.equal((await call("POST", `/cleanup/actions/${json.actionId}/undo`, {})).status, 200);
  const restored = [...google.people.values()].find((p) => p.names?.[0].displayName === "Marco R.")!;
  assert.equal(google.photos.get(restored.resourceName!), "QkJC");
});
