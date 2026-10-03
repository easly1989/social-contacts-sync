import express from "express";
import { Request, Response } from "express";
import WebSocket from "ws";
// @ts-ignore
import patch from "express-ws/lib/add-ws-method";

import { WAState } from "whatsapp-web.js";

import { EventType, SessionStatus, SyncOptions } from "../../interfaces/api";
import { initWhatsApp } from "../src/whatsapp";
import { initSync } from "../src/sync";
import { generateGoogleAuthUrl, getOAuth2ClientFromCode } from "../src/gapi";
import { deleteFromCache, getFromCache, setInCache } from "../src/cache";
import { enforcePayments } from "../src/config";
import { checkPurchase } from "../src/payments";
import { consumeOAuthState, createOAuthState } from "../src/oauthState";
import { desktopMode, safeReturnPath } from "../src/desktop";
import { hasSavedWhatsAppSession, persistGoogleAuth } from "../src/desktopSession";
import { sendEvent } from "../src/ws";
import { telegramState } from "../src/telegramSession";

// Based on https://github.com/HenningM/express-ws/issues/86
const router = express.Router({ mergeParams: true });
patch(router);

function cleanup(sessionID: string) {
  // The desktop app's session lives as long as the app.
  if (desktopMode) return;

  /*
    Cleanup the session and client objects.
    This is done with a timeout to prevent cleanup on websocket disconnect
      and re-connect (for example, during a page refresh).
  */
  const timeout = setTimeout(async () => {
    if (getFromCache(sessionID, "whatsapp") !== undefined) {
      try {
        const client = getFromCache(sessionID, "whatsapp");
        deleteFromCache(sessionID, "whatsapp");
        client.destroy();
      } catch (e) {}
    }

    deleteFromCache(sessionID, "gauth");
    deleteFromCache(sessionID, "ws");
  }, 5 * 60 * 1000); // 5 minutes.

  setInCache(sessionID, "cleanup", timeout);
}

const signedInPage = `<!doctype html><html><head><meta charset="utf-8"><title>Social Contacts Sync</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#f5f5fa;color:#1c1d26">
<main style="text-align:center;max-width:28rem;padding:2rem"><h1 style="font-size:1.5rem">Signed in to Google</h1>
<p>You can close this tab and go back to Social Contacts Sync.</p>
<p lang="it" style="color:#6b6c78">Accesso effettuato: puoi chiudere questa scheda e tornare a Social Contacts Sync.</p></main></body></html>`;

router.get("/", (req: Request, res: Response) => {
  res.send("{}");
});

router.ws("/ws", (ws: WebSocket, req: Request) => {
  if (getFromCache(req.sessionID, "cleanup") !== undefined) {
    clearTimeout(getFromCache(req.sessionID, "cleanup"));
    deleteFromCache(req.sessionID, "cleanup");
  }

  ws.addEventListener("close", () => cleanup(req.sessionID));
  setInCache(req.sessionID, "ws", ws);
});

// Used by route guard
router.get("/status", async (req: Request, res: Response) => {
  let whatsappConnected = false;
  const whatsappClient = getFromCache(req.sessionID, "whatsapp");
  try {
    whatsappConnected =
      (await whatsappClient?.getState()) ===
      WAState.CONNECTED;
  } catch {}

  const status: SessionStatus = {
    whatsappConnected,
    googleConnected: getFromCache(req.sessionID, "gauth") !== undefined,
    enforcePayments,
    desktop: desktopMode,
    whatsappStarting: Boolean(whatsappClient) && !whatsappConnected,
    whatsappSaved: hasSavedWhatsAppSession(),
    googleConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    telegramAvailable: telegramState(req.sessionID).available,
    telegramConnected: telegramState(req.sessionID).connected,
    purchased: enforcePayments
      ? getFromCache(req.sessionID, "purchased")
      : true,
  };

  res.send(status);
});

router.get("/init_whatsapp", async (req: Request, res: Response) => {
  // Desktop: keep a session that is starting or reconnecting, and show the
  // page that asks again the QR code it is waiting on.
  if (desktopMode && getFromCache(req.sessionID, "whatsapp") !== undefined) {
    const qr = getFromCache(req.sessionID, "whatsapp_qr");
    if (qr) sendEvent(getFromCache(req.sessionID, "ws"), EventType.WhatsAppQR, qr);
    return res.send("{}");
  }

  if (getFromCache(req.sessionID, "whatsapp") !== undefined)
    try {
      const client = getFromCache(req.sessionID, "whatsapp");
      deleteFromCache(req.sessionID, "whatsapp");
      client.destroy();
    } catch (e) {}

  const client = initWhatsApp(req.sessionID);
  setInCache(req.sessionID, "whatsapp", client);
  res.send("{}");
});

router.get("/google_auth_start", (req: Request, res: Response) => {
  const state = createOAuthState(req.sessionID, safeReturnPath(req.query.return));
  const redirectUri = `${req.protocol}://${req.get("host")}/api/google_callback`;
  const authUrl = generateGoogleAuthUrl(redirectUri, state);
  res.redirect(authUrl);
});

router.get("/google_callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect("/?error=google_auth_denied");
  }

  // The session that started the sign-in. In the desktop app the consent page
  // runs in the system browser, so this may not be the session of `req`.
  const signIn = consumeOAuthState(state);
  if (!signIn) {
    return res.redirect("/?error=invalid_state");
  }

  const redirectUri = `${req.protocol}://${req.get("host")}/api/google_callback`;
  try {
    const gAuth = await getOAuth2ClientFromCode(code as string, redirectUri);
    const { sessionId: sessionID, returnTo = "/options" } = signIn;
    setInCache(sessionID, "gauth", gAuth);
    persistGoogleAuth(gAuth);
    if (sessionID === req.sessionID) return res.redirect(returnTo);

    // Signed in from another browser: move the app window on and tell the
    // user they can go back to it.
    sendEvent(getFromCache(sessionID, "ws"), EventType.Redirect, returnTo);
    res.send(signedInPage);
  } catch (e) {
    res.redirect("/?error=google_token_exchange_failed");
  }
});

router.get("/init_sync", (req: Request, res: Response) => {
  initSync(req.sessionID, req.query as SyncOptions);
  res.send("{}");
});

router.post("/check_purchase", async (req: Request, res: Response) => {
  const email = req.body.email;
  const purchased = await checkPurchase(email);
  setInCache(req.sessionID, "purchased", purchased);
  setInCache(req.sessionID, "email", email);
  res.send({ purchased });
});

export default router;
