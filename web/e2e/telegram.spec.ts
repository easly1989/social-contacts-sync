import { test, expect } from "@playwright/test";

import { FakeBackend, screenshot } from "./backend";

// Telegram sign-in and source (issue #36), with the backend mocked.
let backend: FakeBackend;

test.beforeEach(async ({ page }) => {
  backend = new FakeBackend(page);
  Object.assign(backend.status, { desktop: true, googleConfigured: true, googleConnected: true, telegramAvailable: true });
  await backend.install();
});

test("setup: Telegram with two-step verification finishes the setup", async ({ page }) => {
  backend.telegramPassword = "secret";
  await page.goto("/setup/sources");
  const card = page.getByTestId("setup-telegram");
  await expect(card.getByLabel("Phone number")).toHaveValue(/^\+/);
  await screenshot(page, "17-setup-telegram");

  await card.getByLabel("Phone number").fill("+39 340 000 0000");
  await card.getByRole("button", { name: "Send code" }).click();
  await expect(card).toContainText("Telegram sent a code to +393400000000. It arrives in the Telegram app, not by SMS.");

  await card.getByLabel("Login code").fill("00000");
  await card.getByRole("button", { name: "Sign in" }).click();
  await expect(card.getByRole("alert")).toHaveText("That code isn't right. Check the latest message from Telegram.");
  await card.getByLabel("Login code").fill("12345");
  await card.getByRole("button", { name: "Sign in" }).click();

  await expect(card).toContainText("Your account has two-step verification.");
  await card.getByLabel("Password").fill("secret");
  await card.getByRole("button", { name: "Sign in" }).click();
  await expect(card).toContainText("Connected as +393400000000");
  await expect(page.getByText("1 source connected")).toBeVisible();

  expect(backend.telegramRequests.map((r) => r.route)).toEqual(["send_code", "sign_in", "sign_in", "password"]);
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/app$/);
});

test("a wrong number is explained, and another number can be used", async ({ page }) => {
  await page.goto("/setup/sources");
  const card = page.getByTestId("setup-telegram");
  await card.getByLabel("Phone number").fill("+39 1234");
  await card.getByRole("button", { name: "Send code" }).click();
  await expect(card.getByRole("alert")).toHaveText("That doesn't look like a phone number. Include the country code, like +39.");

  await card.getByLabel("Phone number").fill("+39 340 000 0000");
  await card.getByRole("button", { name: "Send code" }).click();
  await card.getByRole("button", { name: "Use another number" }).click();
  await expect(card.getByLabel("Phone number")).toBeVisible();
});

test("without app credentials Telegram says why it's unavailable", async ({ page }) => {
  backend.telegram.available = false;
  backend.status.telegramAvailable = false;
  await page.goto("/setup/sources");
  await expect(page.getByTestId("setup-telegram")).toContainText("Telegram isn't available in this build");
});

test("once connected, Telegram is a sync source and can be signed out in Settings", async ({ page }) => {
  Object.assign(backend.telegram, { connected: true, phone: "+393400000000" });
  Object.assign(backend.status, { telegramConnected: true, whatsappConnected: true });
  await page.goto("/app");
  await expect(page.getByText("Telegram").locator("..").locator("..")).toContainText("Connected");

  await page.goto("/app/sync");
  await expect(page.getByRole("checkbox", { name: "Telegram" })).toBeEnabled();
  await page.getByRole("checkbox", { name: "Telegram" }).check();
  await page.getByRole("button", { name: "Start sync" }).click();
  await expect(page).toHaveURL(/sources=whatsapp%2Cgravatar%2Ctelegram/);

  await page.goto("/app/settings/sources");
  const row = page.getByTestId("settings-source-telegram");
  await expect(row).toContainText("Connected as +393400000000");
  await row.getByRole("button", { name: "Sign out" }).click();
  await expect(row.getByLabel("Phone number")).toBeVisible();
});
