import express, { Request, Response } from "express";

import { TelegramError } from "../src/telegram";
import { sendTelegramCode, signOutTelegram, submitTelegramCode, submitTelegramPassword, telegramState } from "../src/telegramSession";

// Telegram sign-in (issue #36): phone → code → optional password.
const router = express.Router();

function jsonOnly(req: Request, res: Response): boolean {
  if (req.is("application/json")) return true;
  res.status(415).send({ error: "json_required" });
  return false;
}

function fail(res: Response, e: unknown): void {
  if (e instanceof TelegramError) {
    res.status(e.code === "unavailable" ? 502 : 400).send({ error: e.code, waitSeconds: e.waitSeconds });
    return;
  }
  console.error("Telegram sign-in failed:", e);
  res.status(502).send({ error: "unavailable" });
}

router.get("/telegram", (req: Request, res: Response) => {
  res.send(telegramState(req.sessionID));
});

router.post("/telegram/send_code", async (req: Request, res: Response) => {
  if (!jsonOnly(req, res)) return;
  try {
    await sendTelegramCode(req.sessionID, String(req.body?.phone ?? ""));
    res.send(telegramState(req.sessionID));
  } catch (e) {
    fail(res, e);
  }
});

router.post("/telegram/sign_in", async (req: Request, res: Response) => {
  if (!jsonOnly(req, res)) return;
  try {
    res.send(await submitTelegramCode(req.sessionID, String(req.body?.code ?? "")));
  } catch (e) {
    fail(res, e);
  }
});

router.post("/telegram/password", async (req: Request, res: Response) => {
  if (!jsonOnly(req, res)) return;
  try {
    res.send(await submitTelegramPassword(req.sessionID, String(req.body?.password ?? "")));
  } catch (e) {
    fail(res, e);
  }
});

router.post("/telegram/sign_out", async (req: Request, res: Response) => {
  if (!jsonOnly(req, res)) return;
  await signOutTelegram(req.sessionID);
  res.send(telegramState(req.sessionID));
});

export default router;
