import { test, expect } from "@playwright/test";

import { FakeBackend, screenshot } from "./backend";
import { sampleProfiles, sampleRun } from "./fixtures";

// Profile links (issue #51), with the backend mocked.
let backend: FakeBackend;

test.beforeEach(async ({ page }) => {
  backend = new FakeBackend(page);
  Object.assign(backend.status, { whatsappConnected: true, googleConnected: true, telegramConnected: true });
  backend.runs = [sampleRun()];
  await backend.install();
});

test("settings: profile links are ready, and the unofficial networks are opt-in", async ({ page }) => {
  await page.goto("/app/settings/sources");
  const links = page.getByTestId("settings-source-links");
  await expect(links).toContainText("Profile links");
  await expect(links).toContainText("Ready");
  await expect(links.getByRole("list", { name: "Networks read" }).getByRole("listitem")).toHaveText(["X", "Telegram", "YouTube", "Bluesky", "Mastodon", "GitHub"]);
  const optIn = links.getByRole("checkbox", { name: /Also try Instagram, Facebook and LinkedIn/ });
  await expect(optIn).not.toBeChecked();
  await links.scrollIntoViewIfNeeded();
  await screenshot(page, "27-settings-links");

  await optIn.check();
  await page.reload();
  await expect(page.getByTestId("settings-source-links").getByRole("checkbox", { name: /Also try/ })).toBeChecked();
  await page.emulateMedia({ colorScheme: "dark" });
  await screenshot(page, "28-settings-links-dark");

  // The sync sends the choice.
  await page.goto("/app/sync?tab=sources");
  await expect(page.getByTestId("source-links")).toContainText("Uses the profile links saved on your Google contacts");
  await page.getByRole("tab", { name: "Run" }).click();
  await page.getByRole("button", { name: "Start sync" }).click();
  await expect.poll(() => backend.requested("/api/init_sync")).toBeTruthy();
  const query = new URL(backend.requested("/api/init_sync")!.url()).searchParams;
  expect(query.get("sources")).toContain("links");
  expect(query.get("links_best_effort")).toBe("true");
});

test("desktop: Find photo says when the app isn't signed in, and sends the LinkedIn setting (issue #80)", async ({ page }) => {
  Object.assign(backend.status, { desktop: true, setupDone: true, googleConfigured: true });
  const run = backend.runs[0];
  backend.linkFailures["https://www.facebook.com/francesco.greco"] = { status: 409, json: { error: "login_needed", network: "Facebook" } };
  backend.linkFailures["https://www.linkedin.com/in/francesco"] = { status: 409, json: { error: "linkedin_off", network: "LinkedIn" } };
  await page.goto(`/app/history/${run.id}`);
  await page.getByRole("tab", { name: "No photo found (2)" }).click();
  await page.getByRole("row", { name: /Francesco Greco/ }).getByRole("button", { name: "Add profile link" }).click();
  const field = page.getByLabel("Profile link for Francesco Greco");

  await field.fill("https://www.facebook.com/francesco.greco");
  await page.getByRole("button", { name: "Find photo" }).click();
  await expect(page.getByRole("alert")).toHaveText("The app isn't signed in to Facebook. Sign in from Sync › Sources, then try again.");
  await screenshot(page, "26e-report-login-needed", { fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("alert").scrollIntoViewIfNeeded();
  await screenshot(page, "26g-report-login-needed-phone", { fullPage: false });
  await page.setViewportSize({ width: 1280, height: 800 });
  await field.fill("https://www.linkedin.com/in/francesco");
  await page.getByRole("button", { name: "Find photo" }).click();
  await expect(page.getByRole("alert")).toHaveText("Reading LinkedIn profiles is turned off in Settings, Sources.");
  const sent = backend.requests.filter((r) => new URL(r.url()).pathname === "/api/links/lookup").map((r) => r.postDataJSON());
  expect(sent).toEqual([
    { url: "https://www.facebook.com/francesco.greco", linkedin: true },
    { url: "https://www.linkedin.com/in/francesco", linkedin: true },
  ]);
});

test("report: add a profile link to a contact without a photo", async ({ page }) => {
  const run = backend.runs[0];
  backend.linkFailures["https://example.com/francesco"] = { status: 400, json: { error: "unsupported_link" } };
  backend.linkFailures["https://www.linkedin.com/in/francesco"] = { status: 409, json: { error: "signin_required", network: "LinkedIn" } };
  await page.goto(`/app/history/${run.id}`);
  await page.getByRole("tab", { name: "No photo found (2)" }).click();
  await expect(page.getByText("Know where one of them is online?")).toBeVisible();

  const row = page.getByRole("row", { name: /Francesco Greco/ });
  await row.getByRole("button", { name: "Add profile link" }).click();
  const field = page.getByLabel("Profile link for Francesco Greco");
  await expect(field).toBeFocused();

  await field.fill("https://example.com/francesco");
  await page.getByRole("button", { name: "Find photo" }).click();
  await expect(page.getByRole("alert")).toContainText("That isn't a profile link the app can read.");
  await field.fill("https://www.linkedin.com/in/francesco");
  await page.getByRole("button", { name: "Find photo" }).click();
  await expect(page.getByRole("alert")).toHaveText("LinkedIn asked to sign in or is limiting requests. Try again later.");
  await screenshot(page, "26f-report-signin-required", { fullPage: false });

  await field.fill("https://www.instagram.com/elena.conti.ph/");
  await page.getByRole("button", { name: "Find photo" }).click();
  await expect(page.getByText("Found on Instagram")).toBeVisible();
  await screenshot(page, "26-report-add-link");

  await page.getByRole("button", { name: "Save link and photo" }).click();
  await expect(page.getByRole("tab", { name: "No photo found (1)" })).toBeVisible();
  expect(backend.linkRequests.at(-1)).toEqual({ route: "save", body: { index: 7, token: "token-3" } });
  await expect(page.getByRole("row", { name: /Francesco Greco/ })).toHaveCount(0);
  await page.getByRole("tab", { name: "Changed (8)" }).click();
  const saved = page.getByRole("row", { name: /Francesco Greco/ });
  await expect(saved).toContainText("instagram.com/elena.conti.ph");
  await expect(saved).toContainText("Profile links");
  await expect(saved.getByRole("button", { name: "Undo" })).toBeVisible();
});

test("report on a phone: the table fits, and so does adding a link", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  backend.linkFailures["https://www.linkedin.com/in/francesco"] = { status: 409, json: { error: "signin_required", network: "LinkedIn" } };
  await page.goto(`/app/history/${backend.runs[0].id}`);
  const table = page.getByRole("table");
  await table.scrollIntoViewIfNeeded();
  await screenshot(page, "29-report-phone", { fullPage: false });
  // What is wider than its box: nothing.
  const fits = () =>
    page.evaluate(() => [
      ...[...document.querySelectorAll("table")].filter((t) => t.parentElement!.scrollWidth > t.parentElement!.clientWidth).map((t) => `table ${t.parentElement!.scrollWidth}/${t.parentElement!.clientWidth}`),
      ...(document.documentElement.scrollWidth > window.innerWidth ? [`page ${document.documentElement.scrollWidth}`] : []),
    ]);

  // Where the photo came from, under the name.
  await expect(page.getByRole("row", { name: /Sofia Esposito/ })).toContainText("sofia@example.com");
  expect(await fits()).toEqual([]);

  await page.getByRole("tab", { name: "No photo found (2)" }).click();
  expect(await fits()).toEqual([]);
  await page.getByRole("row", { name: /Francesco Greco/ }).getByRole("button", { name: "Add profile link" }).click();
  await page.getByLabel("Profile link for Francesco Greco").fill("https://www.linkedin.com/in/francesco");
  await page.getByRole("button", { name: "Find photo" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("alert").evaluate((e) => e.scrollIntoView({ block: "center" }));
  await screenshot(page, "29b-report-link-phone", { fullPage: false });
  const button = await page.getByRole("button", { name: "Find photo" }).boundingBox();
  expect(button!.x + button!.width).toBeLessThanOrEqual(390);
  expect(await fits()).toEqual([]);
});

test("To review: a photo looked up from a profile link on the card becomes a choice (issue #82)", async ({ page }) => {
  backend.profiles = sampleProfiles();
  await page.goto("/app/sync?tab=review");
  const card = page.getByTestId("profile-card").filter({ hasText: "Elena Conti" });
  await card.getByTestId("card-link").locator("summary").click();
  // Typing the link isn't taken for shortcuts.
  await card.getByLabel("Profile link for Elena Conti").pressSequentially("instagram.com/elena.conti.ph");
  await card.getByRole("button", { name: "Find photo" }).click();
  await expect(card.getByRole("radio", { name: "Instagram · instagram.com/elena.conti.ph" })).toBeChecked();
  await card.scrollIntoViewIfNeeded();
  await screenshot(page, "07b-review-link", { fullPage: false });

  await card.getByRole("button", { name: /^Confirm/ }).click();
  await expect.poll(() => backend.profileRequests.find((r) => r.route === "/link")?.body).toMatchObject({ contactId: "people/ec", link: "token-1", personIds: ["instagram:elena_conti"] });
  expect(backend.profileRequests.find((r) => r.route === "/link")?.body.photoFrom).toBeUndefined();
});
