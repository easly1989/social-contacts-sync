import { SourceId } from "../../../interfaces/api";
import { SimpleContact } from "../interfaces";
import { Base64 } from "../types";

export interface FoundPhoto {
  photo: Base64;
  source: SourceId;
  /** The phone number or email that matched, for the report. */
  matchedBy: string;
  /** A profile link to save on the contact when this photo is used. */
  newLink?: string;
}

/** Somewhere profile photos can be looked up for a Google contact. */
export interface PhotoSource {
  id: SourceId;
  /** One-off setup before the first lookup (e.g. loading a contact list). */
  prepare?(): Promise<void>;
  /** The contact's photo, or null when this source has none. Throws on failures. */
  find(contact: SimpleContact): Promise<FoundPhoto | null>;
}
