import test from "node:test";
import assert from "node:assert/strict";

import { consumeOAuthState, createOAuthState } from "./oauthState";

test("a state resolves to the session that created it", () => {
  const state = createOAuthState("session-a");
  assert.deepEqual(consumeOAuthState(state), { sessionId: "session-a", returnTo: undefined });
});

test("a state remembers where to return", () => {
  const state = createOAuthState("session-a", "/setup/signin?connected=1");
  assert.equal(consumeOAuthState(state)?.returnTo, "/setup/signin?connected=1");
});

test("a state can only be used once", () => {
  const state = createOAuthState("session-a");
  consumeOAuthState(state);
  assert.equal(consumeOAuthState(state), undefined);
});

test("states expire after ten minutes", () => {
  const now = 1_000_000;
  const state = createOAuthState("session-a", undefined, now);
  assert.equal(consumeOAuthState(state, now + 10 * 60 * 1000), undefined);
});

test("unknown, missing or malformed states are rejected", () => {
  assert.equal(consumeOAuthState("not-a-state"), undefined);
  assert.equal(consumeOAuthState(undefined), undefined);
  assert.equal(consumeOAuthState(["array"]), undefined);
});

test("states are unique per sign-in", () => {
  const a = createOAuthState("session-a");
  const b = createOAuthState("session-a");
  assert.notEqual(a, b);
  assert.match(a, /^[0-9a-f]{32}$/);
});
