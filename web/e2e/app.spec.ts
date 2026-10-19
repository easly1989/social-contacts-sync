import { test, expect } from "@playwright/test";

import { FakeBackend, screenshot } from "./backend";
import { sampleReview, sampleRun } from "./fixtures";

// The app screens (issue #21), with the backend mocked.
let backend: FakeBackend;

test.beforeEach(async ({ page }) => {
  backend = new FakeBackend(page);
  Object.assign(backend.status, { whatsappConnected: true, googleConnected: true });
  backend.runs = [sampleRun(), sampleRun("2026-09-24T21-03-00-000Z-def456", "2026-09-24T21:03:00.000Z")];
  backend.runs[1].mode = "review";
  await backend.install();
});

test("dashboard: coverage in three parts, next steps, sources and activity (issue #85)", async ({ page }) => {
  backend.runs.unshift(sampleReview());
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  const coverage = page.getByTestId("coverage");
  await expect(coverage).toContainText("62%");
  await expect(coverage).toContainText("ada@example.com");
  await expect(coverage.getByRole("list", { name: "1,248 contacts" }).getByRole("listitem")).toHaveText([
    /Have a photo\s*774\s*62%/,
    /No photo, but one is ready\s*190\s*15%/,
    /No photo and no source\s*284\s*23%/,
  ]);
  // The last sync, not the review made after it.
  await expect(page.getByText("Last sync added 7 photos")).toBeVisible();

  const steps = page.getByTestId("next-steps").getByRole("listitem");
  await expect(steps).toHaveText([
    /190 contacts without a photo already have one ready\s*From Gravatar, a linked profile, or WhatsApp/,
    /21 contacts wait in Profiles or Photos\s*12 of them have no photo yet/,
    /4 photos changed outside the app/,
    /Find profiles for 284 contacts without a source\s*Last search Oct 10, 2026/,
  ]);
  await expect(steps.nth(0).getByRole("link", { name: "Sync", exact: true })).toHaveAttribute("href", "/app/sync?step=run");
  await expect(steps.nth(1).getByRole("link", { name: "Review" })).toHaveAttribute("href", "/app/sync?step=profiles");
  await expect(steps.nth(3).getByRole("link", { name: "Search" })).toHaveAttribute("href", "/app/sync?step=search");

  const sources = page.getByTestId("dashboard-sources");
  await expect(sources.getByRole("listitem").filter({ hasText: "WhatsApp" })).toContainText("812 contacts");
  await expect(sources.getByRole("listitem").filter({ hasText: "Linked profiles" })).toContainText("257 on 233 contacts");

  await expect(page.getByRole("link", { name: /Review · Decisions in To review\s*2 contacts changed/ })).toHaveAttribute("href", `/app/history/${backend.runs[0].id}`);
  await expect(page.getByRole("link", { name: /Photo sync · Replace all/ })).toHaveAttribute("href", `/app/history/${backend.runs[1].id}`);
  await expect(page.getByText("7 contacts got a face in the last sync.")).toBeVisible();
  // Sync comes right after the Dashboard (issue #82).
  await expect(page.getByRole("navigation", { name: "Main navigation" }).first().getByRole("link")).toHaveText([/^Dashboard/, /^Sync/, /^Contacts/, /^Clean up/, /^History/, /^Settings/]);
  await screenshot(page, "20-dashboard");
});

test("dashboard: next steps show only what has something to do (issue #85)", async ({ page }) => {
  Object.assign(backend.coverage, { withPhoto: 1100, ready: 0, noSource: 148, toReview: 0, toReviewWithoutPhoto: 0, changed: 2, lastSearch: undefined });
  backend.status.whatsappConnected = false;
  await page.goto("/app");
  const steps = page.getByTestId("next-steps").getByRole("listitem");
  await expect(steps).toHaveText([/2 photos changed outside the app/, /Find profiles for 148 contacts without a source\s*Import your followers/]);
  await expect(page.getByTestId("dashboard-sources").getByRole("listitem").filter({ hasText: "WhatsApp" }).getByRole("link", { name: "Connect" })).toBeVisible();

  Object.assign(backend.coverage, { withPhoto: 1248, noSource: 0, changed: 0 });
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByTestId("next-steps")).toContainText("Nothing to do right now.");
  await expect(page.getByTestId("coverage")).toContainText("100%");
});

test("dashboard in dark mode", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/app");
  await expect(page.getByTestId("coverage")).toContainText("62%");
  await screenshot(page, "21-dashboard-dark");
});

test("dashboard on a phone uses bottom tabs", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app");
  await expect(page.getByTestId("coverage")).toContainText("62%");
  const tabs = page.getByRole("navigation", { name: "Main navigation" }).last();
  await expect(tabs.getByRole("link")).toHaveCount(6);
  // The tab bar is fixed to the viewport, so capture what a phone shows.
  await screenshot(page, "22-dashboard-mobile", { fullPage: false });
  await page.getByTestId("next-steps").scrollIntoViewIfNeeded();
  await screenshot(page, "22b-dashboard-next-steps-mobile", { fullPage: false });
});

const syncSources = () => new URL(backend.requested("/api/init_sync")!.url()).searchParams.get("sources");

test("sync: sources and profile networks in one order, switched off in Sources, and Sync uses them (issues #82, #107)", async ({ page }) => {
  await page.goto("/app/sync?step=run");
  const summary = page.getByTestId("run-summary");
  await expect(summary.getByText("1,248", { exact: true })).toBeVisible();
  await expect(summary.getByText("474", { exact: true })).toBeVisible();
  await expect(summary.getByText("up to 12 min")).toBeVisible();
  await summary.getByRole("button", { name: "Change sources" }).click();
  await expect(page).toHaveURL(/step=sources$/);
  await page.getByRole("button", { name: "Move Gravatar up" }).click();
  await expect(page.getByRole("list", { name: "Sources" }).getByRole("listitem").first()).toContainText("Gravatar");
  // Every network is a source of its own, with its state.
  await expect(page.getByTestId("state-whatsapp")).toHaveText("Connected");
  await expect(page.getByTestId("source-bluesky")).toBeVisible();
  await screenshot(page, "23-sync-sources");

  await page.getByTestId("wizard-step-run").click();
  await screenshot(page, "23b-sync-run");
  await page.getByRole("button", { name: "Start sync" }).click();
  await expect.poll(() => backend.requested("/api/init_sync")).toBeTruthy();
  // The web version reads Instagram, Facebook and LinkedIn only once they're turned on.
  expect(syncSources()).toBe("gravatar,whatsapp,bluesky,github");

  await page.goto("/app/sync?step=sources");
  for (const name of ["Gravatar", "WhatsApp", "Bluesky", "GitHub"]) await page.getByRole("checkbox", { name: `Use ${name}` }).uncheck();
  await page.getByTestId("wizard-step-run").click();
  await expect(page.getByText("Choose at least one source.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start sync" })).toBeDisabled();
});

test("sync without WhatsApp offers to connect it", async ({ page }) => {
  backend.status.whatsappConnected = false;
  await page.goto("/app/sync?step=sources");
  await expect(page.getByTestId("state-whatsapp")).toHaveText("Not connected");
  await expect(page.getByTestId("source-whatsapp").getByRole("link", { name: "Connect" })).toBeVisible();
  await page.getByTestId("wizard-step-run").click();
  await page.getByRole("button", { name: "Start sync" }).click();
  await expect.poll(() => backend.requested("/api/init_sync")).toBeTruthy();
  expect(syncSources()).toBe("gravatar,bluesky,github");
});

test("history lists every run with its result", async ({ page }) => {
  await page.goto("/app/history");
  const rows = page.getByRole("row");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText("7 added · 1 errors");
  await expect(rows.nth(2)).toContainText("Review each");
  await screenshot(page, "24-history");
  await rows.nth(1).getByRole("link", { name: "Report" }).click();
  await expect(page.getByRole("heading", { name: "Sync report" })).toBeVisible();
});

test("history: syncs, reviews and the profiles linked in To review, with undo (issue #84)", async ({ page }) => {
  const review = sampleReview();
  backend.runs.unshift(review);
  await page.goto("/app/history");
  const rows = page.getByRole("row");
  await expect(rows).toHaveCount(4);
  await screenshot(page, "24a-history-all");
  await page.getByRole("tab", { name: "Reviews" }).click();
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText("Decisions in To review");
  await expect(rows.nth(1)).toContainText("2 contacts changed");
  await page.getByRole("tab", { name: "Syncs" }).click();
  await expect(rows).toHaveCount(3);

  await page.getByRole("tab", { name: "Linked profiles" }).click();
  const linked = page.getByTestId("linked-profiles").getByRole("row");
  await expect(linked).toHaveCount(4);
  // Newest first.
  await expect(linked.nth(1)).toContainText("Davide Gallo");
  await expect(linked.nth(3)).toContainText("instagram.com/elena_conti");
  await screenshot(page, "24b-history-linked");
  await linked.nth(3).getByRole("button", { name: "Undo the change to Elena Conti" }).click();
  await expect.poll(() => backend.undoRequests).toEqual([{ id: review.id, body: { indexes: [0] } }]);
  await expect(linked.nth(3)).toContainText("Undone");
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot(page, "24c-history-linked-phone");

  // The entry's report shows what each decision linked.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/app/history/${review.id}`);
  await expect(page.getByRole("heading", { name: "Review", exact: true })).toBeVisible();
  await expect(page.getByText("2 contacts changed")).toBeVisible();
  await expect(page.getByRole("row", { name: /Davide Gallo/ })).toContainText("bsky.app/profile/dgallo.bsky.social");
  await expect(page.getByRole("row", { name: /Davide Gallo/ }).getByRole("button", { name: "Undo" })).toBeVisible();
  await screenshot(page, "25f-report-review");
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot(page, "25g-report-review-phone");
});

test("report: tabs, search, undo and CSV export", async ({ page }) => {
  const run = backend.runs[0];
  await page.goto(`/app/history/${run.id}`);
  await expect(page.getByText("7 photos added")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Changed (7)" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("row")).toHaveCount(8);
  await screenshot(page, "25-report");

  await page.getByRole("tab", { name: "Errors (1)" }).click();
  await expect(page.getByRole("row").nth(1)).toContainText("Google said no");
  await page.getByRole("tab", { name: "All (10)" }).click();
  await page.getByLabel("Search contacts").fill("sofia");
  await expect(page.getByRole("row")).toHaveCount(2);
  await page.getByLabel("Search contacts").fill("");

  await page.getByRole("tab", { name: "Changed (7)" }).click();
  await page.getByRole("row", { name: /Marco Rossi/ }).getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => backend.undoRequests).toEqual([{ id: run.id, body: { indexes: [1] } }]);
  await expect(page.getByRole("row", { name: /Marco Rossi/ })).toContainText("Undone");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Undo this sync" }).click();
  await expect.poll(() => backend.undoRequests.length).toBe(2);
  expect(backend.undoRequests[1].body).toEqual({});
  await expect(page.getByRole("button", { name: "Undo this sync" })).toBeDisabled();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`social-contacts-sync-${run.id}.csv`);
});

test("report: pinned profiles read again with the login, and why a network stopped (issue #79)", async ({ page }) => {
  const run = backend.runs[0];
  run.profileReads = { instagram: { read: 38, waiting: 12, stopped: "limited", answer: "HTTP 429: Please wait a few minutes before you try again." }, facebook: { read: 1, waiting: 0 } };
  await page.goto(`/app/history/${run.id}`);
  await expect(page.getByTestId("profile-reads-instagram")).toHaveText(
    "Instagram: 38 profiles read again with your login. 12 wait for the next sync. Instagram asked to slow down, so the sync stopped reading it. Instagram answered: HTTP 429: Please wait a few minutes before you try again."
  );
  await expect(page.getByTestId("profile-reads-facebook")).toHaveText("Facebook: 1 profile read again with your login.");
  await screenshot(page, "25d-report-profile-reads", { fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("profile-reads-instagram").scrollIntoViewIfNeeded();
  await screenshot(page, "25e-report-profile-reads-phone", { fullPage: false });
});

test("report: kept Google photos aren't 'no photo found', and an error stays one line", async ({ page }) => {
  const run = backend.runs[0];
  // A contact that kept its Google photo, and a long error.
  run.results[8] = { ...run.results[8], outcome: "alreadyHadPhoto" };
  run.results[9] = { ...run.results[9], error: "Google had a temporary problem (502) and nothing was changed. Try again later. ".repeat(4) };
  Object.assign(run.counters, { noMatch: 1, alreadyHadPhoto: 1 });
  await page.goto(`/app/history/${run.id}`);
  await expect(page.getByTestId("count-kept-google")).toHaveText("Nothing new found, kept the photo they have in Google: 1");
  await expect(page.getByRole("tab", { name: "No photo found (1)" })).toBeVisible();
  await page.getByRole("tab", { name: "Errors (1)" }).click();
  const error = page.getByRole("row").nth(1).locator(".line-clamp-2:visible");
  await expect(error).toContainText("Google had a temporary problem (502)");
  expect(await error.evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(50);
  await screenshot(page, "25d-report-kept-and-error");
});

test("report: the photos open larger, before and after (issue #44)", async ({ page }) => {
  const run = backend.runs[0];
  await page.goto(`/app/history/${run.id}`);
  const preview = page.getByTestId("photo-compare");

  // Replaced: the old photo next to the new one.
  await page.getByRole("button", { name: "Compare photos of Martina Marino" }).hover();
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("Martina Marino");
  await expect(preview).toContainText("Matched by +39 340 555 0166");
  await expect(preview.getByRole("img", { name: "Before" })).toHaveAttribute("src", `/api/runs/${run.id}/photos/6/previous`);
  await expect(preview.getByRole("img", { name: "After" })).toHaveAttribute("src", `/api/runs/${run.id}/photos/6/photo`);
  await expect.poll(() => preview.getByRole("img", { name: "After" }).evaluate((img: HTMLImageElement) => img.getBoundingClientRect().width)).toBe(144);
  await screenshot(page, "25b-report-preview");
  await page.mouse.move(0, 0);
  await expect(preview).toBeHidden();

  // Added: Google's letter, then the new photo. Keyboard focus opens it, Escape closes it.
  await page.getByRole("button", { name: "Compare photos of Sofia Esposito" }).focus();
  await expect(preview).toContainText("Sofia Esposito");
  await expect(preview.getByRole("img", { name: "Before" })).toHaveCount(0);
  await expect(preview).toContainText("S");
  await page.keyboard.press("Escape");
  await expect(preview).toBeHidden();

  await page.emulateMedia({ colorScheme: "dark" });
  await page.getByRole("button", { name: "Compare photos of Martina Marino" }).hover();
  await expect(preview).toBeVisible();
  await screenshot(page, "25c-report-preview-dark");
});

test("a run that is no longer in the history", async ({ page }) => {
  await page.goto("/app/history/missing-run");
  await expect(page.getByText("This sync isn't in the history any more.")).toBeVisible();
});
