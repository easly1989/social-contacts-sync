import test from "node:test";
import assert from "node:assert/strict";
import { people } from "@googleapis/people";

import { generateGoogleAuthUrl } from "./gapi";

test("the consent URL asks for offline contacts access with our state", () => {
  process.env.GOOGLE_CLIENT_ID = "client-id.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "secret";
  const url = new URL(generateGoogleAuthUrl("http://127.0.0.1:5000/api/google_callback", "state-123"));

  assert.equal(url.host, "accounts.google.com");
  assert.equal(url.searchParams.get("client_id"), "client-id.apps.googleusercontent.com");
  assert.equal(url.searchParams.get("redirect_uri"), "http://127.0.0.1:5000/api/google_callback");
  assert.equal(url.searchParams.get("scope"), "https://www.googleapis.com/auth/contacts");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.equal(url.searchParams.get("state"), "state-123");
  assert.equal(url.searchParams.get("response_type"), "code");
});

test("the People client exposes the calls the sync uses", () => {
  const client = people({ version: "v1" });
  assert.equal(typeof client.people.connections.list, "function");
  assert.equal(typeof client.people.updateContactPhoto, "function");
});
