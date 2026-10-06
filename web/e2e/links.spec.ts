import { test, expect } from "@playwright/test";

import { EventType } from "../../interfaces/api";
import { avatars } from "./avatars";
import { FakeBackend, screenshot } from "./backend";
import { sampleRun } from "./fixtures";

// Profile links (issue #51), with the backend mocked.
let backend: FakeBackend;

test.beforeEach(async ({ page }) => {
  backend = new FakeBackend(page);
  Object.assign(backend.status, { whatsappConnected: true, googleConnected: true, telegramConnected: true });
  backend.runs = [sampleRun()];
  await backend.install();
});

test("settings: profile links are ready, and the unofficial networks are opt-in", async ({ page }) => {
  await page.goto("/app/settings/sources");
  const links = page.getByTestId("settings-source-links");
  await expect(links).toContainText("Profile links");
  await expect(links).toContainText("Ready");
  await expect(links.getByRole("list", { name: "Networks read" }).getByRole("listitem")).toHaveText(["X", "Telegram", "YouTube", "Bluesky", "Mastodon", "GitHub"]);
  const optIn = links.getByRole("checkbox", { name: /Also try Instagram, Facebook and LinkedIn/ });
  await expect(optIn).not.toBeChecked();
  await links.scrollIntoViewIfNeeded();
  await screenshot(page, "27-settings-links");

  await optIn.check();
  await page.reload();
  await expect(page.getByTestId("settings-source-links").getByRole("checkbox", { name: /Also try/ })).toBeChecked();
  await page.emulateMedia({ colorScheme: "dark" });
  await screenshot(page, "28-settings-links-dark");

  // The sync sends the choice.
  await page.goto("/app/sync");
  await expect(page.getByTestId("source-links")).toContainText("Uses the profile links saved on your Google contacts");
  await page.getByRole("button", { name: "Start sync" }).click();
  await expect.poll(() => backend.requested("/api/init_sync")).toBeTruthy();
  const query = new URL(backend.requested("/api/init_sync")!.url()).searchParams;
  expect(query.get("sources")).toContain("links");
  expect(query.get("links_best_effort")).toBe("true");
});

test("report: add a profile link to a contact without a photo", async ({ page }) => {
  const run = backend.runs[0];
  backend.linkFailures["https://example.com/francesco"] = { status: 400, json: { error: "unsupported_link" } };
  backend.linkFailures["https://www.linkedin.com/in/francesco"] = { status: 409, json: { error: "signin_required", network: "LinkedIn" } };
  await page.goto(`/app/history/${run.id}`);
  await page.getByRole("tab", { name: "No photo found (2)" }).click();
  await expect(page.getByText("Know where one of them is online?")).toBeVisible();

  const row = page.getByRole("row", { name: /Francesco Greco/ });
  await row.getByRole("button", { name: "Add profile link" }).click();
  const field = page.getByLabel("Profile link for Francesco Greco");
  await expect(field).toBeFocused();

  await field.fill("https://example.com/francesco");
  await page.getByRole("button", { name: "Find photo" }).click();
  await expect(page.getByRole("alert")).toContainText("That isn't a profile link the app can read.");
  await field.fill("https://www.linkedin.com/in/francesco");
  await page.getByRole("button", { name: "Find photo" }).click();
  await expect(page.getByRole("alert")).toHaveText("LinkedIn asked to sign in or is limiting requests. Try again later.");

  await field.fill("https://www.instagram.com/elena.conti.ph/");
  await page.getByRole("button", { name: "Find photo" }).click();
  await expect(page.getByText("Found on Instagram")).toBeVisible();
  await screenshot(page, "26-report-add-link");

  await page.getByRole("button", { name: "Save link and photo" }).click();
  await expect(page.getByRole("tab", { name: "No photo found (1)" })).toBeVisible();
  expect(backend.linkRequests.at(-1)).toEqual({ route: "save", body: { index: 7, token: "token-3" } });
  await expect(page.getByRole("row", { name: /Francesco Greco/ })).toHaveCount(0);
  await page.getByRole("tab", { name: "Changed (8)" }).click();
  const saved = page.getByRole("row", { name: /Francesco Greco/ });
  await expect(saved).toContainText("instagram.com/elena.conti.ph");
  await expect(saved).toContainText("Profile links");
  await expect(saved.getByRole("button", { name: "Undo" })).toBeVisible();
});

test("review: a photo looked up from a profile link becomes a candidate", async ({ page }) => {
  await page.goto("/app/sync/run?mode=review&sources=whatsapp,links");
  await expect.poll(() => backend.requested("/api/init_sync")).toBeTruthy();
  await backend.send(EventType.SyncConfirm, {
    existingPhoto: avatars[0],
    newPhoto: avatars[5],
    contactName: "Francesco Greco",
    candidates: [{ photo: avatars[5], source: "whatsapp", matchedBy: "+39 335 210 4471" }],
  });
  const review = page.getByTestId("review");
  await expect(review.getByRole("radio")).toHaveCount(1);

  // Typing the link isn't taken for shortcuts ("1", "s"…).
  const field = review.getByLabel("Profile link");
  await field.fill("");
  await field.pressSequentially("instagram.com/fra.greco1");
  await expect(review.getByRole("radio")).toHaveCount(1);
  await review.getByRole("button", { name: "Find photo" }).click();
  await expect(review.getByRole("radio")).toHaveCount(2);
  await expect(review.getByRole("radio").nth(1)).toHaveAttribute("aria-checked", "true");
  await expect(review).toContainText("instagram.com/elena.conti.ph");
  await screenshot(page, "07b-review-link");

  await review.getByRole("button", { name: /Use new photo/ }).click();
  await expect
    .poll(() => backend.received.find((e) => e.type === EventType.SyncPhotoConfirm))
    .toEqual({ type: EventType.SyncPhotoConfirm, data: { accept: true, link: "token-1" } });
});
