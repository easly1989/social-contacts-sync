import crypto from "crypto";
import fs from "fs";
import path from "path";

/*
  config.env: plain KEY=value lines, editable by hand. Comments and unknown
  keys are preserved when the app updates a value.
*/

export type Config = Record<string, string>;

const template = (sessionSecret: string) => `# Social Contacts Sync settings. Edit them while the app is closed.

# Google OAuth client of type "Desktop app" (see the README).
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Telegram app credentials from my.telegram.org. Releases include them;
# set them only for a build without, or to use your own app.
# TELEGRAM_API_ID=
# TELEGRAM_API_HASH=

# Keep Google and WhatsApp signed in between launches (saved encrypted).
REMEMBER_SIGN_INS=true

# Signs the cookie between the app window and its local server.
# Generated on first start; changing it only signs you out.
SESSION_SECRET=${sessionSecret}
`;

function unquote(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) return v.slice(1, -1);
  return v;
}

export function parseConfig(text: string): Config {
  const config: Config = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (match) config[match[1]] = unquote(match[2]);
  }
  return config;
}

function serializeValue(value: string): string {
  return /[\s#"']/.test(value) ? JSON.stringify(value) : value;
}

/** Returns `text` with `values` set, replacing existing lines in place. */
export function updateConfigText(text: string, values: Config): string {
  const remaining = new Map(Object.entries(values));
  const lines = text.split(/\r?\n/).map((line) => {
    const match = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (!match || !remaining.has(match[2])) return line;
    const value = remaining.get(match[2])!;
    remaining.delete(match[2]);
    return `${match[1]}${match[2]}=${serializeValue(value)}`;
  });
  if (remaining.size) {
    if (lines.length && lines[lines.length - 1] === "") lines.pop();
    for (const [key, value] of remaining) lines.push(`${key}=${serializeValue(value)}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** Reads config.env, creating it (with a fresh session secret) when missing. */
export function loadConfig(file: string): Config {
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, template(crypto.randomBytes(32).toString("hex")), { mode: 0o600 });
  }
  const config = parseConfig(fs.readFileSync(file, "utf8"));
  if (!config.SESSION_SECRET) {
    config.SESSION_SECRET = crypto.randomBytes(32).toString("hex");
    saveConfig(file, { SESSION_SECRET: config.SESSION_SECRET });
  }
  return config;
}

export function saveConfig(file: string, values: Config): void {
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  fs.writeFileSync(file, updateConfigText(current, values), { mode: 0o600 });
}
