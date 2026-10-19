import { test, expect, Page } from "@playwright/test";

import { FakeBackend, screenshot } from "./backend";
import { sampleProfiles } from "./fixtures";

// Sync's To review and Sources (issues #61, #65, #81), with the backend mocked.
let backend: FakeBackend;

test.beforeEach(async ({ page }) => {
  backend = new FakeBackend(page);
  Object.assign(backend.status, { whatsappConnected: true, googleConnected: true, googleConfigured: true, desktop: true, setupDone: true });
  backend.profiles = sampleProfiles();
  await backend.install();
});

test("To review: one card per contact, a photo among the profiles, and confirming in bulk (issues #65, #81)", async ({ page }) => {
  await page.goto("/app");
  const nav = page.getByRole("navigation", { name: "Main navigation" }).first();
  await expect(nav.getByTestId("review-badge")).toHaveText("2");
  await nav.getByRole("link", { name: "Sync 2 contacts to review" }).click();
  await expect(page).toHaveURL(/\/app\/sync\?tab=review$/);
  await expect(page.getByRole("tab", { name: "To review (2)" })).toHaveAttribute("aria-selected", "true");
  const list = page.getByTestId("profile-list");
  const davide = list.getByTestId("profile-card").filter({ hasText: "Davide Gallo" }).first();
  // Each network's only match is ticked; Instagram has two Davides, so it's left to the user.
  await expect(davide.getByRole("checkbox", { name: "Davide Gallo · linkedin.com/in/davidegallo" })).toBeChecked();
  await expect(davide.getByRole("checkbox", { name: "Davide Gallo · @dgallo.bsky.social" })).toBeChecked();
  await expect(davide.getByRole("checkbox", { name: "Davide Gallo · @davide.gallo" })).not.toBeChecked();
  await expect(davide).toContainText("Connection · same name · Gallo Ceramiche");
  // A photo from every profile that has one; LinkedIn's to begin with, since the contact has none.
  const photos = davide.getByRole("radiogroup", { name: "Photo for Davide Gallo" });
  await expect(photos.getByRole("radio")).toHaveCount(4);
  await expect(photos.getByRole("radio", { name: "LinkedIn · linkedin.com/in/davidegallo" })).toBeChecked();
  // Photos come through the app's server.
  await expect(photos.locator("img").first()).toHaveAttribute("src", "/api/profiles/photo?id=instagram%3Adavide.gallo");

  // Instagram's photo instead: that ticks the profile too.
  await photos.getByText("@davide.gallo").click();
  await expect(photos.getByRole("radio", { name: "Instagram · @davide.gallo" })).toBeChecked();
  await expect(davide.getByRole("checkbox", { name: "Davide Gallo · @davide.gallo" })).toBeChecked();
  await expect(davide).toContainText("Photo from Instagram: later syncs update it from there.");
  await screenshot(page, "71-sync-review");
  await davide.getByRole("button", { name: "Confirm: 3 profiles and the photo" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Linked to Davide Gallo." })).toBeVisible();
  expect(backend.profileRequests.find((r) => r.route === "/link")!.body).toEqual({
    contactId: "people/dg",
    name: "Davide Gallo",
    personIds: ["instagram:davide.gallo", "linkedin:davidegallo", "bluesky:dgallo.bsky.social"],
    photoFrom: "instagram:davide.gallo",
    rejectIds: ["instagram:davegalloni"],
  });
  // The confirmation leaves by itself.
  await expect(page.getByRole("status").filter({ hasText: "Linked to Davide Gallo." })).toHaveCount(0, { timeout: 4000 });

  // Elena, in bulk: selected, then confirmed in the background.
  await expect(list.getByTestId("profile-card")).toHaveCount(1);
  await expect(page.getByRole("tab", { name: "To review (1)" })).toBeVisible();
  await list.getByRole("checkbox", { name: "Select all" }).check();
  await expect(list).toContainText("1 of 1 contacts");
  await list.getByRole("button", { name: "Confirm 1 contact" }).click();
  expect(backend.profileRequests.find((r) => r.route === "/link_many")!.body).toEqual({
    items: [{ contactId: "people/ec", name: "Elena Conti", personIds: ["instagram:elena_conti"], rejectIds: [] }],
  });
  await expect(list.getByTestId("bulk-progress")).toContainText("Linking 0 of 1 contacts…");
  backend.profiles!.bulk = { running: false, done: 1, total: 1, contacts: 0, profiles: 0, failed: [{ contactId: "people/ec", name: "Elena Conti", error: "Google had a temporary problem (503) and nothing was changed. Try again later." }] };
  // Errors stay, with their detail to copy.
  const failed = page.getByRole("alert").filter({ hasText: "1 contact couldn't be linked: Elena Conti." });
  await expect(failed).toBeVisible({ timeout: 6000 });
  await expect(failed).toContainText("Elena Conti: Google had a temporary problem (503)");
  await expect(failed.getByRole("button", { name: "Copy error" })).toBeVisible();
  await screenshot(page, "71b-sync-bulk-error", { fullPage: false });
  await page.waitForTimeout(2500);
  await expect(failed).toBeVisible();
  await failed.getByRole("button", { name: "Close" }).click();
  await expect(failed).toHaveCount(0);
});

test("a contact that already has a photo keeps it unless a photo is picked by hand (issue #65)", async ({ page }) => {
  const davide = backend.profiles!.suggestions[0];
  Object.assign(davide, { hasPhoto: true, photoUrl: "/api/e2e-photos/7" });
  backend.profiles!.suggestions = [davide];
  await page.goto("/app/sync?tab=review");
  const card = page.getByTestId("profile-card");
  await expect(card).toContainText("Has a photo of its own: pick another photo to replace it.");
  // LinkedIn and Bluesky are ticked, but the contact's own photo stays picked.
  const current = card.getByRole("radio", { name: "Current" });
  await expect(current).toBeChecked();
  // Ticking or unticking more profiles doesn't pick another either.
  await card.getByRole("checkbox", { name: "Davide Gallo · @davide.gallo" }).check();
  await card.getByRole("checkbox", { name: "Davide Gallo · linkedin.com/in/davidegallo" }).uncheck();
  await expect(current).toBeChecked();

  // In bulk too: links only.
  await page.getByRole("checkbox", { name: "Select all" }).check();
  await page.getByRole("button", { name: "Confirm 1 contact" }).click();
  expect(backend.profileRequests.find((r) => r.route === "/link_many")!.body.items[0]).toEqual({
    contactId: "people/dg",
    name: "Davide Gallo",
    personIds: ["instagram:davide.gallo", "bluesky:dgallo.bsky.social"],
    rejectIds: ["linkedin:davidegallo", "instagram:davegalloni"],
  });
});

test("a kept photo: only the links, no photo offered (issue #67)", async ({ page }) => {
  const davide = backend.profiles!.suggestions[0];
  Object.assign(davide, { hasPhoto: true, photoKept: true, photoUrl: "/api/e2e-photos/7" });
  backend.profiles!.suggestions = [davide];
  await page.goto("/app/sync?tab=review");
  const card = page.getByTestId("profile-card");
  await expect(card).toContainText("This contact's photo is kept: only the links are added.");
  await expect(card.getByRole("radio")).toHaveCount(0);
  await screenshot(page, "71c-sync-kept-photo", { fullPage: false });
  await card.getByRole("button", { name: "Confirm: 2 profiles" }).click();
  expect(backend.profileRequests.find((r) => r.route === "/link")!.body).toEqual({
    contactId: "people/dg",
    name: "Davide Gallo",
    personIds: ["linkedin:davidegallo", "bluesky:dgallo.bsky.social"],
    rejectIds: ["instagram:davide.gallo", "instagram:davegalloni"],
  });
});

test("one at a time: keys pick a photo, confirm, skip and None of these", async ({ page }) => {
  backend.profiles!.suggestions.push({ ...backend.profiles!.suggestions[1], contactId: "people/ec2", name: "Elena Conti Rossi" });
  await page.goto("/app/sync?tab=review");
  await page.getByRole("button", { name: "One at a time" }).click();
  // The view is remembered.
  await page.reload();
  await expect(page.getByRole("button", { name: "One at a time" })).toHaveAttribute("aria-pressed", "true");
  const review = page.getByTestId("profile-review");
  await expect(review.getByRole("heading", { name: "Davide Gallo" })).toBeVisible();
  await expect(review).toContainText("Keys: 1–9 pick a photo, Enter confirms, N is “None of these”, S skips.");
  // 1: Instagram's photo, which ticks that profile; 3: Bluesky's.
  await page.keyboard.press("1");
  await expect(review.getByRole("radio", { name: "Instagram · @davide.gallo" })).toBeChecked();
  await expect(review.getByRole("checkbox", { name: "Davide Gallo · @davide.gallo" })).toBeChecked();
  // A click leaves the focus on the card's photos: keys still work.
  await review.getByText("@dgallo.bsky.social").first().click();
  await page.keyboard.press("2");
  await expect(review.getByRole("radio", { name: "LinkedIn · linkedin.com/in/davidegallo" })).toBeChecked();
  await page.keyboard.press("3");
  await expect(review.getByRole("radio", { name: "Bluesky · @dgallo.bsky.social" })).toBeChecked();
  await screenshot(page, "72b-sync-one-at-a-time");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Linked to Davide Gallo." })).toBeVisible();
  expect(backend.profileRequests.find((r) => r.route === "/link")!.body).toMatchObject({
    personIds: ["instagram:davide.gallo", "linkedin:davidegallo", "bluesky:dgallo.bsky.social"],
    photoFrom: "bluesky:dgallo.bsky.social",
  });

  await expect(review.getByRole("heading", { name: "Elena Conti", exact: true })).toBeVisible();
  await page.keyboard.press("s");
  expect(backend.profileRequests.find((r) => r.route === "/skip")!.body).toEqual({ contactId: "people/ec" });
  await expect(review.getByRole("heading", { name: "Elena Conti Rossi" })).toBeVisible();
  await page.keyboard.press("n");
  expect(backend.profileRequests.find((r) => r.route === "/reject")!.body).toEqual({ contactId: "people/ec2", personIds: ["instagram:elena_conti"] });
  await expect(page.getByText("No suggestions left.")).toBeVisible();
});

test("a profile already on the contact: its photo is offered and applied without linking again (issue #81)", async ({ page }) => {
  const elena = backend.profiles!.suggestions[1];
  elena.linked = [{ id: "bluesky:elena.bsky.social", network: "bluesky", url: "https://bsky.app/profile/elena.bsky.social", handle: "elena.bsky.social", name: "Elena Conti", photoUrl: "/api/e2e-photos/5", source: "search" }];
  backend.profiles!.suggestions = [elena];
  await page.goto("/app/sync?tab=review");
  const card = page.getByTestId("profile-card");
  // A placeholder, so the linked profile's photo is picked to begin with.
  await expect(card.getByRole("radio", { name: "Bluesky · @elena.bsky.social" })).toBeChecked();
  await expect(card).toContainText("Already linked");
  // The Instagram suggestion isn't her: only the photo is left.
  await card.getByRole("checkbox", { name: /@elena_conti/ }).uncheck();
  await screenshot(page, "71d-sync-linked-photo", { fullPage: false });
  await card.getByRole("button", { name: "Confirm: the photo" }).click();
  expect(backend.profileRequests.find((r) => r.route === "/link")!.body).toEqual({
    contactId: "people/ec",
    name: "Elena Conti",
    personIds: [],
    photoFrom: "bluesky:elena.bsky.social",
    rejectIds: ["instagram:elena_conti"],
  });
});

test("To review on a phone: the card fits", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/sync?tab=review");
  const card = page.getByTestId("profile-card").first();
  await expect(card.getByRole("radiogroup")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await card.scrollIntoViewIfNeeded();
  await screenshot(page, "71e-sync-review-phone", { fullPage: false });
});

test("Sync on its own opens Run; Find profiles' address opens To review (issue #81)", async ({ page }) => {
  await page.goto("/app/sync");
  await expect(page.getByRole("heading", { name: "Sync", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Run" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Start sync" })).toBeVisible();
  // Run doesn't need the suggestions, which read the whole address book.
  expect(backend.requested("/api/profiles")).toBeUndefined();

  await page.goto("/app/profiles");
  await expect(page).toHaveURL(/\/app\/sync\?tab=review$/);
  await expect(page.getByRole("tab", { name: "To review (2)" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Run" }).click();
  await expect(page).toHaveURL(/\/app\/sync\?tab=run$/);
});

test("sources: import an export, run the public search, log in and scan with the risk accepted", async ({ page }) => {
  backend.profiles!.search = { running: false, networks: [], checked: 0, total: 0, found: {} };
  await page.goto("/app/profiles?tab=sources");
  await expect(page).toHaveURL(/\/app\/sync\?tab=sources$/);
  await expect(page.getByRole("heading", { name: "Find new profiles" })).toBeVisible();
  const sources = page.getByTestId("profile-sources");
  await sources.getByTestId("import-linkedin").setInputFiles({ name: "Connections.csv", mimeType: "text/csv", buffer: Buffer.from("First Name,Last Name,URL\nDavide,Gallo,https://www.linkedin.com/in/davidegallo") });
  await expect(page.getByRole("status").filter({ hasText: "Read 312." })).toBeVisible();
  await expect(sources.getByTestId("source-linkedin")).toContainText(/312 people · imported/);
  const imported = backend.profileRequests.find((r) => r.route === "/import")!;
  expect(imported.query).toBe("?network=linkedin&file=Connections.csv");
  expect(imported.body).toContain("Davide,Gallo");

  await sources.getByRole("checkbox", { name: "GitHub" }).check();
  await sources.getByRole("button", { name: "Search" }).click();
  expect(backend.profileRequests.find((r) => r.route === "/search")!.body).toEqual({ networks: ["bluesky", "mastodon", "github"] });
  await expect(sources.getByTestId("search-progress")).toContainText("Searching… 0 of 781 contacts");
  backend.profiles!.search = { running: true, networks: ["bluesky", "mastodon"], checked: 312, total: 781, found: { bluesky: 9, mastodon: 3 } };
  await expect(sources.getByTestId("search-progress")).toContainText("Searching… 312 of 781 contacts", { timeout: 6000 });
  await screenshot(page, "70-profiles-sources");

  // The login scan: log in, then scan only once the risk is accepted.
  const scan = page.getByTestId("profile-scan");
  await scan.getByRole("button", { name: "Log in" }).first().click();
  expect(backend.profileRequests.find((r) => r.route === "/scan/login")!.body).toEqual({ network: "facebook" });
  await scan.getByRole("button", { name: "Scan followers" }).click();
  const risk = page.getByTestId("scan-risk");
  await expect(risk).toContainText("Instagram doesn't allow automated access");
  await expect(risk.getByRole("button", { name: "Scan followers" })).toBeDisabled();
  await risk.getByRole("checkbox").check();
  await screenshot(page, "72-profiles-risk", { fullPage: false });
  await risk.getByRole("button", { name: "Scan followers" }).click();
  expect(backend.profileRequests.find((r) => r.route === "/scan/start")!.body).toEqual({ network: "instagram", acceptRisk: true });
  await expect(scan).toContainText("Reading… 0 people");
});

test("sources: when each was last read, and why a scan stopped, to copy (issue #65)", async ({ page }) => {
  backend.profiles!.sources.find((s) => s.network === "bluesky")!.searched = "2026-10-14T16:02:00Z";
  backend.profiles!.search = { running: false, networks: [], checked: 0, total: 0, found: {} };
  backend.profiles!.scans = [
    { network: "instagram", loggedIn: true, read: 486, finishedAt: "2026-10-15T07:40:00Z" },
    { network: "facebook", loggedIn: true, read: 0, finishedAt: "2026-10-15T07:52:00Z", stopped: "error:ERR_ABORTED (-3) loading 'https://www.facebook.com/me/friends'" },
    { network: "linkedin", loggedIn: true, read: 512, finishedAt: "2026-10-15T08:05:00Z", stopped: "limited" },
  ];
  await page.goto("/app/profiles?tab=sources");
  const sources = page.getByTestId("profile-sources");
  await expect(sources.getByTestId("source-instagram")).toContainText(/1,204 people · imported .*2026/);
  await expect(sources.getByTestId("source-linkedin")).toContainText("Not imported yet");
  await expect(sources).toContainText(/9 found · searched .*2026/);
  await expect(sources).toContainText("Not searched yet");
  const facebook = sources.getByTestId("scan-facebook");
  await expect(facebook).toContainText(/Logged in · 0 people read · scanned .*2026/);
  await expect(facebook).toContainText("Stopped: the site's page wasn't what the app expected.");
  await expect(facebook).toContainText("ERR_ABORTED (-3) loading 'https://www.facebook.com/me/friends'");
  await expect(facebook.getByRole("button", { name: "Copy" })).toBeVisible();
  await expect(sources.getByTestId("scan-linkedin")).toContainText("the site started limiting requests");
  await expect(sources.getByTestId("scan-linkedin").getByRole("button", { name: "Copy" })).toHaveCount(0);
  await screenshot(page, "70b-profiles-sources-dates");
});

test("web version: no login scan", async ({ page }) => {
  backend.status.desktop = false;
  backend.profiles!.scans = undefined;
  await page.goto("/app/profiles?tab=sources");
  await expect(page.getByTestId("profile-scan")).toContainText("Available in the desktop app.");
});

/** To review opens on the contacts without a photo (issue #104): these tests look at the others too. */
const showAll = (page: Page) => page.getByTestId("review-filters").getByRole("button", { name: /^All/ }).click();

test("To review: a linked profile the sync just read is offered once, and every photo grows on hover", async ({ page }) => {
  const readAt = "2026-10-15T09:00:00.000Z";
  const linked = (network: "facebook" | "instagram" | "linkedin", url: string, i: number) =>
    ({ id: `${network}:${i}`, network, url, handle: url.split("/").pop()!, name: "Alessandro Ciaschini", photoUrl: `/api/e2e-photos/${i}`, source: "scan" }) as const;
  backend.profiles!.suggestions.push({
    contactId: "people/ac",
    name: "Alessandro Ciaschini",
    hasPhoto: true,
    photoUrl: "/api/e2e-photos/5",
    candidates: [],
    linked: [linked("facebook", "https://facebook.com/theciascone", 1), linked("instagram", "https://www.instagram.com/alessandrociaschini/", 2), linked("linkedin", "https://linkedin.com/in/alessandro-ciaschini", 3)],
    queue: {
      kind: "photo",
      photos: [
        { id: "photo:wa", source: "whatsapp", matchedBy: "+39 333 913 9471", readAt },
        { id: "photo:fb", source: "links", network: "Facebook", matchedBy: "facebook.com/theciascone", readAt },
        { id: "photo:ig", source: "links", network: "Instagram", matchedBy: "instagram.com/alessandrociaschini", readAt },
      ],
      addedAt: readAt,
    },
  });
  await page.goto("/app/sync?tab=review");
  await showAll(page);
  const card = page.getByTestId("profile-card").filter({ hasText: "Alessandro Ciaschini" });
  // The current photo, the sync's three, and LinkedIn, which the sync didn't read: no second Facebook or Instagram.
  await expect(card.getByRole("radio")).toHaveCount(5);
  await expect(card.getByRole("radio", { name: "Facebook · facebook.com/theciascone" })).toHaveCount(1);
  await expect(card.getByRole("radio", { name: /^Instagram/ })).toHaveCount(1);
  await expect(card.getByRole("radio", { name: "LinkedIn · linkedin.com/in/alessandro-ciaschini" })).toHaveCount(1);
  await card.evaluate((e) => e.scrollIntoView({ block: "end" }));
  await screenshot(page, "71a-sync-review-once", { fullPage: false });

  await card.locator("img[src='/api/profiles/queue-photo?id=photo%3Afb']").hover();
  await expect(page.getByTestId("photo-zoom")).toBeVisible();
  await expect(page.getByTestId("photo-zoom")).toContainText("Facebook");
  await screenshot(page, "71b-sync-review-zoom", { fullPage: false });
  await card.locator("label", { has: page.getByRole("radio", { name: /^LinkedIn/ }) }).locator("img").hover();
  await expect(page.getByTestId("photo-zoom")).toContainText("Alessandro Ciaschini");
});

test("To review: a sync's different photo, and a pinned photo changed outside the app (issue #82)", async ({ page }) => {
  const readAt = "2026-10-15T09:00:00.000Z";
  backend.profiles!.suggestions.push(
    {
      contactId: "people/mr",
      name: "Marco Rossi",
      hasPhoto: true,
      photoUrl: "/api/e2e-photos/5",
      candidates: [],
      queue: { kind: "photo", photos: [{ id: "photo:aaa", source: "whatsapp", matchedBy: "+39 333 123 4567", readAt }], addedAt: readAt },
    },
    {
      contactId: "people/sf",
      name: "Sofia Ferrari",
      hasPhoto: true,
      photoUrl: "/api/e2e-photos/6",
      candidates: [],
      queue: {
        kind: "changed",
        photos: [{ id: "photo:bbb", source: "links", matchedBy: "instagram.com/sofia.ferrari", network: "Instagram", readAt }],
        pinned: { source: "links", network: "Instagram", matchedBy: "instagram.com/sofia.ferrari" },
        addedAt: readAt,
      },
    },
    {
      contactId: "people/lb",
      name: "Laura Bruno",
      hasPhoto: true,
      photoUrl: "/api/e2e-photos/7",
      candidates: [],
      queue: { kind: "photo", photos: [{ id: "photo:ccc", source: "gravatar", matchedBy: "laura@example.com", readAt }], addedAt: readAt },
    }
  );
  await page.goto("/app/sync?tab=review");
  await showAll(page);
  const card = (name: string) => page.getByTestId("profile-card").filter({ hasText: name });

  // A different photo: offered, with where it came from; Use sends it.
  const marco = card("Marco Rossi");
  await expect(marco).toContainText("Different photo");
  await expect(marco.getByRole("radio", { name: "WhatsApp · +39 333 123 4567" })).toBeChecked();
  await expect(marco.locator("img[src^='/api/profiles/queue-photo']")).toHaveAttribute("src", "/api/profiles/queue-photo?id=photo%3Aaaa");
  // A changed photo: what Google has now, against the source's.
  const sofia = card("Sofia Ferrari");
  await expect(sofia).toContainText("Changed outside the app");
  await expect(sofia.getByTestId("changed-photo")).toContainText("In Google now");
  await expect(sofia.getByTestId("changed-photo")).toContainText("no longer follows Instagram");
  await sofia.evaluate((e) => e.scrollIntoView({ block: "center" }));
  await screenshot(page, "72-sync-review-queue", { fullPage: false });

  await marco.getByRole("button", { name: "Use WhatsApp" }).click();
  await expect.poll(() => backend.profileRequests.find((r) => r.route === "/link")?.body).toMatchObject({ contactId: "people/mr", photoFrom: "photo:aaa", personIds: [] });
  await sofia.getByRole("button", { name: "Back to Instagram" }).click();
  await expect.poll(() => backend.profileRequests.filter((r) => r.route === "/link").at(-1)?.body).toMatchObject({ contactId: "people/sf", photoFrom: "photo:bbb" });
  // Keep current: the photos found aren't offered again (the server remembers them).
  await card("Laura Bruno").getByRole("button", { name: "Keep current photo" }).click();
  await expect.poll(() => backend.profileRequests.find((r) => r.route === "/keep")?.body).toEqual({ contactId: "people/lb" });
});

test("To review, one at a time: Enter keeps a photo changed outside the app (issue #82)", async ({ page }) => {
  backend.profiles!.suggestions = [
    {
      contactId: "people/sf",
      name: "Sofia Ferrari",
      hasPhoto: true,
      photoUrl: "/api/e2e-photos/6",
      candidates: [],
      queue: { kind: "changed", photos: [], pinned: { source: "whatsapp" }, addedAt: "2026-10-15T09:00:00.000Z" },
    },
  ];
  await page.goto("/app/sync?tab=review");
  await page.getByRole("button", { name: "One at a time" }).click();
  const review = page.getByTestId("profile-review");
  await expect(review).toContainText("no longer follows WhatsApp");
  // Without the source's photo, there is nothing to go back to.
  await expect(review.getByRole("button", { name: /Back to/ })).toHaveCount(0);
  await review.getByRole("heading", { name: "Sofia Ferrari" }).click();
  await page.keyboard.press("Enter");
  await expect.poll(() => backend.profileRequests.find((r) => r.route === "/keep")?.body).toEqual({ contactId: "people/sf" });
});

test("To review: filters with counts, search by name, contacts without a photo, and where the current photo comes from (issue #104)", async ({ page }) => {
  const readAt = "2026-10-15T09:00:00.000Z";
  backend.profiles!.suggestions.push(
    { contactId: "people/gc", name: "Giulia Colombo", hasPhoto: false, detail: "+39 347 000 1122 · giulia@example.com", candidates: [] },
    {
      contactId: "people/fr",
      name: "Francesca Ricci",
      hasPhoto: true,
      photoUrl: "/api/e2e-photos/6",
      candidates: [],
      currentFrom: { source: "whatsapp" },
      queue: { kind: "photo", photos: [{ id: "photo:ig", source: "links", network: "Instagram", matchedBy: "instagram.com/francesca.ricci", readAt, width: 640, height: 640 }], addedAt: readAt },
    },
    {
      contactId: "people/pm",
      name: "Paolo Moretti",
      hasPhoto: false,
      candidates: [],
      queue: { kind: "photo", photos: [{ id: "photo:li", source: "links", network: "LinkedIn", matchedBy: "linkedin.com/in/paolomoretti", readAt, width: 150, height: 150, small: true }], addedAt: readAt },
    }
  );
  await page.goto("/app/sync?tab=review");
  const filters = page.getByTestId("review-filters");
  const chip = (name: RegExp) => filters.getByRole("button", { name });
  // Contacts without a photo first; each kind with how many.
  await expect(chip(/^No photo/)).toHaveAttribute("aria-pressed", "true");
  await expect(chip(/^No photo/)).toContainText("4");
  await expect(chip(/^Different photo/)).toContainText("1");
  await expect(chip(/^Profiles to link/)).toContainText("2");
  await expect(chip(/^All/)).toContainText("5");
  await expect(chip(/^Changed outside/)).toHaveCount(0);
  const cards = page.getByTestId("profile-card");
  await expect(cards).toHaveCount(4);
  // A small photo is better than none, and says so.
  await expect(cards.filter({ hasText: "Paolo Moretti" })).toContainText("small");
  await screenshot(page, "73-review-filters", { fullPage: false });

  // Search by name, accents or not.
  await filters.getByRole("searchbox", { name: "Search by name" }).fill("giulià");
  await expect(cards).toHaveCount(1);
  const giulia = cards.filter({ hasText: "Giulia Colombo" });
  await expect(giulia).toContainText("+39 347 000 1122 · giulia@example.com");
  await expect(giulia.getByTestId("find-profile")).toContainText("Find a profile");
  await expect(giulia.getByRole("button", { name: /^Confirm/ })).toHaveCount(0);
  await screenshot(page, "73b-review-no-photo", { fullPage: false });
  await giulia.getByRole("button", { name: "No photo" }).click();
  await expect.poll(() => backend.profileRequests.find((r) => r.route === "/no-photo")?.body).toEqual({ contactId: "people/gc" });
  await filters.getByRole("searchbox", { name: "Search by name" }).fill("nobody");
  await expect(page.getByText("No contact here matches “nobody”.")).toBeVisible();
  await filters.getByRole("searchbox", { name: "Search by name" }).fill("");

  // The current photo comes from WhatsApp: keeping it is the default, and Select all takes only what is shown.
  await chip(/^Different photo/).click();
  const francesca = cards.filter({ hasText: "Francesca Ricci" });
  await expect(cards).toHaveCount(1);
  await expect(francesca).toContainText("Current · from WhatsApp");
  await expect(francesca).toContainText("The current photo comes from WhatsApp: keeping it changes nothing.");
  await expect(francesca.getByRole("radio").first()).toBeChecked();
  await page.getByTestId("profile-list").getByRole("checkbox", { name: "Select all" }).check();
  await expect(page.getByTestId("profile-list")).toContainText("1 of 1");
  await francesca.evaluate((e) => e.scrollIntoView({ block: "center" }));
  await screenshot(page, "73c-review-current-from", { fullPage: false });

  await page.setViewportSize({ width: 390, height: 844 });
  await chip(/^No photo/).click();
  await screenshot(page, "73d-review-filters-phone", { fullPage: false });
});
