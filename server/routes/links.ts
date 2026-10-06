import express, { Request, Response } from "express";

import { getFromCache } from "../src/cache";
import { addContactLink } from "../src/contactLinks";
import { ContactsApi, peopleContactsApi } from "../src/cleanup/people";
import { OAuth2Client } from "../src/gapi";
import { getLookup, saveLookup, sessionPacer } from "../src/linkLookups";
import { getRun, setRunPhoto, updateRun } from "../src/runs";
import { LinkBlockedError, LinkPhoto, lookupProfileLink, networkNames, parseProfileLink, Pacer, shortLink } from "../src/sources/links";

type Lookup = (url: string, options: { pacer?: Pacer }) => Promise<LinkPhoto | null>;

// Profile links (issue #51): look up a link's photo, and save it with the
// link on a contact from the report.
export function linksRouter(contactsApi: (auth: OAuth2Client) => ContactsApi = peopleContactsApi, lookup: Lookup = lookupProfileLink): express.Router {
  const router = express.Router();

  router.post("/links/lookup", async (req: Request, res: Response) => {
    if (!req.is("application/json")) return res.status(415).send({ error: "json_required" });
    const url = typeof req.body?.url === "string" ? req.body.url.slice(0, 500) : "";
    const link = parseProfileLink(url);
    if (!link) return res.status(400).send({ error: "unsupported_link" });
    const network = networkNames[link.network];
    try {
      const found = await lookup(link.url, { pacer: sessionPacer(req.sessionID) });
      if (!found) return res.status(404).send({ error: "no_photo", network });
      res.send(saveLookup(req.sessionID, found));
    } catch (e) {
      if (e instanceof LinkBlockedError) return res.status(409).send({ error: "signin_required", network });
      console.error(`Looking up ${link.url} failed:`, e);
      res.status(502).send({ error: "unreachable", network });
    }
  });

  // Report → No photo found → "Save link and photo".
  router.post("/runs/:id/results/:index/link", async (req: Request, res: Response) => {
    if (!req.is("application/json")) return res.status(415).send({ error: "json_required" });
    const gAuth: OAuth2Client | undefined = getFromCache(req.sessionID, "gauth");
    if (!gAuth) return res.status(401).send({ error: "not_signed_in" });
    const run = getRun(req.sessionID, String(req.params.id));
    const index = Number(req.params.index);
    const result = run?.results[index];
    if (!run || !result) return res.status(404).send({ error: "not_found" });
    if (result.outcome !== "noMatch") return res.status(409).send({ error: "already_changed" });
    const found = getLookup(req.sessionID, req.body?.token);
    if (!found) return res.status(410).send({ error: "lookup_expired" });

    const api = contactsApi(gAuth);
    try {
      const person = await api.get(result.contactId);
      const previous = await api.photo(person);
      const added = await addContactLink(api, result.contactId, found.link.url);
      await api.setPhoto(result.contactId, found.photo);
      Object.assign(result, {
        outcome: previous ? "replaced" : "added",
        source: "links",
        matchedBy: shortLink(found.link),
        hasPhoto: true,
        hasPrevious: Boolean(previous),
        addedLink: added ? found.link.url : undefined,
      });
      run.counters.noMatch--;
      run.counters[previous ? "replaced" : "added"]++;
      setRunPhoto(req.sessionID, run.id, index, "photo", found.photo);
      if (previous) setRunPhoto(req.sessionID, run.id, index, "previous", previous);
      updateRun(run);
      res.send({ result, counters: run.counters });
    } catch (e) {
      console.error(`Saving a profile link on ${result.contactId} failed:`, e);
      const message = (e as { response?: { data?: { error?: { message?: unknown } } } })?.response?.data?.error?.message;
      res.status(502).send({ error: "google_unavailable", detail: typeof message === "string" ? message.slice(0, 300) : undefined });
    }
  });

  return router;
}

export default linksRouter();
