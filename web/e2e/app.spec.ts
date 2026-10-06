import { test, expect } from "@playwright/test";

import { FakeBackend, screenshot } from "./backend";
import { sampleRun } from "./fixtures";

// The app screens (issue #21), with the backend mocked.
let backend: FakeBackend;

test.beforeEach(async ({ page }) => {
  backend = new FakeBackend(page);
  Object.assign(backend.status, { whatsappConnected: true, googleConnected: true });
  backend.runs = [sampleRun(), sampleRun("2026-09-24T21-03-00-000Z-def456", "2026-09-24T21:03:00.000Z")];
  backend.runs[1].mode = "review";
  await backend.install();
});

test("dashboard: coverage, sources, activity and latest photos", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  const coverage = page.getByTestId("coverage");
  await expect(coverage).toContainText("62%");
  await expect(coverage).toContainText("774");
  await expect(coverage).toContainText("of 1,248 contacts have a photo");
  await expect(coverage).toContainText("ada@example.com");
  await expect(page.getByText("Last sync added 7 photos")).toBeVisible();
  await expect(page.getByRole("link", { name: /Photo sync · Replace all/ })).toHaveAttribute("href", `/app/history/${backend.runs[0].id}`);
  await expect(page.getByText("7 contacts got a face in the last sync.")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main navigation" }).first()).toBeVisible();
  await screenshot(page, "20-dashboard");
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
  await expect(tabs.getByRole("link")).toHaveCount(5);
  // The tab bar is fixed to the viewport, so capture what a phone shows.
  await screenshot(page, "22-dashboard-mobile", { fullPage: false });
});

test("sync setup: sources can be reordered and switched off", async ({ page }) => {
  await page.goto("/app/sync");
  await expect(page.getByText("1,248", { exact: true })).toBeVisible();
  await expect(page.getByText("474", { exact: true })).toBeVisible();
  await expect(page.getByText("up to 12 min")).toBeVisible();
  await page.getByRole("button", { name: "Move Gravatar up" }).click();
  await expect(page.getByRole("list", { name: "Sources" }).getByRole("listitem").first()).toContainText("Gravatar");
  await screenshot(page, "23-sync-setup");

  await page.getByRole("button", { name: "Start sync" }).click();
  await expect(page).toHaveURL(/sources=gravatar%2Cwhatsapp/);

  await page.goto("/app/sync");
  await page.getByRole("checkbox", { name: "Gravatar" }).uncheck();
  await page.getByRole("checkbox", { name: "WhatsApp" }).uncheck();
  await page.getByRole("checkbox", { name: "Profile links" }).uncheck();
  await expect(page.getByText("Choose at least one source.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start sync" })).toBeDisabled();
});

test("sync setup without WhatsApp offers to connect it", async ({ page }) => {
  backend.status.whatsappConnected = false;
  await page.goto("/app/sync");
  await expect(page.getByTestId("source-whatsapp")).toContainText("Not connected");
  await expect(page.getByTestId("source-whatsapp").getByRole("link", { name: "Connect" })).toBeVisible();
  await page.getByRole("button", { name: "Start sync" }).click();
  await expect(page).toHaveURL(/sources=gravatar%2Clinks$/);
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
  const error = page.getByRole("row").nth(1).locator(".line-clamp-2");
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
