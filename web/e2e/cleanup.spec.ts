import { test, expect } from "@playwright/test";

import { FakeBackend, screenshot } from "./backend";
import { sampleScan } from "./fixtures";

// Clean up (issue #28), with the backend mocked.
let backend: FakeBackend;

test.beforeEach(async ({ page }) => {
  backend = new FakeBackend(page);
  Object.assign(backend.status, { whatsappConnected: true, googleConnected: true });
  backend.nextScan = sampleScan();
  await backend.install();
});

test("first scan, then the duplicates and the merge table", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByTestId("cleanup-card")).toContainText("Find duplicate contacts");
  await page.getByTestId("cleanup-card").getByRole("link", { name: "Scan contacts" }).click();

  await expect(page.getByRole("heading", { name: "Find what needs tidying up" })).toBeVisible();
  await page.getByRole("button", { name: "Scan my contacts" }).click();
  await expect(page.getByText("Scanned 1,248 contacts 2 minutes ago.")).toBeVisible();
  await expect(page.getByRole("tab", { name: /Duplicates\s*6/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: /Shared numbers\s*3/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Missing country code\s*3/ })).toBeVisible();
  await expect(page.getByTestId("cleanup-badge")).toHaveText("6");

  const panel = page.getByTestId("merge-panel");
  await expect(panel.getByRole("heading", { name: "Marco Rossi" })).toBeVisible();
  await expect(panel).toContainText("2 contacts share +39 333 812 5517.");
  await expect(panel).toContainText("Likely duplicate");
  await expect(panel.getByRole("radio", { name: "Name · Marco Rossi" })).toBeChecked();
  await expect(panel.getByRole("radio", { name: "Company · Marco R." })).toBeChecked();
  await expect(panel.getByRole("checkbox", { name: "Phones · Marco R." })).toBeChecked();
  await expect(page.getByRole("button", { name: /Giulia Bianchi\s*Same email and name/ })).toBeVisible();
  await screenshot(page, "40-cleanup");
});

test("merging sends the choices, then the merge can be undone", async ({ page }) => {
  backend.cleanupScan = sampleScan();
  await page.goto("/app/cleanup");
  const panel = page.getByTestId("merge-panel");
  await panel.getByRole("checkbox", { name: "Emails · Marco R." }).uncheck();
  await panel.getByRole("radio", { name: "Birthday · Marco R." }).check();
  await panel.getByRole("button", { name: "Merge into one" }).click();

  await expect(page.getByRole("status").filter({ hasText: "Merged into Marco Rossi." })).toBeVisible();
  expect(backend.mergeRequests).toEqual([
    {
      groupId: "g-marco",
      keepId: "people/a1",
      name: "people/a1",
      photo: "people/a1",
      company: "people/a2",
      birthday: null,
      phones: ["people/a1", "people/a2"],
      emails: ["people/a1"],
      addresses: [],
    },
  ]);
  // The next group opens and the badge counts down.
  await expect(panel.getByRole("heading", { name: "Giulia Bianchi" })).toBeVisible();
  await expect(page.getByTestId("cleanup-badge")).toHaveText("5");

  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Merge of Marco Rossi undone.")).toBeVisible();
  expect(backend.cleanupActions[0].undone).toBe(true);
});

test("not duplicates, skip, and a contact that changed since the scan", async ({ page }) => {
  backend.cleanupScan = sampleScan();
  await page.goto("/app/cleanup");
  const panel = page.getByTestId("merge-panel");
  await panel.getByRole("button", { name: "Not duplicates" }).click();
  await expect(panel.getByRole("heading", { name: "Giulia Bianchi" })).toBeVisible();
  expect(backend.cleanupScan!.duplicates.map((g) => g.id)).not.toContain("g-marco");

  await panel.getByRole("button", { name: "Skip" }).click();
  await expect(panel.getByRole("heading", { name: "Luca Romano" })).toBeVisible();
  await expect(panel).toContainText("Possible duplicate");

  backend.mergeError = "changed_since_scan";
  await panel.getByRole("button", { name: "Merge into one" }).click();
  await expect(panel.getByRole("alert")).toHaveText("One of these contacts changed since the scan. Scan again before merging.");
});

test("shared numbers and missing country codes are listed", async ({ page }) => {
  backend.cleanupScan = sampleScan();
  await page.goto("/app/cleanup");
  await page.getByRole("tab", { name: /Shared numbers/ }).click();
  await expect(page.getByText("+39 02 8899 1100", { exact: true })).toBeVisible();
  await expect(page.getByText("Studio Bianchi")).toBeVisible();
  await screenshot(page, "41-cleanup-shared");

  await page.getByRole("tab", { name: /Missing country code/ }).click();
  const row = page.getByRole("row", { name: /Francesco Greco/ });
  await expect(row).toContainText("333 1234567");
  await expect(row).toContainText("+393331234567");
});

test("dashboard and history after a merge", async ({ page }) => {
  backend.cleanupScan = sampleScan();
  backend.cleanupActions = [{ id: "merge-1", kind: "merge", at: "2026-10-03T12:00:00.000Z", title: "Elena Conti", contacts: 2 }];
  await page.goto("/app");
  const card = page.getByTestId("cleanup-card");
  await expect(card.getByRole("listitem").filter({ hasText: "Duplicates" })).toContainText("6");
  await expect(card.getByRole("listitem").filter({ hasText: "Missing country code" })).toContainText("3");

  await page.goto("/app/history");
  const history = page.getByTestId("cleanup-history");
  await expect(history).toContainText("Merged Elena Conti");
  page.once("dialog", (dialog) => dialog.accept());
  await history.getByRole("button", { name: "Undo" }).click();
  await expect(history.getByText("Undone")).toBeVisible();
  expect(backend.cleanupActions[0].undone).toBe(true);
});
