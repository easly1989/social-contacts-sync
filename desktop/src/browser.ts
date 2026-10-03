import fs from "fs";
import path from "path";

/*
  whatsapp-web.js drives a real Chromium-based browser. Prefer one that is
  already installed (Edge ships with Windows); otherwise download Chrome for
  Testing once into the data folder.
*/

function windowsCandidates(env: NodeJS.ProcessEnv): string[] {
  const roots = [env["PROGRAMFILES"], env["PROGRAMFILES(X86)"], env["LOCALAPPDATA"]].filter(Boolean) as string[];
  const relative = [
    "Google\\Chrome\\Application\\chrome.exe",
    "Microsoft\\Edge\\Application\\msedge.exe",
    "Chromium\\Application\\chrome.exe",
    "BraveSoftware\\Brave-Browser\\Application\\brave.exe",
  ];
  return relative.flatMap((rel) => roots.map((root) => path.win32.join(root, rel)));
}

const macCandidates = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
];

// Snap packages are left out: their confinement breaks automation profiles.
const linuxNames = ["google-chrome-stable", "google-chrome", "chromium", "chromium-browser", "microsoft-edge", "brave-browser"];

function linuxCandidates(env: NodeJS.ProcessEnv): string[] {
  const dirs = (env.PATH || "/usr/bin:/usr/local/bin").split(":").filter((d) => d && !d.startsWith("/snap"));
  return linuxNames.flatMap((name) => dirs.map((dir) => path.posix.join(dir, name)));
}

export function browserCandidates(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  if (platform === "win32") return windowsCandidates(env);
  if (platform === "darwin") return macCandidates;
  return linuxCandidates(env);
}

function isExecutableFile(file: string): boolean {
  try {
    const real = fs.realpathSync(file);
    if (real.startsWith("/snap/")) return false;
    return fs.statSync(real).isFile();
  } catch {
    return false;
  }
}

/** An installed browser, or undefined. CHROME_PATH wins when it exists. */
export function findInstalledBrowser(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  exists: (file: string) => boolean = isExecutableFile
): string | undefined {
  if (env.CHROME_PATH && exists(env.CHROME_PATH)) return env.CHROME_PATH;
  return browserCandidates(platform, env).find(exists);
}

/** Downloads (or reuses) Chrome for Testing in `cacheDir`. */
export async function downloadBrowser(
  cacheDir: string,
  onProgress: (downloaded: number, total: number) => void
): Promise<string> {
  const browsers = await import("@puppeteer/browsers");
  const platform = browsers.detectBrowserPlatform();
  if (!platform) throw new Error("This platform is not supported by Chrome for Testing.");

  const installed = (await browsers.getInstalledBrowsers({ cacheDir })).find(
    (b) => b.browser === browsers.Browser.CHROME && b.platform === platform
  );
  if (installed && fs.existsSync(installed.executablePath)) return installed.executablePath;

  const buildId = await browsers.resolveBuildId(browsers.Browser.CHROME, platform, browsers.ChromeReleaseChannel.STABLE);
  const result = await browsers.install({
    browser: browsers.Browser.CHROME,
    buildId,
    cacheDir,
    downloadProgressCallback: onProgress,
  });
  return result.executablePath;
}
