import { test, expect } from "@playwright/test";

import { EventType } from "../../interfaces/api";
import { FakeBackend, screenshot } from "./backend";
import { avatars } from "./avatars";

let backend: FakeBackend;

test.beforeEach(async ({ page }) => {
  backend = new FakeBackend(page);
  await backend.install();
});

test("home page introduces the app and enables Get Started once connected", async ({ page }) => {
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

test("full sync: WhatsApp QR, Google sign-in, options, progress", async ({ page }) => {
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

  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await expect(page).toHaveURL(/\/options$/);
  await expect(page.getByRole("heading", { name: "What should change?" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Fill in missing photos/ })).toBeChecked();
  await page.getByRole("radio", { name: /Replace all photos/ }).check();
  await screenshot(page, "04-options");

  await page.getByRole("button", { name: "Start sync" }).click();
  await expect(page).toHaveURL(/\/sync\?/);
  await expect.poll(() => backend.requested("/api/init_sync")).toBeTruthy();
  const query = new URL(backend.requested("/api/init_sync")!.url()).searchParams;
  expect(query.get("overwrite_photos")).toBe("true");
  expect(query.get("manual_sync")).toBe("false");

  await expect(page.getByRole("heading", { name: "Syncing photos…" })).toBeVisible();
  await backend.send(EventType.SyncProgress, { progress: 0, syncCount: 0, isManualSync: false });
  for (let i = 0; i < avatars.length; i++) {
    await backend.send(EventType.SyncProgress, {
      progress: ((i + 1) / 20) * 100,
      syncCount: i + 1,
      totalContacts: 20,
      image: avatars[i],
      isManualSync: false,
    });
  }
  await expect(page.getByRole("list", { name: "Just added" }).locator("img")).toHaveCount(9);
  await expect(page.getByTestId("photos-added")).toHaveText("12");
  await expect(page.getByText("+3")).toBeVisible();
  await screenshot(page, "05-sync-progress");

  await backend.send(EventType.SyncProgress, { progress: 100, syncCount: 12 });
  await expect(page.getByRole("heading", { name: "Sync complete" })).toBeVisible();
  await expect(page.locator("progress")).toBeHidden();
  await screenshot(page, "06-sync-complete");
});

test("manual sync asks which photo to keep and sends the answer", async ({ page }) => {
  backend.status.whatsappConnected = true;
  backend.status.googleConnected = true;
  await page.goto("/sync?manual_sync=true&overwrite_photos=false");
  // The real server only starts sending events once the sync is requested.
  await expect.poll(() => backend.requested("/api/init_sync")).toBeTruthy();

  await backend.send(EventType.SyncProgress, { progress: 0, syncCount: 0, isManualSync: true });
  await backend.send(EventType.SyncConfirm, {
    existingPhoto: avatars[0],
    newPhoto: avatars[5],
    contactName: "Ada Lovelace",
  });
  await expect(page.getByText("Ada Lovelace")).toBeVisible();
  await screenshot(page, "07-manual-sync");

  await page.getByRole("button", { name: "Use new photo" }).click();
  await expect(page.getByText("Loading the next contact…")).toBeVisible();
  await expect
    .poll(() => backend.received.find((e) => e.type === EventType.SyncPhotoConfirm))
    .toEqual({ type: EventType.SyncPhotoConfirm, data: { accept: true } });
});

test("sync errors are shown to the user", async ({ page }) => {
  backend.status.whatsappConnected = true;
  backend.status.googleConnected = true;
  await page.goto("/sync?manual_sync=false&overwrite_photos=false");
  await expect.poll(() => backend.requested("/api/init_sync")).toBeTruthy();
  await backend.send(EventType.SyncProgress, {
    progress: 0,
    syncCount: 0,
    error: "Failed to load contacts, please try again.",
  });
  await expect(page.getByRole("alert")).toHaveText("Failed to load contacts, please try again.");
});

test.describe("route guards", () => {
  test("pages after WhatsApp need a connected WhatsApp", async ({ page }) => {
    for (const path of ["/gauth", "/options", "/sync"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/$/);
    }
  });

  test("sync needs Google", async ({ page }) => {
    backend.status.whatsappConnected = true;
    await page.goto("/sync");
    await expect(page).toHaveURL(/\/gauth$/);
  });

  test("a connected WhatsApp skips the QR page", async ({ page }) => {
    backend.status.whatsappConnected = true;
    await page.goto("/whatsapp");
    await expect(page).toHaveURL(/\/gauth$/);
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

test.describe("sync options", () => {
  for (const [label, manual, overwrite] of [
    ["Fill in missing photos", "false", "false"],
    ["Replace all photos", "false", "true"],
    ["Review each photo", "true", "false"],
  ]) {
    test(`"${label}" sends manual_sync=${manual}, overwrite_photos=${overwrite}`, async ({ page }) => {
      backend.status.whatsappConnected = true;
      backend.status.googleConnected = true;
      await page.goto("/options");
      await page.getByRole("radio", { name: new RegExp(label) }).check();
      await page.getByRole("button", { name: "Start sync" }).click();
      await expect.poll(() => backend.requested("/api/init_sync")).toBeTruthy();
      const query = new URL(backend.requested("/api/init_sync")!.url()).searchParams;
      expect(query.get("manual_sync")).toBe(manual);
      expect(query.get("overwrite_photos")).toBe(overwrite);
    });
  }
});

test("review mode answers from the keyboard", async ({ page }) => {
  backend.status.whatsappConnected = true;
  backend.status.googleConnected = true;
  await page.goto("/sync?manual_sync=true&overwrite_photos=false");
  await expect.poll(() => backend.requested("/api/init_sync")).toBeTruthy();
  await backend.send(EventType.SyncProgress, { progress: 0, syncCount: 0, isManualSync: true });
  await backend.send(EventType.SyncConfirm, { existingPhoto: null, newPhoto: avatars[1], contactName: "Grace Hopper" });
  await expect(page.getByText("Grace Hopper")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(() => backend.received.find((e) => e.type === EventType.SyncPhotoConfirm))
    .toEqual({ type: EventType.SyncPhotoConfirm, data: { accept: false } });
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
