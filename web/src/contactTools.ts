import { CleanupContact, Contact } from "../../interfaces/api";

/*
  Helpers for the Contacts page (issue #55): search, matching uploaded image
  files to contacts, and shrinking a photo before it's sent to Google.
*/

/** Lower case, no accents, punctuation as spaces. */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@+]+/g, " ")
    .trim();
}

const digits = (s: string) => s.replace(/\D/g, "");

export function displayName(c: Pick<Contact, "name" | "givenName" | "familyName" | "company" | "emails" | "phones">): string {
  return c.name ?? ([c.givenName, c.familyName].filter(Boolean).join(" ") || c.company || c.emails[0]?.value || c.phones[0]?.value || "");
}

/** Whether a contact matches what was typed in the search box. */
export function matchesSearch(contact: Contact, query: string): boolean {
  const q = fold(query);
  if (!q) return true;
  const text = fold([displayName(contact), contact.company, ...contact.emails.map((e) => e.value), ...contact.urls.map((u) => u.value)].join(" "));
  if (q.split(" ").every((word) => text.includes(word))) return true;
  const number = digits(query);
  return number.length >= 4 && contact.phones.some((p) => digits(p.value).includes(number));
}

export interface FileMatch {
  contactId?: string;
  by?: "name" | "phone";
}

/**
 * The contact an image file is for: a phone number in the name (at least
 * 7 digits, compared on the last 9), else the whole name ("Davide Gallo",
 * "davide_gallo", "Gallo Davide"). Several contacts with that name: no match.
 */
export function matchFile(fileName: string, contacts: Contact[]): FileMatch {
  const base = fileName.replace(/\.[a-z0-9]+$/i, "");
  for (const run of base.match(/\+?\d[\d ]{6,}\d/g) ?? []) {
    const tail = digits(run).slice(-9);
    if (tail.length < 7) continue;
    const found = contacts.filter((c) => c.phones.some((p) => digits(p.value).endsWith(tail)));
    if (found.length === 1) return { contactId: found[0].id, by: "phone" };
  }
  const words = fold(base.replace(/[_.-]+/g, " ")).split(" ").filter(Boolean).sort().join(" ");
  if (!words) return {};
  const found = contacts.filter((c) => {
    const name = displayName(c);
    return name && fold(name).split(" ").filter(Boolean).sort().join(" ") === words;
  });
  return found.length === 1 ? { contactId: found[0].id, by: "name" } : {};
}

/** A JPEG no bigger than `max` pixels a side: Google shows contact photos small anyway. */
export async function shrinkImage(file: Blob, max = 1024): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob"))), "image/jpeg", 0.9));
}

/** The shape Clean up's merge table reads. */
export function toCleanupContact(c: Contact): CleanupContact {
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    id: c.id,
    name: c.name,
    phones: c.phones.map((p) => ({ value: p.value, type: p.type })),
    emails: c.emails.map((e) => ({ value: e.value, type: e.type })),
    company: c.company,
    birthday: c.birthday ? `${c.birthday.year ?? "-"}-${pad(c.birthday.month)}-${pad(c.birthday.day)}` : undefined,
    addresses: c.addresses.map((a) => ({ value: [a.street, a.postalCode, a.city, a.country].filter(Boolean).join(", "), type: a.type })),
    hasPhoto: c.hasPhoto,
    photoUrl: c.photoUrl,
    updatedAt: c.updatedAt,
  };
}
