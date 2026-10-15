/*
  Reading what Instagram, LinkedIn and Facebook answer to the logged-in
  user's own pages (issue #61). Pure functions, so they can be tested
  without the sites; socialScan.ts fetches the pages.
*/

export type ScanNetwork = "instagram" | "facebook" | "linkedin";

export interface ScannedPerson {
  id: string;
  network: ScanNetwork;
  url: string;
  handle: string;
  name?: string;
  photoUrl?: string;
  source: "scan";
  relation: "follower" | "following" | "friend" | "connection";
  detail?: string;
}

const httpsUrl = (u: unknown) => (typeof u === "string" && u.startsWith("https://") ? u : undefined);
const text = (s: unknown) => (typeof s === "string" && s.trim() ? s.trim() : undefined);

/** A page of /api/v1/friendships/{id}/followers|following/. */
export function instagramPage(json: unknown, relation: "follower" | "following"): { people: ScannedPerson[]; next?: string } {
  const data = json as { users?: { username?: string; full_name?: string; profile_pic_url?: string }[]; next_max_id?: string | number | null };
  const people = (data?.users ?? []).flatMap((u): ScannedPerson[] => {
    const username = text(u.username);
    if (!username || !/^[\w.]{1,30}$/.test(username)) return [];
    return [{ id: `instagram:${username.toLowerCase()}`, network: "instagram", url: `https://instagram.com/${username}`, handle: username, name: text(u.full_name), photoUrl: httpsUrl(u.profile_pic_url), source: "scan", relation }];
  });
  const next = data?.next_max_id === null || data?.next_max_id === undefined || data.next_max_id === "" ? undefined : String(data.next_max_id);
  return { people, next };
}

type VectorImage = { rootUrl?: string; artifacts?: { width?: number; fileIdentifyingUrlPathSegment?: string }[] };

function linkedinPhoto(picture: unknown): string | undefined {
  const image = (picture as { displayImageReference?: { vectorImage?: VectorImage }; displayImageReferenceResolutionResult?: { vectorImage?: VectorImage } })
  const vector = image?.displayImageReference?.vectorImage ?? image?.displayImageReferenceResolutionResult?.vectorImage;
  const largest = [...(vector?.artifacts ?? [])].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  return vector?.rootUrl && largest?.fileIdentifyingUrlPathSegment ? httpsUrl(vector.rootUrl + largest.fileIdentifyingUrlPathSegment) : undefined;
}

/** A page of /voyager/api/relationships/dash/connections (normalized JSON): the profiles are in `included`. */
export function linkedinPage(json: unknown): { people: ScannedPerson[]; elements: number } {
  const data = json as { data?: { elements?: unknown[]; "*elements"?: unknown[] }; elements?: unknown[]; included?: Record<string, unknown>[] };
  const elements = (data?.data?.["*elements"] ?? data?.data?.elements ?? data?.elements ?? []).length;
  const people = (data?.included ?? []).flatMap((p): ScannedPerson[] => {
    const id = text(p.publicIdentifier);
    if (!id || !/^[\w%-]{2,100}$/.test(id)) return [];
    const name = [text(p.firstName), text(p.lastName)].filter(Boolean).join(" ") || undefined;
    return [{ id: `linkedin:${id.toLowerCase()}`, network: "linkedin", url: `https://linkedin.com/in/${id}`, handle: id, name, photoUrl: linkedinPhoto(p.profilePicture), source: "scan", relation: "connection", detail: text(p.headline) }];
  });
  return { people, elements };
}

export interface FacebookItem {
  href: string;
  name: string;
  img?: string;
}

const facebookReserved = new Set(["friends", "groups", "pages", "watch", "marketplace", "events", "photo", "photos", "story.php", "help", "settings", "login", "messages", "notifications", "bookmarks", "me", "hashtag", "reel", "stories"]);

/** Links read from the friends page: profile links only, one per person. */
export function facebookPeople(items: FacebookItem[]): ScannedPerson[] {
  const people = new Map<string, ScannedPerson>();
  for (const item of items) {
    let url: URL;
    try {
      url = new URL(item.href);
    } catch {
      continue;
    }
    if (!/(^|\.)facebook\.com$/.test(url.hostname)) continue;
    const name = text(item.name);
    if (!name || name.length > 80) continue;
    let handle: string | undefined;
    let link: string | undefined;
    if (url.pathname === "/profile.php") {
      const id = url.searchParams.get("id");
      if (id && /^\d+$/.test(id)) [handle, link] = [id, `https://facebook.com/profile.php?id=${id}`];
    } else {
      const slug = url.pathname.split("/").filter(Boolean)[0];
      if (slug && /^[\w.]{5,50}$/.test(slug) && !facebookReserved.has(slug.toLowerCase()) && url.pathname.split("/").filter(Boolean).length === 1) [handle, link] = [slug, `https://facebook.com/${slug}`];
    }
    if (!handle || !link || people.has(handle.toLowerCase())) continue;
    people.set(handle.toLowerCase(), { id: `facebook:${handle.toLowerCase()}`, network: "facebook", url: link, handle, name, photoUrl: httpsUrl(item.img), source: "scan", relation: "friend" });
  }
  return [...people.values()];
}

/**
 * Runs in the friends page: the profile links with a name and, next to it,
 * a picture. Kept as source text for executeJavaScript.
 */
export const facebookExtractScript = `(() => {
  const items = [];
  for (const a of document.querySelectorAll('a[href*="facebook.com/"], a[href^="/"]')) {
    const name = (a.innerText || a.getAttribute("aria-label") || "").split("\\n")[0].trim();
    if (!name) continue;
    const box = a.closest('[role="listitem"], [data-visualcompletion]') || a.parentElement?.parentElement?.parentElement;
    const img = box && (box.querySelector("img")?.src || box.querySelector("image")?.getAttribute("xlink:href"));
    items.push({ href: new URL(a.getAttribute("href"), location.href).href, name, img: img || undefined });
  }
  return items;
})()`;

/** Why a site's answer means stop: a sign-in or check page, or a limit. */
export function blockedReason(status: number, finalUrl: string, body = ""): string | undefined {
  if (status === 429 || status === 999) return "limited";
  if (/\/(accounts\/login|login|checkpoint|challenge|authwall|uas\/login)/i.test(finalUrl)) return "signin";
  if (status === 401 || status === 403) return "signin";
  if (/checkpoint_required|challenge_required|feedback_required|Please wait a few minutes/i.test(body)) return "limited";
  return undefined;
}

/**
 * The user agent the social sites see: Chrome's own, without the Electron
 * and app tokens that make some of them serve a reduced page (issue #65).
 */
export function browserUserAgent(userAgent: string): string {
  return userAgent
    .replace(/\sElectron\/\S+/g, "")
    .replace(/(\(KHTML, like Gecko\))\s+(?:(?!Chrome\/)\S+\/\S+\s+)+(?=Chrome\/)/, "$1 ");
}

/** Whether a page load failed only because the page went on to another one (a redirect). */
export function isAbortedLoad(error: unknown): boolean {
  return /ERR_ABORTED|\(-3\)/.test(error instanceof Error ? error.message : String(error));
}

/** A few seconds between pages, a little different each time. */
export function pause(minMs: number, maxMs: number, random = Math.random): number {
  return Math.round(minMs + (maxMs - minMs) * random());
}
