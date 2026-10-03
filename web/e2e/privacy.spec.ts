import { test, expect } from "@playwright/test";

import { FakeBackend, screenshot } from "./backend";

// The privacy policy (issue #32).
test.beforeEach(async ({ page }) => {
  await new FakeBackend(page).install();
});

test("the policy describes this project, with Google's Limited Use statement", async ({ page }) => {
  await page.goto("/privacy");
  const policy = page.getByTestId("privacy");
  await expect(policy.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
  await expect(policy).toContainText("The maintainer runs no service and receives none of your data.");
  await expect(policy).toContainText("including the Limited Use requirements");
  await expect(policy.getByRole("link", { name: "Google API Services User Data Policy" })).toHaveAttribute("href", "https://developers.google.com/terms/api-services-user-data-policy");
  await expect(policy.getByRole("link", { name: "GitHub" })).toHaveAttribute("href", "https://github.com/easly1989/social-contacts-sync/issues");
  await expect(policy).not.toContainText("whasync.com");
  await screenshot(page, "50-privacy");
});

test("the policy follows the app language", async ({ page }) => {
  await page.goto("/privacy");
  await page.getByRole("button", { name: "Preferences" }).click();
  await page.getByRole("button", { name: "Italiano" }).click();
  const policy = page.getByTestId("privacy");
  await expect(policy.getByRole("heading", { name: "Informativa sulla privacy" })).toBeVisible();
  await expect(policy).toHaveAttribute("lang", "it");
  await expect(policy).toContainText("inclusi i requisiti di Limited Use");
});
