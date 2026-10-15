import { SocialPerson } from "../../../interfaces/api";
import { parseProfileLink } from "../sources/links";

/*
  The user's own data exports (issue #61): Instagram's followers and
  following lists (JSON format) and LinkedIn's Connections.csv.
*/

type InstagramEntry = { title?: string; string_list_data?: { href?: string; value?: string }[] };

/** Instagram's followers_1.json (a list) or following.json ({ relationships_following: [...] }). */
export function parseInstagramExport(text: string, fileName = ""): SocialPerson[] {
  const data = JSON.parse(text) as unknown;
  const lists = Array.isArray(data)
    ? [["follower", data]]
    : Object.entries((data ?? {}) as Record<string, unknown>)
        .filter(([, v]) => Array.isArray(v))
        .map(([key, v]) => [/following/i.test(key) ? "following" : "follower", v]);
  const fallback = /following/i.test(fileName) ? "following" : "follower";
  const people = new Map<string, SocialPerson>();
  for (const [kind, entries] of lists as [string, InstagramEntry[]][]) {
    for (const entry of entries) {
      const item = entry.string_list_data?.[0];
      // Newer exports put the username in the title and keep only the link.
      const fromHref = item?.href ? parseProfileLink(item.href.replace("/_u/", "/")) : undefined;
      const username = (item?.value || entry.title || (fromHref?.network === "instagram" ? fromHref.handle : "") || "").trim();
      const link = parseProfileLink(`https://www.instagram.com/${username}`);
      if (!username || !link || link.network !== "instagram") continue;
      const relation = (Array.isArray(data) ? fallback : kind) as "follower" | "following";
      people.set(link.url, { id: `instagram:${link.handle.toLowerCase()}`, network: "instagram", url: link.url, handle: link.handle, source: "export", relation });
    }
  }
  return [...people.values()];
}

/** One CSV line, with quoted fields. */
function csvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") cells.push(cell), (cell = "");
    else cell += ch;
  }
  cells.push(cell);
  return cells.map((c) => c.trim());
}

/** LinkedIn's Connections.csv: a few lines of notes, then "First Name,Last Name,URL,…". */
export function parseLinkedInConnections(text: string): SocialPerson[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const start = lines.findIndex((l) => /^"?First Name"?,/i.test(l));
  if (start < 0) throw new Error("not_linkedin_connections");
  const header = csvLine(lines[start]).map((h) => h.toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const people = new Map<string, SocialPerson>();
  for (const line of lines.slice(start + 1)) {
    if (!line.trim()) continue;
    const cells = csvLine(line);
    const link = parseProfileLink(cells[col("url")] ?? "");
    if (!link || link.network !== "linkedin") continue;
    const name = [cells[col("first name")], cells[col("last name")]].filter(Boolean).join(" ");
    const detail = [cells[col("position")], cells[col("company")]].filter(Boolean).join(" · ") || undefined;
    people.set(link.url, { id: `linkedin:${link.handle.toLowerCase()}`, network: "linkedin", url: link.url, handle: link.handle, name: name || undefined, source: "export", relation: "connection", detail });
  }
  return [...people.values()];
}
