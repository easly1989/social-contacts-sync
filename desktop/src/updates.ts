/*
  Update checks. Builds that can replace themselves (Windows installer,
  AppImage) use electron-updater; the others (portable .exe, .deb, unsigned
  macOS) only learn that a newer release exists and point to its page.
*/

export const releasesRepo = "easly1989/social-contacts-sync";

export type UpdateStrategy = "auto" | "notify" | "none";

export function updateStrategy(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, isPackaged: boolean): UpdateStrategy {
  if (!isPackaged || env.SCS_DISABLE_UPDATES) return "none";
  if (platform === "win32") return env.PORTABLE_EXECUTABLE_DIR ? "notify" : "auto";
  if (platform === "linux") return env.APPIMAGE ? "auto" : "notify";
  return "notify";
}

interface Version {
  core: number[];
  pre: string[];
}

function parse(version: string): Version | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(version.trim());
  if (!match) return undefined;
  return { core: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] ? match[4].split(".") : [] };
}

export function isPrerelease(version: string): boolean {
  return (parse(version)?.pre.length ?? 0) > 0;
}

/** Semantic-version comparison: is `candidate` newer than `current`? */
export function isNewer(candidate: string, current: string): boolean {
  const a = parse(candidate);
  const b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a.core[i] !== b.core[i]) return a.core[i] > b.core[i];
  // 1.0.0 is newer than 1.0.0-beta.2; equal cores without pre-release are equal.
  if (!a.pre.length || !b.pre.length) return !a.pre.length && b.pre.length > 0;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i];
    const y = b.pre[i];
    if (x === undefined) return false;
    if (y === undefined) return true;
    if (x === y) continue;
    const nx = /^\d+$/.test(x) ? Number(x) : undefined;
    const ny = /^\d+$/.test(y) ? Number(y) : undefined;
    if (nx !== undefined && ny !== undefined) return nx > ny;
    if (nx !== undefined) return false; // numeric identifiers sort first
    if (ny !== undefined) return true;
    return x > y;
  }
  return false;
}

export interface Release {
  version: string;
  url: string;
}

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
}

/**
 * The newest release that should be offered to `current`: stable releases
 * always, pre-releases only to people already on a pre-release.
 */
export function pickUpdate(releases: GitHubRelease[], current: string): Release | undefined {
  const allowPre = isPrerelease(current);
  let best: Release | undefined;
  for (const r of releases) {
    if (r.draft || (r.prerelease && !allowPre) || !parse(r.tag_name)) continue;
    const version = r.tag_name.replace(/^v/, "");
    if (isNewer(version, current) && (!best || isNewer(version, best.version))) best = { version, url: r.html_url };
  }
  return best;
}

/**
 * Where electron-updater finds a release's files (latest.yml and the
 * packages). Pointing it at the release we picked keeps its own choice out
 * of it: with the GitHub provider it reads "beta2" in 0.1.0-beta2 as a
 * channel and only offers releases of that same "channel", so a beta never
 * saw the next one.
 */
export function updateFeed(version: string): { provider: "generic"; url: string } {
  return { provider: "generic", url: `https://github.com/${releasesRepo}/releases/download/v${version}` };
}

export async function findUpdate(current: string, fetchImpl: typeof fetch = fetch): Promise<Release | undefined> {
  const response = await fetchImpl(`https://api.github.com/repos/${releasesRepo}/releases?per_page=20`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "social-contacts-sync" },
  });
  if (!response.ok) throw new Error(`GitHub releases: HTTP ${response.status}`);
  return pickUpdate((await response.json()) as GitHubRelease[], current);
}
