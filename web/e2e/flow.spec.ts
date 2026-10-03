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
  await expect(page.getByRole("heading", { name: "Social Contacts Sync" })).toBeVisible();
  // The original project keeps its credit.
  await expect(page.getByRole("link", { name: "WhatsApp Contact Sync" })).toHaveAttribute(
    "href",
    "https://github.com/guyzyl/whatsapp-contact-sync"
  );
  const start = page.getByRole("link", { name: "Get Started" });
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
  await page.getByRole("link", { name: "Get Started" }).click();

  // Payments are off, so /contribute forwards straight to WhatsApp.
  await expect(page).toHaveURL(/\/whatsapp$/);
  await expect(page.getByRole("heading", { name: "Authorize WhatsApp" })).toBeVisible();
  await expect.poll(() => backend.requested("/api/init_whatsapp")).toBeTruthy();

  await backend.send(EventType.WhatsAppQR, "2@fake-qr-payload,for-the-e2e-tests");
  await expect(page.locator("canvas")).toBeVisible();
  await screenshot(page, "02-whatsapp-qr");

  await backend.send(EventType.WhatsAppConnecting);
  await expect(page.getByText("WhatsApp Authorizing")).toBeVisible();

  backend.status.whatsappConnected = true;
  await backend.send(EventType.Redirect, "/gauth");
  await expect(page.getByRole("heading", { name: "Authorize Google" })).toBeVisible();
  await screenshot(page, "03-google-auth");

  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await expect(page).toHaveURL(/\/options$/);
  await expect(page.getByRole("heading", { name: "Sync Options" })).toBeVisible();

  // The two options are mutually exclusive.
  const toggles = page.locator("input.toggle");
  await toggles.nth(0).check();
  await toggles.nth(1).check();
  await expect(toggles.nth(0)).not.toBeChecked();
  await expect(toggles.nth(1)).toBeChecked();
  await screenshot(page, "04-options");

  await page.getByRole("button", { name: "Start Sync" }).click();
  await expect(page).toHaveURL(/\/sync\?/);
  await expect.poll(() => backend.requested("/api/init_sync")).toBeTruthy();
  const query = new URL(backend.requested("/api/init_sync")!.url()).searchParams;
  expect(query.get("overwrite_photos")).toBe("true");
  expect(query.get("manual_sync")).toBe("false");

  await expect(page.getByRole("heading", { name: "Sync In Progress" })).toBeVisible();
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
  await expect(page.locator(".avatar-group img")).toHaveCount(9);
  await expect(page.getByText("+3")).toBeVisible();
  await screenshot(page, "05-sync-progress");

  await backend.send(EventType.SyncProgress, { progress: 100, syncCount: 12 });
  await expect(page.getByText("Sync complete!")).toBeVisible();
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
  await expect(page.getByText("Ada Lovelace's Photo")).toBeVisible();
  await screenshot(page, "07-manual-sync");

  await page.getByRole("button", { name: "Use New Photo" }).click();
  await expect(page.getByText("Loading next contact...")).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "Support WhatsApp Contact Sync" })).toBeVisible();
    await screenshot(page, "08-contribute");
  });
});
