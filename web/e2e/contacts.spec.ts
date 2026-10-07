import { test, expect, Page } from "@playwright/test";

import { avatars } from "./avatars";
import { FakeBackend, screenshot } from "./backend";
import { sampleContacts, sampleLabels } from "./fixtures";

// The Contacts page (issue #55), with the backend mocked.
let backend: FakeBackend;

test.beforeEach(async ({ page }) => {
  backend = new FakeBackend(page);
  Object.assign(backend.status, { whatsappConnected: true, googleConnected: true });
  backend.contacts = sampleContacts();
  backend.labels = structuredClone(sampleLabels);
  await backend.install();
});

const image = (name: string, i = 0) => ({ name, mimeType: "image/jpeg", buffer: Buffer.from(avatars[i], "base64") });
const row = (page: Page, name: string | RegExp) => page.getByRole("row", { name });
const sent = (route: string, method = "POST") => backend.contactRequests.filter((r) => r.route === route && r.method === method);

test("the list: contacts without a photo first, search, labels, and the sidebar entry", async ({ page }) => {
  await page.goto("/app");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Contacts" }).click();
  await expect(page.getByRole("heading", { name: "Contacts" })).toBeVisible();
  await expect(page.getByTestId("tile-all")).toContainText("9");
  await expect(page.getByTestId("tile-noPhoto")).toContainText("5");
  await expect(page.getByTestId("tile-placeholder")).toContainText("1");
  await expect(page.getByTestId("tile-noPhoto")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("row")).toHaveCount(6);
  await expect(row(page, /Lorenzo Giordano/)).toContainText("Work");
  await expect(row(page, /Lorenzo Giordano/)).toContainText("ICE");

  await row(page, /Francesco Greco/).getByRole("checkbox").check();
  await row(page, /Francesco G\./).getByRole("checkbox").check();
  await expect(page.getByTestId("selection-bar")).toContainText("2 selected");
  await screenshot(page, "60-contacts");

  await page.getByRole("button", { name: "Clear selection" }).click();
  await page.getByTestId("tile-all").click();
  await expect(page.getByRole("row")).toHaveCount(10);
  await page.getByLabel("Search name, number, email or link").fill("fra");
  await expect(page.getByRole("row")).toHaveCount(3);
  await page.getByLabel("Search name, number, email or link").fill("335 2104");
  await expect(page.getByRole("row")).toHaveCount(3);
  await page.getByLabel("Search name, number, email or link").fill("");
  await page.getByLabel("Label", { exact: true }).selectOption({ label: "Work" });
  await expect(page.getByRole("row")).toHaveCount(3);
  await page.getByLabel("Label", { exact: true }).selectOption({ label: "All labels" });
  await page.getByTestId("tile-placeholder").click();
  await expect(page.getByRole("row")).toHaveCount(2);
  await expect(row(page, /Elena Conti/)).toContainText("Placeholder");

  await page.getByTestId("tile-noPhoto").click();
  await page.emulateMedia({ colorScheme: "dark" });
  await screenshot(page, "61-contacts-dark");
});

test("edit every field, and a contact changed in Google meanwhile", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1460 });
  await page.goto("/app/contacts");
  await page.getByTestId("tile-all").click();
  await row(page, /Marco Rossi/).getByRole("button", { name: /Marco Rossi/ }).click();
  const editor = page.getByTestId("contact-editor");
  await expect(editor.getByRole("heading", { name: "Edit contact" })).toBeVisible();
  await expect(editor.getByLabel("First name")).toHaveValue("Marco");
  await expect(editor.getByLabel("Company")).toHaveValue("Studio Rossi");
  await expect(editor.getByLabel("Phone number")).toHaveCount(2);
  await expect(editor.getByLabel("Street")).toHaveValue("Via Roma 12");
  await expect(editor.getByLabel("Month")).toHaveValue("3");
  await expect(editor.getByLabel("Notes")).toHaveValue("Met at the volley tournament in 2024.");
  await expect(editor).toContainText("Work");

  await editor.getByLabel("Job title").fill("Partner");
  await editor.getByRole("button", { name: "Add number" }).click();
  await editor.getByLabel("Phone number").last().fill("+39 333 000 1111");
  await editor.getByText("Add label").click();
  await editor.getByRole("button", { name: "Volley" }).click();
  await editor.getByLabel("Year (optional)").fill("1985");
  await screenshot(page, "62-contact-edit", { fullPage: false });

  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor).toBeHidden();
  const [save] = sent("/mr", "PUT");
  expect(save.body.updatedAt).toBe("2026-09-01T10:00:00Z");
  expect(save.body.contact).toMatchObject({
    givenName: "Marco",
    jobTitle: "Partner",
    birthday: { year: 1985, month: 3, day: 12 },
    labels: ["contactGroups/work", "contactGroups/volley"],
    phones: [{ value: "+39 333 812 5517", type: "mobile" }, { value: "+39 02 4455 6677", type: "work" }, { value: "+39 333 000 1111", type: "mobile" }],
  });
  await expect(row(page, /Marco Rossi/)).toContainText("Volley");

  // Edited elsewhere since the list was read: nothing is overwritten.
  await row(page, /Marco Rossi/).getByRole("button", { name: /Marco Rossi/ }).click();
  backend.contacts.find((c) => c.id === "people/mr")!.updatedAt = "2026-10-06T09:00:00Z";
  await editor.getByLabel("Notes").fill("Changed here");
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor.getByRole("alert")).toContainText("This contact was changed in Google since you opened it.");
  await editor.getByRole("button", { name: "Load the current version" }).click();
  await expect(editor.getByLabel("Notes")).toHaveValue("Met at the volley tournament in 2024.");
});

test("new contact with a photo, a photo from a row, and a profile link's photo", async ({ page }) => {
  await page.goto("/app/contacts");
  await page.getByRole("button", { name: "New contact" }).click();
  const editor = page.getByTestId("contact-editor");
  await expect(editor.getByRole("heading", { name: "New contact" })).toBeVisible();
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor.getByRole("alert")).toHaveText("Give the contact a name, a company, a number or an email.");
  await editor.getByLabel("First name").fill("Sara");
  await editor.getByLabel("Last name").fill("Bruno");
  await editor.getByRole("button", { name: "Add number" }).click();
  await editor.getByLabel("Phone number").fill("+39 320 555 0101");
  await editor.getByTestId("photo-input").setInputFiles(image("sara.jpg", 5));
  await expect(editor.getByText("Placeholder", { exact: true })).toBeVisible();
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor).toBeHidden();
  const created = sent("/").at(-1)!;
  expect(created.body.contact).toMatchObject({ givenName: "Sara", familyName: "Bruno", phones: [{ value: "+39 320 555 0101", type: "mobile" }] });
  const upload = backend.contactRequests.at(-1)!;
  expect(upload).toMatchObject({ method: "PUT", route: expect.stringMatching(/^\/new\d+\/photo$/) });
  expect(upload.bytes).toBeGreaterThan(500);
  await page.getByTestId("tile-placeholder").click();
  await expect(row(page, /Sara Bruno/)).toContainText("Placeholder");

  // "Add photo" on a row goes straight to the file picker.
  await page.getByTestId("tile-noPhoto").click();
  const chooser = page.waitForEvent("filechooser");
  await row(page, /Davide Gallo/).getByRole("button", { name: "Add photo" }).click();
  await (await chooser).setFiles(image("davide.jpg", 2));
  await expect(page.getByRole("status")).toContainText("Photo added as a placeholder.");
  await expect(page.getByTestId("tile-placeholder")).toContainText("3");
  await expect(row(page, /Davide Gallo/)).toHaveCount(0);

  // A profile link's photo is a real one.
  await row(page, /Lorenzo Giordano/).getByRole("button", { name: /Lorenzo Giordano/ }).click();
  await editor.getByRole("button", { name: "Add link" }).click();
  await editor.getByLabel("Profile link").fill("instagram.com/lorenzo.g");
  await editor.getByRole("button", { name: "Find photo" }).click();
  await expect(editor.getByText("Found on Instagram")).toBeVisible();
  await editor.getByRole("button", { name: "Use this photo" }).click();
  await expect.poll(() => sent("/lg/photo_from_link").map((r) => r.body)).toEqual([{ token: "token-1" }]);
  await expect(page.getByTestId("tile-noPhoto")).toContainText("3");
});

test("upload photos for many contacts: matched by name or number, real photos skipped", async ({ page }) => {
  await page.goto("/app/contacts");
  await page.getByRole("button", { name: "Upload photos" }).click();
  const dialog = page.getByTestId("photo-upload");
  await dialog.getByTestId("upload-input").setInputFiles([
    image("Davide Gallo.jpg", 0),
    image("lorenzo_giordano.png", 1),
    image("IMG_3402 +393497772227.jpg", 2),
    image("Marco Rossi.jpg", 3),
    image("cena-2023.jpg", 4),
  ]);
  const fileRow = (name: string) => dialog.getByRole("row", { name: new RegExp(name.replace(/[.+]/g, "\\$&")) });
  await expect(fileRow("Davide Gallo.jpg").getByRole("combobox")).toHaveValue("people/dg");
  await expect(fileRow("Davide Gallo.jpg")).toContainText("Ready");
  await expect(fileRow("IMG_3402")).toContainText("Phone number");
  await expect(fileRow("IMG_3402").getByRole("combobox")).toHaveValue("people/mm");
  await expect(fileRow("Marco Rossi.jpg")).toContainText("Has a photo");
  await expect(fileRow("cena-2023.jpg")).toContainText("No match");
  await expect(dialog).toContainText("3 to upload · 2 skipped");
  await screenshot(page, "63-contacts-upload", { fullPage: false });

  // Chosen by hand.
  await fileRow("cena-2023.jpg").getByRole("combobox").selectOption({ label: "Francesco Greco" });
  await expect(fileRow("cena-2023.jpg")).toContainText("Chosen by you");
  await dialog.getByRole("button", { name: "Upload 4 photos" }).click();
  await expect(dialog).toContainText("4 uploaded");
  expect(backend.contactRequests.filter((r) => r.method === "PUT").map((r) => r.route).sort()).toEqual(["/dg/photo", "/fg/photo", "/lg/photo", "/mm/photo"]);
  await dialog.getByRole("button", { name: "Close", exact: true }).first().click();
  await expect(page.getByTestId("tile-placeholder")).toContainText("5");
});

test("merge, label and delete the selected contacts, with undo", async ({ page }) => {
  await page.goto("/app/contacts");
  await row(page, /Francesco Greco/).getByRole("checkbox").check();
  await row(page, /Francesco G\./).getByRole("checkbox").check();

  // Label.
  await page.getByTestId("selection-bar").getByText("Label", { exact: true }).click();
  await page.getByRole("listitem").filter({ hasText: "Volley" }).getByRole("button", { name: "Add" }).click();
  expect(sent("/labels/apply").map((r) => r.body)).toEqual([{ contactIds: ["people/fg", "people/fg2"], label: "contactGroups/volley", add: true }]);
  await expect(row(page, /Francesco Greco/)).toContainText("Volley");

  // Merge: the most recently edited is kept.
  await page.getByTestId("selection-bar").getByRole("button", { name: "Merge" }).click();
  const panel = page.getByTestId("merge-panel");
  await expect(panel).toContainText("Merging 2 contacts.");
  await screenshot(page, "64-contacts-merge", { fullPage: false });
  await panel.getByRole("button", { name: "Merge into one" }).click();
  await expect(page.getByRole("status")).toContainText("Contacts merged.");
  const [merge] = sent("/merge");
  expect(merge.body).toMatchObject({ contactIds: ["people/fg", "people/fg2"], request: { keepId: "people/fg" }, updatedAt: { "people/fg": "2026-09-30T10:00:00Z", "people/fg2": "2019-05-01T10:00:00Z" } });
  await expect(row(page, /Francesco G\./)).toHaveCount(0);

  // Delete, then undo from the notice.
  page.once("dialog", (d) => d.accept());
  await row(page, /Davide Gallo/).getByLabel("More for Davide Gallo").click();
  await row(page, /Davide Gallo/).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("status")).toContainText("Contact deleted.");
  expect(sent("/delete").map((r) => r.body)).toEqual([{ contactIds: ["people/dg"] }]);
  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("status")).toContainText("Undone.");
  expect(backend.cleanupActions.find((a) => a.kind === "delete")?.undone).toBe(true);

  await page.goto("/app/history");
  await expect(page.getByTestId("cleanup-history")).toContainText("Deleted Davide Gallo");
});

test("prefix, middle name and suffix are editable, a double click opens a row, photos grow on hover (issue #57)", async ({ page }) => {
  await page.goto("/app/contacts");
  await page.getByTestId("tile-all").click();

  // Hovering a photo shows it larger.
  await row(page, /Giulia Bianchi/).locator("img").hover();
  await expect(page.getByTestId("photo-zoom")).toBeVisible();
  await expect(page.getByTestId("photo-zoom")).toContainText("Giulia Bianchi");
  await screenshot(page, "65-photo-zoom", { fullPage: false });
  await page.getByLabel("Search name, number, email or link").hover();
  await expect(page.getByTestId("photo-zoom")).toBeHidden();

  // A double click on the row, not only on the name.
  await row(page, /Matteo De Luca/).getByRole("cell").nth(2).dblclick();
  const editor = page.getByTestId("contact-editor");
  await expect(editor.getByLabel("Prefix, e.g. Dr. or (Volley)")).toHaveValue("(Volley)");
  await expect(editor.getByLabel("First name")).toHaveValue("Matteo");
  await expect(editor.getByLabel("Last name")).toHaveValue("De Luca");
  await expect(editor.getByLabel("Suffix, e.g. Jr. or Volley")).toHaveValue("Coach");
  await expect(editor.getByTestId("name-preview")).toHaveText("Shown in Google as: (Volley) Matteo De Luca, Coach");
  await editor.getByLabel("Prefix, e.g. Dr. or (Volley)").fill("");
  await editor.getByLabel("Middle name").fill("Maria");
  await editor.getByLabel("Suffix, e.g. Jr. or Volley").fill("Volley");
  await expect(editor.getByTestId("name-preview")).toHaveText("Shown in Google as: Matteo Maria De Luca, Volley");
  await screenshot(page, "66-contact-name-parts", { fullPage: false });
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor).toBeHidden();
  expect(sent("/md", "PUT")[0].body.contact).toMatchObject({ givenName: "Matteo", middleName: "Maria", familyName: "De Luca", honorificSuffix: "Volley" });
  expect(sent("/md", "PUT")[0].body.contact.honorificPrefix ?? "").toBe(""); // cleared: the server drops empties
  await expect(row(page, /Matteo Maria De Luca, Volley/)).toBeVisible();

  // A double click on a row's checkbox only selects it.
  await row(page, /Davide Gallo/).getByRole("checkbox").dblclick();
  await expect(editor).toBeHidden();
});
