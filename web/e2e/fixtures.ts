import { CleanupContact, CleanupScan, Contact, ContactLabel, RunRecord } from "../../interfaces/api";

const names = [
  "Giulia Bianchi", "Marco Rossi", "Sofia Esposito", "Luca Romano", "Chiara Colombo",
  "Alessandro Ricci", "Martina Marino", "Francesco Greco", "Sara Bruno", "Davide Gallo",
];

/** A finished run: 6 photos added, 1 replaced, 2 without a match, 1 error. */
export function sampleRun(id = "2026-10-03T13-42-00-000Z-abc123", startedAt = "2026-10-03T13:42:00.000Z"): RunRecord {
  return {
    id,
    startedAt,
    finishedAt: new Date(Date.parse(startedAt) + 18 * 60_000).toISOString(),
    mode: "replace",
    sources: ["whatsapp", "gravatar"],
    totalContacts: names.length,
    counters: { added: 6, replaced: 1, kept: 0, alreadyHadPhoto: 0, noMatch: 2, errors: 1 },
    results: names.map((name, i) => {
      if (i < 6) return { contactId: `c/${i}`, name, outcome: "added", source: i === 2 ? "gravatar" : "whatsapp", matchedBy: i === 2 ? "sofia@example.com" : `+39 33${i} 555 01${i}${i}`, hasPhoto: true };
      if (i === 6) return { contactId: `c/${i}`, name, outcome: "replaced", source: "whatsapp", matchedBy: "+39 340 555 0166", hasPhoto: true, hasPrevious: true };
      if (i === 9) return { contactId: `c/${i}`, name, outcome: "error", error: "Google said no" };
      return { contactId: `c/${i}`, name, outcome: "noMatch" };
    }),
  };
}

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const photo = (i: number) => `/api/e2e-photos/${i}`;

/** A clean-up scan shaped like mockup 4 of issue #8. */
export function sampleScan(): CleanupScan {
  const c = (id: string, name: string | undefined, extra: Partial<CleanupContact> = {}): CleanupContact => ({ id, name, phones: [], emails: [], addresses: [], hasPhoto: false, ...extra });
  const contacts: CleanupContact[] = [
    c("people/a1", "Marco Rossi", { hasPhoto: true, photoUrl: photo(1), updatedAt: daysAgo(3), birthday: "--03-12", phones: [{ value: "+39 333 812 5517", e164: "+393338125517", type: "mobile" }], emails: [{ value: "marco.rossi@example.com" }] }),
    c("people/a2", "Marco R.", { updatedAt: "2019-05-01T10:00:00Z", company: "Studio Rossi", phones: [{ value: "+39 333 812 5517", e164: "+393338125517" }, { value: "+39 02 4455 6677", e164: "+390244556677", type: "work" }], emails: [{ value: "m.rossi@studio.example" }] }),
    c("people/b1", "Giulia Bianchi", { updatedAt: daysAgo(40), emails: [{ value: "giulia.bianchi@example.com" }], phones: [{ value: "+39 02 8899 1100", e164: "+390288991100" }] }),
    c("people/b2", "Giulia Bianchi", { updatedAt: daysAgo(400), emails: [{ value: "giulia.bianchi@example.com" }] }),
    c("people/c1", "Luca Romano", { hasPhoto: true, photoUrl: photo(3), updatedAt: daysAgo(10), phones: [{ value: "+39 328 309 7537", e164: "+393283097537" }] }),
    c("people/c2", "Luca Romano", { updatedAt: daysAgo(900) }),
    c("people/d1", "Elena Conti", { updatedAt: daysAgo(5), phones: [{ value: "+39 347 100 2000", e164: "+393471002000" }] }),
    c("people/d2", "Elena Conti", { updatedAt: daysAgo(500), phones: [{ value: "347 100 2000", e164: "+393471002000" }] }),
    c("people/e1", "Andrea Rizzo", { hasPhoto: true, photoUrl: photo(5), updatedAt: daysAgo(1), emails: [{ value: "andrea@rizzo.example" }] }),
    c("people/e2", "Andrea Rizzo", { updatedAt: daysAgo(700), emails: [{ value: "andrea@rizzo.example" }] }),
    c("people/f1", "Sara Bruno", { updatedAt: daysAgo(20), phones: [{ value: "+39 320 555 0101", e164: "+393205550101" }] }),
    c("people/f2", "Sara B.", { updatedAt: daysAgo(800), phones: [{ value: "+39 320 555 0101", e164: "+393205550101" }] }),
    c("people/m1", "Mamma", { phones: [{ value: "+39 340 221 6527", e164: "+393402216527" }] }),
    c("people/m2", "Maria Esposito", { hasPhoto: true, photoUrl: photo(2), phones: [{ value: "+39 340 221 6527", e164: "+393402216527" }] }),
    c("people/s1", "Studio Bianchi", { phones: [{ value: "+39 02 8899 1100", e164: "+390288991100" }] }),
    c("people/s2", "Paolo Bianchi", { phones: [{ value: "+39 02 8899 1100", e164: "+390288991100" }] }),
    c("people/l1", "Luca", { phones: [{ value: "+39 328 309 7537", e164: "+393283097537" }] }),
    c("people/n1", "Francesco Greco", { phones: [{ value: "333 1234567", e164: "+393331234567" }] }),
    c("people/n2", "Davide Gallo", { phones: [{ value: "02 1234 5678", e164: "+390212345678" }] }),
  ];
  return {
    markedShared: [],
    scannedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
    totalContacts: 1248,
    region: "IT",
    contacts: Object.fromEntries(contacts.map((x) => [x.id, x])),
    duplicates: [
      { id: "g-marco", contactIds: ["people/a1", "people/a2"], reasons: ["phone"] },
      { id: "g-giulia", contactIds: ["people/b1", "people/b2"], reasons: ["email", "name"] },
      { id: "g-luca", contactIds: ["people/c1", "people/c2"], reasons: ["name"] },
      { id: "g-elena", contactIds: ["people/d1", "people/d2"], reasons: ["phone", "name"] },
      { id: "g-andrea", contactIds: ["people/e1", "people/e2"], reasons: ["email", "name"] },
      { id: "g-sara", contactIds: ["people/f1", "people/f2"], reasons: ["phone"] },
    ],
    sharedNumbers: [
      { e164: "+393402216527", contactIds: ["people/m1", "people/m2"] },
      { e164: "+390288991100", contactIds: ["people/s1", "people/b1", "people/s2"] },
      { e164: "+393283097537", contactIds: ["people/l1", "people/c1"] },
    ],
    missingCountryCode: [
      { contactId: "people/d2", value: "347 100 2000", suggestion: "+39 347 100 2000" },
      { contactId: "people/n1", value: "333 1234567", suggestion: "+39 333 123 4567" },
      { contactId: "people/n2", value: "02 1234 5678", suggestion: "+39 02 1234 5678" },
      { contactId: "people/n2", value: "12", suggestion: undefined },
    ],
  };
}

export const sampleLabels: ContactLabel[] = [
  { id: "contactGroups/ice", name: "ICE" },
  { id: "contactGroups/volley", name: "Volley" },
  { id: "contactGroups/work", name: "Work" },
];

/** The Contacts page's address book, shaped like the mockups of issue #55. */
export function sampleContacts(): Contact[] {
  const c = (id: string, name: string, extra: Partial<Contact> = {}): Contact => {
    const [givenName, ...rest] = name.split(" ");
    return { id: `people/${id}`, name, givenName, familyName: rest.join(" ") || undefined, phones: [], emails: [], urls: [], addresses: [], labels: [], hasPhoto: false, updatedAt: "2026-09-01T10:00:00Z", ...extra };
  };
  const photo = (i: number) => ({ hasPhoto: true, photoUrl: `/api/e2e-photos/${i}` });
  return [
    c("dg", "Davide Gallo", { phones: [{ value: "+39 338 555 0412", type: "mobile" }] }),
    c("ec", "Elena Conti", { ...photo(4), placeholder: true, phones: [{ value: "+39 347 100 2000", type: "mobile" }], urls: [{ value: "https://instagram.com/elena.conti.ph", type: "profile" }], labels: ["contactGroups/volley"] }),
    c("fg", "Francesco Greco", { phones: [{ value: "+39 335 210 4471", type: "mobile" }], emails: [{ value: "francesco.greco@example.com", type: "home" }], updatedAt: "2026-09-30T10:00:00Z" }),
    c("fg2", "Francesco G.", { givenName: "Francesco G.", familyName: undefined, phones: [{ value: "+39 335 210 4471" }], urls: [{ value: "https://instagram.com/fra.greco" }], updatedAt: "2019-05-01T10:00:00Z" }),
    c("gb", "Giulia Bianchi", { ...photo(1), emails: [{ value: "giulia.bianchi@example.com", type: "home" }], urls: [{ value: "https://x.com/giulia", type: "profile" }, { value: "https://github.com/giulia", type: "profile" }] }),
    c("lg", "Lorenzo Giordano", { phones: [{ value: "+39 340 111 2227", type: "mobile" }], labels: ["contactGroups/work", "contactGroups/ice"] }),
    c("mr", "Marco Rossi", {
      ...photo(2),
      company: "Studio Rossi",
      jobTitle: "Architect",
      phones: [{ value: "+39 333 812 5517", type: "mobile" }, { value: "+39 02 4455 6677", type: "work" }],
      emails: [{ value: "marco.rossi@example.com", type: "home" }],
      urls: [{ value: "https://linkedin.com/in/marcorossi", type: "profile" }],
      addresses: [{ street: "Via Roma 12", postalCode: "20121", city: "Milano", country: "Italy", type: "home" }],
      birthday: { month: 3, day: 12 },
      notes: "Met at the volley tournament in 2024.",
      labels: ["contactGroups/work"],
    }),
    c("mm", "Martina Marino", { phones: [{ value: "+39 349 777 2227", type: "mobile" }], emails: [{ value: "martina@marino.example", type: "home" }], urls: [{ value: "https://t.me/martina", type: "profile" }] }),
    // Prefix and suffix, the way Google shows them (issue #57).
    c("md", "(Volley) Matteo De Luca, Coach", { ...photo(3), honorificPrefix: "(Volley)", givenName: "Matteo", familyName: "De Luca", honorificSuffix: "Coach", phones: [{ value: "+39 328 309 7537", type: "mobile" }] }),
  ];
}
