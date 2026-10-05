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
  await expect(page.getByRole("tab", { name: /Missing country code\s*4/ })).toBeVisible();
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

  // Google refused the change: its own words are shown too.
  backend.mergeError = undefined;
  backend.cleanupFailure = { status: 502, json: { error: "google_unavailable", detail: "Request must set person.metadata.sources." } };
  await panel.getByRole("button", { name: "Merge into one" }).click();
  await expect(panel.getByRole("alert")).toHaveText(
    "The merge didn't complete. What changed can be undone from History. (Google: Request must set person.metadata.sources.)"
  );
});

test("shared numbers: keep on one, merge, mark as shared and unmark", async ({ page }) => {
  backend.cleanupScan = sampleScan();
  await page.goto("/app/cleanup");
  await page.getByRole("tab", { name: /Shared numbers/ }).click();
  const mamma = page.getByTestId("shared-+393402216527");
  await expect(mamma).toContainText("+39 340 221 6527");
  await expect(page.getByTestId("shared-+390288991100")).toContainText("Looks like a shared landline");
  await mamma.getByRole("radio", { name: "Maria Esposito" }).click();
  await screenshot(page, "41-cleanup-shared");

  await mamma.getByRole("button", { name: "Keep on selected" }).click();
  await expect(page.getByRole("status").filter({ hasText: "The number is now only on Maria Esposito." })).toBeVisible();
  await expect(mamma).toHaveCount(0);

  await page.getByTestId("shared-+390288991100").getByRole("button", { name: "Mark as shared" }).click();
  await expect(page.getByTestId("marked-shared")).toContainText("+390288991100");

  await page.getByTestId("shared-+393283097537").getByRole("button", { name: "Merge" }).click();
  await expect(page.getByRole("tab", { name: /Duplicates\s*7/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("merge-panel")).toContainText("Luca");

  await page.getByRole("tab", { name: /Shared numbers/ }).click();
  await page.getByTestId("marked-shared").getByRole("button", { name: "Unmark" }).click();
  await expect(page.getByTestId("marked-shared")).toHaveCount(0);

  expect(backend.cleanupRequests).toEqual([
    { route: "keep_number", body: { e164: "+393402216527", contactId: "people/m2" } },
    { route: "mark_shared", body: { e164: "+390288991100", shared: true } },
    { route: "group", body: { e164: "+393283097537" } },
    { route: "mark_shared", body: { e164: "+390288991100", shared: false } },
  ]);
});

test("missing country codes: fix the selected numbers", async ({ page }) => {
  backend.cleanupScan = sampleScan();
  await page.goto("/app/cleanup");
  await page.getByRole("tab", { name: /Missing country code/ }).click();
  await expect(page.getByText("Country used: Italy")).toBeVisible();
  const row = page.getByRole("row", { name: /Francesco Greco/ });
  await expect(row).toContainText("+39 333 123 4567");
  await expect(page.getByRole("row", { name: /Not a valid number/ }).getByRole("checkbox")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Add country code to 3 numbers" })).toBeEnabled();
  await row.getByRole("checkbox").uncheck();
  await screenshot(page, "42-cleanup-country-codes");

  await page.getByRole("button", { name: "Add country code to 2 numbers" }).click();
  await expect(page.getByText("Added the country code to 2 numbers.")).toBeVisible();
  expect(backend.cleanupRequests).toEqual([
    { route: "fix_country_codes", body: { items: [{ contactId: "people/d2", value: "347 100 2000" }, { contactId: "people/n2", value: "02 1234 5678" }] } },
  ]);
  await expect(page.getByRole("row", { name: /Elena Conti/ })).toHaveCount(0);
  // Francesco stays unselected until chosen again.
  await expect(page.getByRole("button", { name: "Nothing selected" })).toBeDisabled();
  await page.getByRole("checkbox", { name: "Select all" }).check();
  await expect(page.getByRole("button", { name: "Add country code to 1 number" })).toBeEnabled();

  backend.cleanupFailure = { status: 502, json: { error: "google_unavailable", detail: "Invalid phone number." } };
  await page.getByRole("button", { name: "Add country code to 1 number" }).click();
  await expect(page.getByRole("alert")).toHaveText("That didn't work. Please try again. (Google: Invalid phone number.)");
});

test("dashboard and history after a merge", async ({ page }) => {
  backend.cleanupScan = sampleScan();
  backend.cleanupActions = [
    { id: "numbers-2", kind: "countryCodes", at: "2026-10-03T12:10:00.000Z", title: "3", contacts: 3 },
    { id: "number-1", kind: "keepNumber", at: "2026-10-03T12:05:00.000Z", title: "Maria Esposito", number: "+393402216527", contacts: 1 },
    { id: "merge-1", kind: "merge", at: "2026-10-03T12:00:00.000Z", title: "Elena Conti", contacts: 2 },
  ];
  await page.goto("/app");
  const card = page.getByTestId("cleanup-card");
  await expect(card.getByRole("listitem").filter({ hasText: "Duplicates" })).toContainText("6");
  await expect(card.getByRole("listitem").filter({ hasText: "Missing country code" })).toContainText("4");

  await page.goto("/app/history");
  const history = page.getByTestId("cleanup-history");
  await expect(history).toContainText("Added country codes to 3 numbers");
  await expect(history).toContainText("Kept +393402216527 on Maria Esposito");
  await expect(history).toContainText("Merged Elena Conti");
  page.once("dialog", (dialog) => dialog.accept());
  await history.getByRole("row", { name: /Merged Elena Conti/ }).getByRole("button", { name: "Undo" }).click();
  await expect(history.getByRole("row", { name: /Merged Elena Conti/ }).getByText("Undone")).toBeVisible();
  expect(backend.cleanupActions[2].undone).toBe(true);
});
