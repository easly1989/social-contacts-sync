import fs from "fs";
import path from "path";
import { app, BrowserWindow, Menu, nativeTheme, Notification, safeStorage, session, shell, utilityProcess, UtilityProcess } from "electron";

import { resolvePaths } from "./paths";
import { loadConfig, saveConfig } from "./config";
import { loadDataKey } from "./dataKey";
import { downloadBrowser, findInstalledBrowser } from "./browser";
import { findUpdate, isPrerelease, releasesRepo, updateStrategy } from "./updates";
import { deleteLocalData, packageKind, writableValues } from "./localData";
import { telegramEnv } from "./telegramApp";

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
let serverLog: fs.WriteStream | undefined;
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
  serverLog = log;

  server = utilityProcess.fork(path.join(__dirname, "server-process.js"), [], {
    env,
    stdio: "pipe",
    serviceName: `${productName} server`,
  });
  server.stdout?.pipe(log);
  server.stderr?.pipe(log);

  return new Promise((resolve, reject) => {
    server!.on("message", (message: ServerMessage) => {
      if (message?.type === "ready" && message.port) resolve(message.port);
      else if (message?.type === "request") void answer(message);
    });
    server!.on("exit", (code) => {
      if (!quitting) reject(new Error(`The local server stopped (code ${code}). See ${logFile}.`));
    });
  });
}

interface ServerMessage {
  type?: string;
  port?: number;
  id?: number;
  request?: string;
  payload?: Record<string, unknown>;
}

/*
  Requests from the server process (setup wizard and Settings). The main
  process is the only one that writes config.env, opens the file manager,
  checks for updates and deletes the app's data.
*/
async function answer({ id, request, payload = {} }: ServerMessage): Promise<void> {
  const reply = (value?: unknown, error?: string) => server?.postMessage({ type: "reply", id, value, error });
  try {
    switch (request) {
      case "save-config":
        saveConfig(paths.configFile, writableValues(payload.values));
        return reply();
      case "info":
        return reply(desktopInfo());
      case "open":
        if (payload.target === "config") shell.showItemInFolder(paths.configFile);
        else await shell.openPath(paths.dataDir);
        return reply();
      case "check-updates":
        return reply(await checkForUpdates());
      case "delete-data":
        reply();
        return void deleteDataAndRestart();
      case "focus":
        // After signing in from the system browser: back to the app.
        if (mainWindow?.isMinimized()) mainWindow.restore();
        mainWindow?.show();
        mainWindow?.focus();
        return reply();
      default:
        return reply(undefined, `Unknown request: ${request}`);
    }
  } catch (error) {
    reply(undefined, error instanceof Error ? error.message : String(error));
  }
}

function desktopInfo() {
  return {
    version: app.getVersion(),
    packageKind: packageKind(process.platform, process.env, app.isPackaged),
    dataDir: paths.dataDir,
    configFile: paths.configFile,
    portable: paths.portable,
    updates: updateStrategy(process.platform, process.env, app.isPackaged),
    lastUpdate,
  };
}

/** "Delete all local data" in Settings: back to a first start. */
async function deleteDataAndRestart(): Promise<void> {
  quitting = true;
  // Give the server a moment to answer the page before it stops.
  await new Promise((resolve) => setTimeout(resolve, 500));
  server?.kill();
  // Let the server process exit and release its files first.
  serverLog?.end();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await session.defaultSession.clearStorageData().catch(() => undefined);
  const skipped = deleteLocalData(paths);
  if (skipped.length) console.warn("Could not delete:", skipped);
  // The portable .exe and the AppImage run from a temporary copy that goes
  // away when this process exits: relaunch the file the user started.
  const launcher = process.env.PORTABLE_EXECUTABLE_FILE || process.env.APPIMAGE;
  app.relaunch(launcher ? { execPath: launcher, args: process.argv.slice(1) } : undefined);
  app.exit(0);
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
      ...telegramEnv(app.getAppPath(), config),
      CHROME_PATH: chromePath,
      HOST: "127.0.0.1",
      SCS_DESKTOP: "1",
      SCS_APP_VERSION: app.getVersion(),
      WEB_ROOT: path.join(app.getAppPath(), "web"),
      SCS_DATA_DIR: paths.dataDir,
      // Encrypts saved sign-ins; see dataKey.ts.
      SCS_DATA_KEY: loadDataKey(path.join(paths.dataDir, "secret.key"), safeStorage),
    });
    const origin = `http://127.0.0.1:${port}`;
    keepLinksOutside(win, origin);
    // /start opens the app once set up, otherwise the welcome page.
    await win.loadURL(`${origin}/start`);
    void checkForUpdates();
  } catch (error) {
    await showStatus(win, `${productName} could not start`, error instanceof Error ? error.message : String(error));
  }
}

interface UpdateResult {
  status: "current" | "available" | "ready" | "error" | "disabled";
  version?: string;
  url?: string;
  checkedAt: string;
}

let lastUpdate: UpdateResult | undefined;
let notified = false;

function releasePage(version: string): string {
  return `https://github.com/${releasesRepo}/releases/tag/v${version}`;
}

/** Checks at start-up and from Settings; the result is shown in the app. */
async function checkForUpdates(): Promise<UpdateResult> {
  const strategy = updateStrategy(process.platform, process.env, app.isPackaged);
  const checkedAt = new Date().toISOString();
  try {
    if (strategy === "auto") {
      // Downloads in the background and installs when the app quits.
      const { autoUpdater } = await import("electron-updater");
      autoUpdater.allowPrerelease = isPrerelease(app.getVersion());
      if (!autoUpdater.listenerCount("update-downloaded")) {
        autoUpdater.on("update-downloaded", (info) => {
          lastUpdate = { status: "ready", version: info.version, url: releasePage(info.version), checkedAt: new Date().toISOString() };
        });
      }
      if (lastUpdate?.status === "ready") return lastUpdate;
      const result = await autoUpdater.checkForUpdatesAndNotify({
        title: `${productName} {version} is ready`,
        body: "It will be installed when you close the app.",
      });
      const version = result?.isUpdateAvailable ? result.updateInfo.version : undefined;
      lastUpdate = version ? { status: "available", version, url: releasePage(version), checkedAt } : { status: "current", checkedAt };
    } else if (strategy === "notify") {
      const update = await findUpdate(app.getVersion());
      lastUpdate = update ? { status: "available", ...update, checkedAt } : { status: "current", checkedAt };
      if (update && !notified && Notification.isSupported()) {
        notified = true;
        const notification = new Notification({
          title: `${productName} ${update.version} is available`,
          body: "Click to open the download page.",
        });
        notification.on("click", () => void shell.openExternal(update.url));
        notification.show();
      }
    } else {
      lastUpdate = { status: "disabled", checkedAt };
    }
  } catch (error) {
    console.warn("Update check failed:", error);
    lastUpdate = { status: "error", checkedAt };
  }
  return lastUpdate;
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
