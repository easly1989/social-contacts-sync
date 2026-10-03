import fs from "fs";
import os from "os";
import path from "path";

import { AppPaths } from "./paths";

/*
  What the Settings page shows and changes on this computer: the package
  type, the keys the server may write to config.env, and deleting every
  local file of the app.
*/

export type PackageKind = "windows-installer" | "windows-portable" | "appimage" | "deb" | "macos" | "development";

export function packageKind(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, isPackaged: boolean): PackageKind {
  if (!isPackaged) return "development";
  if (platform === "win32") return env.PORTABLE_EXECUTABLE_DIR ? "windows-portable" : "windows-installer";
  if (platform === "linux") return env.APPIMAGE ? "appimage" : "deb";
  return "macos";
}

// Keys the server may write to config.env (setup wizard and Settings).
const writableKeys = new Set(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "REMEMBER_SIGN_INS"]);

export function writableValues(values: unknown): Record<string, string> {
  if (!values || typeof values !== "object") return {};
  return Object.fromEntries(
    Object.entries(values).filter(([key, value]) => writableKeys.has(key) && typeof value === "string" && !/[\r\n]/.test(value))
  );
}

/** Refuses folders whose deletion would take more than the app's own data. */
export function safeToDelete(dir: string, home = os.homedir()): boolean {
  const resolved = path.resolve(dir);
  return resolved !== path.parse(resolved).root && resolved !== path.resolve(home) && !path.resolve(home).startsWith(`${resolved}${path.sep}`);
}

/**
 * Deletes config.env and the data folder. Files the running app still holds
 * open (its own browser storage on Windows) are skipped and returned.
 */
export function deleteLocalData(paths: Pick<AppPaths, "configFile" | "dataDir">): string[] {
  const skipped: string[] = [];
  const remove = (target: string) => {
    try {
      fs.rmSync(target, { recursive: true, force: true });
    } catch {
      skipped.push(target);
    }
  };
  remove(paths.configFile);
  if (!safeToDelete(paths.dataDir)) return [...skipped, paths.dataDir];
  if (fs.existsSync(paths.dataDir)) {
    for (const entry of fs.readdirSync(paths.dataDir)) remove(path.join(paths.dataDir, entry));
    try {
      fs.rmdirSync(paths.dataDir);
    } catch {
      // Not empty (skipped files) or the folder is the user data folder in use.
    }
  }
  return skipped;
}
