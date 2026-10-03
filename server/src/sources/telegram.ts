import { inferRegion, matchCandidates } from "../phone";
import { TelegramConnection } from "../telegram";
import { PhotoSource } from "./types";

/** Telegram profile photos of the user's own Telegram contacts, matched by phone number. */
export function telegramSource(connection: TelegramConnection): PhotoSource {
  let contacts = new Map<string, string>();
  let region: ReturnType<typeof inferRegion>;

  return {
    id: "telegram",
    async prepare() {
      contacts = new Map((await connection.contacts()).map((c) => [c.phone.replace(/\D/g, ""), c.id]));
      // The user's own number tells the country of numbers saved without +CC.
      region = inferRegion((await connection.me())?.phone);
    },
    async find(contact) {
      for (const phoneNumber of contact.numbers) {
        const id = matchCandidates(phoneNumber, region).map((candidate) => contacts.get(candidate)).find(Boolean);
        if (!id) continue;
        const photo = await connection.photo(id);
        return photo ? { photo, source: "telegram", matchedBy: phoneNumber } : null;
      }
      return null;
    },
  };
}
