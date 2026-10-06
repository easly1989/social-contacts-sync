import { Client } from "whatsapp-web.js";

import { downloadFile, loadContacts } from "../whatsapp";
import { inferRegion, matchCandidates, toE164Digits } from "../phone";
import { Base64 } from "../types";
import { PhotoSource } from "./types";

/** What the source needs from WhatsApp Web, so it can be tested without it. */
export interface WhatsAppLookup {
  /** The contacts WhatsApp Web has loaded: number → WhatsApp id. */
  contacts(): Promise<Map<string, string>>;
  /** Asks WhatsApp whether a number (international digits) has an account: its id, or null. */
  numberId(digits: string): Promise<string | null>;
  photo(whatsappId: string): Promise<Base64 | null>;
  ownNumber(): string | undefined;
}

export function clientLookup(client: Client): WhatsAppLookup {
  return {
    contacts: () => loadContacts(client),
    numberId: async (digits) => (await client.getNumberId(digits))?._serialized ?? null,
    photo: (id) => downloadFile(client, id),
    ownNumber: () => client.info?.wid?.user,
  };
}

/**
 * WhatsApp profile photos, matched by phone number.
 *
 * WhatsApp Web only loads part of the phone's address book, so a number it
 * doesn't know is asked about directly. Those questions are spaced out.
 */
export function whatsappSource(
  client: Client | WhatsAppLookup,
  options: { interval?: number; now?: () => number; sleep?: (ms: number) => Promise<void> } = {}
): PhotoSource {
  const whatsapp = "getNumberId" in client ? clientLookup(client) : client;
  const interval = options.interval ?? 1000;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let contacts: Map<string, string> = new Map();
  let region: ReturnType<typeof inferRegion>;
  let last = -Infinity;

  async function askWhatsApp(digits: string): Promise<string | null> {
    const wait = last + interval - now();
    if (wait > 0) await sleep(wait);
    last = now();
    try {
      return await whatsapp.numberId(digits);
    } catch (e) {
      console.error(`WhatsApp couldn't look up a number:`, (e as Error)?.message);
      return null;
    }
  }

  return {
    id: "whatsapp",
    async prepare() {
      contacts = await whatsapp.contacts();
      // The user's own number tells the country of numbers saved without +CC.
      region = inferRegion(whatsapp.ownNumber());
    },
    async find(contact) {
      for (const phoneNumber of contact.numbers) {
        let whatsappId: string | undefined;
        // Try the normalized number and country-specific legacy spellings.
        for (const candidate of matchCandidates(phoneNumber, region)) {
          whatsappId = contacts.get(candidate);
          if (whatsappId) break;
        }
        let photo = whatsappId ? await whatsapp.photo(whatsappId) : null;
        // Not loaded by WhatsApp Web, or known only by its new private id
        // (…@lid): ask for the account behind the number itself.
        const digits = toE164Digits(phoneNumber, region);
        if (!photo && digits && whatsappId !== `${digits}@c.us`) {
          const byNumber = await askWhatsApp(digits);
          if (byNumber && byNumber !== whatsappId) {
            whatsappId = byNumber;
            photo = await whatsapp.photo(byNumber);
          }
        }
        if (!whatsappId) continue;
        // A matched contact without a picture: other numbers won't help.
        return photo ? { photo, source: "whatsapp", matchedBy: phoneNumber } : null;
      }
      return null;
    },
  };
}
