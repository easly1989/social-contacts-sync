import crypto from "crypto";

import { LinkLookup } from "../../interfaces/api";
import { getFromCache, setInCache } from "./cache";
import { LinkPhoto, networkNames, Pacer } from "./sources/links";

/*
  Photos looked up from a profile link in the report or in review, kept
  until the user saves one: the page gets a token, not the right to send
  any photo it likes as "from a link".
*/

const ttl = 30 * 60 * 1000;
const maxPerSession = 20;

interface Stored extends LinkPhoto {
  at: number;
}

function lookups(sessionId: string): Map<string, Stored> {
  let map: Map<string, Stored> | undefined = getFromCache(sessionId, "link_lookups");
  if (!map) setInCache(sessionId, "link_lookups", (map = new Map()));
  return map;
}

export function saveLookup(sessionId: string, found: LinkPhoto, now = Date.now()): LinkLookup {
  const map = lookups(sessionId);
  for (const [token, entry] of map) if (now - entry.at > ttl) map.delete(token);
  while (map.size >= maxPerSession) map.delete(map.keys().next().value!);
  const token = crypto.randomBytes(12).toString("hex");
  map.set(token, { ...found, at: now });
  return { token, photo: found.photo, network: networkNames[found.link.network], url: found.link.url };
}

export function getLookup(sessionId: string, token: unknown, now = Date.now()): LinkPhoto | undefined {
  if (typeof token !== "string") return undefined;
  const entry = lookups(sessionId).get(token);
  return entry && now - entry.at <= ttl ? entry : undefined;
}

/** One pacer per session, so repeated lookups respect each site too. */
export function sessionPacer(sessionId: string): Pacer {
  let pacer: Pacer | undefined = getFromCache(sessionId, "link_pacer");
  if (!pacer) setInCache(sessionId, "link_pacer", (pacer = new Pacer()));
  return pacer;
}
