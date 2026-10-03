import crypto from "crypto";
import fs from "fs";
import path from "path";

/*
  Small encrypted files in the desktop app's data folder (saved sign-ins).
  The key comes from the desktop app (SCS_DATA_KEY, base64, 32 bytes), which
  keeps it encrypted with the OS keychain. AES-256-GCM: tampering or a wrong
  key makes reading fail, and the caller then treats the file as absent.
*/

const version = 1;

function key(): Buffer | undefined {
  const raw = process.env.SCS_DATA_KEY;
  if (!raw) return undefined;
  const buffer = Buffer.from(raw, "base64");
  return buffer.length === 32 ? buffer : undefined;
}

export function secretStoreAvailable(): boolean {
  return Boolean(process.env.SCS_DATA_DIR && key());
}

function file(name: string): string {
  return path.join(process.env.SCS_DATA_DIR!, `${name}.enc`);
}

export function encrypt(value: unknown, dataKey: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", dataKey, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return JSON.stringify({ v: version, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: body.toString("base64") });
}

export function decrypt<T>(text: string, dataKey: Buffer): T {
  const { v, iv, tag, data } = JSON.parse(text);
  if (v !== version) throw new Error(`Unsupported secret file version ${v}`);
  const decipher = crypto.createDecipheriv("aes-256-gcm", dataKey, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]);
  return JSON.parse(plain.toString("utf8"));
}

export function writeSecret(name: string, value: unknown): void {
  const dataKey = key();
  if (!dataKey || !process.env.SCS_DATA_DIR) return;
  fs.mkdirSync(process.env.SCS_DATA_DIR, { recursive: true });
  const target = file(name);
  // Write then rename, so a crash never leaves half a file behind.
  fs.writeFileSync(`${target}.tmp`, encrypt(value, dataKey), { mode: 0o600 });
  fs.renameSync(`${target}.tmp`, target);
}

/** The stored value, or undefined when missing or unreadable. */
export function readSecret<T>(name: string): T | undefined {
  const dataKey = key();
  if (!dataKey || !process.env.SCS_DATA_DIR) return undefined;
  try {
    return decrypt<T>(fs.readFileSync(file(name), "utf8"), dataKey);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") console.warn(`Ignoring unreadable ${name}.enc:`, (e as Error).message);
    return undefined;
  }
}

export function deleteSecret(name: string): void {
  if (!process.env.SCS_DATA_DIR) return;
  fs.rmSync(file(name), { force: true });
}
