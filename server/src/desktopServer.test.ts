import test from "node:test";
import assert from "node:assert/strict";
import { fork, ChildProcess } from "child_process";
import http from "http";
import crypto from "crypto";
import fs from "fs";
import { AddressInfo } from "net";
import os from "os";
import path from "path";

import { encrypt } from "./secretStore";

// Boots the real server in desktop mode in a child process.
async function startDesktopServer(env: NodeJS.ProcessEnv): Promise<{ base: string; child: ChildProcess }> {
  const child = fork(path.join(__dirname, "..", "main.ts"), [], {
    execArgv: ["--require", "ts-node/register/transpile-only"],
    env: { ...process.env, SCS_DESKTOP: "1", HOST: "127.0.0.1", PORT: "0", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", ...env },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  const port = await new Promise<number>((resolve, reject) => {
    let output = "";
    child.stdout!.on("data", (chunk) => {
      output += chunk;
      const match = /Listening on 127\.0\.0\.1:(\d+)/.exec(output);
      if (match) resolve(Number(match[1]));
    });
    child.on("exit", (code) => reject(new Error(`server exited (${code}): ${output}`)));
  });
  return { base: `http://127.0.0.1:${port}/api`, child };
}

test("desktop mode", async (t) => {
  // Stands in for Google's token endpoint: accepts any client.
  const google = http.createServer((_req, res) => {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_grant" }));
  });
  await new Promise<void>((resolve) => google.listen(0, "127.0.0.1", resolve));
  const tokenEndpoint = `http://127.0.0.1:${(google.address() as AddressInfo).port}/token`;

  const { base, child } = await startDesktopServer({ SCS_GOOGLE_TOKEN_ENDPOINT: tokenEndpoint });
  t.after(() => {
    child.kill();
    google.close();
  });

  await t.test("status reports desktop mode and missing credentials", async () => {
    const status = (await (await fetch(`${base}/status`)).json()) as { desktop: boolean; googleConfigured: boolean };
    assert.equal(status.desktop, true);
    assert.equal(status.googleConfigured, false);
  });

  await t.test("cross-site requests are refused", async () => {
    const response = await fetch(`${base}/status`, { headers: { "Sec-Fetch-Site": "cross-site" } });
    assert.equal(response.status, 403);
  });

  await t.test("the OAuth callback stays reachable from Google", async () => {
    const response = await fetch(`${base}/google_callback?state=unknown`, {
      headers: { "Sec-Fetch-Site": "cross-site" },
      redirect: "manual",
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/?error=invalid_state");
  });

  await t.test("credentials must be sent as JSON", async () => {
    const response = await fetch(`${base}/desktop/google_credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "clientId=a",
    });
    assert.equal(response.status, 415);
  });

  await t.test("malformed credentials are explained", async () => {
    const response = await fetch(`${base}/desktop/google_credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ json: JSON.stringify({ web: {} }) }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "wrong_client_type" });
  });

  await t.test("verified credentials are handed to the desktop app to save", async () => {
    // Outside Electron there is no desktop app to save them.
    const response = await fetch(`${base}/desktop/google_credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "1-abc.apps.googleusercontent.com", clientSecret: "s" }),
    });
    assert.deepEqual(await response.json(), { error: "save_failed" });
  });

  await t.test("starting a sign-in with a return path redirects to Google", async () => {
    const response = await fetch(`${base}/google_auth_start?return=/setup/signin`, { redirect: "manual" });
    assert.equal(response.status, 302);
    assert.match(response.headers.get("location") ?? "", /^https:\/\/accounts\.google\.com\//);
  });
});

test("desktop mode keeps the Google sign-in across restarts", async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "scs-session-"));
  const key = crypto.randomBytes(32);
  fs.writeFileSync(
    path.join(dataDir, "google-token.enc"),
    encrypt({ refresh_token: "1//saved", access_token: "ya29.saved", expiry_date: Date.now() + 3600_000 }, key)
  );

  const { base, child } = await startDesktopServer({
    SCS_DATA_DIR: dataDir,
    SCS_DATA_KEY: key.toString("base64"),
    GOOGLE_CLIENT_ID: "1-abc.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "s",
  });
  t.after(() => child.kill());
  const status = async () => (await (await fetch(`${base}/status`)).json()) as Record<string, unknown>;

  await t.test("a saved token signs the app in at start", async () => {
    const s = await status();
    assert.equal(s.googleConnected, true);
    assert.equal(s.whatsappSaved, false);
  });

  await t.test("signing out forgets the saved token", async () => {
    const response = await fetch(`${base}/desktop/google_sign_out`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal((await status()).googleConnected, false);
    assert.equal(fs.existsSync(path.join(dataDir, "google-token.enc")), false);
  });
});
