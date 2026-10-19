import { test, expect, Page } from "@playwright/test";

import { EventType } from "../../interfaces/api";
import { FakeBackend, screenshot } from "./backend";
import { avatars } from "./avatars";
import { sampleProfiles } from "./fixtures";

let backend: FakeBackend;

test.beforeEach(async ({ page }) => {
  backend = new FakeBackend(page);
  await backend.install();
});

const counters = (c: Partial<Record<string, number>>) => ({ added: 0, replaced: 0, kept: 0, alreadyHadPhoto: 0, noMatch: 0, errors: 0, ...c });

test("home page introduces the app and enables Get started once connected", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Social Contacts Sync");
  await expect(page.getByRole("heading", { name: "Give every contact a face." })).toBeVisible();
  // The original project keeps its credit.
  await expect(page.getByRole("link", { name: "WhatsApp Contact Sync" })).toHaveAttribute(
    "href",
    "https://github.com/guyzyl/whatsapp-contact-sync"
  );
  const start = page.getByRole("link", { name: "Get started" });
  await expect(start).not.toHaveClass(/btn-disabled/);
  await screenshot(page, "01-home");
});

test("home page offers Continue for a session already in progress", async ({ page }) => {
  backend.status.whatsappConnected = true;
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Continue" })).toBeVisible();
});

test("full flow: WhatsApp QR, Google sign-in, sync options, progress, done", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Get started" }).click();

  // Payments are off, so /contribute forwards straight to WhatsApp.
  await expect(page).toHaveURL(/\/whatsapp$/);
  await expect(page.getByRole("heading", { name: "Link WhatsApp" })).toBeVisible();
  await expect.poll(() => backend.requested("/api/init_whatsapp")).toBeTruthy();

  await backend.send(EventType.WhatsAppQR, "2@fake-qr-payload,for-the-e2e-tests");
  await expect(page.locator("canvas")).toBeVisible();
  await screenshot(page, "02-whatsapp-qr");

  await backend.send(EventType.WhatsAppConnecting);
  await expect(page.getByText("Linking WhatsApp…")).toBeVisible();

  backend.status.whatsappConnected = true;
  await backend.send(EventType.Redirect, "/gauth");
  await expect(page.getByRole("heading", { name: "Sign in to Google Contacts" })).toBeVisible();
  await screenshot(page, "03-google-auth");

  // Google's callback returns to /options, which is now the app's sync page.
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await expect(page).toHaveURL(/\/app\/sync$/);
  // The first step is Sources; Next leads through Profiles to the sync.
  await expect(page.getByTestId("wizard-step-sources")).toHaveAttribute("aria-current", "step");
  await page.getByTestId("wizard-next").click();
  await page.getByTestId("wizard-next").click();
  await expect(page.getByTestId("wizard-step-run")).toHaveAttribute("aria-current", "step");
  // Options, not modes (issue #82): three on, "I decide every contact" off; the last two wait under Advanced (issue #107).
  const options = page.getByTestId("run-options");
  await options.getByTestId("run-advanced").locator("summary").click();
  await expect(options.getByRole("checkbox", { name: /Fill in missing photos/ })).toBeChecked();
  await expect(options.getByRole("checkbox", { name: /Update pinned photos/ })).toBeChecked();
  await expect(options.getByRole("checkbox", { name: /Look for different photos/ })).toBeChecked();
  await expect(options.getByRole("checkbox", { name: /I decide every contact/ })).not.toBeChecked();
  await options.getByRole("checkbox", { name: /Look for different photos/ }).uncheck();
  await expect(page.getByTestId("run-summary")).toContainText("Without a photo");
  await screenshot(page, "04-sync-setup");

  await page.getByRole("button", { name: "Start sync" }).click();
  await expect.poll(() => backend.requested("/api/init_sync")).toBeTruthy();
  const query = new URL(backend.requested("/api/init_sync")!.url()).searchParams;
  expect(Object.fromEntries(["fill_missing", "update_pinned", "look_different", "decide_all"].map((k) => [k, query.get(k)]))).toEqual({
    fill_missing: "true",
    update_pinned: "true",
    look_different: "false",
    decide_all: "false",
  });
  // Each network with linked profiles is a source of its own; Instagram, Facebook and LinkedIn stay off on the web unless turned on.
  expect(query.get("sources")).toBe("whatsapp,gravatar,bluesky,github");
  expect(query.get("link_networks")).toBeNull();

  await expect(page.getByRole("heading", { name: "Syncing photos…" })).toBeVisible();
  await backend.send(EventType.SyncProgress, { progress: 0, syncCount: 0, totalContacts: 20, checked: 0, phase: "photos", counters: counters({}) });
  const names = ["Giulia Bianchi", "Marco Rossi", "Sofia Esposito", "Luca Romano", "Chiara Colombo", "Alessandro Ricci", "Martina Marino", "Francesco Greco"];
  for (let i = 0; i < names.length; i++) {
    await backend.send(EventType.SyncProgress, {
      progress: ((i + 1) / 20) * 100,
      syncCount: i + 1,
      totalContacts: 20,
      checked: i + 1,
      phase: "photos",
      counters: counters({ added: i, replaced: 1, queued: 3, noMatch: 2, errors: i > 5 ? 1 : 0 }),
      image: avatars[i],
      latest: { name: names[i], source: i % 4 === 3 ? "gravatar" : "whatsapp", pinned: i === 7 },
    });
  }
  await expect(page.getByText("Checked 8 of 20 contacts")).toBeVisible();
  await expect(page.getByTestId("count-applied")).toContainText("8");
  await expect(page.getByTestId("count-queued")).toContainText("3");
  await expect(page.getByTestId("count-errors")).toContainText("1");
  // The stepper says how far the sync is, from any step.
  await expect(page.getByTestId("wizard-step-run")).toContainText("40%");
  const justApplied = page.getByRole("list", { name: "Just applied" });
  await expect(justApplied.getByRole("listitem")).toHaveCount(8);
  await expect(justApplied.getByRole("listitem").first()).toContainText("Francesco Greco");
  await expect(justApplied.getByRole("listitem").first()).toContainText("updated");
  await screenshot(page, "05-sync-progress");

  await backend.send(EventType.SyncProgress, {
    progress: 100,
    syncCount: 12,
    totalContacts: 20,
    checked: 20,
    counters: counters({ added: 11, replaced: 1, queued: 3, noMatch: 7, errors: 1 }),
    runId: "run-1",
  });
  await expect(page.getByRole("heading", { name: "Sync complete" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("12 applied, 3 to review, 7 without a photo, 1 errors.");
  await expect(page.getByRole("link", { name: "Open the report" })).toHaveAttribute("href", "/app/history/run-1");
  await screenshot(page, "06-sync-complete");

  // Start reviewing opens Photos; New sync goes back to the options.
  await page.getByRole("button", { name: "Review 3 contacts" }).click();
  await expect(page).toHaveURL(/step=photos$/);
  await page.getByTestId("wizard-step-run").click();
  await page.getByRole("button", { name: "New sync" }).click();
  await expect(page.getByRole("button", { name: "Start sync" })).toBeVisible();
});

test("desktop: a sync with no news for a minute offers to restart the server", async ({ page }) => {
  Object.assign(backend.status, { whatsappConnected: true, googleConnected: true, desktop: true, setupDone: true, googleConfigured: true });
  await page.clock.install();
  await startSync(page);
  await backend.send(EventType.SyncProgress, { progress: 25, syncCount: 0, totalContacts: 839, checked: 215, phase: "photos", counters: counters({ queued: 126, noMatch: 46 }) });
  await expect(page.getByText("Checked 215 of 839 contacts")).toBeVisible();
  await expect(page.getByTestId("run-restart")).toBeHidden();
  await page.clock.fastForward(65_000);
  await expect(page.getByRole("alert")).toContainText("The sync hasn't sent any news for over a minute.");
  await screenshot(page, "05c-sync-stuck");
  await page.getByTestId("run-restart").click();
  await expect.poll(() => backend.desktopActions.map((a) => a.route)).toEqual(["restart"]);
});

const startSync = async (page: Page) => {
  await page.goto("/app/sync?step=run");
  await page.getByRole("button", { name: "Start sync" }).click();
  await expect.poll(() => backend.requested("/api/init_sync")).toBeTruthy();
};

test("I decide every contact applies nothing: the options that apply photos turn off (issue #82)", async ({ page }) => {
  Object.assign(backend.status, { whatsappConnected: true, googleConnected: true });
  await page.goto("/app/sync?step=run");
  const options = page.getByTestId("run-options");
  await options.getByTestId("run-advanced").locator("summary").click();
  await options.getByRole("checkbox", { name: /I decide every contact/ }).check();
  await expect(options.getByRole("checkbox", { name: /Fill in missing photos/ })).toBeDisabled();
  await expect(options.getByRole("checkbox", { name: /Update pinned photos/ })).toBeDisabled();
  await expect(options.getByRole("checkbox", { name: /Look for different photos/ })).toBeEnabled();
  await page.getByRole("button", { name: "Start sync" }).click();
  await expect.poll(() => backend.requested("/api/init_sync")).toBeTruthy();
  expect(new URL(backend.requested("/api/init_sync")!.url()).searchParams.get("decide_all")).toBe("true");
});

test("a sync reads pinned profiles first, then the photos, and goes on while you move around the app (issue #82)", async ({ page }) => {
  Object.assign(backend.status, { whatsappConnected: true, googleConnected: true });
  await startSync(page);
  await backend.send(EventType.SyncProgress, { progress: 0, syncCount: 0, phase: "profiles", reads: { instagram: { read: 1, total: 4 }, facebook: { read: 2, total: 2, stopped: "limited", answer: "HTTP 429: Please wait a few minutes before you try again." } } });
  const profiles = page.getByTestId("phase-profiles");
  await expect(profiles).toContainText("Instagram");
  await expect(profiles).toContainText("1 of 4");
  await expect(profiles).toContainText("Facebook asked to slow down");
  await expect(page.getByTestId("reads-answer")).toHaveText("Facebook answered: HTTP 429: Please wait a few minutes before you try again.");
  await screenshot(page, "05b-sync-phases");

  const nav = page.getByRole("navigation").first();
  await nav.getByRole("link", { name: "History" }).click();
  await expect(page).toHaveURL(/\/app\/history$/);
  // While it runs, Sync opens on the sync (issue #107).
  await nav.getByRole("link", { name: /^Sync/ }).click();
  await expect(page.getByTestId("wizard-step-run")).toHaveAttribute("aria-current", "step");
  await backend.send(EventType.SyncProgress, { progress: 50, syncCount: 2, totalContacts: 4, checked: 2, phase: "photos", counters: counters({ added: 1, queued: 1 }) });
  await expect(page.getByText("Checked 2 of 4 contacts")).toBeVisible();
  await expect(page.getByTestId("count-queued")).toContainText("1");
  await expect(page.getByTestId("phase-profiles")).toContainText("1 of 4");
  expect(backend.count("/api/init_sync")).toBe(1);
});

test("a running sync can be stopped", async ({ page }) => {
  backend.status.googleConnected = true;
  await startSync(page);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect.poll(() => backend.requested("/api/sync/stop")?.method()).toBe("POST");
  await backend.send(EventType.SyncProgress, { progress: 100, syncCount: 0, checked: 2, totalContacts: 10, counters: counters({ noMatch: 2 }), runId: "run-2", cancelled: true });
  await expect(page.getByRole("heading", { name: "Sync stopped" })).toBeVisible();
});

test("sync errors are shown to the user", async ({ page }) => {
  Object.assign(backend.status, { whatsappConnected: true, googleConnected: true });
  await startSync(page);
  await backend.send(EventType.SyncProgress, { progress: 0, syncCount: 0, error: "Failed to load contacts, please try again." });
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("Failed to load contacts, please try again.");
  await expect(page.getByRole("heading", { name: "Sync didn't finish" })).toBeVisible();
  // The sync is over: no Stop, and Back starts again (issue #107).
  await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0);
  await screenshot(page, "05d-sync-failed");
  await alert.getByRole("button", { name: "Back to the start" }).click();
  await expect(page.getByRole("button", { name: "Start sync" })).toBeVisible();
});

test("a source that stops working is left out: the sync goes on, says so, and Summary runs it again on its own (issue #107)", async ({ page }) => {
  Object.assign(backend.status, { whatsappConnected: true, googleConnected: true });
  await startSync(page);
  const issues = [{ source: "whatsapp", reason: "error", message: "Execution context was destroyed", checked: 5 }];
  await backend.send(EventType.SyncProgress, { progress: 50, syncCount: 2, totalContacts: 10, checked: 5, phase: "photos", counters: counters({ added: 2 }), issues });
  const issue = page.getByTestId("run-issue");
  await expect(issue).toContainText("WhatsApp stopped working after 5 contacts: the sync goes on without it.");
  await expect(issue).toContainText("Execution context was destroyed");
  await expect(issue.getByRole("button", { name: "Reconnect WhatsApp" })).toBeVisible();
  await screenshot(page, "05e-sync-issue");
  await backend.send(EventType.SyncProgress, { progress: 100, syncCount: 4, totalContacts: 10, checked: 10, counters: counters({ added: 4, noMatch: 6 }), runId: "run-3", issues });
  await expect(page.getByRole("heading", { name: "Sync complete" })).toBeVisible();

  await page.getByTestId("wizard-step-summary").click();
  const unfinished = page.getByTestId("summary-unfinished");
  await expect(unfinished).toContainText("1 thing didn't finish");
  await expect(unfinished).toContainText("WhatsApp stopped: 5 contacts not checked");
  await expect(page.getByTestId("sync-summary")).toContainText("4");
  await screenshot(page, "06b-sync-summary");
  await unfinished.getByRole("button", { name: "Run with only WhatsApp" }).click();
  await expect(page).toHaveURL(/step=run$/);
  await expect.poll(() => backend.count("/api/init_sync")).toBe(2);
  const last = backend.requests.filter((r) => new URL(r.url()).pathname === "/api/init_sync").at(-1)!;
  expect(new URL(last.url()).searchParams.get("sources")).toBe("whatsapp");
});

test("desktop: a site that closes the session during a sync offers Sign in again and Skip on its row (issue #107)", async ({ page }) => {
  Object.assign(backend.status, { whatsappConnected: true, googleConnected: true, desktop: true, setupDone: true, googleConfigured: true });
  backend.profiles = sampleProfiles();
  await startSync(page);
  await backend.send(EventType.SyncProgress, { progress: 0, syncCount: 0, phase: "profiles", reads: { linkedin: { read: 3, total: 10, stopped: "signedOut" } } });
  const profiles = page.getByTestId("phase-profiles");
  await expect(profiles).toContainText("LinkedIn closed the app's session during the sync: sign in again to read the rest.");
  await screenshot(page, "05f-sync-signed-out", { fullPage: false });
  await profiles.getByTestId("reads-sign-in").click();
  await expect.poll(() => backend.profileRequests.find((r) => r.route === "/scan/login")?.body).toEqual({ network: "linkedin" });
  await profiles.getByRole("button", { name: "Skip LinkedIn" }).click();
  await expect.poll(() => backend.requested("/api/sync/skip")?.postDataJSON()).toEqual({ network: "linkedin" });
});

test.describe("route guards", () => {
  test("Google needs a connected WhatsApp, the app needs Google", async ({ page }) => {
    for (const path of ["/gauth", "/app", "/app/sync", "/options"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/$/);
    }
    backend.status.whatsappConnected = true;
    await page.goto("/app/history");
    await expect(page).toHaveURL(/\/gauth$/);
  });

  test("a connected WhatsApp skips the QR page", async ({ page }) => {
    backend.status.whatsappConnected = true;
    await page.goto("/whatsapp");
    await expect(page).toHaveURL(/\/gauth$/);
  });

  test("old links lead to the app", async ({ page }) => {
    Object.assign(backend.status, { whatsappConnected: true, googleConnected: true });
    await page.goto("/options");
    await expect(page).toHaveURL(/\/app\/sync$/);
    await page.goto("/sync?manual_sync=true&overwrite_photos=false");
    await expect(page).toHaveURL(/\/app\/sync\?step=run$/);
    await page.goto("/app/sync/run?mode=review");
    await expect(page).toHaveURL(/\/app\/sync\?step=run$/);
    await expect(page.getByRole("button", { name: "Start sync" })).toBeVisible();
  });

  test("when payments are enforced, unpaid sessions see the contribute page", async ({ page }) => {
    backend.status.enforcePayments = true;
    backend.status.purchased = false;
    await page.goto("/whatsapp");
    await expect(page).toHaveURL(/\/contribute$/);
    await expect(page.getByRole("heading", { name: "Support the project" })).toBeVisible();
    await screenshot(page, "08-contribute");
  });
});

test.describe("preferences", () => {
  test("switching to Italian translates the app and is remembered", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Preferences" }).click();
    await page.getByRole("button", { name: "Italiano" }).click();
    await expect(page.getByRole("heading", { name: "Dai un volto a ogni contatto." })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "it");
    await page.reload();
    await expect(page.getByRole("link", { name: "Inizia" })).toBeVisible();
    await screenshot(page, "09-home-italian");
  });

  test("an Italian browser gets Italian by default", async ({ browser }) => {
    const context = await browser.newContext({ locale: "it-IT" });
    const page = await context.newPage();
    const italianBackend = new FakeBackend(page);
    await italianBackend.install();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dai un volto a ogni contatto." })).toBeVisible();
    await context.close();
  });

  test("dark theme follows the system and can be forced", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "scs-dark");
    await screenshot(page, "10-home-dark");
    await page.getByRole("button", { name: "Preferences" }).click();
    await page.getByRole("button", { name: "Light" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "scs-light");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "scs-light");
  });
});
