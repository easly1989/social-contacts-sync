import crypto from "crypto";

import { PhotoSource } from "./types";

/** Gravatar's hash of an email address. */
export function gravatarHash(email: string): string {
  return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

/**
 * Public Gravatar pictures, matched by email address. `d=404` makes Gravatar
 * answer 404 instead of a generated placeholder when there is no picture.
 */
export function gravatarSource(fetchImpl: typeof fetch = fetch): PhotoSource {
  return {
    id: "gravatar",
    async find(contact) {
      for (const email of contact.emails ?? []) {
        if (!email.includes("@")) continue;
        const response = await fetchImpl(`https://gravatar.com/avatar/${gravatarHash(email)}?s=512&d=404`);
        if (response.status === 404) continue;
        if (!response.ok) throw new Error(`Gravatar answered HTTP ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length) return { photo: bytes.toString("base64"), source: "gravatar", matchedBy: email };
      }
      return null;
    },
  };
}
