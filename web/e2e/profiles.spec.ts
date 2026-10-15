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

test("review: one contact at a time, link with photo, none of these, skip, keyboard", async ({ page }) => {
  await page.goto("/app");
  await page.getByRole("navigation", { name: "Main navigation" }).first().getByRole("link", { name: "Find profiles" }).click();
  await expect(page.getByRole("tab", { name: "To review (2)" })).toHaveAttribute("aria-selected", "true");
  const review = page.getByTestId("profile-review");
  await expect(review.getByRole("heading", { name: "Davide Gallo" })).toBeVisible();
  await expect(review.getByRole("radio")).toHaveCount(4);
  await expect(review.getByRole("radio").first()).toBeChecked();
  await expect(review).toContainText("Follows you · same name");
  await expect(review).toContainText("Connection · same name · Gallo Ceramiche");
  await expect(review.getByRole("checkbox")).toBeChecked(); // the contact has no photo
  await screenshot(page, "71-profiles-review");

  // The arrow keys pick another profile; Enter links it.
  await page.keyboard.press("ArrowDown");
  await expect(review.getByRole("radio").nth(1)).toBeChecked();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("Linked to Davide Gallo.");
  expect(backend.profileRequests.find((r) => r.route === "/link")!.body).toEqual({ contactId: "people/dg", personId: "linkedin:davidegallo", usePhoto: true });

  // Next: Elena, with a placeholder photo; "None of these".
  await expect(review.getByRole("heading", { name: "Elena Conti" })).toBeVisible();
  await expect(review.getByRole("checkbox")).toBeChecked();
  await review.getByRole("button", { name: /None of these/ }).click();
  expect(backend.profileRequests.find((r) => r.route === "/reject")!.body).toEqual({ contactId: "people/ec", personIds: ["instagram:elena_conti"] });
  await expect(page.getByText("No suggestions left.")).toBeVisible();

  // Linked, with undo.
  await page.getByRole("tab", { name: "Linked (1)" }).click();
  const linked = page.getByTestId("profiles-linked");
  await expect(linked).toContainText("linkedin.com/in/davidegallo");
  await linked.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("status")).toContainText("Link removed from Davide Gallo.");
  await expect(linked).toContainText("Undone");
});

test("sources: import an export, run the public search, log in and scan with the risk accepted", async ({ page }) => {
  backend.profiles!.search = { running: false, networks: [], checked: 0, total: 0, found: {} };
  await page.goto("/app/profiles?tab=sources");
  const sources = page.getByTestId("profile-sources");
  await sources.getByTestId("import-linkedin").setInputFiles({ name: "Connections.csv", mimeType: "text/csv", buffer: Buffer.from("First Name,Last Name,URL\nDavide,Gallo,https://www.linkedin.com/in/davidegallo") });
  await expect(sources).toContainText("Read 312.");
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

test("web version: no login scan", async ({ page }) => {
  backend.status.desktop = false;
  backend.profiles!.scans = undefined;
  await page.goto("/app/profiles?tab=sources");
  await expect(page.getByTestId("profile-scan")).toContainText("Available in the desktop app.");
});
