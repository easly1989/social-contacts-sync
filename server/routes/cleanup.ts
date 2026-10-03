import express, { Request, Response } from "express";
import { CountryCode } from "libphonenumber-js";

import { CleanupScan, CleanupSummary, MergeRequest } from "../../interfaces/api";
import { deleteFromCache, getFromCache, setInCache } from "../src/cache";
import { OAuth2Client } from "../src/gapi";
import { inferRegion } from "../src/phone";
import { executeMerge, MergeError, undoMerge } from "../src/cleanup/merge";
import { ContactsApi, peopleContactsApi, toCleanupContact } from "../src/cleanup/people";
import { pairKey, scanContacts } from "../src/cleanup/scan";
import { CleanupAction, getAction, getPrefs, getScan, listActions, saveAction, savePrefs, setScan } from "../src/cleanup/store";

// Clean up: scan, merge duplicates, history of merges with undo (issue #28).
export function cleanupRouter(contactsApi: (auth: OAuth2Client) => ContactsApi = peopleContactsApi): express.Router {
  const router = express.Router();

  function google(req: Request, res: Response): ContactsApi | undefined {
    const gAuth: OAuth2Client | undefined = getFromCache(req.sessionID, "gauth");
    if (!gAuth) res.status(401).send({ error: "not_signed_in" });
    return gAuth && contactsApi(gAuth);
  }

  function jsonOnly(req: Request, res: Response): boolean {
    if (req.is("application/json")) return true;
    res.status(415).send({ error: "json_required" });
    return false;
  }

  /** The user's own country (from WhatsApp), else the browser's. */
  function region(req: Request): CountryCode | undefined {
    const own = inferRegion(getFromCache(req.sessionID, "whatsapp")?.info?.wid?.user);
    const asked = typeof req.body?.region === "string" && /^[A-Z]{2}$/.test(req.body.region) ? (req.body.region as CountryCode) : undefined;
    return own ?? asked;
  }

  function summary(scan: CleanupScan | undefined): CleanupSummary {
    return {
      scannedAt: scan?.scannedAt,
      totalContacts: scan?.totalContacts,
      duplicates: scan?.duplicates.length ?? 0,
      sharedNumbers: scan?.sharedNumbers.length ?? 0,
      missingCountryCode: scan?.missingCountryCode.length ?? 0,
    };
  }

  router.get("/cleanup", (req: Request, res: Response) => {
    res.send({ scan: getScan(req.sessionID) ?? null });
  });

  // Counts only, for the sidebar and the dashboard.
  router.get("/cleanup/summary", (req: Request, res: Response) => {
    res.send(summary(getScan(req.sessionID)));
  });

  router.post("/cleanup/scan", async (req: Request, res: Response) => {
    if (!jsonOnly(req, res)) return;
    const api = google(req, res);
    if (!api) return;
    try {
      const prefs = getPrefs(req.sessionID);
      const contacts = (await api.list()).filter((p) => p.resourceName).map(toCleanupContact);
      const scan = scanContacts(contacts, {
        region: region(req),
        ignoredPairs: new Set(prefs.ignoredPairs),
        sharedNumbers: new Set(prefs.sharedNumbers),
      });
      setScan(req.sessionID, scan);
      res.send(scan);
    } catch (e) {
      console.error("Scanning contacts failed:", e);
      res.status(502).send({ error: "google_unavailable" });
    }
  });

  // "Not duplicates": remember every pair in the group.
  router.post("/cleanup/ignore", (req: Request, res: Response) => {
    if (!jsonOnly(req, res)) return;
    const scan = getScan(req.sessionID);
    const group = scan?.duplicates.find((g) => g.id === req.body?.groupId);
    if (!scan || !group) return res.status(404).send({ error: "not_found" });
    const prefs = getPrefs(req.sessionID);
    const pairs = new Set(prefs.ignoredPairs);
    group.contactIds.forEach((a, i) => group.contactIds.slice(i + 1).forEach((b) => pairs.add(pairKey(a, b))));
    savePrefs(req.sessionID, { ...prefs, ignoredPairs: [...pairs] });
    scan.duplicates = scan.duplicates.filter((g) => g !== group);
    res.send(summary(scan));
  });

  router.post("/cleanup/merge", async (req: Request, res: Response) => {
    if (!jsonOnly(req, res)) return;
    const api = google(req, res);
    if (!api) return;
    const request = req.body as MergeRequest;
    const scan = getScan(req.sessionID);
    const group = scan?.duplicates.find((g) => g.id === request?.groupId);
    if (!scan || !group) return res.status(404).send({ error: "not_found" });
    if (getFromCache(req.sessionID, "cleanup_busy")) return res.status(409).send({ error: "busy" });

    const sessionId = req.sessionID;
    const kept = scan.contacts[request.keepId];
    const action: CleanupAction = {
      id: `${new Date().toISOString().replace(/[:.]/g, "-")}-merge`,
      kind: "merge",
      at: new Date().toISOString(),
      title: kept?.name ?? kept?.emails[0]?.value ?? kept?.phones[0]?.value ?? "",
      contacts: group.contactIds.length,
      backup: { people: [], photos: [], keptId: request.keepId, steps: { updated: false, photo: false, deleted: [] } },
    };
    const save = (backup: CleanupAction["backup"]) => saveAction(sessionId, { ...action, backup });
    setInCache(sessionId, "cleanup_busy", true);
    try {
      const backup = await executeMerge(api, group.contactIds, request, {
        region: (scan.region as CountryCode | undefined) ?? undefined,
        expectedUpdates: Object.fromEntries(group.contactIds.map((id) => [id, scan.contacts[id]?.updatedAt])),
        save,
      });
      action.backup = backup;
      // The scan without the merged group and the deleted contacts.
      const deleted = new Set(backup.steps.deleted);
      scan.duplicates = scan.duplicates.filter((g) => g !== group);
      scan.sharedNumbers = scan.sharedNumbers
        .map((s) => ({ ...s, contactIds: s.contactIds.filter((id) => !deleted.has(id)) }))
        .filter((s) => s.contactIds.length > 1);
      scan.missingCountryCode = scan.missingCountryCode.filter((m) => !deleted.has(m.contactId));
      deleted.forEach((id) => delete scan.contacts[id]);
      scan.contacts[request.keepId] = toCleanupContact(await api.get(request.keepId));
      res.send({ actionId: action.id, summary: summary(scan) });
    } catch (e) {
      if (e instanceof MergeError) return res.status(e.code === "changed_since_scan" ? 409 : 400).send({ error: e.code });
      console.error("Merging contacts failed:", e);
      if (action.backup.steps.updated) {
        action.incomplete = true;
        save(action.backup);
      }
      res.status(502).send({ error: "google_unavailable", actionId: action.backup.steps.updated ? action.id : undefined });
    } finally {
      deleteFromCache(sessionId, "cleanup_busy");
    }
  });

  router.get("/cleanup/actions", (req: Request, res: Response) => {
    res.send(listActions(req.sessionID));
  });

  router.post("/cleanup/actions/:id/undo", async (req: Request, res: Response) => {
    if (!jsonOnly(req, res)) return;
    const api = google(req, res);
    if (!api) return;
    const action = getAction(req.sessionID, String(req.params.id));
    if (!action) return res.status(404).send({ error: "not_found" });
    if (action.undone) return res.send({ ok: true });
    const sessionId = req.sessionID;
    try {
      await undoMerge(api, action.backup, (backup) => saveAction(sessionId, { ...action, backup }));
      action.undone = true;
      saveAction(sessionId, action);
      const scan = getScan(sessionId);
      if (scan) scan.stale = true;
      res.send({ ok: true });
    } catch (e) {
      console.error(`Undoing ${action.id} failed:`, e);
      res.status(502).send({ error: "google_unavailable" });
    }
  });

  return router;
}

export default cleanupRouter();
