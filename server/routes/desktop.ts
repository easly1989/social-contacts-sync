import express, { Request, Response } from "express";

import { deleteFromCache, getFromCache } from "../src/cache";
import { signOutGoogle, whatsappDataPath } from "../src/desktopSession";
import fs from "fs";
import { desktopMode, saveDesktopConfig } from "../src/desktop";
import { getAccountSummary } from "../src/gapi";
import { parseGoogleCredentials, verifyGoogleCredentials } from "../src/googleCredentials";

// Routes for the desktop app's setup wizard (and its account summary).
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

router.post("/desktop/whatsapp_unlink", async (req: Request, res: Response) => {
  if (!desktopAction(req, res)) return;
  const client = getFromCache(req.sessionID, "whatsapp");
  deleteFromCache(req.sessionID, "whatsapp");
  deleteFromCache(req.sessionID, "whatsapp_qr");
  // Logging out unlinks the device on the phone and clears LocalAuth's data.
  await client?.logout().catch(() => undefined);
  await client?.destroy().catch(() => undefined);
  const dir = whatsappDataPath();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
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
