import fs from "fs";
import path from "path";
import { app, BrowserWindow, Menu, nativeTheme, Notification, shell, utilityProcess, UtilityProcess } from "electron";

import { resolvePaths } from "./paths";
import { loadConfig, saveConfig } from "./config";
import { downloadBrowser, findInstalledBrowser } from "./browser";
import { findUpdate, isPrerelease, updateStrategy } from "./updates";

const productName = "Social Contacts Sync";

// Recent Ubuntu releases restrict the user namespaces Chromium's sandbox
// needs, so AppImages fail to start. The window only shows the app's own
// local pages (everything else opens in the system browser), so the AppImage
// runs without it, like the .deb launcher (see electron-builder.config.js).
if (process.platform === "linux" && process.env.APPIMAGE) app.commandLine.appendSwitch("no-sandbox");

// One instance at a time: a second launch focuses the existing window.
if (!app.requestSingleInstanceLock()) app.quit();

const paths = resolvePaths({ env: process.env, userData: app.getPath("userData") });
// Portable builds keep Electron's own storage (preferences, cookies) with the data too.
if (paths.portable) app.setPath("userData", path.join(paths.dataDir, "electron"));

let mainWindow: BrowserWindow | undefined;
let server: UtilityProcess | undefined;
let quitting = false;

function background(): string {
  return nativeTheme.shouldUseDarkColors ? "#101118" : "#f5f5fa";
}

function statusPage(): string {
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;display:grid;place-items:center;
    font-family:system-ui,sans-serif;background:${background()};color:${nativeTheme.shouldUseDarkColors ? "#e8e9f1" : "#1c1d26"}">
    <main style="text-align:center;max-width:26rem;padding:2rem"><h1 style="font-size:1.25rem" id="t"></h1>
    <p id="d" style="opacity:.7;white-space:pre-line"></p></main></body>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

async function showStatus(win: BrowserWindow, title: string, detail = ""): Promise<void> {
  if (!win.webContents.getURL().startsWith("data:")) await win.loadURL(statusPage());
  await win.webContents.executeJavaScript(
    `document.getElementById("t").textContent=${JSON.stringify(title)};document.getElementById("d").textContent=${JSON.stringify(detail)};`
  );
}

/** Installed Chrome/Edge/Chromium, or a one-time download into the data folder. */
async function resolveBrowser(win: BrowserWindow): Promise<string> {
  const installed = findInstalledBrowser();
  if (installed) return installed;
  await showStatus(win, "Preparing WhatsApp Web…", "Downloading a browser component (once).");
  let lastUpdate = 0;
  return downloadBrowser(path.join(paths.dataDir, "browser"), (done, total) => {
    if (Date.now() - lastUpdate < 250) return;
    lastUpdate = Date.now();
    const percent = total ? Math.round((done / total) * 100) : 0;
    void showStatus(win, "Preparing WhatsApp Web…", `Downloading a browser component (once): ${percent}%`);
  });
}

function startServer(env: NodeJS.ProcessEnv): Promise<number> {
  const logDir = path.join(paths.dataDir, "logs");
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, "server.log");
  if (fs.existsSync(logFile)) fs.renameSync(logFile, path.join(logDir, "server.previous.log"));
  const log = fs.createWriteStream(logFile);

  server = utilityProcess.fork(path.join(__dirname, "server-process.js"), [], {
    env,
    stdio: "pipe",
    serviceName: `${productName} server`,
  });
  server.stdout?.pipe(log);
  server.stderr?.pipe(log);

  return new Promise((resolve, reject) => {
    server!.on("message", (message: { type?: string; port?: number; id?: number; values?: Record<string, string> }) => {
      if (message?.type === "ready" && message.port) resolve(message.port);
      if (message?.type === "save-config") server!.postMessage(saveFromServer(message.id, message.values));
    });
    server!.on("exit", (code) => {
      if (!quitting) reject(new Error(`The local server stopped (code ${code}). See ${logFile}.`));
    });
  });
}

// Keys the server may write to config.env (from the setup wizard).
const writableKeys = new Set(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]);

function saveFromServer(id: number | undefined, values: Record<string, string> = {}): { type: "reply"; id?: number; error?: string } {
  const entries = Object.entries(values).filter(([key, value]) => writableKeys.has(key) && typeof value === "string");
  try {
    saveConfig(paths.configFile, Object.fromEntries(entries));
    return { type: "reply", id };
  } catch (error) {
    return { type: "reply", id, error: error instanceof Error ? error.message : String(error) };
  }
}

function keepLinksOutside(win: BrowserWindow, origin: string): void {
  const isApp = (url: string) => url === origin || url.startsWith(`${origin}/`);
  const openOutside = (url: string) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
  };
  win.webContents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: "deny" };
  });
  // Google refuses sign-in inside embedded browsers, so its redirect (and any
  // other page outside the app) opens in the system browser.
  const guard = (event: { preventDefault(): void }, url: string) => {
    if (isApp(url)) return;
    event.preventDefault();
    openOutside(url);
  };
  win.webContents.on("will-navigate", guard);
  win.webContents.on("will-redirect", guard);
}

async function start(): Promise<void> {
  fs.mkdirSync(paths.dataDir, { recursive: true });
  const config = loadConfig(paths.configFile);

  mainWindow = new BrowserWindow({
    title: productName,
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: background(),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  const win = mainWindow;
  await showStatus(win, `Starting ${productName}…`);

  try {
    const chromePath = await resolveBrowser(win);
    const port = await startServer({
      ...process.env,
      ...config,
      CHROME_PATH: chromePath,
      HOST: "127.0.0.1",
      SCS_DESKTOP: "1",
      WEB_ROOT: path.join(app.getAppPath(), "web"),
      SCS_DATA_DIR: paths.dataDir,
    });
    const origin = `http://127.0.0.1:${port}`;
    keepLinksOutside(win, origin);
    await win.loadURL(origin);
    void checkForUpdates();
  } catch (error) {
    await showStatus(win, `${productName} could not start`, error instanceof Error ? error.message : String(error));
  }
}

async function checkForUpdates(): Promise<void> {
  const strategy = updateStrategy(process.platform, process.env, app.isPackaged);
  try {
    if (strategy === "auto") {
      // Downloads in the background and installs when the app quits.
      const { autoUpdater } = await import("electron-updater");
      autoUpdater.allowPrerelease = isPrerelease(app.getVersion());
      await autoUpdater.checkForUpdatesAndNotify({
        title: `${productName} {version} is ready`,
        body: "It will be installed when you close the app.",
      });
    } else if (strategy === "notify") {
      const update = await findUpdate(app.getVersion());
      if (!update || !Notification.isSupported()) return;
      const notification = new Notification({
        title: `${productName} ${update.version} is available`,
        body: "Click to open the download page.",
      });
      notification.on("click", () => void shell.openExternal(update.url));
      notification.show();
    }
  } catch (error) {
    console.warn("Update check failed:", error);
  }
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.on("before-quit", () => {
  quitting = true;
  server?.kill();
});

app.on("window-all-closed", () => app.quit());

app.whenReady().then(() => {
  if (process.platform !== "darwin") Menu.setApplicationMenu(null);
  void start();
});
