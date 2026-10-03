import test from "node:test";
import assert from "node:assert/strict";

import { browserCandidates, findInstalledBrowser } from "./browser";

test("Windows looks for Chrome, then Edge, in Program Files and LocalAppData", () => {
  const env = { PROGRAMFILES: "C:\\Program Files", "PROGRAMFILES(X86)": "C:\\Program Files (x86)", LOCALAPPDATA: "C:\\Users\\ada\\AppData\\Local" };
  const list = browserCandidates("win32", env);
  assert.equal(list[0], "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
  assert.ok(list.includes("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"));
  assert.ok(list.indexOf("C:\\Users\\ada\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe") < list.findIndex((p) => p.includes("msedge")));
});

test("Linux searches PATH but skips snap directories", () => {
  const list = browserCandidates("linux", { PATH: "/usr/local/bin:/snap/bin:/usr/bin" });
  assert.ok(list.includes("/usr/bin/google-chrome-stable"));
  assert.ok(list.includes("/usr/local/bin/chromium"));
  assert.ok(!list.some((p) => p.startsWith("/snap")));
});

test("CHROME_PATH wins when it exists", () => {
  const found = findInstalledBrowser("linux", { CHROME_PATH: "/opt/chrome", PATH: "/usr/bin" }, () => true);
  assert.equal(found, "/opt/chrome");
});

test("the first existing candidate is used, or none", () => {
  const exists = (p: string) => p === "/usr/bin/chromium";
  assert.equal(findInstalledBrowser("linux", { PATH: "/usr/bin" }, exists), "/usr/bin/chromium");
  assert.equal(findInstalledBrowser("linux", { PATH: "/usr/bin" }, () => false), undefined);
});
