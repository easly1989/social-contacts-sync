import { SimpleContact } from "../interfaces";
import { Base64 } from "../types";
import { FoundPhoto, PhotoSource } from "./types";

/*
  Profile links (issue #51): profile pictures from the social profile URLs
  saved on a contact. Every request is anonymous, like a link preview: the
  page's public preview image (og:image) or a network's public API. No
  sign-in, ever. Instagram, Facebook and LinkedIn don't allow automated
  access and quickly ask to sign in, so the sync only tries them when the
  user turns them on (`bestEffort`), and slowly.
*/

export type Network = "x" | "telegram" | "youtube" | "bluesky" | "mastodon" | "github" | "instagram" | "facebook" | "linkedin";

/** Networks tried only when the user turns them on. */
export const bestEffortNetworks: ReadonlySet<Network> = new Set(["instagram", "facebook", "linkedin"]);

export const networkNames: Record<Network, string> = {
  x: "X",
  telegram: "Telegram",
  youtube: "YouTube",
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  github: "GitHub",
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
};

export interface ProfileLink {
  network: Network;
  /** The profile's address, normalized: https, no query or trailing slash. */
  url: string;
  host: string;
  handle: string;
}

const userAgent = `SocialContactsSync/${process.env.SCS_APP_VERSION || "1"} (+https://github.com/easly1989/social-contacts-sync)`;

// First path segments that are pages of the site, not profiles.
const reserved: Partial<Record<Network, string[]>> = {
  x: ["home", "i", "intent", "share", "search", "hashtag", "explore", "settings", "messages", "notifications", "login", "signup", "tos", "privacy"],
  telegram: ["joinchat", "s", "addstickers", "share", "proxy", "iv"],
  github: ["about", "features", "topics", "trending", "orgs", "settings", "marketplace", "sponsors", "login", "join", "explore", "pricing"],
  instagram: ["p", "reel", "reels", "explore", "stories", "accounts", "direct", "tv", "about", "legal"],
  facebook: ["groups", "pages", "events", "watch", "marketplace", "login", "login.php", "share", "sharer.php", "help", "policies", "photo.php"],
};

const hostNetwork: Record<string, Network> = {
  "x.com": "x",
  "twitter.com": "x",
  "mobile.twitter.com": "x",
  "t.me": "telegram",
  "telegram.me": "telegram",
  "youtube.com": "youtube",
  "m.youtube.com": "youtube",
  "bsky.app": "bluesky",
  "github.com": "github",
  "instagram.com": "instagram",
  "facebook.com": "facebook",
  "m.facebook.com": "facebook",
  "fb.com": "facebook",
  "linkedin.com": "linkedin",
};

/** Recognizes a profile URL (also without https:// or www.), or undefined. */
export function parseProfileLink(raw: string): ProfileLink | undefined {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const network = hostNetwork[host];
  const make = (net: Network, handle: string, path: string, h = host): ProfileLink | undefined =>
    handle && !(reserved[net] ?? []).includes(handle.toLowerCase()) ? { network: net, handle, host: h, url: `https://${h}${path}` } : undefined;

  switch (network) {
    case "x":
      return parts.length >= 1 && /^\w{1,15}$/.test(parts[0]) ? make("x", parts[0], `/${parts[0]}`, "x.com") : undefined;
    case "telegram":
      return parts.length === 1 && /^\w{4,32}$/.test(parts[0]) ? make("telegram", parts[0], `/${parts[0]}`, "t.me") : undefined;
    case "youtube": {
      if (parts[0]?.startsWith("@")) return make("youtube", parts[0], `/${parts[0]}`, "youtube.com");
      if (["channel", "c", "user"].includes(parts[0]) && parts[1]) return make("youtube", parts[1], `/${parts[0]}/${parts[1]}`, "youtube.com");
      return undefined;
    }
    case "bluesky":
      return parts[0] === "profile" && parts[1] ? make("bluesky", parts[1], `/profile/${parts[1]}`) : undefined;
    case "github":
      return parts.length === 1 && /^[A-Za-z0-9-]{1,39}$/.test(parts[0]) ? make("github", parts[0], `/${parts[0]}`) : undefined;
    case "instagram":
      return parts.length >= 1 && /^[\w.]{1,30}$/.test(parts[0]) ? make("instagram", parts[0], `/${parts[0]}`, "instagram.com") : undefined;
    case "facebook": {
      if (parts[0] === "profile.php") {
        const id = url.searchParams.get("id");
        return id && /^\d+$/.test(id) ? { network: "facebook", handle: id, host: "facebook.com", url: `https://facebook.com/profile.php?id=${id}` } : undefined;
      }
      return parts.length >= 1 && /^[\w.-]{2,}$/.test(parts[0]) ? make("facebook", parts[0], `/${parts[0]}`, "facebook.com") : undefined;
    }
    case "linkedin":
      return parts[0] === "in" && parts[1] ? make("linkedin", parts[1], `/in/${parts[1]}`, "linkedin.com") : undefined;
  }
  // Mastodon and other fediverse servers: https://server/@user.
  if (parts.length === 1 && /^@\w{1,30}$/.test(parts[0]) && isPublicHost(host) && !url.port) return make("mastodon", parts[0].slice(1), `/${parts[0]}`);
  return undefined;
}

/** A short form for reports: "instagram.com/name". */
export function shortLink(link: ProfileLink): string {
  return link.url.replace(/^https:\/\//, "");
}

/** The site asked to sign in, or limited requests: skip it for now. */
export class LinkBlockedError extends Error {
  constructor(public network: Network) {
    super(`${networkNames[network]} asked to sign in or limited requests`);
  }
}

type Fetch = typeof fetch;

/**
 * Only public sites by name: a link (or a picture address a server sent
 * back) must not make the app call a device on the local network.
 */
export function isPublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host.includes(".") || host.includes(":")) return false; // localhost, IPv6
  if (/^\d+(\.\d+){3}$/.test(host)) return false; // IPv4
  return !/\.(local|localhost|internal|lan|home|arpa)$/.test(host);
}

async function get(fetchImpl: Fetch, url: string, network: Network): Promise<Response> {
  const target = new URL(url);
  if (target.protocol !== "https:" || !isPublicHost(target.hostname)) throw new Error(`Not a public https address: ${target.hostname}`);
  const response = await fetchImpl(url, {
    headers: { "User-Agent": userAgent, Accept: "text/html,application/json;q=0.9,*/*;q=0.8" },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  // 403 is GitHub's API rate limit, and how some sites turn visitors away.
  if (response.status === 429 || response.status === 403 || /\/(accounts\/)?login|authwall|checkpoint/i.test(response.url)) throw new LinkBlockedError(network);
  return response;
}

function decodeEntities(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x2F;/gi, "/").replace(/&#39;/g, "'");
}

/** The page's og:image (or twitter:image), whatever the attribute order. */
export function previewImage(html: string): string | undefined {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = /(?:property|name)\s*=\s*["'](og:image|og:image:url|twitter:image)["']/i.exec(tag);
    const content = /content\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (name && content) return decodeEntities(content[1]);
  }
  return undefined;
}

// Generic images some sites show when there is no profile picture, or to
// signed-out visitors instead of one.
const placeholders = [
  /default_profile/i, // X
  /telegram\.org\/img\//i, // t.me without a photo
  /static\.cdninstagram\.com/i,
  /44884218_345707102882519_2446069589734326272_n/, // Instagram's grey avatar
  /static\.xx\.fbcdn\.net\/rsrc\.php/i,
  /static\.licdn\.com/i,
  /\/avatars\/original\/missing\.png$/i, // Mastodon
];

export function isPlaceholder(imageUrl: string): boolean {
  return placeholders.some((p) => p.test(imageUrl));
}

/** The URL of the profile picture, or null when the profile has none. */
export async function avatarUrl(link: ProfileLink, fetchImpl: Fetch = fetch): Promise<string | null> {
  let image: string | undefined;
  if (link.network === "bluesky") {
    const response = await get(fetchImpl, `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(link.handle)}`, link.network);
    image = response.ok ? ((await response.json()) as { avatar?: string })?.avatar : undefined;
  } else if (link.network === "github") {
    const response = await get(fetchImpl, `https://api.github.com/users/${encodeURIComponent(link.handle)}`, link.network);
    const avatar = response.ok ? ((await response.json()) as { avatar_url?: string })?.avatar_url : undefined;
    image = avatar && `${avatar}${avatar.includes("?") ? "&" : "?"}s=460`;
  } else if (link.network === "mastodon") {
    const response = await get(fetchImpl, `https://${link.host}/api/v1/accounts/lookup?acct=${encodeURIComponent(link.handle)}`, link.network);
    image = response.ok ? ((await response.json()) as { avatar?: string })?.avatar : undefined;
  } else {
    const response = await get(fetchImpl, link.url, link.network);
    image = response.ok ? previewImage(await response.text()) : undefined;
    // X's preview is 200 px; the same picture exists at 400 px.
    if (image && link.network === "x") image = image.replace(/_(normal|bigger|200x200)\.(\w+)$/, "_400x400.$2");
  }
  if (!image || !/^https:\/\//.test(image) || isPlaceholder(image)) return null;
  return image;
}

/** Downloads a picture; null when it isn't an image of a sensible size. */
export async function downloadImage(url: string, network: Network, fetchImpl: Fetch = fetch): Promise<Base64 | null> {
  const response = await get(fetchImpl, url, network);
  if (!response.ok || !/^image\//.test(response.headers.get("content-type") ?? "")) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  return bytes.length > 500 && bytes.length < 8_000_000 ? bytes.toString("base64") : null;
}

/** Leaves at least `interval` between requests to the same site. */
export class Pacer {
  private last = new Map<string, number>();
  constructor(
    private interval: (network: Network) => number = (n) => (bestEffortNetworks.has(n) ? 6000 : 3000),
    private now = () => Date.now(),
    private sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
  ) {}

  async wait(network: Network): Promise<void> {
    const key = network === "mastodon" ? "mastodon" : network;
    const previous = this.last.get(key);
    const wait = previous === undefined ? 0 : previous + this.interval(network) - this.now();
    if (wait > 0) await this.sleep(wait);
    this.last.set(key, this.now());
  }
}

export interface LinkPhoto {
  photo: Base64;
  link: ProfileLink;
}

/** One link's picture: the explicit lookup from the report and review. */
export async function lookupProfileLink(raw: string, options: { fetchImpl?: Fetch; pacer?: Pacer } = {}): Promise<LinkPhoto | null> {
  const link = parseProfileLink(raw);
  if (!link) return null;
  const fetchImpl = options.fetchImpl ?? fetch;
  await options.pacer?.wait(link.network);
  const image = await avatarUrl(link, fetchImpl);
  if (!image) return null;
  const photo = await downloadImage(image, link.network, fetchImpl);
  return photo ? { photo, link } : null;
}

/** The contact's profile links that this sync may try. */
export function contactLinks(contact: SimpleContact, bestEffort: boolean): ProfileLink[] {
  return (contact.urls ?? [])
    .map(parseProfileLink)
    .filter((l): l is ProfileLink => Boolean(l) && (bestEffort || !bestEffortNetworks.has(l!.network)));
}

/**
 * The sync source. A site that asks to sign in, or limits requests, is
 * skipped for the rest of the sync: retrying would only make it worse.
 */
export function linksSource(options: { bestEffort?: boolean; fetchImpl?: Fetch; pacer?: Pacer } = {}): PhotoSource {
  const fetchImpl = options.fetchImpl ?? fetch;
  const pacer = options.pacer ?? new Pacer();
  const blocked = new Set<Network>();
  return {
    id: "links",
    async find(contact): Promise<FoundPhoto | null> {
      for (const link of contactLinks(contact, Boolean(options.bestEffort))) {
        if (blocked.has(link.network)) continue;
        try {
          const found = await lookupProfileLink(link.url, { fetchImpl, pacer });
          if (found) return { photo: found.photo, source: "links", matchedBy: shortLink(link) };
        } catch (e) {
          if (e instanceof LinkBlockedError) {
            blocked.add(link.network);
            console.warn(`${e.message}; skipping it for the rest of this sync.`);
            continue;
          }
          // A link that doesn't answer is not the contact's failure.
          console.warn(`Profile link ${shortLink(link)} failed:`, e instanceof Error ? e.message : e);
        }
      }
      return null;
    },
  };
}
