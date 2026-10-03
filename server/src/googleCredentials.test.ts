import test from "node:test";
import assert from "node:assert/strict";

import { parseGoogleCredentials, verifyGoogleCredentials } from "./googleCredentials";

const clientId = "1234567890-abcdef.apps.googleusercontent.com";

test("reads a downloaded Desktop app client file", () => {
  const json = JSON.stringify({ installed: { client_id: clientId, client_secret: "GOCSPX-secret", redirect_uris: ["http://localhost"] } });
  assert.deepEqual(parseGoogleCredentials({ json }), { clientId, clientSecret: "GOCSPX-secret" });
});

test("rejects a Web application client file", () => {
  const json = JSON.stringify({ web: { client_id: clientId, client_secret: "x" } });
  assert.deepEqual(parseGoogleCredentials({ json }), { error: "wrong_client_type" });
});

test("rejects files that are not client files", () => {
  assert.deepEqual(parseGoogleCredentials({ json: "{nope" }), { error: "invalid_json" });
  assert.deepEqual(parseGoogleCredentials({ json: '{"type":"service_account"}' }), { error: "invalid_json" });
});

test("reads pasted values and trims them", () => {
  assert.deepEqual(parseGoogleCredentials({ clientId: `  ${clientId} `, clientSecret: " s " }), { clientId, clientSecret: "s" });
});

test("rejects missing or malformed values", () => {
  assert.deepEqual(parseGoogleCredentials({ clientId, clientSecret: "" }), { error: "missing_fields" });
  assert.deepEqual(parseGoogleCredentials(undefined), { error: "missing_fields" });
  assert.deepEqual(parseGoogleCredentials({ clientId: "not-an-id", clientSecret: "s" }), { error: "invalid_client_id" });
});

function googleAnswering(status: number, body: unknown, seen?: { body?: string }) {
  return (async (_url: string, init: RequestInit) => {
    if (seen) seen.body = String(init.body);
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

test("invalid_grant means Google accepted the client", async () => {
  const seen: { body?: string } = {};
  const result = await verifyGoogleCredentials({ clientId, clientSecret: "s" }, googleAnswering(400, { error: "invalid_grant" }, seen));
  assert.equal(result, "valid");
  const sent = new URLSearchParams(seen.body);
  assert.equal(sent.get("client_id"), clientId);
  assert.equal(sent.get("grant_type"), "authorization_code");
});

test("invalid_client means a wrong ID or secret", async () => {
  assert.equal(await verifyGoogleCredentials({ clientId, clientSecret: "s" }, googleAnswering(401, { error: "invalid_client" })), "invalid");
});

test("network failures and server errors are reported as unreachable", async () => {
  const failing = (async () => {
    throw new Error("offline");
  }) as unknown as typeof fetch;
  assert.equal(await verifyGoogleCredentials({ clientId, clientSecret: "s" }, failing), "unreachable");
  assert.equal(await verifyGoogleCredentials({ clientId, clientSecret: "s" }, googleAnswering(503, {})), "unreachable");
});
