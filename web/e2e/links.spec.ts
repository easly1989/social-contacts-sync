import { test, expect } from "@playwright/test";

import { EventType } from "../../interfaces/api";
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

// Each network is a source of its own (issue #107).
const sourcesSent = () => new URL(backend.requested("/api/init_sync")!.url()).searchParams.get("sources")!.split(",");

test("Sources: linked profiles one row per network, each with its toggle (issue #83)", async ({ page }) => {
  // Settings points to Sync › Sources; the old switch is gone.
  await page.goto("/app/settings/sources");
  const links = page.getByTestId("settings-source-links");
  await expect(links).toContainText("Profile links");
  await expect(links).toContainText("Ready");
  await expect(links.getByRole("list", { name: "Networks read" }).getByRole("listitem")).toHaveText(["X", "YouTube", "Bluesky", "Mastodon", "GitHub"]);
  await expect(links.getByRole("checkbox")).toHaveCount(0);
  await links.scrollIntoViewIfNeeded();
  await screenshot(page, "27-settings-links");
  await links.getByRole("link", { name: "Choose networks" }).click();
  await expect(page).toHaveURL(/\/app\/sync\?step=sources$/);

  // One list: every network a row of its own among the sources (issue #107).
  await expect(page.getByTestId("source-instagram")).toContainText("142 profiles · public preview, unofficial");
  await expect(page.getByTestId("source-bluesky")).toContainText("12 profiles · public, no login");
  // Networks without profiles wait behind Show all (issue #104).
  await expect(page.getByTestId("source-x")).toHaveCount(0);
  await page.getByTestId("networks-show-all").click();
  await expect(page.getByTestId("source-x")).toContainText("No profiles linked");
  await expect(page.getByTestId("source-x").getByRole("checkbox")).toBeDisabled();
  // Before issue #83 the three were off on the web unless turned on in Settings: still off.
  await expect(page.getByRole("checkbox", { name: "Use Instagram" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Use GitHub" })).toBeChecked();
  await screenshot(page, "70b-sync-sources-networks");

  await page.getByRole("checkbox", { name: "Use Instagram" }).check();
  await page.getByRole("checkbox", { name: "Use GitHub" }).uncheck();

  await page.reload();
  await page.getByTestId("wizard-step-run").click();
  await page.getByRole("button", { name: "Start sync" }).click();
  await expect.poll(() => backend.requested("/api/init_sync")).toBeTruthy();
  const query = new URL(backend.requested("/api/init_sync")!.url()).searchParams;
  expect(sourcesSent()).toContain("instagram");
  expect(sourcesSent()).not.toContain("github");
  expect(sourcesSent()).not.toContain("facebook");
  expect(query.get("links_best_effort")).toBeNull();
});

test("Sources: the old Settings switch, turned on, carries over to the three networks (issue #83)", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("scs.links.bestEffort", "true"));
  await page.goto("/app/sync?step=sources");
  for (const name of ["Instagram", "Facebook", "LinkedIn"]) await expect(page.getByRole("checkbox", { name: `Use ${name}` })).toBeChecked();
  await page.getByTestId("wizard-step-run").click();
  await page.getByRole("button", { name: "Start sync" }).click();
  await expect.poll(() => backend.requested("/api/init_sync")).toBeTruthy();
  expect(sourcesSent()).toEqual(expect.arrayContaining(["instagram", "facebook", "linkedin", "github", "bluesky"]));
});

test("Sources, desktop: the three are read with the login and on; WhatsApp and Telegram connect in place (issue #83)", async ({ page }) => {
  Object.assign(backend.status, { desktop: true, setupDone: true, googleConfigured: true, whatsappConnected: false, telegramConnected: false, telegramAvailable: true });
  await page.goto("/app/sync?step=sources");
  await expect(page.getByTestId("source-instagram")).toContainText("142 profiles · read one by one with your login · oldest read");
  await expect(page.getByTestId("source-linkedin")).toContainText("may show as a profile visit");
  await expect(page.getByRole("checkbox", { name: "Use Instagram" })).toBeChecked();
  // Signed in: the state says so; a network without a session offers the sign-in on its row (issue #107).
  await expect(page.getByTestId("state-instagram")).toHaveText("Signed in");
  await expect(page.getByTestId("state-facebook")).toHaveText("Not signed in");
  await expect(page.getByTestId("source-facebook").getByRole("button", { name: "Sign in" })).toBeVisible();
  // A site that closes the session shows at once, said above the list, with Sign in again on its row.
  await expect(page.getByTestId("session-closed")).toHaveCount(0);
  await backend.send(EventType.LoginChanged, { network: "linkedin", loggedIn: false, closedAt: "2026-10-18T09:12:00.000Z" });
  await expect(page.getByTestId("session-closed")).toHaveText("LinkedIn closed the app's session: its profiles aren't read until you sign in again.");
  await expect(page.getByTestId("state-linkedin")).toHaveText("Session closed");
  await expect(page.getByTestId("source-linkedin").getByRole("button", { name: "Sign in again" })).toBeVisible();
  await screenshot(page, "70d-sync-sources-session-closed", { fullPage: false });

  await page.getByRole("button", { name: "Connect WhatsApp" }).click();
  await expect(page.getByTestId("sources-whatsapp-link")).toBeVisible();
  await expect.poll(() => backend.requested("/api/init_whatsapp")).toBeTruthy();
  await page.getByRole("button", { name: "Connect Telegram" }).click();
  const telegram = page.getByTestId("sources-telegram-link");
  await expect(telegram.getByLabel("Phone number")).toBeVisible();
  await screenshot(page, "70c-sync-sources-connect");
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

test("Photos: a photo looked up from a profile link on the card becomes a choice (issue #82)", async ({ page }) => {
  backend.profiles = sampleProfiles();
  const readAt = "2026-10-15T09:00:00.000Z";
  Object.assign(backend.profiles.suggestions[1], { candidates: [], queue: { kind: "photo", photos: [{ id: "photo:gr", source: "gravatar", matchedBy: "elena@example.com", readAt }], addedAt: readAt } });
  await page.goto("/app/sync?step=photos");
  const card = page.getByTestId("profile-card").filter({ hasText: "Elena Conti" });
  await card.getByTestId("card-link").locator("summary").click();
  // Typing the link isn't taken for shortcuts.
  await card.getByLabel("Profile link for Elena Conti").pressSequentially("instagram.com/elena.conti.ph");
  await card.getByRole("button", { name: "Find photo" }).click();
  await expect(card.getByRole("radio", { name: "Instagram · instagram.com/elena.conti.ph" })).toBeChecked();
  await card.scrollIntoViewIfNeeded();
  await screenshot(page, "07b-review-link", { fullPage: false });

  await card.getByRole("button", { name: "Use Instagram" }).click();
  await expect.poll(() => backend.profileRequests.find((r) => r.route === "/link")?.body).toMatchObject({ contactId: "people/ec", link: "token-1", personIds: [] });
  expect(backend.profileRequests.find((r) => r.route === "/link")?.body.photoFrom).toBeUndefined();
});
