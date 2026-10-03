import express, { Request, Response } from "express";

import { getFromCache } from "../src/cache";
import { deleteContactPhoto, OAuth2Client, updateContactPhoto } from "../src/gapi";
import { getRun, getRunPhoto, listRuns, updateRun } from "../src/runs";
import { googleRateLimiter } from "../src/sync";
import { undoRun } from "../src/undo";

// Reports, history and undo of sync runs (issue #20).
const router = express.Router();

router.get("/runs", (req: Request, res: Response) => {
  res.send(listRuns(req.sessionID));
});

router.get("/runs/:id", (req: Request, res: Response) => {
  const run = getRun(req.sessionID, String(req.params.id));
  if (!run) return res.status(404).send({ error: "not_found" });
  res.send(run);
});

router.get("/runs/:id/photos/:index/:kind", (req: Request, res: Response) => {
  const kind = req.params.kind === "previous" ? "previous" : req.params.kind === "photo" ? "photo" : undefined;
  const photo = kind && getRunPhoto(req.sessionID, String(req.params.id), Number(req.params.index), kind);
  if (!photo) return res.status(404).end();
  res.set("Cache-Control", "private, max-age=86400").type("image/jpeg").send(Buffer.from(photo, "base64"));
});

// Undoing writes to Google at its rate limit, so it continues in the
// background; the run shows each entry as undone when done.
router.post("/runs/:id/undo", (req: Request, res: Response) => {
  if (!req.is("application/json")) return res.status(415).send({ error: "json_required" });
  const gAuth: OAuth2Client | undefined = getFromCache(req.sessionID, "gauth");
  if (!gAuth) return res.status(401).send({ error: "not_signed_in" });
  const run = getRun(req.sessionID, String(req.params.id));
  if (!run) return res.status(404).send({ error: "not_found" });

  const indexes = Array.isArray(req.body?.indexes) ? req.body.indexes.filter(Number.isInteger) : undefined;
  const sessionId = req.sessionID;
  const limiter = googleRateLimiter();
  undoRun(run, (index) => getRunPhoto(sessionId, run.id, index, "previous"), {
    setPhoto: (contactId, photo) => updateContactPhoto(gAuth, contactId, photo),
    deletePhoto: (contactId) => deleteContactPhoto(gAuth, contactId),
  }, {
    indexes,
    beforeWrite: async () => void (await limiter.removeTokens(1)),
    onUndone: () => updateRun(run),
  })
    .then(() => updateRun(run))
    .catch((e) => {
      console.error(`Undoing run ${run.id} failed:`, e);
      updateRun(run);
    });
  res.status(202).send({ ok: true });
});

export default router;
