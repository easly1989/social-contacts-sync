import fs from "fs";
import path from "path";

import { ProfileLinked, SocialNetwork, SocialPerson } from "../../../interfaces/api";
import { getFromCache, setInCache } from "../cache";
import { Base64 } from "../types";

/*
  What Find profiles keeps (issue #61): the people read from exports,
  searches and scans, and the user's answers. The desktop app keeps it in
  profiles.json in the data folder; the web version per session.
*/

export interface StoredLinked extends ProfileLinked {
  addedLink: boolean;
  /** The contact's photo before, for undo (null: it had none). */
  previousPhoto?: Base64 | null;
}

export interface ProfilesData {
  people: SocialPerson[];
  /** contactId → person ids that aren't them. */
  rejected: Record<string, string[]>;
  skipped: string[];
  linked: StoredLinked[];
  /** network → contact ids already searched. */
  searched: Record<string, string[]>;
  imports: Partial<Record<SocialNetwork, string>>;
  scans: Partial<Record<SocialNetwork, { finishedAt: string; read: number; stopped?: string }>>;
}

const empty = (): ProfilesData => ({ people: [], rejected: {}, skipped: [], linked: [], searched: {}, imports: {}, scans: {} });

function file(): string | undefined {
  return process.env.SCS_DESKTOP === "1" && process.env.SCS_DATA_DIR ? path.join(process.env.SCS_DATA_DIR, "profiles.json") : undefined;
}

export function loadProfiles(sessionId: string): ProfilesData {
  const f = file();
  if (!f) return getFromCache(sessionId, "profiles") ?? empty();
  try {
    return { ...empty(), ...JSON.parse(fs.readFileSync(f, "utf8")) };
  } catch {
    return empty();
  }
}

export function saveProfiles(sessionId: string, data: ProfilesData): void {
  const f = file();
  if (!f) return setInCache(sessionId, "profiles", data);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(`${f}.tmp`, JSON.stringify(data));
  fs.renameSync(`${f}.tmp`, f);
}

/** Adds or refreshes people: a scan's name and photo complete an export's username. */
export function mergePeople(data: ProfilesData, incoming: SocialPerson[]): number {
  const byId = new Map(data.people.map((p) => [p.id, p]));
  let added = 0;
  for (const person of incoming) {
    const known = byId.get(person.id);
    if (!known) {
      byId.set(person.id, person);
      added++;
      continue;
    }
    byId.set(person.id, {
      ...known,
      name: person.name ?? known.name,
      photoUrl: person.photoUrl ?? known.photoUrl,
      detail: person.detail ?? known.detail,
      relation: known.relation ?? person.relation,
      // The strongest source wins: a scan or an export over a public search.
      source: known.source === "search" ? person.source : known.source,
    });
  }
  data.people = [...byId.values()];
  return added;
}
