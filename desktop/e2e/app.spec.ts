import fs from "fs";
import net from "net";
import os from "os";
import path from "path";
import { _electron as electron, ElectronApplication, expect, Page, test } from "@playwright/test";

// The unpacked build of the current platform (npm run pack), or DESKTOP_APP.
function packagedApp(): string {
  if (process.env.DESKTOP_APP) return process.env.DESKTOP_APP;
  const dist = path.join(__dirname, "..", "dist");
  if (process.platform === "win32") return path.join(dist, "win-unpacked", "Social Contacts Sync.exe");
  if (process.platform === "darwin")
    return path.join(dist, "mac-universal", "Social Contacts Sync.app", "Contents", "MacOS", "Social Contacts Sync");
  return path.join(dist, "linux-unpacked", "social-contacts-sync");
}

type Opened = { opened?: string[] };

let app: ElectronApplication;
let page: Page;
let dataDir: string;

test.beforeEach(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "scs-desktop-"));
  fs.writeFileSync(
    path.join(dataDir, "config.env"),
    "GOOGLE_CLIENT_ID=test-client.apps.googleusercontent.com\nGOOGLE_CLIENT_SECRET=test-secret\n"
  );
  app = await electron.launch({
    executablePath: packagedApp(),
    // CI runners (and root in containers) lack the Chromium sandbox setup.
    args: ["--no-sandbox"],
    env: {
      ...process.env,
      SCS_DATA_DIR: dataDir,
      // Any existing file skips the browser lookup/download; WhatsApp isn't started here.
      CHROME_PATH: process.execPath,
    },
  });
  page = await app.firstWindow();
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:\d+\/$/, { timeout: 30_000 });
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
