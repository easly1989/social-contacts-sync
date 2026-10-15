import test from "node:test";
import assert from "node:assert/strict";

import { getFromCache, setInCache } from "./cache";
import { checkGoogleSignIn, isRevokedSignIn } from "./googleSignIn";

// What googleapis throws when the refresh token is no longer valid.
const revoked = Object.assign(new Error("invalid_grant"), { response: { status: 400, data: { error: "invalid_grant", error_description: "Token has been expired or revoked." } } });

function client(answer: () => Promise<unknown>) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    getAccessToken: () => {
      calls++;
      return answer();
    },
  };
}

test("a sign-in Google refuses is forgotten, and the page is told why", async () => {
  const google = client(() => Promise.reject(revoked));
  setInCache("expired-1", "gauth", google);
  await checkGoogleSignIn("expired-1", 1_000_000);
  assert.equal(getFromCache("expired-1", "gauth"), undefined);
  assert.equal(getFromCache("expired-1", "google_expired"), true);
  assert.ok(isRevokedSignIn(revoked));
  assert.ok(!isRevokedSignIn(new Error("getaddrinfo ENOTFOUND oauth2.googleapis.com")));
});

test("offline is not a refusal, and a working sign-in is checked every few minutes only", async () => {
  const offline = client(() => Promise.reject(Object.assign(new Error("getaddrinfo ENOTFOUND oauth2.googleapis.com"), { code: "ENOTFOUND" })));
  setInCache("expired-2", "gauth", offline);
  await checkGoogleSignIn("expired-2", 1_000_000);
  assert.equal(getFromCache("expired-2", "gauth"), offline);
  assert.equal(getFromCache("expired-2", "google_expired"), undefined);

  const working = client(() => Promise.resolve({ token: "ya29" }));
  setInCache("expired-3", "gauth", working);
  await checkGoogleSignIn("expired-3", 1_000_000);
  await checkGoogleSignIn("expired-3", 1_000_000 + 60_000);
  assert.equal(working.calls, 1);
  await checkGoogleSignIn("expired-3", 1_000_000 + 6 * 60_000);
  assert.equal(working.calls, 2);
  assert.equal(getFromCache("expired-3", "gauth"), working);
});
