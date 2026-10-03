import express, { Request, Response } from "express";

import fs from "fs";

import { deleteFromCache, getFromCache } from "../src/cache";
import { rememberSignIns, setRememberSignIns, signOutGoogle, whatsappDataPath } from "../src/desktopSession";
import { askDesktop, desktopMode, saveDesktopConfig } from "../src/desktop";
import { historyUsage } from "../src/runs";
import { getAccountSummary } from "../src/gapi";
import { parseGoogleCredentials, verifyGoogleCredentials } from "../src/googleCredentials";

// Routes for the desktop app's setup wizard and Settings (and the account summary).
const router = express.Router();

router.post("/desktop/google_credentials", async (req: Request, res: Response) => {
  if (!desktopAction(req, res)) return;

  const credentials = parseGoogleCredentials(req.body);
  if ("error" in credentials) return res.status(400).send(credentials);

  const verification = await verifyGoogleCredentials(credentials);
  if (verification !== "valid") return res.status(400).send({ error: verification });

  try {
    await saveDesktopConfig({ GOOGLE_CLIENT_ID: credentials.clientId, GOOGLE_CLIENT_SECRET: credentials.clientSecret });
  } catch (e) {
    console.error("Saving Google credentials failed:", e);
    return res.status(500).send({ error: "save_failed" });
  }
  process.env.GOOGLE_CLIENT_ID = credentials.clientId;
  process.env.GOOGLE_CLIENT_SECRET = credentials.clientSecret;
  res.send({ ok: true });
});

// Same-origin JSON POSTs only (see crossSiteGuard and the CORS preflight).
function desktopAction(req: Request, res: Response): boolean {
  if (!desktopMode) {
    res.status(404).send({ error: "not_found" });
    return false;
  }
  if (!req.is("application/json")) {
    res.status(415).send({ error: "json_required" });
    return false;
  }
  return true;
}

router.post("/desktop/google_sign_out", async (req: Request, res: Response) => {
  if (!desktopAction(req, res)) return;
  await signOutGoogle(req.sessionID);
  res.send({ ok: true });
});

async function unlinkWhatsApp(sessionId: string): Promise<void> {
  const client = getFromCache(sessionId, "whatsapp");
  deleteFromCache(sessionId, "whatsapp");
  deleteFromCache(sessionId, "whatsapp_qr");
  // Logging out unlinks the device on the phone and clears LocalAuth's data.
  await client?.logout().catch(() => undefined);
  await client?.destroy().catch(() => undefined);
  const dir = whatsappDataPath();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
}

router.post("/desktop/whatsapp_unlink", async (req: Request, res: Response) => {
  if (!desktopAction(req, res)) return;
  await unlinkWhatsApp(req.sessionID);
  res.send({ ok: true });
});

// Settings: version, package, folders, updates, and this server's own state.
router.get("/desktop/info", async (_req: Request, res: Response) => {
  if (!desktopMode) return res.status(404).send({ error: "not_found" });
  try {
    const info = await askDesktop<object>("info");
    res.send({ ...info, rememberSignIns: rememberSignIns(), history: historyUsage() });
  } catch (e) {
    console.error("Reading the desktop info failed:", e);
    res.status(502).send({ error: "desktop_unavailable" });
  }
});

router.post("/desktop/open", async (req: Request, res: Response) => {
  if (!desktopAction(req, res)) return;
  const target = req.body?.target === "config" ? "config" : "data";
  await askDesktop("open", { target }).catch((e) => console.error("Opening the folder failed:", e));
  res.send({ ok: true });
});

router.post("/desktop/check_updates", async (req: Request, res: Response) => {
  if (!desktopAction(req, res)) return;
  try {
    res.send(await askDesktop("check-updates", {}, 60_000));
  } catch (e) {
    console.error("Checking for updates failed:", e);
    res.status(502).send({ error: "desktop_unavailable" });
  }
});

router.post("/desktop/remember_sign_ins", async (req: Request, res: Response) => {
  if (!desktopAction(req, res)) return;
  if (typeof req.body?.enabled !== "boolean") return res.status(400).send({ error: "enabled_required" });
  try {
    await saveDesktopConfig({ REMEMBER_SIGN_INS: String(req.body.enabled) });
  } catch (e) {
    console.error("Saving the setting failed:", e);
    return res.status(500).send({ error: "save_failed" });
  }
  setRememberSignIns(req.sessionID, req.body.enabled);
  res.send({ ok: true, rememberSignIns: rememberSignIns() });
});

// Signs out everywhere, then the desktop app deletes its files and restarts.
router.post("/desktop/delete_all_data", async (req: Request, res: Response) => {
  if (!desktopAction(req, res)) return;
  if (req.body?.confirm !== true) return res.status(400).send({ error: "confirm_required" });
  await signOutGoogle(req.sessionID);
  await unlinkWhatsApp(req.sessionID);
  try {
    await askDesktop("delete-data");
  } catch (e) {
    console.error("Deleting the local data failed:", e);
    return res.status(502).send({ error: "desktop_unavailable" });
  }
  res.send({ ok: true });
});

router.get("/google_account", async (req: Request, res: Response) => {
  const gAuth = getFromCache(req.sessionID, "gauth");
  if (!gAuth) return res.status(401).send({ error: "not_signed_in" });
  try {
    res.send(await getAccountSummary(gAuth));
  } catch (e) {
    console.error("Reading the Google account failed:", e);
    res.status(502).send({ error: "google_unavailable" });
  }
});

export default router;
