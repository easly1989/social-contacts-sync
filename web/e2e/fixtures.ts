import { RunRecord } from "../../interfaces/api";

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
