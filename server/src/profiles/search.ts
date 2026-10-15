import { Contact, SocialNetwork, SocialPerson } from "../../../interfaces/api";
import { get, LinkBlockedError, parseProfileLink } from "../sources/links";
import { contactWords, scoreMatch } from "./match";

/*
  The public search by name (issue #61): sites whose search works without
  an account. Results are kept only when the name matches the contact's.
*/

type Fetch = typeof fetch;
export type SearchNetwork = Extract<SocialNetwork, "bluesky" | "mastodon" | "github">;
export const searchNetworks: SearchNetwork[] = ["bluesky", "mastodon", "github"];

/** Seconds between searches on each site: GitHub allows 10 a minute without a token. */
export const searchInterval: Record<SearchNetwork, number> = { bluesky: 1000, mastodon: 1500, github: 7000 };

function person(network: SocialNetwork, url: string | undefined, extra: Partial<SocialPerson>): SocialPerson | undefined {
  const link = url ? parseProfileLink(url) : undefined;
  if (!link || link.network !== network) return undefined;
  return { id: `${network}:${link.handle.toLowerCase()}${network === "mastodon" ? `@${link.host}` : ""}`, network, url: link.url, handle: link.handle, source: "search", ...extra };
}

export async function searchNetwork(network: SearchNetwork, query: string, fetchImpl: Fetch = fetch): Promise<SocialPerson[]> {
  const q = encodeURIComponent(query);
  if (network === "bluesky") {
    const response = await get(fetchImpl, `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q=${q}&limit=10`, "bluesky");
    if (!response.ok) return [];
    const { actors = [] } = (await response.json()) as { actors?: { handle?: string; displayName?: string; avatar?: string }[] };
    return actors.flatMap((a) => person("bluesky", a.handle && `https://bsky.app/profile/${a.handle}`, { name: a.displayName || undefined, photoUrl: a.avatar }) ?? []);
  }
  if (network === "mastodon") {
    const response = await get(fetchImpl, `https://mastodon.social/api/v2/search?q=${q}&type=accounts&limit=10`, "mastodon");
    if (!response.ok) return [];
    const { accounts = [] } = (await response.json()) as { accounts?: { url?: string; display_name?: string; avatar?: string; bot?: boolean }[] };
    return accounts.filter((a) => !a.bot).flatMap((a) => person("mastodon", a.url, { name: a.display_name || undefined, photoUrl: a.avatar }) ?? []);
  }
  const response = await get(fetchImpl, `https://api.github.com/search/users?q=${encodeURIComponent(`fullname:"${query}"`)}&per_page=5`, "github");
  if (!response.ok) return [];
  const { items = [] } = (await response.json()) as { items?: { html_url?: string; avatar_url?: string }[] };
  // GitHub matched the full name itself; its answer doesn't repeat it.
  return items.flatMap((i) => person("github", i.html_url, { name: query, photoUrl: i.avatar_url && `${i.avatar_url}${i.avatar_url.includes("?") ? "&" : "?"}s=460` }) ?? []);
}

/** The name to search for: first and last name, without prefix or suffix. */
export function searchQuery(contact: Contact): string | undefined {
  const name = contactWords(contact);
  if (name.length < 2) return undefined;
  const parts = contact.givenName || contact.familyName ? [contact.givenName, contact.middleName, contact.familyName] : [(contact.name ?? "").split(",")[0].replace(/\(.*?\)/g, " ")];
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

export interface SearchRun {
  contacts: Contact[];
  networks: SearchNetwork[];
  /** network → contact ids already searched (kept across runs). */
  searched: Record<string, string[]>;
  found(people: SocialPerson[]): void;
  progress(checked: number, total: number, found: Partial<Record<SocialNetwork, number>>): void;
  cancelled(): boolean;
  fetchImpl?: Fetch;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Searches every contact with a first and last name on each network, slowly.
 * A site that limits or refuses the searches is left out for the rest of the run.
 */
export async function runSearch(run: SearchRun): Promise<{ stopped?: string }> {
  const sleep = run.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const todo = run.contacts.filter((c) => searchQuery(c));
  const networks = new Set(run.networks);
  const found: Partial<Record<SocialNetwork, number>> = {};
  let stopped: string | undefined;
  for (const [i, contact] of todo.entries()) {
    if (run.cancelled()) break;
    const query = searchQuery(contact)!;
    const name = contactWords(contact);
    for (const network of [...networks]) {
      const done = (run.searched[network] ??= []);
      if (done.includes(contact.id) || contact.urls.some((u) => parseProfileLink(u.value)?.network === network)) continue;
      try {
        const matches = (await searchNetwork(network, query, run.fetchImpl)).filter((p) => (scoreMatch(name, p)?.score ?? 0) >= 0.7);
        if (matches.length) {
          found[network] = (found[network] ?? 0) + matches.length;
          run.found(matches);
        }
        done.push(contact.id);
      } catch (e) {
        if (e instanceof LinkBlockedError) {
          networks.delete(network);
          stopped = network;
        } else console.error(`Searching ${network} failed:`, (e as Error).message);
      }
      await sleep(searchInterval[network]);
    }
    run.progress(i + 1, todo.length, found);
    if (!networks.size) break;
  }
  return { stopped };
}
