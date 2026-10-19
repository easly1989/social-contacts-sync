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
  /** "loginSearch": found by searching a contact's name with the login (issue #104). */
  source: "scan" | "loginSearch";
  relation?: "follower" | "following" | "friend" | "connection";
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

/** A Facebook profile address as the app saves it, and its handle; undefined for any other page. */
function facebookLink(href: string): { handle: string; link: string } | undefined {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return undefined;
  }
  if (!/(^|\.)facebook\.com$/.test(url.hostname)) return undefined;
  if (url.pathname === "/profile.php") {
    const id = url.searchParams.get("id");
    return id && /^\d+$/.test(id) ? { handle: id, link: `https://facebook.com/profile.php?id=${id}` } : undefined;
  }
  const parts = url.pathname.split("/").filter(Boolean);
  const slug = parts[0];
  if (parts.length !== 1 || !slug || !/^[\w.]{5,50}$/.test(slug) || facebookReserved.has(slug.toLowerCase())) return undefined;
  return { handle: slug, link: `https://facebook.com/${slug}` };
}

/**
 * Links read from the friends page: profile links only, one per person. A
 * friend's card has two links to the same profile, one around the picture
 * and one around the name (issue #71), so they're put together by profile.
 */
export function facebookPeople(items: FacebookItem[]): ScannedPerson[] {
  const photos = new Map<string, string>();
  for (const item of items) {
    const found = facebookLink(item.href);
    const img = httpsUrl(item.img);
    if (found && img && !photos.has(found.handle.toLowerCase())) photos.set(found.handle.toLowerCase(), img);
  }
  const people = new Map<string, ScannedPerson>();
  for (const item of items) {
    const found = facebookLink(item.href);
    const name = text(item.name);
    if (!found || !name || name.length > 80) continue;
    const key = found.handle.toLowerCase();
    if (people.has(key)) continue;
    people.set(key, { id: `facebook:${key}`, network: "facebook", url: found.link, handle: found.handle, name, photoUrl: httpsUrl(item.img) ?? photos.get(key), source: "scan", relation: "friend" });
  }
  return [...people.values()];
}

/**
 * Runs in the friends page: every link to a Facebook page, with its text
 * (or label) and the picture inside it, if any. Kept as source text for
 * executeJavaScript; facebookPeople keeps the profiles.
 */
export const facebookExtractScript = `(() => {
  const items = [];
  for (const a of document.querySelectorAll("a[href]")) {
    let href;
    try {
      href = new URL(a.getAttribute("href"), location.href).href;
    } catch {
      continue;
    }
    if (!/facebook\\.com\\//.test(href)) continue;
    const name = (a.innerText || a.getAttribute("aria-label") || "").split("\\n")[0].trim();
    const image = a.querySelector("image");
    const img = a.querySelector("img")?.src || (image && (image.getAttribute("xlink:href") || image.getAttribute("href"))) || undefined;
    if (name || img) items.push({ href, name, img });
  }
  return items;
})()`;

/** People a search with the login offers per network (issue #104). */
export const searchResults = 5;

/** /api/v1/web/search/topsearch/?query=…: the people Instagram's search box offers. */
export function instagramSearch(json: unknown): ScannedPerson[] {
  const users = ((json as { users?: { user?: { username?: string; full_name?: string; profile_pic_url?: string } }[] })?.users ?? []).map((u) => u?.user ?? {});
  return instagramPage({ users }, "follower")
    .people.map(({ relation: _relation, ...p }): ScannedPerson => ({ ...p, source: "loginSearch" }))
    .slice(0, searchResults);
}

/**
 * LinkedIn's search box (/voyager/api/typeahead/hitsV2, normalized JSON):
 * the profiles are in `included`, with a picture as `picture` or `profilePicture`.
 */
export function linkedinSearch(json: unknown): ScannedPerson[] {
  const included = ((json as { included?: Record<string, unknown>[] })?.included ?? []).filter((p) => p && typeof p === "object");
  const people = new Map<string, ScannedPerson>();
  for (const p of included) {
    const id = text(p.publicIdentifier);
    if (!id || !/^[\w%-]{2,100}$/.test(id) || people.has(id.toLowerCase())) continue;
    const name = [text(p.firstName), text(p.lastName)].filter(Boolean).join(" ") || undefined;
    const mini = (p.picture as Record<string, VectorImage> | undefined)?.["com.linkedin.common.VectorImage"];
    const photoUrl = linkedinPhoto(p.profilePicture) ?? linkedinPhoto({ displayImageReference: { vectorImage: mini } });
    people.set(id.toLowerCase(), { id: `linkedin:${id.toLowerCase()}`, network: "linkedin", url: `https://linkedin.com/in/${id}`, handle: id, name, photoUrl, source: "loginSearch", detail: text(p.occupation) ?? text(p.headline) });
  }
  return [...people.values()].slice(0, searchResults);
}

/** Facebook's people search page: its profile links, as the friends page's (issue #104). */
export function facebookSearch(items: FacebookItem[], ownHandle?: string): ScannedPerson[] {
  return facebookPeople(items)
    .filter((p) => p.handle.toLowerCase() !== ownHandle?.toLowerCase())
    .map(({ relation: _relation, ...p }): ScannedPerson => ({ ...p, source: "loginSearch" }))
    .slice(0, searchResults);
}

/** The search page's address on each site, for a name. */
export function searchPath(network: ScanNetwork, query: string): string {
  const q = encodeURIComponent(query.trim().slice(0, 100));
  if (network === "instagram") return `/api/v1/web/search/topsearch/?context=user&query=${q}&include_reel=false`;
  if (network === "linkedin") return `/voyager/api/typeahead/hitsV2?keywords=${q}&origin=GLOBAL_SEARCH_HEADER&q=blended`;
  return `https://www.facebook.com/search/people/?q=${q}`;
}

/** One profile read again by a sync (issue #79). */
export interface ProfileRead {
  name?: string;
  photoUrl?: string;
}

/** The address of a profile's page, from its handle; undefined for anything but a plain handle. */
export function profilePageUrl(network: string, handle: string): string | undefined {
  if (network === "instagram") return /^[\w.]{1,30}$/.test(handle) ? `https://www.instagram.com/${handle}/` : undefined;
  if (network === "facebook") {
    if (/^\d+$/.test(handle)) return `https://www.facebook.com/profile.php?id=${handle}`;
    return /^[\w.]{5,50}$/.test(handle) ? `https://www.facebook.com/${handle}` : undefined;
  }
  if (network === "linkedin") return /^[\w%-]{2,100}$/.test(handle) ? `https://www.linkedin.com/in/${handle}/` : undefined;
  return undefined;
}

/** /voyager/api/identity/dash/profiles?q=memberIdentity: the profile with that handle; undefined when it isn't there. */
export function linkedinProfile(json: unknown, handle: string): ProfileRead | undefined {
  const data = json as { included?: unknown[]; elements?: unknown[]; data?: { elements?: unknown[] } };
  const entities = [...(data?.included ?? []), ...(data?.elements ?? []), ...(data?.data?.elements ?? [])] as Record<string, unknown>[];
  const profile = entities.find((e) => typeof e?.publicIdentifier === "string" && e.publicIdentifier.toLowerCase() === handle.toLowerCase());
  if (!profile) return undefined;
  const name = [text(profile.firstName), text(profile.lastName)].filter(Boolean).join(" ") || undefined;
  return { name, photoUrl: linkedinPhoto(profile.profilePicture) };
}

/** /api/v1/users/web_profile_info/?username=…: undefined when there's no such profile. */
export function instagramProfile(json: unknown): ProfileRead | undefined {
  const user = (json as { data?: { user?: { full_name?: string; profile_pic_url?: string; profile_pic_url_hd?: string } | null } })?.data?.user;
  if (!user) return undefined;
  return { name: text(user.full_name), photoUrl: httpsUrl(user.profile_pic_url_hd) ?? httpsUrl(user.profile_pic_url) };
}

export interface FacebookProfilePage {
  heading: string;
  /** Pictures in the page's header, with their width on screen; `svg` when drawn in an SVG, as the profile picture is. */
  images: { src: string; width: number; svg: boolean }[];
}

/**
 * The profile picture is the largest of Facebook's own SVG pictures in the
 * header; undefined when there's none. The plain pictures are the cover, or
 * without one a blurred copy of the profile picture (issue #104).
 */
export function facebookProfile(page: FacebookProfilePage): ProfileRead | undefined {
  const own = page.images.filter((i) => i.svg && /^https:\/\/[^/]+\.fbcdn\.net\//.test(i.src) && i.width >= 100).sort((a, b) => b.width - a.width)[0];
  if (!own) return undefined;
  return { name: text(page.heading), photoUrl: own.src };
}

/** Runs in a profile page: its heading and the pictures in its header (the profile picture is an SVG image). */
export const facebookProfileScript = `(() => {
  const header = document.querySelector("[role=main]") || document.body;
  const images = [];
  for (const el of header.querySelectorAll("svg image, img")) {
    const src = el.getAttribute("xlink:href") || el.getAttribute("href") || el.getAttribute("src") || "";
    const width = Math.round(el.getBoundingClientRect().width);
    if (src && width) images.push({ src, width, svg: el.tagName.toLowerCase() === "image" });
    if (images.length >= 40) break;
  }
  return { heading: (header.querySelector("h1")?.innerText || "").split("\\n")[0].trim(), images };
})()`;

/** A profile's own page, read when Instagram's API says no. */
export interface InstagramProfilePage {
  ogImage: string;
  ogTitle: string;
  /** The start of the page's text, to spot a limit or sign-in message. */
  text: string;
}

/** The og:image of a profile page is its picture; og:title is "Name (@handle) • Instagram …". Undefined when there's no picture. */
export function instagramPageProfile(page: InstagramProfilePage): ProfileRead | undefined {
  const photoUrl = httpsUrl(page.ogImage);
  if (!photoUrl || !/^https:\/\/[^/]+\.(cdninstagram\.com|fbcdn\.net)\//.test(photoUrl) || photoUrl.includes("/rsrc.php/")) return undefined;
  return { name: text(page.ogTitle.match(/^(.*?)\s*\(@[\w.]+\)/)?.[1]), photoUrl };
}

/** Runs in an Instagram profile page. */
export const instagramProfilePageScript = `(() => ({
  ogImage: document.querySelector('meta[property="og:image"]')?.content || "",
  ogTitle: document.querySelector('meta[property="og:title"]')?.content || "",
  text: (document.body?.innerText || "").slice(0, 300),
}))()`;

/** The site's own answer when it said no, short enough for a report: the status and its message. */
export function siteAnswer(status: number, body = ""): string {
  let message = body;
  try {
    const json = JSON.parse(body) as { message?: unknown };
    if (typeof json?.message === "string") message = json.message;
  } catch {
    if (body.trimStart().startsWith("<")) message = body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "";
  }
  message = message.replace(/\s+/g, " ").trim().slice(0, 200);
  return message ? `HTTP ${status}: ${message}` : `HTTP ${status}`;
}

/** Why a site's answer means stop: a sign-in or check page, or a limit. */
export function blockedReason(status: number, finalUrl: string, body = ""): string | undefined {
  // Instagram says "Please wait a few minutes" also when the session is gone; require_login tells them apart.
  if (/"require_login"\s*:\s*true/.test(body)) return "signin";
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

/**
 * What a change of a site's cookie says about the app's sign-in (issue #107):
 * true signed in, false signed out, undefined for any other cookie or a
 * session cookie that is only being refreshed.
 */
export function sessionChange(name: string, sessionCookie: string, cause: string, removed: boolean): boolean | undefined {
  if (name !== sessionCookie) return undefined;
  if (!removed) return true;
  return cause === "overwrite" ? undefined : false;
}
