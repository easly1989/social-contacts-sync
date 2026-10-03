import test from "node:test";
import assert from "node:assert/strict";

import { gravatarHash, gravatarSource } from "./gravatar";

const contact = (emails: string[]) => ({ id: "people/c1", numbers: [], emails, hasPhoto: false });

test("hashes the trimmed, lower-cased address with SHA-256", () => {
  assert.equal(gravatarHash(" MyEmailAddress@example.com "), gravatarHash("myemailaddress@example.com"));
  assert.match(gravatarHash("a@b.c"), /^[0-9a-f]{64}$/);
});

test("returns the first address that has a picture", async () => {
  const requested: string[] = [];
  const fake = (async (url: string) => {
    requested.push(url);
    return url.includes(gravatarHash("has@photo.com"))
      ? new Response(Buffer.from("JPEG"), { status: 200 })
      : new Response("", { status: 404 });
  }) as unknown as typeof fetch;

  const found = await gravatarSource(fake).find(contact(["none@example.com", "not-an-email", "has@photo.com"]));
  assert.deepEqual(found, { photo: Buffer.from("JPEG").toString("base64"), source: "gravatar", matchedBy: "has@photo.com" });
  assert.equal(requested.length, 2);
  assert.match(requested[0], /^https:\/\/gravatar\.com\/avatar\/[0-9a-f]{64}\?s=512&d=404$/);
});

test("no picture for any address is not an error", async () => {
  const fake = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
  assert.equal(await gravatarSource(fake).find(contact(["a@example.com"])), null);
  assert.equal(await gravatarSource(fake).find(contact([])), null);
});

test("server errors are reported", async () => {
  const fake = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
  await assert.rejects(gravatarSource(fake).find(contact(["a@example.com"])), /HTTP 503/);
});
