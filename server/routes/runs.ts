import express, { Request, Response } from "express";

import { getFromCache, setInCache } from "../src/cache";
import { deleteContactPhoto, listContacts, OAuth2Client, updateContactPhoto } from "../src/gapi";
import { removeContactLink } from "../src/contactLinks";
import { peopleContactsApi } from "../src/cleanup/people";
import { GoogleStats } from "../../interfaces/api";
import { getRun, getRunPhoto, listRuns, updateRun } from "../src/runs";
import { googleRateLimiter } from "../src/sync";
import { undoRun } from "../src/undo";

// Reports, history and undo of sync runs (issue #20).
const router = express.Router();

const statsMaxAge = 5 * 60 * 1000;

// Photo coverage of the address book, for the dashboard. Listing every
// contact is slow for big address books, so it's cached for a few minutes.
router.get("/google_stats", async (req: Request, res: Response) => {
  const gAuth: OAuth2Client | undefined = getFromCache(req.sessionID, "gauth");
  if (!gAuth) return res.status(401).send({ error: "not_signed_in" });
  const cached: GoogleStats | undefined = getFromCache(req.sessionID, "google_stats");
  if (cached && req.query.refresh === undefined && Date.now() - Date.parse(cached.updatedAt) < statsMaxAge) return res.send(cached);
  try {
    const contacts = await listContacts(gAuth);
    const stats: GoogleStats = {
      totalContacts: contacts.length,
      withPhoto: contacts.filter((c) => c.hasPhoto).length,
      updatedAt: new Date().toISOString(),
    };
    setInCache(req.sessionID, "google_stats", stats);
    res.send(stats);
  } catch (e) {
    console.error("Reading contact statistics failed:", e);
    res.status(502).send({ error: "google_unavailable" });
  }
});

// Asks the running sync to stop before its next contact.
router.post("/sync/stop", (req: Request, res: Response) => {
  if (!req.is("application/json")) return res.status(415).send({ error: "json_required" });
  setInCache(req.sessionID, "sync_stop", true);
  res.send({ ok: true });
});

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
    removeLink: (contactId, url) => removeContactLink(peopleContactsApi(gAuth), contactId, url),
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
