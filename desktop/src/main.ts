import fs from "fs";
import path from "path";
import { app, BrowserWindow, dialog, Menu, nativeTheme, Notification, safeStorage, session, shell, utilityProcess, UtilityProcess } from "electron";
import type { AppUpdater } from "electron-updater";

import { resolvePaths } from "./paths";
import { loadConfig, saveConfig } from "./config";
import { loadDataKey } from "./dataKey";
import { downloadBrowser, findInstalledBrowser } from "./browser";
import { autoUpdatesOn, findUpdate, releasesRepo, updateFeed, updateStrategy } from "./updates";
import { afterUpdate, closeChoices, takePendingUpdate, UpdateLanguage, updateLanguage, updateText, writePendingUpdate } from "./updateFlow";
import { deleteLocalData, packageKind, writableValues } from "./localData";
import { telegramEnv } from "./telegramApp";
import { forgetSocialSessions, socialLogin, socialLogout, socialProfile, socialScan, socialSearch, socialStatus, socialStop, watchSessions } from "./socialScan";
import { ScanNetwork } from "./socialParse";

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
// The choice made when closing the app to install an update (see updateFlow.ts).
const pendingUpdateFile = path.join(paths.dataDir, "update-pending.json");

let mainWindow: BrowserWindow | undefined;
let server: UtilityProcess | undefined;
let serverLog: fs.WriteStream | undefined;
let quitting = false;
// What the server was started with, and where it answers: a restart reuses the first and moves the second.
let serverEnv: NodeJS.ProcessEnv | undefined;
let appOrigin = "";

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
        // Asked for: downloads it even with automatic updates off.
        return reply(await checkForUpdates(true));
      case "set-auto-updates":
        saveConfig(paths.configFile, { AUTO_UPDATES: String(payload.enabled === true) });
        if (payload.enabled === true) void checkForUpdates();
        return reply(desktopInfo());
      case "install-update":
        // "Update and restart" in Settings.
        if (lastUpdate?.status !== "ready") return reply(undefined, "No update is ready to install.");
        reply();
        return void setTimeout(() => void installUpdate(true).catch((error) => console.warn("Installing the update failed:", error)), 500);
      case "restart-server":
        reply();
        return void setTimeout(() => void restartServer(), 200);
      case "delete-data":
        reply();
        return void deleteDataAndRestart();
      // Find profiles' login scan (issue #61).
      case "social-status":
        return reply(await socialStatus());
      case "social-login":
        return reply(await socialLogin(scanNetwork(payload.network), mainWindow));
      case "social-logout":
        await socialLogout(scanNetwork(payload.network));
        return reply();
      case "social-scan":
        return reply(await socialScan(scanNetwork(payload.network)));
      case "social-stop":
        socialStop(scanNetwork(payload.network));
        return reply();
      // A sync reads a pinned profile again (issue #79).
      case "social-profile":
        return reply(await socialProfile(scanNetwork(payload.network), String(payload.handle ?? "")));
      // To review looks a contact up by name with the login (issue #104).
      case "social-search":
        return reply(await socialSearch(scanNetwork(payload.network), String(payload.query ?? "")));
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

function scanNetwork(value: unknown): ScanNetwork {
  if (value === "instagram" || value === "facebook" || value === "linkedin") return value;
  throw new Error(`Unknown network: ${String(value)}`);
}

function desktopInfo() {
  return {
    version: app.getVersion(),
    packageKind: packageKind(process.platform, process.env, app.isPackaged),
    dataDir: paths.dataDir,
    configFile: paths.configFile,
    portable: paths.portable,
    updates: updateStrategy(process.platform, process.env, app.isPackaged),
    autoUpdates: autoUpdatesOn(loadConfig(paths.configFile)),
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
  await forgetSocialSessions().catch(() => undefined);
  const skipped = deleteLocalData(paths);
  if (skipped.length) console.warn("Could not delete:", skipped);
  // The portable .exe and the AppImage run from a temporary copy that goes
  // away when this process exits: relaunch the file the user started.
  const launcher = process.env.PORTABLE_EXECUTABLE_FILE || process.env.APPIMAGE;
  app.relaunch(launcher ? { execPath: launcher, args: process.argv.slice(1) } : undefined);
  app.exit(0);
}

function keepLinksOutside(win: BrowserWindow): void {
  // The origin is read on each navigation: a restarted server answers on another port.
  const isApp = (url: string) => url === appOrigin || url.startsWith(`${appOrigin}/`);
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
  // Closing with an update ready asks what to do with it (issue #63).
  win.on("close", (event) => {
    if (quitting || lastUpdate?.status !== "ready") return;
    event.preventDefault();
    void askBeforeClosing(win);
  });
  await showStatus(win, `Starting ${productName}…`);

  try {
    const chromePath = await resolveBrowser(win);
    serverEnv = {
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
    };
    appOrigin = `http://127.0.0.1:${await startServer(serverEnv)}`;
    keepLinksOutside(win);
    // /start opens the app once set up, otherwise the welcome page.
    await win.loadURL(`${appOrigin}/start`);
    void checkForUpdates();
    // A long session still hears of a new version.
    setInterval(() => void checkForUpdates(), 6 * 60 * 60 * 1000);
  } catch (error) {
    await showStatus(win, `${productName} could not start`, error instanceof Error ? error.message : String(error));
  }
}

/** The server again, without closing the app (Settings, or a sync that stopped answering). */
async function restartServer(): Promise<void> {
  const win = mainWindow;
  if (!win || !serverEnv) return;
  await showStatus(win, `Restarting ${productName}…`);
  const old = server;
  await new Promise<void>((resolve) => {
    if (!old?.pid) return resolve();
    old.once("exit", () => resolve());
    old.kill();
  });
  serverLog?.end();
  try {
    appOrigin = `http://127.0.0.1:${await startServer(serverEnv)}`;
    await win.loadURL(`${appOrigin}/start`);
  } catch (error) {
    await showStatus(win, `${productName} could not start`, error instanceof Error ? error.message : String(error));
  }
}

interface UpdateResult {
  status: "current" | "available" | "downloading" | "ready" | "error" | "disabled";
  version?: string;
  url?: string;
  /** While downloading, 0–100. */
  progress?: number;
  checkedAt: string;
}

let lastUpdate: UpdateResult | undefined;
let notified = false;

function releasePage(version: string): string {
  return `https://github.com/${releasesRepo}/releases/tag/v${version}`;
}

/** The language the app is shown in, for the update dialogs. */
async function uiLanguage(): Promise<UpdateLanguage> {
  const lang = await mainWindow?.webContents.executeJavaScript("document.documentElement.lang").catch(() => undefined);
  return updateLanguage(typeof lang === "string" && lang ? lang : app.getLocale());
}

let watchingDownloads = false;

/** The download's progress, shown in Settings and the sidebar. */
function watchDownloads(autoUpdater: AppUpdater): void {
  if (watchingDownloads) return;
  watchingDownloads = true;
  autoUpdater.on("download-progress", (progress) => {
    if (lastUpdate?.status === "downloading") lastUpdate = { ...lastUpdate, progress: Math.floor(progress.percent) };
  });
  autoUpdater.on("update-downloaded", (info) => {
    lastUpdate = { status: "ready", version: info.version, url: releasePage(info.version), checkedAt: new Date().toISOString() };
    void notifyDownloaded(info.version);
  });
  autoUpdater.on("error", (error) => {
    console.warn("Updating failed:", error);
    if (lastUpdate?.status === "downloading") lastUpdate = { status: "error", checkedAt: new Date().toISOString() };
  });
}

async function notifyDownloaded(version: string): Promise<void> {
  if (notified || !Notification.isSupported()) return;
  notified = true;
  const lang = await uiLanguage();
  new Notification({ title: updateText(lang, "downloadedTitle", { product: productName, version }), body: updateText(lang, "downloadedBody") }).show();
}

/**
 * Checks at start-up, every few hours and from Settings (`asked`); the
 * result is shown in the app. With automatic updates off, only an asked
 * check downloads the update.
 */
async function checkForUpdates(asked = false): Promise<UpdateResult> {
  const strategy = updateStrategy(process.platform, process.env, app.isPackaged);
  const checkedAt = new Date().toISOString();
  try {
    if (strategy === "auto") {
      // Downloads in the background; installed when the app closes (see askBeforeClosing).
      const { autoUpdater } = await import("electron-updater");
      watchDownloads(autoUpdater);
      if (lastUpdate?.status === "ready" || lastUpdate?.status === "downloading") return lastUpdate;
      // We pick the release (see updateFeed), electron-updater installs it.
      const update = await findUpdate(app.getVersion());
      if (update) {
        autoUpdater.setFeedURL(updateFeed(update.version));
        autoUpdater.autoDownload = asked || autoUpdatesOn(loadConfig(paths.configFile));
        const result = await autoUpdater.checkForUpdates();
        if (result?.isUpdateAvailable) {
          const version = result.updateInfo.version;
          // Its failure comes in as the "error" event too (see watchDownloads).
          result.downloadPromise?.catch(() => undefined);
          // An earlier download of the same version is ready at once (the
          // event may have come in during the await).
          const now = lastUpdate as UpdateResult | undefined;
          if (now?.status === "ready") return now;
          lastUpdate = result.downloadPromise
            ? { status: "downloading", version, progress: 0, url: releasePage(version), checkedAt }
            : { status: "available", version, url: releasePage(version), checkedAt };
          return lastUpdate;
        }
      }
      lastUpdate = { status: "current", checkedAt };
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

/**
 * Closes the app and runs the installer with its own progress window. The
 * installer opens the app again when it's done; `reopen` says whether that
 * start goes straight into the app or first asks (see openAfterUpdate).
 */
async function installUpdate(reopen: boolean, lang?: UpdateLanguage): Promise<void> {
  const version = lastUpdate?.status === "ready" ? lastUpdate.version : undefined;
  if (!version) throw new Error("No update is ready to install.");
  const { autoUpdater } = await import("electron-updater");
  writePendingUpdate(pendingUpdateFile, { version, reopen, lang: lang ?? (await uiLanguage()) });
  quitting = true;
  autoUpdater.quitAndInstall(false, true);
}

let askingBeforeClosing = false;

/** Closing with an update ready: update now, close without updating, or stay. */
async function askBeforeClosing(win: BrowserWindow): Promise<void> {
  if (askingBeforeClosing || !lastUpdate?.version) return;
  askingBeforeClosing = true;
  try {
    const lang = await uiLanguage();
    const labels = { update: "updateAndClose", close: "closeWithout", cancel: "cancel" } as const;
    const { response, checkboxChecked } = await dialog.showMessageBox(win, {
      type: "info",
      title: productName,
      message: updateText(lang, "readyTitle", { version: lastUpdate.version }),
      detail: updateText(lang, "readyDetail"),
      buttons: closeChoices.map((choice) => updateText(lang, labels[choice])),
      defaultId: 0,
      cancelId: closeChoices.indexOf("cancel"),
      noLink: true,
      checkboxLabel: updateText(lang, "reopen"),
      checkboxChecked: false,
    });
    const choice = closeChoices[response];
    if (choice === "update") {
      await installUpdate(checkboxChecked, lang);
    } else if (choice === "close") {
      // Kept for next time: the downloaded update is offered again then.
      const { autoUpdater } = await import("electron-updater");
      autoUpdater.autoInstallOnAppQuit = false;
      quitting = true;
      app.quit();
    }
  } catch (error) {
    console.warn("Closing with an update failed:", error);
    quitting = true;
    app.quit();
  } finally {
    askingBeforeClosing = false;
  }
}

/** After an update: straight into the app, or a small window asking first. */
async function openAfterUpdate(): Promise<boolean> {
  const pending = takePendingUpdate(pendingUpdateFile);
  if (!pending || afterUpdate(pending, app.getVersion()) === "open") return true;
  const { response } = await dialog.showMessageBox({
    type: "info",
    title: productName,
    message: updateText(pending.lang, "installedTitle", { product: productName, version: app.getVersion() }),
    detail: updateText(pending.lang, "installedDetail"),
    buttons: [updateText(pending.lang, "open"), updateText(pending.lang, "close")],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  return response === 0;
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

app.whenReady().then(async () => {
  if (process.platform !== "darwin") Menu.setApplicationMenu(null);
  // The server, and through it the page, hears at once when a site signs the app in or out (issue #107).
  watchSessions((value) => server?.postMessage({ type: "event", event: "login-changed", value }));
  if (!(await openAfterUpdate())) return app.quit();
  void start();
});
