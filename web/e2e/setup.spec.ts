import { test, expect } from "@playwright/test";

import { EventType } from "../../interfaces/api";
import { FakeBackend, screenshot } from "./backend";

// The desktop app's first-run wizard (issue #17), with the backend mocked.
let backend: FakeBackend;

test.beforeEach(async ({ page }) => {
  backend = new FakeBackend(page);
  backend.status.desktop = true;
  backend.status.googleConfigured = false;
  await backend.install();
});

const clientId = "1234567890-abc.apps.googleusercontent.com";

test("Get started leads to the Google project step when credentials are missing", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Get started" }).click();
  await expect(page).toHaveURL(/\/setup\/google$/);
  await expect(page.getByRole("heading", { name: "Connect your own Google project" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Setup steps" })).toContainText("Google project");
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  await screenshot(page, "11-setup-google");
});

test("the checklist opens Google Cloud pages and remembers finished steps", async ({ page }) => {
  await page.goto("/setup/google");
  const open = page.getByRole("link", { name: "Open Cloud Console" });
  await expect(open).toHaveAttribute("href", "https://console.cloud.google.com/projectcreate");
  await expect(open).toHaveAttribute("target", "_blank");
  await page.getByRole("button", { name: "I've done this" }).click();
  await expect(page.getByRole("link", { name: "Open the API page" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "Open the API page" })).toBeVisible();
});

test("a Web application client file is refused with an explanation", async ({ page }) => {
  backend.credentialsResult = { status: 400, body: { error: "wrong_client_type" } };
  await page.goto("/setup/google");
  await page.getByTestId("credentials-file").setInputFiles({
    name: "client_secret_web.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ web: { client_id: clientId, client_secret: "x" } })),
  });
  await expect(page.getByRole("alert")).toHaveText(/Create one of type “Desktop app”/);
  const body = backend.requested("/api/desktop/google_credentials")!.postDataJSON();
  expect(JSON.parse(body.json)).toEqual({ web: { client_id: clientId, client_secret: "x" } });
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
});

test("pasted credentials are verified, saved and unlock the next step", async ({ page }) => {
  await page.goto("/setup/google");
  await page.getByLabel("Client ID").fill(clientId);
  await page.getByLabel("Client secret").fill("GOCSPX-secret");
  await page.getByRole("button", { name: "Check and save" }).click();
  await expect(page.getByRole("status")).toHaveText("Credentials verified and saved.");
  expect(backend.requested("/api/desktop/google_credentials")!.postDataJSON()).toEqual({ clientId, clientSecret: "GOCSPX-secret" });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/setup\/signin$/);
});

test("sign-in waits for the browser, then shows the connected account", async ({ page }) => {
  backend.status.googleConfigured = true;
  backend.signInCompletes = false;
  await page.goto("/setup/signin");
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await expect(page.getByText("Waiting for you to finish in the browser…")).toBeVisible();
  const start = new URL(backend.requested("/api/google_auth_start")!.url());
  expect(start.searchParams.get("return")).toBe("/setup/signin?connected=1");
  await screenshot(page, "12-setup-signin-waiting");

  backend.signInCompletes = true;
  await page.getByRole("button", { name: "Open the page again" }).click();
  await expect(page.getByRole("status")).toContainText("Connected as ada@example.com");
  await expect(page.getByRole("status")).toContainText("1,248 contacts");
  await screenshot(page, "13-setup-signin-connected");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/setup\/sources$/);
});

test("linking WhatsApp finishes the setup", async ({ page }) => {
  backend.status.googleConfigured = true;
  backend.status.googleConnected = true;
  await page.goto("/setup/sources");
  await expect(page.getByRole("heading", { name: "Where should photos come from?" })).toBeVisible();
  await expect.poll(() => backend.requested("/api/init_whatsapp")).toBeTruthy();
  await backend.send(EventType.WhatsAppQR, "2@fake-qr-payload,for-the-e2e-tests");
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Finish setup" })).toBeDisabled();
  await screenshot(page, "14-setup-sources");

  backend.status.whatsappConnected = true;
  await backend.send(EventType.WhatsAppConnecting);
  await expect(page.getByText("Connected", { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/options$/);
});

test.describe("desktop guards", () => {
  test("without credentials every step leads to the Google project step", async ({ page }) => {
    for (const path of ["/whatsapp", "/options", "/setup/signin", "/setup/sources"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/setup\/google$/);
    }
  });

  test("the web flow's pages lead into the wizard", async ({ page }) => {
    backend.status.googleConfigured = true;
    for (const path of ["/whatsapp", "/gauth", "/options", "/setup/sources"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/setup\/signin$/);
    }
    backend.status.googleConnected = true;
    await page.goto("/options");
    await expect(page).toHaveURL(/\/setup\/sources$/);
  });

  test("a finished setup goes straight to the options", async ({ page }) => {
    Object.assign(backend.status, { googleConfigured: true, googleConnected: true, whatsappConnected: true });
    await page.goto("/options");
    await expect(page.getByRole("heading", { name: "What should change?" })).toBeVisible();
  });
});

test.describe("returning users", () => {
  test.beforeEach(() => {
    Object.assign(backend.status, { googleConfigured: true, googleConnected: true });
  });

  test("a saved WhatsApp link reconnects without a QR code", async ({ page }) => {
    Object.assign(backend.status, { whatsappSaved: true, whatsappStarting: true });
    await page.goto("/setup/sources");
    await expect(page.getByText("Reconnecting to WhatsApp…")).toBeVisible();
    await screenshot(page, "15-setup-reconnecting");
    Object.assign(backend.status, { whatsappConnected: true, whatsappStarting: false });
    await expect(page.getByText("Connected", { exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test("with everything connected, Continue goes straight to the options", async ({ page }) => {
    backend.status.whatsappConnected = true;
    await page.goto("/");
    await page.getByRole("link", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/options$/);
  });

  test("WhatsApp can be unlinked, which shows a new QR code", async ({ page }) => {
    backend.status.whatsappConnected = true;
    await page.goto("/setup/sources");
    await page.getByRole("button", { name: "Unlink" }).click();
    await expect.poll(() => backend.requested("/api/desktop/whatsapp_unlink")).toBeTruthy();
    await expect.poll(() => backend.requested("/api/init_whatsapp")).toBeTruthy();
    await backend.send(EventType.WhatsAppQR, "2@new-qr");
    await expect(page.locator("canvas")).toBeVisible();
  });

  test("Google can be signed out", async ({ page }) => {
    await page.goto("/setup/signin");
    await expect(page.getByRole("status")).toContainText("Connected as ada@example.com");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
    expect(backend.requested("/api/desktop/google_sign_out")!.method()).toBe("POST");
  });
});

test("a WhatsApp start failure is shown with a retry", async ({ page }) => {
  Object.assign(backend.status, { googleConfigured: true, googleConnected: true });
  await page.goto("/setup/sources");
  await expect.poll(() => backend.count("/api/init_whatsapp")).toBe(1);
  await backend.send(EventType.WhatsAppError, "Browser was not found at the configured path");
  await expect(page.getByRole("alert")).toContainText("WhatsApp Web couldn't start.");
  await expect(page.getByRole("alert")).toContainText("Browser was not found");
  await screenshot(page, "16-whatsapp-error");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect.poll(() => backend.count("/api/init_whatsapp")).toBe(2);
});
