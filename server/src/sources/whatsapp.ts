import { Client } from "whatsapp-web.js";

import { downloadFile, loadContacts } from "../whatsapp";
import { inferRegion, matchCandidates } from "../phone";
import { PhotoSource } from "./types";

/** WhatsApp profile photos, matched by phone number. */
export function whatsappSource(client: Client): PhotoSource {
  let contacts: Map<string, string> = new Map();
  let region: ReturnType<typeof inferRegion>;

  return {
    id: "whatsapp",
    async prepare() {
      contacts = await loadContacts(client);
      // The user's own number tells the country of numbers saved without +CC.
      region = inferRegion(client.info?.wid?.user);
    },
    async find(contact) {
      for (const phoneNumber of contact.numbers) {
        let whatsappId: string | undefined;
        // Try the normalized number and country-specific legacy spellings.
        for (const candidate of matchCandidates(phoneNumber, region)) {
          whatsappId = contacts.get(candidate);
          if (whatsappId) break;
        }
        if (!whatsappId) continue;
        const photo = await downloadFile(client, whatsappId);
        // A matched contact without a picture: other numbers won't help.
        return photo ? { photo, source: "whatsapp", matchedBy: phoneNumber } : null;
      }
      return null;
    },
  };
}
