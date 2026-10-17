import { test, expect } from "@playwright/test";

import { EventType } from "../../interfaces/api";
import { FakeBackend, screenshot } from "./backend";
import { sampleRun } from "./fixtures";

// Settings and About (issue #24), with the backend mocked.
let backend: FakeBackend;

test.beforeEach(async ({ page }) => {
  backend = new FakeBackend(page);
  Object.assign(backend.status, { whatsappConnected: true, googleConnected: true, googleConfigured: true, desktop: true, setupDone: true });
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

test("desktop: an update's download shows its progress, then installs on request (issue #63)", async ({ page }) => {
  const url = "https://github.com/easly1989/social-contacts-sync/releases/tag/v1.3.1";
  Object.assign(backend.desktopInfo, { packageKind: "windows-installer", portable: false, updates: "auto" });
  backend.desktopInfo.lastUpdate = { status: "downloading", version: "1.3.1", progress: 46, url, checkedAt: new Date().toISOString() };
  await page.goto("/app/settings/updates");
  await expect(page.getByTestId("update-status")).toContainText("Downloading version 1.3.1… 46%");
  await expect(page.getByRole("progressbar", { name: "Download progress" })).toHaveAttribute("value", "46");
  await expect(page.getByTestId("app-version")).toContainText("1.3.1 · 46%");
  await expect(page.getByRole("button", { name: "Check for updates" })).toBeDisabled();
  await screenshot(page, "33b-settings-update-downloading");

  // The download finishes: Settings picks it up by itself.
  backend.desktopInfo.lastUpdate = { status: "ready", version: "1.3.1", url, checkedAt: new Date().toISOString() };
  await expect(page.getByTestId("update-status")).toContainText("Version 1.3.1 is ready to install", { timeout: 6000 });
  await expect(page.getByTestId("app-version")).toContainText("1.3.1 ready");
  await screenshot(page, "33c-settings-update-ready");
  await page.getByRole("button", { name: "Update and restart" }).click();
  await expect.poll(() => backend.desktopActions.map((a) => a.route)).toEqual(["install_update"]);
});

test("desktop: automatic updates can be turned off (issue #63)", async ({ page }) => {
  Object.assign(backend.desktopInfo, { packageKind: "windows-installer", portable: false, updates: "auto" });
  backend.desktopInfo.lastUpdate = { status: "available", version: "1.3.1", checkedAt: new Date().toISOString() };
  await page.goto("/app/settings/updates");
  await expect(page.getByText("A new version is downloaded as soon as it's out.")).toBeVisible();
  await page.getByRole("checkbox", { name: "Automatic updates" }).uncheck();
  await expect.poll(() => backend.desktopActions[0]).toEqual({ route: "auto_updates", body: { enabled: false } });
  await expect(page.getByText("A new version is only downloaded when you check for updates.")).toBeVisible();
  await expect(page.getByTestId("update-status")).toContainText("Check for updates to download it.");
});

test("desktop: Google account and sources can be signed out and unlinked, and connected again in place", async ({ page }) => {
  await page.goto("/app/settings/sources");
  const whatsapp = page.getByTestId("settings-source-whatsapp");
  await whatsapp.getByRole("button", { name: "Unlink" }).click();
  // Linked again right here, not in the first-run wizard.
  await whatsapp.getByRole("button", { name: "Connect" }).click();
  await expect.poll(() => backend.requested("/api/init_whatsapp")).toBeTruthy();
  await backend.send(EventType.WhatsAppQR, "2@fake-qr-payload,for-the-e2e-tests");
  await expect(whatsapp.getByTestId("settings-whatsapp-link").locator("canvas")).toBeVisible();
  await expect(page).toHaveURL(/\/app\/settings\/sources$/);

  await page.getByRole("link", { name: "Google account" }).click();
  await expect(page.getByTestId("google-account")).toContainText("Ada Lovelace");
  await expect(page.getByTestId("google-account")).toContainText("ada@example.com · 1,248 contacts");
  await screenshot(page, "34-settings-google");
  await page.getByRole("button", { name: "Sign out" }).click();
  // Set up once: signing in again happens here, not in the wizard.
  await expect(page).toHaveURL(/\/app\/settings\/google$/);
  await expect(page.getByText("Not signed in: contacts can't be read or updated.")).toBeVisible();
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await expect(page.getByTestId("google-account")).toContainText("Ada Lovelace");
  expect(new URL(backend.requested("/api/google_auth_start")!.url()).searchParams.get("return")).toBe("/app/settings/google");
});

test("desktop: LinkedIn reads are on by default, said once before a sync, and can be turned off (issue #80)", async ({ page }) => {
  backend.pinnedProfiles = { instagram: 4, linkedin: 3 };
  const initSync = () => backend.requests.filter((r) => new URL(r.url()).pathname === "/api/init_sync").map((r) => new URL(r.url()).searchParams.get("linkedin_rereads"));

  // The setting, on by default, explains the visit.
  await page.goto("/app/settings/sources");
  const setting = page.getByTestId("settings-linkedin-rereads");
  await expect(setting.getByRole("checkbox")).toBeChecked();
  await expect(setting).toContainText("LinkedIn may show this to the person as a profile visit from you.");
  // Instagram, Facebook and LinkedIn are read with the login only: no anonymous visits to turn on.
  const logins = page.getByTestId("settings-social-logins");
  await expect(logins).toContainText("Instagram · signed in");
  await expect(logins).toContainText("Facebook · not signed in");
  await expect(logins.getByRole("link", { name: "Sign in from Sync › Sources" })).toHaveAttribute("href", "/app/sync?tab=sources");
  await expect(page.getByText("Also try Instagram, Facebook and LinkedIn")).toHaveCount(0);
  await expect(page.getByText("Instagram, Facebook and LinkedIn are read with the login you make in Sync › Sources.")).toBeVisible();
  await screenshot(page, "26d-settings-sources");
  await setting.scrollIntoViewIfNeeded();
  await screenshot(page, "26b-settings-linkedin-rereads", { fullPage: false });

  // The first sync with profile links says so.
  await page.goto("/app/sync");
  await page.getByRole("button", { name: "Start sync" }).click();
  const notice = page.getByTestId("linkedin-notice");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("This sync checks the 3 LinkedIn profiles your contacts' photos come from, with your LinkedIn login.");
  await screenshot(page, "26-linkedin-notice", { fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot(page, "26c-linkedin-notice-phone", { fullPage: false });
  await notice.getByRole("button", { name: "Turn off for LinkedIn" }).click();
  await expect(page).toHaveURL(/\/app\/sync\/run/);
  await expect.poll(initSync).toEqual(["false"]);

  // Never again; and the setting is off.
  await page.goto("/app/sync");
  await page.getByRole("button", { name: "Start sync" }).click();
  await expect(page).toHaveURL(/\/app\/sync\/run/);
  await expect(page.getByTestId("linkedin-notice")).toBeHidden();
  await page.goto("/app/settings/sources");
  await expect(page.getByTestId("settings-linkedin-rereads").getByRole("checkbox")).not.toBeChecked();
});

test("desktop: Got it keeps LinkedIn reads on; no notice without pinned LinkedIn profiles (issue #80)", async ({ page }) => {
  const initSync = () => backend.requests.filter((r) => new URL(r.url()).pathname === "/api/init_sync").map((r) => new URL(r.url()).searchParams.get("linkedin_rereads"));
  // Nothing pinned to LinkedIn: no notice.
  await page.goto("/app/sync");
  await page.getByRole("button", { name: "Start sync" }).click();
  await expect(page).toHaveURL(/\/app\/sync\/run/);
  await expect.poll(initSync).toEqual(["true"]);

  backend.pinnedProfiles = { linkedin: 1 };
  await page.goto("/app/sync");
  await page.getByRole("button", { name: "Start sync" }).click();
  await expect(page.getByTestId("linkedin-notice")).toContainText("This sync checks the LinkedIn profile your contact's photo comes from");
  await page.getByTestId("linkedin-notice").getByRole("button", { name: "Got it" }).click();
  await expect(page).toHaveURL(/\/app\/sync\/run/);
  await expect.poll(initSync).toEqual(["true", "true"]);
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

  // No login reads on the web: the anonymous visits stay a choice, and LinkedIn's setting isn't there (issue #80).
  await nav.getByRole("link", { name: "Sources" }).click();
  await expect(page.getByText("Also try Instagram, Facebook and LinkedIn")).toBeVisible();
  await expect(page.getByTestId("settings-social-logins")).toHaveCount(0);
  await expect(page.getByTestId("settings-linkedin-rereads")).toHaveCount(0);
  expect(backend.count("/api/profiles/logins")).toBe(0);
});

test("settings on a phone use a section picker", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/settings/about");
  await page.getByRole("combobox", { name: "Settings sections" }).selectOption("data");
  await expect(page).toHaveURL(/\/app\/settings\/data$/);
  await screenshot(page, "36-settings-mobile", { fullPage: false });
});
