import { test, expect } from "@playwright/test";

import { FakeBackend, screenshot } from "./backend";
import { sampleProfiles } from "./fixtures";

// Find profiles (issue #61), with the backend mocked.
let backend: FakeBackend;

test.beforeEach(async ({ page }) => {
  backend = new FakeBackend(page);
  Object.assign(backend.status, { whatsappConnected: true, googleConnected: true, googleConfigured: true, desktop: true, setupDone: true });
  backend.profiles = sampleProfiles();
  await backend.install();
});

test("review list: several profiles per contact, the photo to use, and linking in bulk (issue #65)", async ({ page }) => {
  await page.goto("/app");
  await page.getByRole("navigation", { name: "Main navigation" }).first().getByRole("link", { name: "Find profiles" }).click();
  await expect(page.getByRole("tab", { name: "To review (2)" })).toHaveAttribute("aria-selected", "true");
  const list = page.getByTestId("profile-list");
  const davide = list.getByTestId("profile-card").filter({ hasText: "Davide Gallo" }).first();
  // Each network's only match is ticked; Instagram has two Davides, so it's left to the user.
  await expect(davide.getByRole("checkbox", { name: "Davide Gallo · linkedin.com/in/davidegallo" })).toBeChecked();
  await expect(davide.getByRole("checkbox", { name: "Davide Gallo · @dgallo.bsky.social" })).toBeChecked();
  await expect(davide.getByRole("checkbox", { name: "Davide Gallo · @davide.gallo" })).not.toBeChecked();
  await expect(davide.getByRole("checkbox", { name: "Use this photo" })).toHaveCount(2);
  await expect(davide.getByRole("checkbox", { name: "Use this photo" }).first()).toBeChecked(); // LinkedIn's, the contact has none
  await expect(davide).toContainText("Connection · same name · Gallo Ceramiche");
  // Photos come through the app's server.
  await expect(davide.locator("img").first()).toHaveAttribute("src", "/api/profiles/photo?id=instagram%3Adavide.gallo");

  // Instagram too, and its photo instead of LinkedIn's.
  await davide.getByRole("checkbox", { name: "Davide Gallo · @davide.gallo" }).check();
  await davide.getByRole("checkbox", { name: "Use this photo" }).first().check();
  await expect(davide.getByRole("checkbox", { name: "Use this photo" }).nth(1)).not.toBeChecked();
  await screenshot(page, "71-profiles-list");
  await davide.getByRole("button", { name: "Link 3 profiles" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Linked to Davide Gallo." })).toBeVisible();
  expect(backend.profileRequests.find((r) => r.route === "/link")!.body).toEqual({
    contactId: "people/dg",
    name: "Davide Gallo",
    personIds: ["instagram:davide.gallo", "linkedin:davidegallo", "bluesky:dgallo.bsky.social"],
    photoFrom: "instagram:davide.gallo",
    rejectIds: ["instagram:davegalloni"],
  });
  // The confirmation leaves by itself.
  await expect(page.getByRole("status").filter({ hasText: "Linked to Davide Gallo." })).toHaveCount(0, { timeout: 4000 });

  // Elena, in bulk: selected, then linked in the background.
  await expect(list.getByTestId("profile-card")).toHaveCount(1);
  await list.getByRole("checkbox", { name: "Select all" }).check();
  await expect(list).toContainText("1 of 1 contacts");
  await list.getByRole("button", { name: "Link 1 profile to 1 contact" }).click();
  expect(backend.profileRequests.find((r) => r.route === "/link_many")!.body).toEqual({
    items: [{ contactId: "people/ec", name: "Elena Conti", personIds: ["instagram:elena_conti"], rejectIds: [] }],
  });
  await expect(list.getByTestId("bulk-progress")).toContainText("Linking 0 of 1 contacts…");
  backend.profiles!.bulk = { running: false, done: 1, total: 1, contacts: 0, profiles: 0, failed: [{ contactId: "people/ec", name: "Elena Conti", error: "Google had a temporary problem (503) and nothing was changed. Try again later." }] };
  // Errors stay, with their detail to copy.
  const failed = page.getByRole("alert").filter({ hasText: "1 contact couldn't be linked: Elena Conti." });
  await expect(failed).toBeVisible({ timeout: 6000 });
  await expect(failed).toContainText("Elena Conti: Google had a temporary problem (503)");
  await expect(failed.getByRole("button", { name: "Copy error" })).toBeVisible();
  await screenshot(page, "71b-profiles-bulk-error", { fullPage: false });
  await page.waitForTimeout(2500);
  await expect(failed).toBeVisible();
  await failed.getByRole("button", { name: "Close" }).click();
  await expect(failed).toHaveCount(0);
});

test("a contact that already has a photo keeps it unless a photo is picked by hand (issue #65)", async ({ page }) => {
  const davide = backend.profiles!.suggestions[0];
  Object.assign(davide, { hasPhoto: true, photoUrl: "/api/e2e-photos/7" });
  backend.profiles!.suggestions = [davide];
  await page.goto("/app/profiles");
  const card = page.getByTestId("profile-card");
  await expect(card).toContainText("Has a photo of its own");
  // LinkedIn and Bluesky are ticked, but neither gives its photo.
  await expect(card.getByRole("checkbox", { name: "Use this photo" })).toHaveCount(2);
  for (const box of await card.getByRole("checkbox", { name: "Use this photo" }).all()) await expect(box).not.toBeChecked();
  // Ticking or unticking more profiles doesn't pick one either.
  await card.getByRole("checkbox", { name: "Davide Gallo · @davide.gallo" }).check();
  await card.getByRole("checkbox", { name: "Davide Gallo · linkedin.com/in/davidegallo" }).uncheck();
  for (const box of await card.getByRole("checkbox", { name: "Use this photo" }).all()) await expect(box).not.toBeChecked();

  // In bulk too: links only.
  await page.getByRole("checkbox", { name: "Select all" }).check();
  await page.getByRole("button", { name: "Link 2 profiles to 1 contact" }).click();
  expect(backend.profileRequests.find((r) => r.route === "/link_many")!.body.items[0]).toEqual({
    contactId: "people/dg",
    name: "Davide Gallo",
    personIds: ["instagram:davide.gallo", "bluesky:dgallo.bsky.social"],
    rejectIds: ["linkedin:davidegallo", "instagram:davegalloni"],
  });
});

test("a kept photo: only the links, no photo offered (issue #67)", async ({ page }) => {
  const davide = backend.profiles!.suggestions[0];
  Object.assign(davide, { hasPhoto: true, photoKept: true, photoUrl: "/api/e2e-photos/7" });
  backend.profiles!.suggestions = [davide];
  await page.goto("/app/profiles");
  const card = page.getByTestId("profile-card");
  await expect(card).toContainText("This contact's photo is kept: only the links are added.");
  await expect(card.getByRole("checkbox", { name: "Use this photo" })).toHaveCount(0);
  await screenshot(page, "71c-profiles-kept-photo", { fullPage: false });
  await card.getByRole("button", { name: "Link 2 profiles" }).click();
  expect(backend.profileRequests.find((r) => r.route === "/link")!.body).toEqual({
    contactId: "people/dg",
    name: "Davide Gallo",
    personIds: ["linkedin:davidegallo", "bluesky:dgallo.bsky.social"],
    rejectIds: ["instagram:davide.gallo", "instagram:davegalloni"],
  });
});

test("one at a time: keys tick profiles, link, and None of these; Linked has undo", async ({ page }) => {
  await page.goto("/app/profiles");
  await page.getByRole("button", { name: "One at a time" }).click();
  // The view is remembered.
  await page.reload();
  await expect(page.getByRole("button", { name: "One at a time" })).toHaveAttribute("aria-pressed", "true");
  const review = page.getByTestId("profile-review");
  await expect(review.getByRole("heading", { name: "Davide Gallo" })).toBeVisible();
  await page.keyboard.press("1");
  await expect(review.getByRole("checkbox", { name: "Davide Gallo · @davide.gallo" })).toBeChecked();
  await page.keyboard.press("2");
  await expect(review.getByRole("checkbox", { name: "Davide Gallo · linkedin.com/in/davidegallo" })).not.toBeChecked();
  await screenshot(page, "72b-profiles-one-at-a-time");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Linked to Davide Gallo." })).toBeVisible();
  expect(backend.profileRequests.find((r) => r.route === "/link")!.body).toMatchObject({ personIds: ["instagram:davide.gallo", "bluesky:dgallo.bsky.social"], photoFrom: "instagram:davide.gallo" });

  await expect(review.getByRole("heading", { name: "Elena Conti" })).toBeVisible();
  await page.keyboard.press("n");
  expect(backend.profileRequests.find((r) => r.route === "/reject")!.body).toEqual({ contactId: "people/ec", personIds: ["instagram:elena_conti"] });
  await expect(page.getByText("No suggestions left.")).toBeVisible();

  await page.getByRole("tab", { name: "Linked (2)" }).click();
  const linked = page.getByTestId("profiles-linked");
  await expect(linked).toContainText("instagram.com/davide.gallo");
  await linked.getByRole("button", { name: "Undo" }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Link removed from Davide Gallo." })).toBeVisible();
  await expect(linked).toContainText("Undone");
});

test("sources: import an export, run the public search, log in and scan with the risk accepted", async ({ page }) => {
  backend.profiles!.search = { running: false, networks: [], checked: 0, total: 0, found: {} };
  await page.goto("/app/profiles?tab=sources");
  const sources = page.getByTestId("profile-sources");
  await sources.getByTestId("import-linkedin").setInputFiles({ name: "Connections.csv", mimeType: "text/csv", buffer: Buffer.from("First Name,Last Name,URL\nDavide,Gallo,https://www.linkedin.com/in/davidegallo") });
  await expect(page.getByRole("status").filter({ hasText: "Read 312." })).toBeVisible();
  await expect(sources.getByTestId("source-linkedin")).toContainText(/312 people · imported/);
  const imported = backend.profileRequests.find((r) => r.route === "/import")!;
  expect(imported.query).toBe("?network=linkedin&file=Connections.csv");
  expect(imported.body).toContain("Davide,Gallo");

  await sources.getByRole("checkbox", { name: "GitHub" }).check();
  await sources.getByRole("button", { name: "Search" }).click();
  expect(backend.profileRequests.find((r) => r.route === "/search")!.body).toEqual({ networks: ["bluesky", "mastodon", "github"] });
  await expect(sources.getByTestId("search-progress")).toContainText("Searching… 0 of 781 contacts");
  backend.profiles!.search = { running: true, networks: ["bluesky", "mastodon"], checked: 312, total: 781, found: { bluesky: 9, mastodon: 3 } };
  await expect(sources.getByTestId("search-progress")).toContainText("Searching… 312 of 781 contacts", { timeout: 6000 });
  await screenshot(page, "70-profiles-sources");

  // The login scan: log in, then scan only once the risk is accepted.
  const scan = page.getByTestId("profile-scan");
  await scan.getByRole("button", { name: "Log in" }).first().click();
  expect(backend.profileRequests.find((r) => r.route === "/scan/login")!.body).toEqual({ network: "facebook" });
  await scan.getByRole("button", { name: "Scan followers" }).click();
  const risk = page.getByTestId("scan-risk");
  await expect(risk).toContainText("Instagram doesn't allow automated access");
  await expect(risk.getByRole("button", { name: "Scan followers" })).toBeDisabled();
  await risk.getByRole("checkbox").check();
  await screenshot(page, "72-profiles-risk", { fullPage: false });
  await risk.getByRole("button", { name: "Scan followers" }).click();
  expect(backend.profileRequests.find((r) => r.route === "/scan/start")!.body).toEqual({ network: "instagram", acceptRisk: true });
  await expect(scan).toContainText("Reading… 0 people");
});

test("sources: when each was last read, and why a scan stopped, to copy (issue #65)", async ({ page }) => {
  backend.profiles!.sources.find((s) => s.network === "bluesky")!.searched = "2026-10-14T16:02:00Z";
  backend.profiles!.search = { running: false, networks: [], checked: 0, total: 0, found: {} };
  backend.profiles!.scans = [
    { network: "instagram", loggedIn: true, read: 486, finishedAt: "2026-10-15T07:40:00Z" },
    { network: "facebook", loggedIn: true, read: 0, finishedAt: "2026-10-15T07:52:00Z", stopped: "error:ERR_ABORTED (-3) loading 'https://www.facebook.com/me/friends'" },
    { network: "linkedin", loggedIn: true, read: 512, finishedAt: "2026-10-15T08:05:00Z", stopped: "limited" },
  ];
  await page.goto("/app/profiles?tab=sources");
  const sources = page.getByTestId("profile-sources");
  await expect(sources.getByTestId("source-instagram")).toContainText(/1,204 people · imported .*2026/);
  await expect(sources.getByTestId("source-linkedin")).toContainText("Not imported yet");
  await expect(sources).toContainText(/9 found · searched .*2026/);
  await expect(sources).toContainText("Not searched yet");
  const facebook = sources.getByTestId("scan-facebook");
  await expect(facebook).toContainText(/Logged in · 0 people read · scanned .*2026/);
  await expect(facebook).toContainText("Stopped: the site's page wasn't what the app expected.");
  await expect(facebook).toContainText("ERR_ABORTED (-3) loading 'https://www.facebook.com/me/friends'");
  await expect(facebook.getByRole("button", { name: "Copy" })).toBeVisible();
  await expect(sources.getByTestId("scan-linkedin")).toContainText("the site started limiting requests");
  await expect(sources.getByTestId("scan-linkedin").getByRole("button", { name: "Copy" })).toHaveCount(0);
  await screenshot(page, "70b-profiles-sources-dates");
});

test("web version: no login scan", async ({ page }) => {
  backend.status.desktop = false;
  backend.profiles!.scans = undefined;
  await page.goto("/app/profiles?tab=sources");
  await expect(page.getByTestId("profile-scan")).toContainText("Available in the desktop app.");
});
