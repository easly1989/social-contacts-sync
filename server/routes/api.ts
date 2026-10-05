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
import { askDesktop, desktopMode, safeReturnPath } from "../src/desktop";
import { hasSavedWhatsAppSession, persistGoogleAuth } from "../src/desktopSession";
import { sendEvent } from "../src/ws";
import { hasSavedTelegram, telegramState } from "../src/telegramSession";

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

/** A page for the system browser, which the desktop app's sign-in leaves on the local server. */
function browserPage(title: string, text: string, italian: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Social Contacts Sync</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#f5f5fa;color:#1c1d26">
<main style="text-align:center;max-width:28rem;padding:2rem"><h1 style="font-size:1.5rem">${title}</h1>
<p>${text}</p>
<p lang="it" style="color:#6b6c78">${italian}</p></main></body></html>`;
}

const signedInPage = browserPage(
  "Signed in to Google",
  "You can close this tab and go back to Social Contacts Sync.",
  "Accesso effettuato: puoi chiudere questa scheda e tornare a Social Contacts Sync."
);
const signInFailedPage = browserPage(
  "Google sign-in didn't complete",
  "Close this tab, go back to Social Contacts Sync and press Sign in with Google again.",
  "L'accesso non è stato completato: chiudi questa scheda, torna a Social Contacts Sync e premi di nuovo Accedi con Google."
);

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
    telegramSaved: hasSavedTelegram(),
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
  // The desktop app signs in from the system browser: the app itself stays
  // in its window, so the browser only gets a page saying what happened.
  const failed = (reason: string) => (desktopMode ? res.send(signInFailedPage) : res.redirect(`/?error=${reason}`));

  if (error) return failed("google_auth_denied");

  // The session that started the sign-in. In the desktop app the consent page
  // runs in the system browser, so this may not be the session of `req`.
  const signIn = consumeOAuthState(state);
  if (!signIn) return failed("invalid_state");

  const redirectUri = `${req.protocol}://${req.get("host")}/api/google_callback`;
  try {
    const gAuth = await getOAuth2ClientFromCode(code as string, redirectUri);
    const { sessionId: sessionID, returnTo = "/options" } = signIn;
    setInCache(sessionID, "gauth", gAuth);
    persistGoogleAuth(gAuth);
    // The desktop app has one session for the window and the browser, so
    // the session alone can't tell them apart.
    if (sessionID === req.sessionID && !desktopMode) return res.redirect(returnTo);

    // Signed in from another browser: move the app window on, bring it to the
    // front, and tell the user they can go back to it.
    sendEvent(getFromCache(sessionID, "ws"), EventType.Redirect, returnTo);
    if (desktopMode) askDesktop("focus").catch(() => undefined);
    res.send(signedInPage);
  } catch (e) {
    failed("google_token_exchange_failed");
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
