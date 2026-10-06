import test from "node:test";
import assert from "node:assert/strict";

import { whatsappSource, WhatsAppLookup } from "./whatsapp";

/** WhatsApp Web knowing some contacts, and accounts reachable by number. */
function fakeWhatsApp(loaded: Record<string, string>, accounts: Record<string, string>, photos: Record<string, string>) {
  const asked: string[] = [];
  const lookup: WhatsAppLookup = {
    contacts: async () => new Map(Object.entries(loaded)),
    numberId: async (digits) => {
      asked.push(digits);
      return accounts[digits] ?? null;
    },
    photo: async (id) => photos[id] ?? null,
    ownNumber: () => "393331112222",
  };
  return { lookup, asked };
}

const contact = (numbers: string[]) => ({ id: "people/1", numbers, hasPhoto: false });

test("a number WhatsApp Web hasn't loaded is asked about directly", async () => {
  const { lookup, asked } = fakeWhatsApp(
    { "393351110000": "393351110000@c.us" },
    { "393357167738": "393357167738@c.us" },
    { "393351110000@c.us": "loaded-photo", "393357167738@c.us": "asked-photo" }
  );
  const source = whatsappSource(lookup, { interval: 0 });
  await source.prepare!();
  // Loaded: no question asked.
  assert.deepEqual(await source.find(contact(["+39 335 111 0000"])), { photo: "loaded-photo", source: "whatsapp", matchedBy: "+39 335 111 0000" });
  assert.deepEqual(asked, []);
  // Not loaded, saved without the country code.
  assert.deepEqual(await source.find(contact(["335 716 7738"])), { photo: "asked-photo", source: "whatsapp", matchedBy: "335 716 7738" });
  assert.deepEqual(asked, ["393357167738"]);
  // No account at all.
  assert.equal(await source.find(contact(["+39 340 000 0000"])), null);
});

test("a contact known only by its private id gets its photo through the number", async () => {
  const { lookup } = fakeWhatsApp(
    { "393357167738": "123456789012345@lid" },
    { "393357167738": "393357167738@c.us" },
    { "393357167738@c.us": "photo" }
  );
  const source = whatsappSource(lookup, { interval: 0 });
  await source.prepare!();
  assert.deepEqual(await source.find(contact(["+393357167738"])), { photo: "photo", source: "whatsapp", matchedBy: "+393357167738" });
});

test("questions to WhatsApp are spaced out", async () => {
  const { lookup } = fakeWhatsApp({}, {}, {});
  let now = 0;
  const waits: number[] = [];
  const source = whatsappSource(lookup, {
    interval: 500,
    now: () => now,
    sleep: async (ms) => {
      waits.push(ms);
      now += ms;
    },
  });
  await source.prepare!();
  await source.find(contact(["+393350000001"]));
  now += 100;
  await source.find(contact(["+393350000002"]));
  await source.find(contact(["+393350000003"]));
  assert.deepEqual(waits, [400, 500]);
});
