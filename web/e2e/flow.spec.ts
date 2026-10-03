import { test, expect } from "@playwright/test";

import { EventType } from "../../interfaces/api";
import { FakeBackend, screenshot } from "./backend";
import { avatars } from "./avatars";

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

test("full flow: WhatsApp QR, Google sign-in, sync setup, progress, done", async ({ page }) => {
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
  await expect(page.getByRole("heading", { name: "Sync photos" })).toBeVisible();
  await page.getByRole("radio", { name: /Replace all photos/ }).check();
  await screenshot(page, "04-sync-setup");

  await page.getByRole("button", { name: "Start sync" }).click();
  await expect(page).toHaveURL(/\/app\/sync\/run\?/);
  await expect.poll(() => backend.requested("/api/init_sync")).toBeTruthy();
  const query = new URL(backend.requested("/api/init_sync")!.url()).searchParams;
  expect(query.get("overwrite_photos")).toBe("true");
  expect(query.get("manual_sync")).toBe("false");
  expect(query.get("sources")).toBe("whatsapp,gravatar");

  await expect(page.getByRole("heading", { name: "Syncing photos…" })).toBeVisible();
  await backend.send(EventType.SyncProgress, { progress: 0, syncCount: 0, totalContacts: 20, checked: 0, counters: counters({}) });
  const names = ["Giulia Bianchi", "Marco Rossi", "Sofia Esposito", "Luca Romano", "Chiara Colombo", "Alessandro Ricci", "Martina Marino", "Francesco Greco"];
  for (let i = 0; i < names.length; i++) {
    await backend.send(EventType.SyncProgress, {
      progress: ((i + 1) / 20) * 100,
      syncCount: i + 1,
      totalContacts: 20,
      checked: i + 1,
      counters: counters({ added: i, replaced: 1, noMatch: 2, errors: i > 5 ? 1 : 0 }),
      image: avatars[i],
      latest: { name: names[i], source: i % 4 === 3 ? "gravatar" : "whatsapp" },
    });
  }
  await expect(page.getByText("Checked 8 of 20 contacts")).toBeVisible();
  await expect(page.getByTestId("count-added")).toContainText("7");
  await expect(page.getByTestId("count-replaced")).toContainText("1");
  await expect(page.getByTestId("count-errors")).toContainText("1");
  const justAdded = page.getByRole("list", { name: "Just added" });
  await expect(justAdded.getByRole("listitem")).toHaveCount(8);
  await expect(justAdded.getByRole("listitem").first()).toContainText("Francesco Greco");
  await screenshot(page, "05-sync-progress");

  await backend.send(EventType.SyncProgress, {
    progress: 100,
    syncCount: 12,
    totalContacts: 20,
    checked: 20,
    counters: counters({ added: 11, replaced: 1, noMatch: 7, errors: 1 }),
    runId: "run-1",
  });
  await expect(page.getByRole("heading", { name: "Sync complete" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("12 photos added");
  await expect(page.getByRole("link", { name: "Open the report" })).toHaveAttribute("href", "/app/history/run-1");
  await screenshot(page, "06-sync-complete");
});

test("review mode offers every source's photo and sends the choice", async ({ page }) => {
  backend.status.whatsappConnected = true;
  backend.status.googleConnected = true;
  await page.goto("/app/sync/run?mode=review&sources=whatsapp,gravatar");
  await expect.poll(() => backend.requested("/api/init_sync")).toBeTruthy();
  expect(new URL(backend.requested("/api/init_sync")!.url()).searchParams.get("manual_sync")).toBe("true");

  await backend.send(EventType.SyncProgress, { progress: 0, syncCount: 0, totalContacts: 3, checked: 0, counters: counters({}), isManualSync: true });
  await backend.send(EventType.SyncConfirm, {
    existingPhoto: avatars[0],
    newPhoto: avatars[5],
    contactName: "Ada Lovelace",
    candidates: [
      { photo: avatars[5], source: "whatsapp", matchedBy: "+391" },
      { photo: avatars[7], source: "gravatar", matchedBy: "ada@example.com" },
    ],
  });
  const review = page.getByTestId("review");
  await expect(review).toContainText("Ada Lovelace");
  await expect(review.getByRole("radio")).toHaveCount(2);
  await page.keyboard.press("2");
  await expect(review.getByRole("radio").nth(1)).toHaveAttribute("aria-checked", "true");
  await screenshot(page, "07-review");

  await page.keyboard.press("Enter");
  await expect(page.getByText("Loading the next contact…")).toBeVisible();
  await expect
    .poll(() => backend.received.find((e) => e.type === EventType.SyncPhotoConfirm))
    .toEqual({ type: EventType.SyncPhotoConfirm, data: { accept: true, choice: 1 } });
});

test("review mode: keep the current photo from the keyboard", async ({ page }) => {
  backend.status.googleConnected = true;
  await page.goto("/app/sync/run?mode=review");
  await expect.poll(() => backend.requested("/api/init_sync")).toBeTruthy();
  await backend.send(EventType.SyncConfirm, {
    existingPhoto: null,
    newPhoto: avatars[1],
    contactName: "Grace Hopper",
    candidates: [{ photo: avatars[1], source: "whatsapp", matchedBy: "+1" }],
  });
  await expect(page.getByTestId("review")).toContainText("Grace Hopper");
  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(() => backend.received.find((e) => e.type === EventType.SyncPhotoConfirm))
    .toEqual({ type: EventType.SyncPhotoConfirm, data: { accept: false, choice: 0 } });
});

test("a running sync can be stopped", async ({ page }) => {
  backend.status.googleConnected = true;
  await page.goto("/app/sync/run?mode=fill&sources=gravatar");
  await expect.poll(() => backend.requested("/api/init_sync")).toBeTruthy();
  await page.getByRole("button", { name: "Stop" }).click();
  await expect.poll(() => backend.requested("/api/sync/stop")?.method()).toBe("POST");
  await backend.send(EventType.SyncProgress, { progress: 100, syncCount: 0, checked: 2, totalContacts: 10, counters: counters({ noMatch: 2 }), runId: "run-2", cancelled: true });
  await expect(page.getByRole("heading", { name: "Sync stopped" })).toBeVisible();
});

test("sync errors are shown to the user", async ({ page }) => {
  backend.status.whatsappConnected = true;
  backend.status.googleConnected = true;
  await page.goto("/app/sync/run?mode=fill");
  await expect.poll(() => backend.requested("/api/init_sync")).toBeTruthy();
  await backend.send(EventType.SyncProgress, { progress: 0, syncCount: 0, error: "Failed to load contacts, please try again." });
  await expect(page.getByRole("alert")).toHaveText("Failed to load contacts, please try again.");
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
    await expect(page).toHaveURL(/\/app\/sync\/run\?mode=review&sources=whatsapp$/);
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
