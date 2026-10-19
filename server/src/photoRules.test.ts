import test from "node:test";
import assert from "node:assert/strict";

import { testJpeg } from "./fakeImages";
import { imageSize, photoFacts, sameImage, worthOffering } from "./photoRules";

test("a photo's size is read from its header", () => {
  assert.deepEqual(imageSize(testJpeg(320, 240, 1)), { width: 320, height: 240 });
  const png = Buffer.alloc(40);
  png.writeUInt32BE(0x89504e47, 0);
  png.writeUInt32BE(640, 16);
  png.writeUInt32BE(480, 20);
  assert.deepEqual(imageSize(png), { width: 640, height: 480 });
  assert.equal(imageSize(Buffer.alloc(2048, 9)), undefined);
});

test("the same picture saved again looks the same; another one doesn't", () => {
  const a = photoFacts(testJpeg(640, 640, 1)).visual!;
  assert.ok(sameImage(a, photoFacts(testJpeg(100, 100, 1, 40)).visual!));
  assert.ok(!sameImage(a, photoFacts(testJpeg(640, 640, 4)).visual!));
  assert.equal(photoFacts(Buffer.alloc(2048, 9)).visual, undefined);
});

test("which photos To review offers (issue #104)", () => {
  const current = photoFacts(testJpeg(100, 100, 1)).visual;
  const big = { source: "whatsapp" as const, ...photoFacts(testJpeg(640, 640, 2)) };
  const small = { source: "links" as const, network: "LinkedIn", ...photoFacts(testJpeg(150, 150, 3)) };
  assert.deepEqual(worthOffering(big, { hasPhoto: true, current }), { offer: true });
  // Smaller than 200: only for a contact without a photo, marked small.
  assert.deepEqual(worthOffering(small, { hasPhoto: true, current }), { offer: false });
  assert.deepEqual(worthOffering(small, { hasPhoto: false }), { offer: true, small: true });
  // The contact's own photo, saved again by Google.
  assert.deepEqual(worthOffering({ ...big, ...photoFacts(testJpeg(640, 640, 1, 50)) }, { hasPhoto: true, current }), { offer: false });
  // Facebook and Instagram read without the login: never, whatever the size.
  assert.deepEqual(worthOffering({ ...big, source: "links", network: "Facebook", anonymous: true }, { hasPhoto: false }), { offer: false });
  assert.deepEqual(worthOffering({ ...big, source: "links", network: "X", anonymous: true }, { hasPhoto: false }), { offer: true });
});
