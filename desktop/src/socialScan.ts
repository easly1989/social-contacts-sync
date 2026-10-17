import { app, BrowserWindow, session, Session } from "electron";

import {
  blockedReason,
  browserUserAgent,
  facebookExtractScript,
  facebookPeople,
  facebookProfile,
  facebookProfileScript,
  instagramPage,
  instagramProfile,
  isAbortedLoad,
  linkedinPage,
  linkedinProfile,
  pause,
  ProfileRead,
  profilePageUrl,
  ScannedPerson,
  ScanNetwork,
} from "./socialParse";

/*
  The experimental login scan of Find profiles (issue #61). The user logs in
  on the site's own page in an app window; the session is kept in its own
  Electron partition, apart from the app. The scan then reads the user's own
  followers, friends or connections from a hidden window on the site, the
  way the site's web page does, one page every few seconds, and stops at
  the first sign-in page or limit. Nothing is posted or changed.
*/

const sites: Record<ScanNetwork, { login: string; home: string; cookie: string }> = {
  instagram: { login: "https://www.instagram.com/accounts/login/", home: "https://www.instagram.com/", cookie: "sessionid" },
  facebook: { login: "https://www.facebook.com/login/", home: "https://www.facebook.com/", cookie: "c_user" },
  linkedin: { login: "https://www.linkedin.com/login", home: "https://www.linkedin.com/mynetwork/", cookie: "li_at" },
};

const maxPeople = 5000;

interface Running {
  read: number;
  stop: boolean;
}
const running = new Map<ScanNetwork, Running>();

/** The site's own session, which presents itself as plain Chrome. */
function partition(network: ScanNetwork): Session {
  const ses = session.fromPartition(`persist:scs-social-${network}`);
  ses.setUserAgent(browserUserAgent(app.userAgentFallback));
  return ses;
}

/**
 * Opens a page and waits for it to settle. Sites redirect (Facebook's
 * /me/friends goes on to the profile's own friends page), which fails the
 * first load with ERR_ABORTED although the page that follows is the one wanted.
 */
async function load(win: BrowserWindow, url: string): Promise<void> {
  try {
    await win.loadURL(url);
  } catch (error) {
    if (!isAbortedLoad(error)) throw error;
  }
  if (win.webContents.isLoading()) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 30_000);
      win.webContents.once("did-stop-loading", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

async function cookie(network: ScanNetwork, name: string): Promise<string | undefined> {
  const [found] = await partition(network).cookies.get({ name });
  return found?.value;
}

export async function socialStatus() {
  return Promise.all(
    (Object.keys(sites) as ScanNetwork[]).map(async (network) => ({
      network,
      loggedIn: Boolean(await cookie(network, sites[network].cookie)),
      running: running.has(network),
      read: running.get(network)?.read,
    }))
  );
}

/** Opens the site's login page; resolves once its session cookie is there, or when the window is closed. */
export function socialLogin(network: ScanNetwork, parent?: BrowserWindow): Promise<{ network: ScanNetwork; loggedIn: boolean }> {
  partition(network);
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 520,
      height: 760,
      parent,
      title: `${network[0].toUpperCase()}${network.slice(1)}`,
      autoHideMenuBar: true,
      webPreferences: { partition: `persist:scs-social-${network}`, contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    let done = false;
    const finish = (loggedIn: boolean) => {
      if (done) return;
      done = true;
      clearInterval(poll);
      if (!win.isDestroyed()) win.close();
      resolve({ network, loggedIn });
    };
    const poll = setInterval(async () => {
      if (await cookie(network, sites[network].cookie)) finish(true);
    }, 1000);
    win.on("closed", () => finish(false));
    void load(win, sites[network].login).catch(() => undefined);
  });
}

export async function socialLogout(network: ScanNetwork): Promise<void> {
  running.get(network) && (running.get(network)!.stop = true);
  closeReader(network);
  await partition(network).clearStorageData();
}

export function socialStop(network: ScanNetwork): void {
  const scan = running.get(network);
  if (scan) scan.stop = true;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A request made by the site's own page, so it carries the session like the site does. */
async function pageFetch(win: BrowserWindow, path: string, headers: Record<string, string>): Promise<{ status: number; url: string; body: string }> {
  return win.webContents.executeJavaScript(
    `fetch(${JSON.stringify(path)}, { credentials: "include", headers: ${JSON.stringify(headers)} }).then(async (r) => ({ status: r.status, url: r.url, body: await r.text() }))`
  );
}

async function openHidden(network: ScanNetwork): Promise<BrowserWindow> {
  partition(network);
  const win = new BrowserWindow({ show: false, webPreferences: { partition: `persist:scs-social-${network}`, contextIsolation: true, nodeIntegration: false, sandbox: true } });
  await load(win, sites[network].home);
  return win;
}

async function scanInstagram(win: BrowserWindow, scan: Running, add: (people: ScannedPerson[]) => void): Promise<string | undefined> {
  const userId = await cookie("instagram", "ds_user_id");
  if (!userId) return "signin";
  for (const [list, relation] of [["followers", "follower"], ["following", "following"]] as const) {
    let next: string | undefined;
    do {
      if (scan.stop) return "stopped";
      const query = `count=50${next ? `&max_id=${encodeURIComponent(next)}` : ""}`;
      const answer = await pageFetch(win, `/api/v1/friendships/${userId}/${list}/?${query}`, { "X-IG-App-ID": "936619743392459", "X-Requested-With": "XMLHttpRequest" });
      const blocked = blockedReason(answer.status, answer.url, answer.body);
      if (blocked) return blocked;
      if (answer.status !== 200) return `error:${answer.status}`;
      const page = instagramPage(JSON.parse(answer.body), relation);
      add(page.people);
      next = page.next;
      if (scan.read >= maxPeople) return undefined;
      await sleep(pause(3000, 7000));
    } while (next);
  }
  return undefined;
}

async function scanLinkedIn(win: BrowserWindow, scan: Running, add: (people: ScannedPerson[]) => void): Promise<string | undefined> {
  const csrf = (await cookie("linkedin", "JSESSIONID"))?.replace(/"/g, "");
  if (!csrf) return "signin";
  for (let start = 0; start < maxPeople; start += 40) {
    if (scan.stop) return "stopped";
    const path = `/voyager/api/relationships/dash/connections?decorationId=com.linkedin.voyager.dash.deco.web.mynetwork.ConnectionListWithProfile-16&count=40&q=search&sortType=RECENTLY_ADDED&start=${start}`;
    const answer = await pageFetch(win, path, { "csrf-token": csrf, "x-restli-protocol-version": "2.0.0", accept: "application/vnd.linkedin.normalized+json+2.1" });
    const blocked = blockedReason(answer.status, answer.url, answer.body);
    if (blocked) return blocked;
    if (answer.status !== 200) return `error:${answer.status}`;
    const page = linkedinPage(JSON.parse(answer.body));
    add(page.people);
    if (!page.elements) return undefined;
    await sleep(pause(4000, 8000));
  }
  return undefined;
}

async function scanFacebook(win: BrowserWindow, scan: Running, add: (people: ScannedPerson[]) => void): Promise<string | undefined> {
  await load(win, "https://www.facebook.com/me/friends");
  const blocked = blockedReason(200, win.webContents.getURL());
  if (blocked) return blocked;
  let unchanged = 0;
  let seen = 0;
  while (unchanged < 3 && scan.read < maxPeople) {
    if (scan.stop) return "stopped";
    add(facebookPeople(await win.webContents.executeJavaScript(facebookExtractScript)));
    unchanged = scan.read === seen ? unchanged + 1 : 0;
    seen = scan.read;
    await win.webContents.executeJavaScript("window.scrollTo(0, document.body.scrollHeight)");
    await sleep(pause(2500, 5000));
    const now = blockedReason(200, win.webContents.getURL());
    if (now) return now;
  }
  return undefined;
}

/** Reads everyone it can; `stopped` says why it ended early. */
export async function socialScan(network: ScanNetwork): Promise<{ people: ScannedPerson[]; stopped?: string }> {
  if (running.has(network)) throw new Error("A scan is already running.");
  if (!(await cookie(network, sites[network].cookie))) return { people: [], stopped: "signin" };
  const scan: Running = { read: 0, stop: false };
  running.set(network, scan);
  const people = new Map<string, ScannedPerson>();
  const add = (found: ScannedPerson[]) => {
    for (const person of found) people.set(person.id, { ...people.get(person.id), ...person });
    scan.read = people.size;
  };
  let win: BrowserWindow | undefined;
  try {
    win = await openHidden(network);
    const blocked = blockedReason(200, win.webContents.getURL());
    const stopped =
      blocked ??
      (network === "instagram" ? await scanInstagram(win, scan, add) : network === "linkedin" ? await scanLinkedIn(win, scan, add) : await scanFacebook(win, scan, add));
    return { people: [...people.values()], stopped };
  } catch (e) {
    return { people: [...people.values()], stopped: `error:${e instanceof Error ? e.message : String(e)}` };
  } finally {
    running.delete(network);
    if (win && !win.isDestroyed()) win.destroy();
  }
}

/*
  A sync reads a pinned profile again (issue #79), one at a time; the sync
  paces the reads. One hidden window per network serves a sync's reads and
  closes once they stop coming.
*/
const readers = new Map<ScanNetwork, { win: BrowserWindow; idle?: NodeJS.Timeout }>();

async function reader(network: ScanNetwork): Promise<BrowserWindow> {
  const known = readers.get(network);
  if (known && !known.win.isDestroyed()) {
    clearTimeout(known.idle);
    return known.win;
  }
  const win = await openHidden(network);
  readers.set(network, { win });
  return win;
}

function release(network: ScanNetwork): void {
  const known = readers.get(network);
  if (known) known.idle = setTimeout(() => closeReader(network), 60_000);
}

function closeReader(network: ScanNetwork): void {
  const known = readers.get(network);
  readers.delete(network);
  if (known && !known.win.isDestroyed()) known.win.destroy();
}

/** A profile's photo address and name, read with the user's login; `stopped` when the site said no. Nothing is posted or changed. */
export async function socialProfile(network: ScanNetwork, handle: string): Promise<{ profile?: ProfileRead; missing?: boolean; stopped?: string }> {
  const url = profilePageUrl(network, handle);
  if (!url) return { missing: true };
  if (!(await cookie(network, sites[network].cookie))) return { stopped: "signin" };
  // A login scan is reading the site already: two at once would double the requests.
  if (running.has(network)) return { stopped: "busy" };
  try {
    const win = await reader(network);
    const atHome = blockedReason(200, win.webContents.getURL());
    if (atHome) {
      closeReader(network);
      return { stopped: atHome };
    }
    if (network === "instagram") {
      const answer = await pageFetch(win, `/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`, { "X-IG-App-ID": "936619743392459", "X-Requested-With": "XMLHttpRequest" });
      const blocked = blockedReason(answer.status, answer.url, answer.body);
      if (blocked) return { stopped: blocked };
      if (answer.status === 404) return { missing: true };
      if (answer.status !== 200) return { stopped: `error:${answer.status}` };
      const profile = instagramProfile(JSON.parse(answer.body));
      return profile ? { profile } : { missing: true };
    }
    if (network === "linkedin") {
      const csrf = (await cookie("linkedin", "JSESSIONID"))?.replace(/"/g, "");
      if (!csrf) return { stopped: "signin" };
      const path = `/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${encodeURIComponent(handle)}`;
      const answer = await pageFetch(win, path, { "csrf-token": csrf, "x-restli-protocol-version": "2.0.0", accept: "application/vnd.linkedin.normalized+json+2.1" });
      const blocked = blockedReason(answer.status, answer.url, answer.body);
      if (blocked) return { stopped: blocked };
      if (answer.status === 404) return { missing: true };
      if (answer.status !== 200) return { stopped: `error:${answer.status}` };
      const profile = linkedinProfile(JSON.parse(answer.body), handle);
      return profile ? { profile } : { missing: true };
    }
    await load(win, url);
    const blocked = blockedReason(200, win.webContents.getURL());
    if (blocked) return { stopped: blocked };
    const profile = facebookProfile(await win.webContents.executeJavaScript(facebookProfileScript));
    return profile ? { profile } : { missing: true };
  } catch (e) {
    closeReader(network);
    return { stopped: `error:${e instanceof Error ? e.message : String(e)}` };
  } finally {
    release(network);
  }
}

/** "Delete all local data": the sites' sessions go too. */
export async function forgetSocialSessions(): Promise<void> {
  await Promise.all((Object.keys(sites) as ScanNetwork[]).map((n) => partition(n).clearStorageData()));
}
