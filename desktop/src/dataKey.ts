import crypto from "crypto";
import fs from "fs";

/*
  The key the server uses to encrypt saved sign-ins. It is stored in
  secret.key, itself encrypted with the OS keychain (Electron safeStorage)
  when available. If it can't be read back (keychain reset, portable folder
  moved to another computer), a new key is made and the old saved sign-ins
  simply become unreadable: the user signs in again.
*/

export interface KeyProtector {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

interface KeyFile {
  v: 1;
  protected: boolean;
  key: string;
}

function read(file: string, protector: KeyProtector): string | undefined {
  try {
    const stored: KeyFile = JSON.parse(fs.readFileSync(file, "utf8"));
    const key = stored.protected ? protector.decryptString(Buffer.from(stored.key, "base64")) : stored.key;
    return Buffer.from(key, "base64").length === 32 ? key : undefined;
  } catch {
    return undefined;
  }
}

/** The base64 data key, created on first use. */
export function loadDataKey(file: string, protector: KeyProtector): string {
  const existing = read(file, protector);
  if (existing) return existing;

  const key = crypto.randomBytes(32).toString("base64");
  const isProtected = protector.isEncryptionAvailable();
  const stored: KeyFile = {
    v: 1,
    protected: isProtected,
    key: isProtected ? protector.encryptString(key).toString("base64") : key,
  };
  fs.writeFileSync(file, JSON.stringify(stored), { mode: 0o600 });
  return key;
}
