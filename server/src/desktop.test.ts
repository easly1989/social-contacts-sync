import test from "node:test";
import assert from "node:assert/strict";

import { crossSiteGuard, safeReturnPath, saveDesktopConfig } from "./desktop";

test("return paths must stay inside the app", () => {
  assert.equal(safeReturnPath("/setup/signin?connected=1"), "/setup/signin?connected=1");
  assert.equal(safeReturnPath("/options"), "/options");
  for (const bad of ["https://evil.example", "//evil.example", "/api/google_auth_start", "setup", "/a b", "/x\\y", undefined, ["/"]])
    assert.equal(safeReturnPath(bad), undefined, String(bad));
});

function run(headers: Record<string, string>, path = "/status") {
  let status = 200;
  let passed = false;
  const req = { path, get: (name: string) => headers[name.toLowerCase()] } as any;
  const res = { status: (code: number) => ((status = code), res), send: () => res } as any;
  crossSiteGuard(req, res, () => (passed = true));
  return { status, passed };
}

test("cross-site requests are refused, except Google's callback", () => {
  assert.deepEqual(run({ "sec-fetch-site": "cross-site" }), { status: 403, passed: false });
  assert.deepEqual(run({ "sec-fetch-site": "cross-site" }, "/google_callback"), { status: 200, passed: true });
  assert.deepEqual(run({ "sec-fetch-site": "same-origin" }), { status: 200, passed: true });
  assert.deepEqual(run({ "sec-fetch-site": "none" }), { status: 200, passed: true });
  assert.deepEqual(run({}), { status: 200, passed: true });
});

test("saving the config needs the desktop app", async () => {
  await assert.rejects(saveDesktopConfig({ A: "1" }), /desktop app/);
});
