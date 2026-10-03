import test from "node:test";
import assert from "node:assert/strict";

import { findUpdate, isNewer, isPrerelease, pickUpdate, updateStrategy } from "./updates";

test("which builds update themselves", () => {
  assert.equal(updateStrategy("win32", {}, true), "auto");
  assert.equal(updateStrategy("win32", { PORTABLE_EXECUTABLE_DIR: "D:\\apps" }, true), "notify");
  assert.equal(updateStrategy("linux", { APPIMAGE: "/home/ada/app.AppImage" }, true), "auto");
  assert.equal(updateStrategy("linux", {}, true), "notify");
  assert.equal(updateStrategy("darwin", {}, true), "notify");
  assert.equal(updateStrategy("win32", {}, false), "none");
  assert.equal(updateStrategy("linux", { APPIMAGE: "/a", SCS_DISABLE_UPDATES: "1" }, true), "none");
});

test("semantic version ordering", () => {
  assert.ok(isNewer("1.0.1", "1.0.0"));
  assert.ok(isNewer("1.10.0", "1.9.9"));
  assert.ok(isNewer("v2.0.0", "1.99.99"));
  assert.ok(!isNewer("1.0.0", "1.0.0"));
  assert.ok(!isNewer("0.9.0", "1.0.0"));
  assert.ok(isNewer("1.0.0", "1.0.0-beta.3"));
  assert.ok(!isNewer("1.0.0-beta.3", "1.0.0"));
  assert.ok(isNewer("1.0.0-beta.10", "1.0.0-beta.2"));
  assert.ok(isNewer("1.0.0-rc.1", "1.0.0-beta.9"));
  assert.ok(isNewer("1.0.0-beta.1", "1.0.0-beta"));
  assert.ok(!isNewer("not-a-version", "1.0.0"));
});

test("pre-release detection", () => {
  assert.ok(isPrerelease("0.2.0-beta.1"));
  assert.ok(!isPrerelease("0.2.0"));
});

const releases = [
  { tag_name: "v0.3.0-beta.1", html_url: "https://example/0.3.0-beta.1", draft: false, prerelease: true },
  { tag_name: "v0.2.1", html_url: "https://example/0.2.1", draft: false, prerelease: false },
  { tag_name: "v0.4.0", html_url: "https://example/draft", draft: true, prerelease: false },
  { tag_name: "v0.2.0", html_url: "https://example/0.2.0", draft: false, prerelease: false },
];

test("stable users are offered the newest stable release, never drafts", () => {
  assert.deepEqual(pickUpdate(releases, "0.2.0"), { version: "0.2.1", url: "https://example/0.2.1" });
  assert.equal(pickUpdate(releases, "0.2.1"), undefined);
});

test("pre-release users are offered newer pre-releases too", () => {
  assert.deepEqual(pickUpdate(releases, "0.2.0-beta.1"), { version: "0.3.0-beta.1", url: "https://example/0.3.0-beta.1" });
});

test("findUpdate reads the GitHub releases API", async () => {
  let requested = "";
  const fakeFetch = (async (url: string) => {
    requested = url;
    return { ok: true, json: async () => releases } as Response;
  }) as unknown as typeof fetch;
  assert.deepEqual(await findUpdate("0.1.0", fakeFetch), { version: "0.2.1", url: "https://example/0.2.1" });
  assert.match(requested, /^https:\/\/api\.github\.com\/repos\/easly1989\/social-contacts-sync\/releases/);
});
