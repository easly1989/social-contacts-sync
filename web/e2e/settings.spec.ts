import { test, expect } from "@playwright/test";

import { FakeBackend, screenshot } from "./backend";
import { sampleRun } from "./fixtures";

// Settings and About (issue #24), with the backend mocked.
let backend: FakeBackend;

test.beforeEach(async ({ page }) => {
  backend = new FakeBackend(page);
  Object.assign(backend.status, { whatsappConnected: true, googleConnected: true, googleConfigured: true, desktop: true });
  backend.runs = [sampleRun()];
  await backend.install();
});

test("desktop: general settings change language, theme and Remember sign-ins", async ({ page }) => {
  await page.goto("/app/settings");
  await expect(page).toHaveURL(/\/app\/settings\/general$/);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByTestId("app-version")).toContainText("v1.0.0");
  await expect(page.getByTestId("app-version")).toContainText("Up to date");
  await screenshot(page, "30-settings-general");

  await page.getByRole("button", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "scs-dark");
  await page.getByRole("button", { name: "Light" }).click();

  await page.getByRole("checkbox", { name: "Remember sign-ins" }).uncheck();
  await expect.poll(() => backend.desktopActions).toEqual([{ route: "remember_sign_ins", body: { enabled: false } }]);
  await expect(page.getByText("You stay signed in until you close the app.")).toBeVisible();

  await page.getByRole("combobox", { name: "Language" }).selectOption("it");
  await expect(page.getByRole("heading", { name: "Impostazioni" })).toBeVisible();
  await page.getByRole("combobox", { name: "Lingua" }).selectOption("system");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});

test("desktop: data & privacy shows the folders and deletes after confirming", async ({ page }) => {
  await page.goto("/app/settings/data");
  await expect(page.getByTestId("data-dir")).toHaveText("D:\\Apps\\SocialContactsSync\\social-contacts-sync-data");
  await expect(page.getByText("portable mode: settings live next to the app")).toBeVisible();
  await expect(page.getByText("4 syncs, 3.2 MB")).toBeVisible();
  await screenshot(page, "31-settings-data");

  await page.getByRole("button", { name: "Open" }).click();
  await page.getByRole("button", { name: "Show" }).click();
  await expect.poll(() => backend.desktopActions).toEqual([
    { route: "open", body: { target: "data" } },
    { route: "open", body: { target: "config" } },
  ]);

  await page.getByRole("button", { name: "Delete…" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete all local data?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect(backend.desktopActions).toHaveLength(2);

  await page.getByRole("button", { name: "Delete…" }).click();
  await screenshot(page, "32-settings-delete", { fullPage: false });
  await dialog.getByRole("button", { name: "Delete and restart" }).click();
  await expect.poll(() => backend.desktopActions[2]).toEqual({ route: "delete_all_data", body: { confirm: true } });
  await expect(dialog.getByRole("button", { name: "Deleting…" })).toBeDisabled();
});

test("desktop: checking for updates shows the new version", async ({ page }) => {
  backend.updateCheck = { status: "available", version: "1.1.0", url: "https://github.com/easly1989/social-contacts-sync/releases/tag/v1.1.0" };
  await page.goto("/app/settings/updates");
  await expect(page.getByText("Windows portable · you're told when a new version is out")).toBeVisible();
  await page.getByRole("button", { name: "Check for updates" }).click();
  await expect(page.getByTestId("update-status")).toContainText("Version 1.1.0 is available");
  await expect(page.getByRole("link", { name: "Release notes" })).toHaveAttribute("href", backend.updateCheck.url!);
  await expect(page.getByTestId("app-version")).toContainText("1.1.0 available");
  await screenshot(page, "33-settings-updates");
});

test("desktop: Google account and sources can be signed out and unlinked", async ({ page }) => {
  await page.goto("/app/settings/sources");
  await page.getByTestId("settings-source-whatsapp").getByRole("button", { name: "Unlink" }).click();
  await expect(page.getByTestId("settings-source-whatsapp").getByRole("link", { name: "Connect" })).toHaveAttribute("href", "/setup/sources");

  await page.getByRole("link", { name: "Google account" }).click();
  await expect(page.getByTestId("google-account")).toContainText("Ada Lovelace");
  await expect(page.getByTestId("google-account")).toContainText("ada@example.com · 1,248 contacts");
  await screenshot(page, "34-settings-google");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/setup\/signin$/);
});

test("about: credits, donations and licence", async ({ page }) => {
  await page.goto("/app/settings/about");
  await expect(page.getByTestId("about-version")).toContainText("Version 1.0.0 · Windows portable · What's new");
  await expect(page.getByRole("link", { name: "easly1989.github.io" })).toHaveAttribute("href", "https://easly1989.github.io");
  await expect(page.getByRole("link", { name: "WhatsApp Contact Sync" })).toHaveAttribute("href", "https://github.com/guyzyl/whatsapp-contact-sync");
  await expect(page.getByText("Guy Zylberberg")).toBeVisible();
  await expect(page.getByRole("link", { name: "Support the original author" })).toHaveAttribute("href", "https://www.buymeacoffee.com/guyzyl");
  const donations = page.getByTestId("donations").getByRole("link");
  await expect(donations).toHaveText(["Buy me a coffee", "PayPal", "Stripe", "Liberapay", "GitHub Sponsors"]);
  await expect(donations.nth(4)).toHaveAttribute("href", "https://github.com/sponsors/easly1989");
  await screenshot(page, "35-settings-about");

  // The sidebar's Support link leads here.
  await page.goto("/app");
  await page.getByRole("link", { name: "Support the project" }).click();
  await expect(page).toHaveURL(/\/app\/settings\/about$/);
});

test("web: only the sections that apply, without desktop calls", async ({ page }) => {
  backend.status.desktop = false;
  await page.goto("/app/settings/data");
  await expect(page).toHaveURL(/\/app\/settings\/general$/);
  const nav = page.getByRole("navigation", { name: "Settings sections" });
  await expect(nav.getByRole("link")).toHaveText(["General", "Google account", "Sources", "About"]);
  await expect(page.getByRole("checkbox", { name: "Remember sign-ins" })).toHaveCount(0);

  await nav.getByRole("link", { name: "About" }).click();
  await expect(page.getByTestId("about-version")).toContainText("Web app");
  await expect(page.getByRole("button", { name: "Check for updates" })).toHaveCount(0);
  await nav.getByRole("link", { name: "Google account" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  expect(backend.count("/api/desktop/info")).toBe(0);
});

test("settings on a phone use a section picker", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/settings/about");
  await page.getByRole("combobox", { name: "Settings sections" }).selectOption("data");
  await expect(page).toHaveURL(/\/app\/settings\/data$/);
  await screenshot(page, "36-settings-mobile", { fullPage: false });
});
