import { SourceId } from "../../../interfaces/api";
import { SimpleContact } from "../interfaces";
import { PhotoFacts } from "../photoRules";
import { Base64 } from "../types";

export interface FoundPhoto extends PhotoFacts {
  photo: Base64;
  source: SourceId;
  /** The phone number or email that matched, for the report. */
  matchedBy: string;
  /** A profile link to save on the contact when this photo is used. */
  newLink?: string;
  /** The profile's network, for photos from a profile link: "Instagram", "X"… */
  network?: string;
  /** Read from the site's public page, without the login (issue #104). */
  anonymous?: boolean;
  /** Smaller than To review wants, offered because the contact has no photo. */
  small?: boolean;
}

/** Somewhere profile photos can be looked up for a Google contact. */
export interface PhotoSource {
  id: SourceId;
  /** One-off setup before the first lookup (e.g. loading a contact list). */
  prepare?(): Promise<void>;
  /** The contact's photo, or null when this source has none. Throws on failures. */
  find(contact: SimpleContact): Promise<FoundPhoto | null>;
  /** Every photo it has for the contact, for review (one per linked profile). Defaults to `find`. */
  findAll?(contact: SimpleContact): Promise<FoundPhoto[]>;
}
