import express, { Request, Response } from "express";
import { RateLimiter } from "limiter";

import { Contact, MergeRequest } from "../../interfaces/api";
import { deleteFromCache, getFromCache, setInCache } from "../src/cache";
import { OAuth2Client } from "../src/gapi";
import { googleRateLimiter } from "../src/sync";
import { executeMerge, MergeBackup, MergeError } from "../src/cleanup/merge";
import { ContactsApi, Person, peopleContactsApi } from "../src/cleanup/people";
import { CleanupAction, getScan, saveAction } from "../src/cleanup/store";
import { duplicatePerson, hasName, newPerson, parseInput, personUpdate, toContact, userGroup, withLabel } from "../src/contacts/model";
import { clearPlaceholder, getPlaceholders, markPlaceholder, prunePlaceholders } from "../src/contacts/placeholders";
import { addContactLink } from "../src/contactLinks";
import { getLookup } from "../src/linkLookups";

// The Contacts page (issue #55): every Google contact, edited in place.
export function contactsRouter(contactsApi: (auth: OAuth2Client) => ContactsApi = peopleContactsApi, limiter: () => RateLimiter = googleRateLimiter): express.Router {
  const router = express.Router();
  const photoBody = express.raw({ type: ["image/jpeg", "image/png"], limit: "8mb" });
  const maxBatch = 500;

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

  /** Google allows about 60 writes a minute: one limiter per session, shared by every request. */
  async function beforeWrite(req: Request): Promise<void> {
    let shared: RateLimiter | undefined = getFromCache(req.sessionID, "contacts_limiter");
    if (!shared) setInCache(req.sessionID, "contacts_limiter", (shared = limiter()));
    await shared.removeTokens(1);
  }

  function googleDetail(e: unknown): string | undefined {
    const error = e as { response?: { data?: { error?: { message?: unknown } } }; message?: unknown };
    const message = error?.response?.data?.error?.message ?? error?.message;
    return typeof message === "string" && message ? message.slice(0, 300) : undefined;
  }

  function failed(res: Response, what: string, e: unknown): void {
    const status = (e as { code?: unknown; response?: { status?: unknown } })?.response?.status ?? (e as { code?: unknown })?.code;
    if (status === 404) return void res.status(404).send({ error: "not_found" });
    console.error(`${what} failed:`, e);
    res.status(502).send({ error: "google_unavailable", detail: googleDetail(e) });
  }

  const ids = (value: unknown): string[] =>
    Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && /^people\/[\w-]+$/.test(id)))].slice(0, maxBatch) : [];
  const contactId = (req: Request) => `people/${String(req.params.id)}`;
  const view = (req: Request, person: Person): Contact => toContact(person, getPlaceholders(req.sessionID));

  router.param("id", (_req, res, next, id) => (/^[\w-]+$/.test(String(id)) ? next() : res.status(404).send({ error: "not_found" })));

  /** Clean up's scan is out of date after a change here. */
  function staleScan(req: Request): void {
    const scan = getScan(req.sessionID);
    if (scan) scan.stale = true;
  }

  router.get("/contacts", async (req: Request, res: Response) => {
    const api = google(req, res);
    if (!api) return;
    try {
      const [people, labels] = await Promise.all([api.list(), api.groups()]);
      const contacts = people.filter((p) => p.resourceName).map((p) => toContact(p, getPlaceholders(req.sessionID)));
      prunePlaceholders(req.sessionID, new Map(contacts.map((c) => [c.id, c.photoUrl])));
      res.send({ contacts, labels: labels.sort((a, b) => a.name.localeCompare(b.name)) });
    } catch (e) {
      failed(res, "Listing contacts", e);
    }
  });

  router.post("/contacts", async (req: Request, res: Response) => {
    if (!jsonOnly(req, res)) return;
    const api = google(req, res);
    if (!api) return;
    const input = parseInput(req.body?.contact);
    if (!input || !(hasName(input) || input.company || input.phones.length || input.emails.length))
      return res.status(400).send({ error: "empty_contact" });
    try {
      await beforeWrite(req);
      const created = await api.create(newPerson(input));
      staleScan(req);
      res.send(view(req, created));
    } catch (e) {
      failed(res, "Creating a contact", e);
    }
  });

  router.put("/contacts/:id", async (req: Request, res: Response) => {
    if (!jsonOnly(req, res)) return;
    const api = google(req, res);
    if (!api) return;
    const input = parseInput(req.body?.contact);
    if (!input) return res.status(400).send({ error: "invalid_contact" });
    try {
      const current = await api.get(contactId(req));
      // Changed in Google since the page read it: don't overwrite blindly.
      if (req.body?.updatedAt && toContact(current).updatedAt !== req.body.updatedAt) return res.status(409).send({ error: "changed", contact: view(req, current) });
      const { body, fields } = personUpdate(current, input);
      if (!fields.length) return res.send(view(req, current));
      await beforeWrite(req);
      const updated = await api.update(contactId(req), body, fields);
      staleScan(req);
      res.send(view(req, updated));
    } catch (e) {
      failed(res, "Saving a contact", e);
    }
  });

  router.post("/contacts/:id/duplicate", async (req: Request, res: Response) => {
    const api = google(req, res);
    if (!api) return;
    try {
      const person = await api.get(contactId(req));
      await beforeWrite(req);
      const copy = await api.create(duplicatePerson(person));
      const photo = await api.photo(person);
      if (photo) {
        await beforeWrite(req);
        await api.setPhoto(copy.resourceName!, photo);
      }
      const result = await api.get(copy.resourceName!);
      // A copied placeholder is still a placeholder.
      if (photo && toContact(person, getPlaceholders(req.sessionID)).placeholder) markPlaceholder(req.sessionID, result.resourceName!, toContact(result).photoUrl);
      staleScan(req);
      res.send(view(req, result));
    } catch (e) {
      failed(res, "Duplicating a contact", e);
    }
  });

  // Deleted contacts are backed up and listed in History, where undo creates them again.
  router.post("/contacts/delete", async (req: Request, res: Response) => {
    if (!jsonOnly(req, res)) return;
    const api = google(req, res);
    if (!api) return;
    const contactIds = ids(req.body?.contactIds);
    if (!contactIds.length) return res.status(400).send({ error: "nothing_selected" });
    const sessionId = req.sessionID;
    try {
      const people = await Promise.all(contactIds.map((id) => api.get(id)));
      const photos = await Promise.all(people.map((p) => api.photo(p)));
      const first = toContact(people[0]);
      const backup: MergeBackup = { people, photos, keptId: "", steps: { updated: false, photo: false, deleted: [] } };
      const action: CleanupAction & { kind: "delete" } = {
        id: `${new Date().toISOString().replace(/[:.]/g, "-")}-delete`,
        kind: "delete",
        at: new Date().toISOString(),
        title: people.length === 1 ? (first.name ?? first.emails[0]?.value ?? first.phones[0]?.value ?? "") : "",
        contacts: people.length,
        backup,
      };
      saveAction(sessionId, action);
      try {
        for (const id of contactIds) {
          await beforeWrite(req);
          await api.remove(id);
          backup.steps.deleted.push(id);
          saveAction(sessionId, action);
          clearPlaceholder(sessionId, id);
        }
      } catch (e) {
        if (backup.steps.deleted.length) saveAction(sessionId, { ...action, incomplete: true });
        throw e;
      } finally {
        staleScan(req);
      }
      res.send({ actionId: action.id, deleted: backup.steps.deleted });
    } catch (e) {
      failed(res, "Deleting contacts", e);
    }
  });

  // Merge any contacts the user picked, with the same plan and undo as Clean up.
  router.post("/contacts/merge", async (req: Request, res: Response) => {
    if (!jsonOnly(req, res)) return;
    const api = google(req, res);
    if (!api) return;
    const contactIds = ids(req.body?.contactIds);
    const request = req.body?.request as MergeRequest | undefined;
    const expected = (req.body?.updatedAt ?? {}) as Record<string, unknown>;
    if (contactIds.length < 2 || contactIds.length > 10 || !request || !contactIds.includes(request.keepId)) return res.status(400).send({ error: "invalid_request" });
    if (getFromCache(req.sessionID, "cleanup_busy")) return res.status(409).send({ error: "busy" });
    const sessionId = req.sessionID;
    const action: CleanupAction & { kind: "merge" } = {
      id: `${new Date().toISOString().replace(/[:.]/g, "-")}-merge`,
      kind: "merge",
      at: new Date().toISOString(),
      title: "",
      contacts: contactIds.length,
      backup: { people: [], photos: [], keptId: request.keepId, steps: { updated: false, photo: false, deleted: [] } },
    };
    const save = (backup: MergeBackup) => {
      const kept = backup.people.find((p) => p.resourceName === request.keepId);
      action.title = kept ? (toContact(kept).name ?? "") : action.title;
      saveAction(sessionId, { ...action, backup });
    };
    setInCache(sessionId, "cleanup_busy", true);
    try {
      action.backup = await executeMerge(api, contactIds, { ...request, groupId: "contacts" }, {
        expectedUpdates: Object.fromEntries(contactIds.map((id) => [id, typeof expected[id] === "string" ? (expected[id] as string) : undefined])),
        save,
      });
      for (const id of action.backup.steps.deleted) clearPlaceholder(sessionId, id);
      staleScan(req);
      res.send({ actionId: action.id, contact: view(req, await api.get(request.keepId)), deleted: action.backup.steps.deleted });
    } catch (e) {
      if (e instanceof MergeError) return res.status(e.code === "changed_since_scan" ? 409 : 400).send({ error: e.code });
      if (action.backup.steps.updated) saveAction(sessionId, { ...action, incomplete: true });
      failed(res, "Merging contacts", e);
    } finally {
      deleteFromCache(sessionId, "cleanup_busy");
    }
  });

  // A photo uploaded by hand: a placeholder until a sync finds a real one.
  router.put("/contacts/:id/photo", photoBody, async (req: Request, res: Response) => {
    const api = google(req, res);
    if (!api) return;
    const bytes = req.body;
    if (!Buffer.isBuffer(bytes) || bytes.length < 100) return res.status(415).send({ error: "image_required" });
    try {
      await beforeWrite(req);
      await api.setPhoto(contactId(req), bytes.toString("base64"));
      const person = await api.get(contactId(req));
      markPlaceholder(req.sessionID, contactId(req), toContact(person).photoUrl);
      res.send(view(req, person));
    } catch (e) {
      failed(res, "Uploading a photo", e);
    }
  });

  router.delete("/contacts/:id/photo", async (req: Request, res: Response) => {
    const api = google(req, res);
    if (!api) return;
    try {
      await beforeWrite(req);
      await api.deletePhoto(contactId(req));
      clearPlaceholder(req.sessionID, contactId(req));
      res.send(view(req, await api.get(contactId(req))));
    } catch (e) {
      failed(res, "Removing a photo", e);
    }
  });

  // The photo behind a profile link the editor looked up: a real photo, and the link is saved too.
  router.post("/contacts/:id/photo_from_link", async (req: Request, res: Response) => {
    if (!jsonOnly(req, res)) return;
    const api = google(req, res);
    if (!api) return;
    const found = getLookup(req.sessionID, req.body?.token);
    if (!found) return res.status(410).send({ error: "lookup_expired" });
    try {
      await beforeWrite(req);
      await api.setPhoto(contactId(req), found.photo);
      clearPlaceholder(req.sessionID, contactId(req));
      await addContactLink(api, contactId(req), found.link.url);
      res.send(view(req, await api.get(contactId(req))));
    } catch (e) {
      failed(res, "Saving a photo from a link", e);
    }
  });

  router.post("/contacts/labels", async (req: Request, res: Response) => {
    if (!jsonOnly(req, res)) return;
    const api = google(req, res);
    if (!api) return;
    const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 100) : "";
    if (!name) return res.status(400).send({ error: "invalid_name" });
    try {
      const existing = (await api.groups()).find((g) => g.name.toLowerCase() === name.toLowerCase());
      res.send(existing ?? (await api.createGroup(name)));
    } catch (e) {
      failed(res, "Creating a label", e);
    }
  });

  // Add or remove a label on the selected contacts.
  router.post("/contacts/labels/apply", async (req: Request, res: Response) => {
    if (!jsonOnly(req, res)) return;
    const api = google(req, res);
    if (!api) return;
    const contactIds = ids(req.body?.contactIds);
    const label = typeof req.body?.label === "string" && userGroup.test(req.body.label) ? (req.body.label as string) : undefined;
    if (!contactIds.length || !label) return res.status(400).send({ error: "invalid_request" });
    const add = req.body?.add !== false;
    const updated: Contact[] = [];
    try {
      for (const id of contactIds) {
        const person = await api.get(id);
        const body = withLabel(person, label, add);
        if (!body) continue;
        await beforeWrite(req);
        updated.push(view(req, await api.update(id, body, ["memberships"])));
      }
      res.send({ contacts: updated });
    } catch (e) {
      // What changed so far is still reported, so the page can show it.
      if (updated.length) return res.status(502).send({ error: "google_unavailable", detail: googleDetail(e), contacts: updated });
      failed(res, "Changing labels", e);
    }
  });

  return router;
}

export default contactsRouter();
