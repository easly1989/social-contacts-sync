import { mkdirSync } from "fs";
import path from "path";
import { Page, Request, WebSocketRoute, expect } from "@playwright/test";

import { EventType, GoogleAccount, GoogleStats, RunRecord, SessionStatus } from "../../interfaces/api";
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

      if (pathname === "/api/status") return route.fulfill({ json: this.status });
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
