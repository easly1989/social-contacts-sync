import fs from "fs";
import http from "http";
import net from "net";
import os from "os";
import path from "path";
import { _electron as electron, ElectronApplication, expect, Page, test } from "@playwright/test";

// The unpacked build of the current platform (npm run pack), or DESKTOP_APP.
function packagedApp(): string {
  if (process.env.DESKTOP_APP) return process.env.DESKTOP_APP;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { executableName } = require("../electron-builder.config.js");
  const dist = path.join(__dirname, "..", "dist");
  if (process.platform === "win32") return path.join(dist, "win-unpacked", `${executableName}.exe`);
  if (process.platform === "darwin") {
    // mac-universal/, mac-arm64/ or mac/, depending on the build.
    const dir = fs.readdirSync(dist).find((d) => d.startsWith("mac"))!;
    const bundle = fs.readdirSync(path.join(dist, dir)).find((f) => f.endsWith(".app"))!;
    const macos = path.join(dist, dir, bundle, "Contents", "MacOS");
    return path.join(macos, fs.readdirSync(macos)[0]);
  }
  return path.join(dist, "linux-unpacked", executableName);
}

type Opened = { opened?: string[] };

let app: ElectronApplication;
let page: Page;
let dataDir: string;

async function launch(config: string, env: NodeJS.ProcessEnv = {}): Promise<void> {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "scs-desktop-"));
  fs.writeFileSync(path.join(dataDir, "config.env"), config);
  app = await electron.launch({
    executablePath: packagedApp(),
    // CI runners (and root in containers) lack the Chromium sandbox setup.
    args: ["--no-sandbox"],
    env: {
      ...process.env,
      SCS_DATA_DIR: dataDir,
      // Any existing file skips the browser lookup/download; WhatsApp isn't started here.
      CHROME_PATH: process.execPath,
      ...env,
    },
  });
  page = await app.firstWindow();
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:\d+\/$/, { timeout: 30_000 });
}

test.beforeEach(async ({}, testInfo) => {
  if (testInfo.title.startsWith("setup:")) return;
  await launch("GOOGLE_CLIENT_ID=test-client.apps.googleusercontent.com\nGOOGLE_CLIENT_SECRET=test-secret\n");
});

test.afterEach(async () => {
  await app?.close();
});

test("opens the welcome page served by the local server", async () => {
  await expect(page.getByRole("heading", { name: "Give every contact a face." })).toBeVisible();
  await expect(page).toHaveTitle("Social Contacts Sync");
  fs.mkdirSync(path.join(__dirname, "screenshots"), { recursive: true });
  await page.screenshot({ path: path.join(__dirname, "screenshots", "desktop-welcome.png") });
});

test("keeps settings in config.env and adds a session secret", async () => {
  const config = fs.readFileSync(path.join(dataDir, "config.env"), "utf8");
  expect(config).toContain("GOOGLE_CLIENT_ID=test-client.apps.googleusercontent.com");
  expect(config).toMatch(/^SESSION_SECRET=[0-9a-f]{64}$/m);
  expect(fs.existsSync(path.join(dataDir, "logs", "server.log"))).toBe(true);
});

test("the server only listens on loopback", async () => {
  const port = Number(new URL(page.url()).port);
  const external = Object.values(os.networkInterfaces())
    .flat()
    .find((i) => i && i.family === "IPv4" && !i.internal)?.address;
  test.skip(!external, "no non-loopback interface on this machine");
  const reachable = await new Promise<boolean>((resolve) => {
    const socket = net.connect({ host: external, port, timeout: 2000 }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
  expect(reachable).toBe(false);
});

test("Google sign-in opens in the system browser with a loopback redirect", async () => {
  await app.evaluate(({ shell }) => {
    (globalThis as Opened).opened = [];
    shell.openExternal = async (url: string) => {
      (globalThis as Opened).opened!.push(url);
    };
  });
  const origin = new URL(page.url()).origin;
  await page.evaluate(() => {
    window.location.href = "/api/google_auth_start";
  });

  await expect.poll(() => app.evaluate(() => (globalThis as Opened).opened ?? [])).toHaveLength(1);
  const [opened] = await app.evaluate(() => (globalThis as Opened).opened!);
  const url = new URL(opened);
  expect(url.host).toBe("accounts.google.com");
  expect(url.searchParams.get("redirect_uri")).toBe(`${origin}/api/google_callback`);
  expect(url.searchParams.get("client_id")).toBe("test-client.apps.googleusercontent.com");
  // The app window itself never leaves the local server.
  expect(page.url().startsWith(origin)).toBe(true);
});

test("setup: without credentials the wizard saves them to config.env", async () => {
  // Stands in for Google's token endpoint: accepts any client.
  const google = http.createServer((_req, res) => {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_grant" }));
  });
  await new Promise<void>((resolve) => google.listen(0, "127.0.0.1", resolve));
  const port = (google.address() as net.AddressInfo).port;
  try {
    await launch("# no credentials yet\n", { SCS_GOOGLE_TOKEN_ENDPOINT: `http://127.0.0.1:${port}/token` });
    await page.getByRole("link", { name: "Get started" }).click();
    await expect(page.getByRole("heading", { name: "Connect your own Google project" })).toBeVisible();

    await page.getByLabel("Client ID").fill("1234567890-abc.apps.googleusercontent.com");
    await page.getByLabel("Client secret").fill("GOCSPX-desktop-test");
    await page.getByRole("button", { name: "Check and save" }).click();
    await expect(page.getByRole("status")).toHaveText("Credentials verified and saved.");

    const config = fs.readFileSync(path.join(dataDir, "config.env"), "utf8");
    expect(config).toContain("# no credentials yet");
    expect(config).toContain("GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com");
    expect(config).toContain("GOOGLE_CLIENT_SECRET=GOCSPX-desktop-test");
    fs.mkdirSync(path.join(__dirname, "screenshots"), { recursive: true });
    await page.screenshot({ path: path.join(__dirname, "screenshots", "desktop-setup-google.png") });

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Sign in to Google Contacts" })).toBeVisible();
  } finally {
    google.close();
  }
});
