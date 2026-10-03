import fs from "fs";
import path from "path";

export interface AppPaths {
  /** Folder holding config.env. */
  configDir: string;
  configFile: string;
  /** Sessions, downloaded browser, logs, backups. */
  dataDir: string;
  /** True when everything lives next to the executable. */
  portable: boolean;
}

export interface PathInputs {
  env: NodeJS.ProcessEnv;
  /** Electron's per-user data folder (app.getPath("userData")). */
  userData: string;
  isWritable?: (dir: string) => boolean;
}

export const dataFolderName = "social-contacts-sync-data";

export function isWritable(dir: string): boolean {
  try {
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function inside(dir: string, portable: boolean): AppPaths {
  return {
    configDir: dir,
    configFile: path.join(dir, "config.env"),
    dataDir: portable ? path.join(dir, dataFolderName) : dir,
    portable,
  };
}

/**
 * Where settings and data live:
 *  1. SCS_DATA_DIR, when set;
 *  2. next to the executable for the Windows portable .exe and the Linux
 *     AppImage ("download and run" builds), if that folder is writable;
 *  3. the OS user data folder otherwise (installers, .deb, macOS).
 */
export function resolvePaths({ env, userData, isWritable: writable = isWritable }: PathInputs): AppPaths {
  if (env.SCS_DATA_DIR) return inside(path.resolve(env.SCS_DATA_DIR), false);

  // Set by electron-builder's portable launcher and by the AppImage runtime.
  const launcherDir = env.PORTABLE_EXECUTABLE_DIR || (env.APPIMAGE ? path.dirname(env.APPIMAGE) : undefined);
  if (launcherDir && writable(launcherDir)) return inside(launcherDir, true);

  return inside(userData, false);
}
