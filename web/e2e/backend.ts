import { mkdirSync } from "fs";
import path from "path";
import { Page, Request, Route, WebSocketRoute, expect } from "@playwright/test";

import { TelegramState, CleanupActionSummary, CleanupScan, DesktopInfo, EventType, MergeRequest, GoogleAccount, GoogleStats, RunRecord, SessionStatus, UpdateCheck } from "../../interfaces/api";
import { avatars } from "./avatars";

/**
 * A fake backend living in the browser: `/api/*` requests are answered from
 * `status` and the `/api/ws` WebSocket is mocked, so tests can push server
 * events and inspect what the page sends back.
 */
export class FakeBackend {
  status: SessionStatus = {
    whatsappConnected: false,
    googleConnected: false,
    enforcePayments: false,
    purchased: true,
  };
  requests: Request[] = [];
  /** Answer of the desktop credentials endpoint. */
  credentialsResult: { status: number; body: unknown } = { status: 200, body: { ok: true } };
  account: GoogleAccount = { email: "ada@example.com", name: "Ada Lovelace", totalContacts: 1248 };
  stats: GoogleStats = { totalContacts: 1248, withPhoto: 774, updatedAt: "2026-10-03T12:00:00.000Z" };
  runs: RunRecord[] = [];
  undoRequests: { id: string; body: unknown }[] = [];
  desktopInfo: DesktopInfo = {
    version: "1.0.0",
    packageKind: "windows-portable",
    dataDir: "D:\\Apps\\SocialContactsSync\\social-contacts-sync-data",
    configFile: "D:\\Apps\\SocialContactsSync\\config.env",
    portable: true,
    updates: "notify",
    lastUpdate: { status: "current", checkedAt: new Date(Date.now() - 5 * 60_000).toISOString() },
    rememberSignIns: true,
    history: { runs: 4, bytes: 3_355_443 },
  };
  /** The last clean-up scan, and the one "Scan" returns. */
  cleanupScan: CleanupScan | null = null;
  nextScan?: CleanupScan;
  cleanupActions: CleanupActionSummary[] = [];
  mergeRequests: MergeRequest[] = [];
  /** Bodies of the shared-number and country-code actions, by route. */
  cleanupRequests: { route: string; body: any }[] = [];
  /** Error code the next merge fails with. */
  mergeError?: string;
  /** Makes clean-up's Google changes (merge, numbers) fail like the server does. */
  cleanupFailure?: { status: number; json: object };
  /** Telegram sign-in: the account state and what the next answers are. */
  telegram: TelegramState = { available: true, connected: false };
  telegramPassword?: string;
  telegramRequests: { route: string; body: any }[] = [];
  /** Answer of "Check for updates". */
  updateCheck: Omit<UpdateCheck, "checkedAt"> = { status: "current" };
  /** Bodies posted to /api/desktop/* Settings actions, by route. */
  desktopActions: { route: string; body: unknown }[] = [];
  /** /api/status waits for this, to show what the page looks like while it loads. */
  statusGate?: Promise<void>;
  /** When false, Google sign-in "opens in the system browser" and nothing happens here. */
  signInCompletes = true;
  received: { type: string; data: any }[] = [];
  private socket?: WebSocketRoute;

  constructor(private page: Page) {}

  async install(): Promise<void> {
    // Nothing leaves the machine: analytics, badges and donation buttons are
    // third-party and would make the tests slow and flaky.
    await this.page.route(
      (url) => !["localhost", "127.0.0.1"].includes(url.hostname),
      (route) => route.abort()
    );

    await this.page.route("**/api/**", async (route) => {
      const request = route.request();
      this.requests.push(request);
      const { pathname } = new URL(request.url());

      if (pathname === "/api/status") {
        await this.statusGate;
        return route.fulfill({ json: this.status });
      }
      // Stands in for the whole Google consent round trip, which ends with the
      // backend's callback redirecting to /options.
      if (pathname === "/api/google_auth_start") {
        if (!this.signInCompletes) return route.fulfill({ status: 204 });
        this.status.googleConnected = true;
        const back = new URL(request.url()).searchParams.get("return") ?? "/options";
        return route.fulfill({ status: 302, headers: { location: back } });
      }
      if (pathname === "/api/desktop/google_credentials") {
        if (this.credentialsResult.status === 200) this.status.googleConfigured = true;
        return route.fulfill({ status: this.credentialsResult.status, json: this.credentialsResult.body });
      }
      if (pathname === "/api/google_account") return route.fulfill({ json: this.account });
      if (pathname === "/api/google_stats") return route.fulfill({ json: this.stats });
      if (pathname === "/api/runs") return route.fulfill({ json: this.runs.map(({ results: _r, ...summary }) => summary) });
      const runMatch = /^\/api\/runs\/([^/]+)(?:\/(photos\/(\d+)\/(\w+)|undo))?$/.exec(pathname);
      if (runMatch) {
        const run = this.runs.find((r) => r.id === decodeURIComponent(runMatch[1]));
        if (!run) return route.fulfill({ status: 404, json: { error: "not_found" } });
        if (runMatch[2]?.startsWith("photos")) {
          const avatar = avatars[Number(runMatch[3]) % avatars.length];
          return route.fulfill({ contentType: "image/jpeg", body: Buffer.from(avatar, "base64") });
        }
        if (pathname.endsWith("/undo")) {
          const body = request.postDataJSON() ?? {};
          this.undoRequests.push({ id: run.id, body });
          const indexes: number[] = body.indexes ?? run.results.map((_r, i) => i);
          for (const i of indexes) if (["added", "replaced"].includes(run.results[i]?.outcome)) run.results[i].undone = true;
          return route.fulfill({ status: 202, json: { ok: true } });
        }
        return route.fulfill({ json: run });
      }
      if (pathname === "/api/desktop/google_sign_out") {
        this.status.googleConnected = false;
        return route.fulfill({ json: { ok: true } });
      }
      if (pathname === "/api/desktop/whatsapp_unlink") {
        Object.assign(this.status, { whatsappConnected: false, whatsappSaved: false, whatsappStarting: false });
        return route.fulfill({ json: { ok: true } });
      }
      if (pathname === "/api/desktop/info") return route.fulfill({ json: this.desktopInfo });
      const action = /^\/api\/desktop\/(open|check_updates|remember_sign_ins|delete_all_data)$/.exec(pathname);
      if (action) {
        const body = request.postDataJSON() ?? {};
        this.desktopActions.push({ route: action[1], body });
        if (action[1] === "check_updates") {
          this.desktopInfo.lastUpdate = { ...this.updateCheck, checkedAt: new Date().toISOString() };
          return route.fulfill({ json: this.desktopInfo.lastUpdate });
        }
        if (action[1] === "remember_sign_ins") this.desktopInfo.rememberSignIns = body.enabled;
        return route.fulfill({ json: { ok: true } });
      }
      if (pathname.startsWith("/api/e2e-photos/")) {
        const avatar = avatars[Number(pathname.split("/").pop()) % avatars.length];
        return route.fulfill({ contentType: "image/jpeg", body: Buffer.from(avatar, "base64") });
      }
      if (pathname.startsWith("/api/cleanup")) return this.cleanup(route, pathname, request);
      if (pathname.startsWith("/api/telegram")) return this.telegramRoute(route, pathname, request);
      if (pathname === "/api/check_purchase")
        return route.fulfill({ json: { purchased: this.status.purchased } });
      return route.fulfill({ json: {} });
    });

    await this.page.routeWebSocket("**/api/ws", (ws) => {
      this.socket = ws;
      ws.onMessage((message) => {
        this.received.push(JSON.parse(message.toString()));
      });
    });
  }

  private telegramRoute(route: Route, pathname: string, request: Request) {
    const body = request.method() === "POST" ? request.postDataJSON() ?? {} : {};
    const step = pathname.replace("/api/telegram", "").replace("/", "");
    if (step) this.telegramRequests.push({ route: step, body });
    const fail = (error: string) => route.fulfill({ status: 400, json: { error } });
    const t = this.telegram;
    if (step === "send_code") {
      if (body.phone.replace(/\D/g, "").length < 8) return fail("invalid_phone");
      Object.assign(t, { step: "code", phone: body.phone.replace(/[^\d+]/g, "") });
    } else if (step === "sign_in") {
      if (body.code !== "12345") return fail("invalid_code");
      if (this.telegramPassword) t.step = "password";
      else Object.assign(t, { step: undefined, connected: true });
    } else if (step === "password") {
      if (body.password !== this.telegramPassword) return fail("invalid_password");
      Object.assign(t, { step: undefined, connected: true });
    } else if (step === "sign_out") {
      Object.assign(t, { step: undefined, connected: false, phone: undefined });
    }
    this.status.telegramConnected = t.connected;
    this.status.telegramAvailable = t.available;
    return route.fulfill({ json: t });
  }

  private cleanupSummary() {
    const s = this.cleanupScan;
    return {
      scannedAt: s?.scannedAt,
      totalContacts: s?.totalContacts,
      duplicates: s?.duplicates.length ?? 0,
      sharedNumbers: s?.sharedNumbers.length ?? 0,
      missingCountryCode: s?.missingCountryCode.length ?? 0,
    };
  }

  private cleanup(route: Route, pathname: string, request: Request) {
    const body = request.method() === "POST" ? request.postDataJSON() ?? {} : {};
    if (pathname === "/api/cleanup") return route.fulfill({ json: { scan: this.cleanupScan } });
    if (pathname === "/api/cleanup/summary") return route.fulfill({ json: this.cleanupSummary() });
    if (pathname === "/api/cleanup/scan") {
      this.cleanupScan = this.nextScan ?? this.cleanupScan;
      return route.fulfill({ json: this.cleanupScan });
    }
    if (pathname === "/api/cleanup/ignore") {
      this.cleanupScan!.duplicates = this.cleanupScan!.duplicates.filter((g) => g.id !== body.groupId);
      return route.fulfill({ json: this.cleanupSummary() });
    }
    if (pathname === "/api/cleanup/merge") {
      this.mergeRequests.push(body);
      if (this.mergeError) return route.fulfill({ status: 409, json: { error: this.mergeError } });
      if (this.cleanupFailure) return route.fulfill(this.cleanupFailure);
      const group = this.cleanupScan!.duplicates.find((g) => g.id === body.groupId)!;
      this.cleanupScan!.duplicates = this.cleanupScan!.duplicates.filter((g) => g !== group);
      const id = `merge-${this.cleanupActions.length + 1}`;
      this.cleanupActions.unshift({ id, kind: "merge", at: new Date().toISOString(), title: this.cleanupScan!.contacts[body.keepId].name ?? "", contacts: group.contactIds.length });
      return route.fulfill({ json: { actionId: id, summary: this.cleanupSummary() } });
    }
    const numbers = /^\/api\/cleanup\/(keep_number|mark_shared|group|fix_country_codes)$/.exec(pathname);
    if (numbers) {
      const scan = this.cleanupScan!;
      this.cleanupRequests.push({ route: numbers[1], body });
      if (this.cleanupFailure && numbers[1] !== "mark_shared" && numbers[1] !== "group") return route.fulfill(this.cleanupFailure);
      const shared = scan.sharedNumbers.find((n) => n.e164 === body.e164);
      scan.sharedNumbers = scan.sharedNumbers.filter((n) => n !== shared || numbers[1] === "fix_country_codes" || (numbers[1] === "mark_shared" && body.shared === false));
      if (numbers[1] === "mark_shared") {
        scan.markedShared = body.shared === false ? (scan.markedShared ?? []).filter((n) => n !== body.e164) : [...(scan.markedShared ?? []), body.e164];
        return route.fulfill({ json: this.cleanupSummary() });
      }
      if (numbers[1] === "group") {
        const group = { id: "g-shared", contactIds: shared!.contactIds, reasons: ["phone" as const] };
        scan.duplicates.unshift(group);
        return route.fulfill({ json: { group, summary: this.cleanupSummary() } });
      }
      const id = `${numbers[1]}-${this.cleanupActions.length + 1}`;
      if (numbers[1] === "keep_number") {
        this.cleanupActions.unshift({ id, kind: "keepNumber", at: new Date().toISOString(), title: scan.contacts[body.contactId].name ?? "", number: body.e164, contacts: shared!.contactIds.length - 1 });
        return route.fulfill({ json: { actionId: id, summary: this.cleanupSummary() } });
      }
      const fixed = body.items.length;
      scan.missingCountryCode = scan.missingCountryCode.filter((m) => !body.items.some((i: { contactId: string; value: string }) => i.contactId === m.contactId && i.value === m.value));
      this.cleanupActions.unshift({ id, kind: "countryCodes", at: new Date().toISOString(), title: String(fixed), contacts: fixed });
      return route.fulfill({ json: { actionId: id, fixed, summary: this.cleanupSummary() } });
    }
    if (pathname === "/api/cleanup/actions") return route.fulfill({ json: this.cleanupActions });
    const undo = /^\/api\/cleanup\/actions\/([^/]+)\/undo$/.exec(pathname);
    if (undo) {
      const action = this.cleanupActions.find((a) => a.id === decodeURIComponent(undo[1]));
      if (action) action.undone = true;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ status: 404, json: { error: "not_found" } });
  }

  /** Sends a server event to the page once its WebSocket is connected. */
  async send(type: EventType, data: any = null): Promise<void> {
    await expect.poll(() => this.socket !== undefined).toBe(true);
    this.socket!.send(JSON.stringify({ type, data }));
  }

  requested(pathname: string): Request | undefined {
    return this.requests.find((r) => new URL(r.url()).pathname === pathname);
  }

  count(pathname: string): number {
    return this.requests.filter((r) => new URL(r.url()).pathname === pathname).length;
  }
}

// Playwright runs from the web/ directory (see playwright.config.ts).
const screenshotDir = path.resolve("e2e/screenshots");

/** Saves a full-page screenshot for the PR preview (see CI workflow). */
export async function screenshot(page: Page, name: string, { fullPage = true } = {}): Promise<void> {
  mkdirSync(screenshotDir, { recursive: true });
  // Let fonts and images settle so screenshots are comparable between runs.
  await page.evaluate(() => document.fonts.ready);
  // "disabled" fast-forwards CSS transitions such as the progress bar.
  await page.screenshot({ path: path.join(screenshotDir, `${name}.png`), fullPage, animations: "disabled" });
}
