import jpeg from "jpeg-js";

import { SourceId } from "../../interfaces/api";
import { Base64 } from "./types";

/*
  Which found photos To review offers (issue #104), as the sync queues them
  and again when the list is read:
  - Facebook and Instagram only when read with the login: their anonymous
    previews are blurred or tiny;
  - for a contact with a photo, nothing smaller than 200×200, and nothing
    that looks the same as the photo it has;
  - for a contact without one, any size, marked small below 200.
*/

/** The shorter side a photo needs to replace one the contact has. */
export const minSide = 200;

/** What the rules know of a photo; the sizes come from its header, `visual` is its look (`visualHash`). */
export interface PhotoFacts {
  width?: number;
  height?: number;
  visual?: string;
}

export interface OfferedPhoto extends PhotoFacts {
  source: SourceId;
  /** For a profile link, its network: "Instagram", "X"… */
  network?: string;
  /** Read from the site's public page, without the login. */
  anonymous?: boolean;
}

/** The image's size from its header (JPEG, PNG, GIF or WebP), else undefined. */
export function imageSize(bytes: Buffer): { width: number; height: number } | undefined {
  if (bytes.length < 30) return undefined;
  if (bytes.readUInt32BE(0) === 0x89504e47) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (bytes.toString("latin1", 0, 3) === "GIF") return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  if (bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") {
    const chunk = bytes.toString("latin1", 12, 16);
    if (chunk === "VP8 ") return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") {
      const bits = bytes.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
    return undefined;
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  // JPEG: segment by segment to the frame header (SOF0–SOF15 but DHT, JPG and DAC).
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return undefined;
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) };
    i += marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) ? 2 : 2 + bytes.readUInt16BE(i + 2);
  }
  return undefined;
}

/**
 * A JPEG's look as 16 hex digits (a difference hash on a 9×8 grey thumbnail):
 * the same picture saved again, or at another size, gets a close hash.
 * Undefined for what jpeg-js can't decode (PNG, WebP…): it then counts as different.
 */
export function visualHash(bytes: Buffer): string | undefined {
  let image: { width: number; height: number; data: Uint8Array };
  try {
    image = jpeg.decode(bytes, { useTArray: true, maxResolutionInMP: 50, maxMemoryUsageInMB: 512 });
  } catch {
    return undefined;
  }
  const { width, height, data } = image;
  if (!width || !height) return undefined;
  // Average grey of each cell of a 9×8 grid.
  const cells = new Array<number>(72).fill(0);
  const counts = new Array<number>(72).fill(0);
  for (let y = 0; y < height; y++) {
    const row = Math.min(7, Math.floor((y * 8) / height)) * 9;
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      const cell = row + Math.min(8, Math.floor((x * 9) / width));
      cells[cell] += 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
      counts[cell]++;
    }
  }
  let hash = 0n;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) hash = (hash << 1n) | (cells[r * 9 + c] / counts[r * 9 + c] > cells[r * 9 + c + 1] / counts[r * 9 + c + 1] ? 1n : 0n);
  return hash.toString(16).padStart(16, "0");
}

/** Two looks this close (at most 10 of 64 bits apart) are the same picture. */
export function sameImage(a: string, b: string): boolean {
  let diff = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let bits = 0;
  for (; diff; diff &= diff - 1n) bits++;
  return bits <= 10;
}

/** Size and look of a photo. */
export function photoFacts(photo: Base64 | Buffer): PhotoFacts {
  const bytes = typeof photo === "string" ? Buffer.from(photo, "base64") : photo;
  const visual = visualHash(bytes);
  return { ...imageSize(bytes), ...(visual ? { visual } : {}) };
}

/**
 * Whether To review offers the photo, and whether it is small. `current` is
 * the look of the contact's photo, undefined when it has none (a photo
 * uploaded by hand as a placeholder counts as none).
 */
export function worthOffering(photo: OfferedPhoto, contact: { hasPhoto: boolean; current?: string }): { offer: boolean; small?: true } {
  if (photo.anonymous && (photo.network === "Facebook" || photo.network === "Instagram")) return { offer: false };
  const small = photo.width !== undefined && photo.height !== undefined && Math.min(photo.width, photo.height) < minSide;
  if (contact.hasPhoto && small) return { offer: false };
  if (contact.hasPhoto && photo.visual && contact.current && sameImage(photo.visual, contact.current)) return { offer: false };
  return small ? { offer: true, small } : { offer: true };
}
