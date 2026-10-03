import fs from "fs";
import path from "path";

import { Config } from "./config";

/*
  Telegram app credentials for the server (issue #36): the user's own from
  config.env when both are set, otherwise the ones built into release
  packages (telegram.json, written by scripts/stage.mjs from CI secrets).
*/
export function telegramEnv(appPath: string, config: Config): Record<string, string> {
  if (config.TELEGRAM_API_ID && config.TELEGRAM_API_HASH) return { TELEGRAM_API_ID: config.TELEGRAM_API_ID, TELEGRAM_API_HASH: config.TELEGRAM_API_HASH };
  try {
    const builtIn = JSON.parse(fs.readFileSync(path.join(appPath, "telegram.json"), "utf8"));
    if (builtIn?.apiId && builtIn?.apiHash) return { TELEGRAM_API_ID: String(builtIn.apiId), TELEGRAM_API_HASH: String(builtIn.apiHash) };
  } catch {
    // Not a release build.
  }
  return {};
}
