import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { cachedPhoto, cachePhoto } from "./photoCache";

test("desktop: review photos are kept in the data folder for 90 days, per photo read (issue #81)", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scs-photos-"));
  Object.assign(process.env, { SCS_DESKTOP: "1", SCS_DATA_DIR: dir });
  t.after(() => {
    delete process.env.SCS_DESKTOP;
    delete process.env.SCS_DATA_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const day = 86_400_000;
  const anna = { id: "instagram:anna.m", photoUrl: "https://scontent.cdninstagram.com/a.jpg" };
  cachePhoto(anna, Buffer.from("anna"));
  assert.equal(cachedPhoto(anna)?.toString(), "anna");
  // A newer read of the profile, with another photo: not the old one.
  assert.equal(cachedPhoto({ ...anna, photoUrl: "https://scontent.cdninstagram.com/b.jpg" }), undefined);

  const [file] = fs.readdirSync(path.join(dir, "review-photos"));
  const old = new Date(Date.now() - 91 * day);
  fs.utimesSync(path.join(dir, "review-photos", file), old, old);
  assert.equal(cachedPhoto(anna), undefined);

  // A write on a later day prunes what is older than 90 days.
  cachePhoto({ id: "bluesky:bo" }, Buffer.from("bo"), Date.now() + 2 * day);
  assert.deepEqual(fs.readdirSync(path.join(dir, "review-photos")).length, 1);
  assert.equal(cachedPhoto({ id: "bluesky:bo" })?.toString(), "bo");
});
