import { PhotoPin } from "../../interfaces/api";

export interface SimpleContact {
  id: string;
  name?: string;
  numbers: string[];
  emails?: string[];
  hasPhoto: boolean;
  photoUrl?: string;
  /** Websites saved on the contact: profile links (issue #51). */
  urls?: string[];
  /** The photo was uploaded by hand on the Contacts page: any real photo replaces it (issue #55). */
  placeholder?: boolean;
  /** The photo is kept: no sync replaces it, whatever the mode (issue #67). */
  photoKept?: boolean;
  /** The source the photo follows (issue #78). */
  pin?: PhotoPin;
}
