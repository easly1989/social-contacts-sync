import test from "node:test";
import assert from "node:assert/strict";

import { avatarUrl, contactLinks, isPlaceholder, LinkBlockedError, linksSource, lookupProfileLink, Pacer, parseProfileLink, previewImage, shortLink } from "./links";

const jpeg = Buffer.alloc(2048, 7);

/** A fake web: url → response, recording every request. */
function fakeWeb(pages: Record<string, { status?: number; body?: string | Buffer; type?: string; finalUrl?: string }>) {
  const requests: string[] = [];
  const fetchImpl = (async (url: string) => {
    requests.push(url);
    const page = pages[url];
    const response = new Response(page?.body ?? "", {
      status: page ? page.status ?? 200 : 404,
      headers: { "content-type": page?.type ?? "text/html" },
    });
    Object.defineProperty(response, "url", { value: page?.finalUrl ?? url });
    return response;
  }) as typeof fetch;
  return { fetchImpl, requests };
}

const page = (image: string) => `<html><head><meta content="${image}" property="og:image"/><title>x</title></head></html>`;
const noWait = new Pacer(() => 0);

test("profile URLs are recognized however they were typed", () => {
  const cases: [string, string | undefined][] = [
    ["https://x.com/github", "https://x.com/github"],
    ["twitter.com/github?lang=it", "https://x.com/github"],
    ["https://www.instagram.com/easly1989/?hl=it", "https://instagram.com/easly1989"],
    ["https://m.facebook.com/ruggiero.carlo/", "https://facebook.com/ruggiero.carlo"],
    ["https://www.facebook.com/profile.php?id=1000123", "https://facebook.com/profile.php?id=1000123"],
    ["https://www.linkedin.com/in/cruggiero89", "https://linkedin.com/in/cruggiero89"],
    ["t.me/durov", "https://t.me/durov"],
    ["https://www.youtube.com/@YouTube", "https://youtube.com/@YouTube"],
    ["https://bsky.app/profile/bsky.app", "https://bsky.app/profile/bsky.app"],
    ["https://github.com/easly1989", "https://github.com/easly1989"],
    ["https://mastodon.social/@Gargron", "https://mastodon.social/@Gargron"],
    // Not profiles.
    ["https://www.instagram.com/p/C1abc/", undefined],
    ["https://x.com/home", undefined],
    ["https://example.com/about", undefined],
    ["mailto:someone@example.com", undefined],
    ["", undefined],
  ];
  for (const [raw, expected] of cases) assert.equal(parseProfileLink(raw)?.url, expected, raw);
  assert.equal(parseProfileLink("https://www.instagram.com/easly1989/")!.network, "instagram");
  assert.equal(shortLink(parseProfileLink("https://www.instagram.com/easly1989/")!), "instagram.com/easly1989");
});

test("the preview image is read whatever the attribute order", () => {
  assert.equal(previewImage(page("https://img.example/a.jpg?x=1&amp;y=2")), "https://img.example/a.jpg?x=1&y=2");
  assert.equal(previewImage(`<meta property='og:image' content='https://img.example/b.jpg'>`), "https://img.example/b.jpg");
  assert.equal(previewImage(`<meta name="twitter:image" content="https://img.example/c.jpg">`), "https://img.example/c.jpg");
  assert.equal(previewImage("<html></html>"), undefined);
});

test("placeholders aren't photos", () => {
  assert.ok(isPlaceholder("https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png"));
  assert.ok(isPlaceholder("https://telegram.org/img/t_logo.png"));
  assert.ok(isPlaceholder("https://files.mastodon.social/accounts/avatars/original/missing.png"));
  assert.ok(!isPlaceholder("https://pbs.twimg.com/profile_images/1/abc_400x400.jpg"));
});

test("each network's avatar", async () => {
  const web = fakeWeb({
    "https://x.com/github": { body: page("https://pbs.twimg.com/profile_images/1/abc_200x200.jpg") },
    "https://t.me/durov": { body: page("https://cdn4.telesco.pe/file/durov.jpg") },
    "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=bsky.app": { body: JSON.stringify({ avatar: "https://cdn.bsky.app/img/avatar/plain/a@jpeg" }), type: "application/json" },
    "https://api.github.com/users/easly1989": { body: JSON.stringify({ avatar_url: "https://avatars.githubusercontent.com/u/3910202?v=4" }), type: "application/json" },
    "https://mastodon.social/api/v1/accounts/lookup?acct=Gargron": { body: JSON.stringify({ avatar: "https://files.mastodon.social/accounts/avatars/1.png" }), type: "application/json" },
    "https://instagram.com/nopic": { body: page("https://static.cdninstagram.com/rsrc.php/v3/default.png") },
  });
  const avatar = (url: string) => avatarUrl(parseProfileLink(url)!, web.fetchImpl);
  // X: the same picture at 400 px.
  assert.equal(await avatar("https://x.com/github"), "https://pbs.twimg.com/profile_images/1/abc_400x400.jpg");
  assert.equal(await avatar("https://t.me/durov"), "https://cdn4.telesco.pe/file/durov.jpg");
  assert.equal(await avatar("https://bsky.app/profile/bsky.app"), "https://cdn.bsky.app/img/avatar/plain/a@jpeg");
  assert.equal(await avatar("https://github.com/easly1989"), "https://avatars.githubusercontent.com/u/3910202?v=4&s=460");
  assert.equal(await avatar("https://mastodon.social/@Gargron"), "https://files.mastodon.social/accounts/avatars/1.png");
  assert.equal(await avatar("https://instagram.com/nopic"), null);
  assert.equal(await avatar("https://x.com/nobody"), null); // 404
});

test("a sign-in page or 429 means the site is blocked", async () => {
  const web = fakeWeb({
    "https://instagram.com/someone": { finalUrl: "https://www.instagram.com/accounts/login/?next=%2Fsomeone%2F" },
    "https://linkedin.com/in/someone": { status: 429 },
    "https://api.github.com/users/someone": { status: 403, type: "application/json" },
  });
  await assert.rejects(avatarUrl(parseProfileLink("https://instagram.com/someone")!, web.fetchImpl), LinkBlockedError);
  await assert.rejects(avatarUrl(parseProfileLink("https://linkedin.com/in/someone")!, web.fetchImpl), LinkBlockedError);
  await assert.rejects(avatarUrl(parseProfileLink("https://github.com/someone")!, web.fetchImpl), LinkBlockedError);
});

test("a lookup downloads the picture, and refuses what isn't an image", async () => {
  const web = fakeWeb({
    "https://t.me/durov": { body: page("https://cdn4.telesco.pe/file/durov.jpg") },
    "https://cdn4.telesco.pe/file/durov.jpg": { body: jpeg, type: "image/jpeg" },
    "https://t.me/broken": { body: page("https://cdn4.telesco.pe/file/broken.jpg") },
    "https://cdn4.telesco.pe/file/broken.jpg": { body: "<html>not an image</html>", type: "text/html" },
  });
  const found = await lookupProfileLink("t.me/durov", { fetchImpl: web.fetchImpl, pacer: noWait });
  assert.equal(found?.photo, jpeg.toString("base64"));
  assert.equal(found?.link.network, "telegram");
  assert.equal(await lookupProfileLink("t.me/broken", { fetchImpl: web.fetchImpl, pacer: noWait }), null);
  assert.equal(await lookupProfileLink("https://example.com/me", { fetchImpl: web.fetchImpl, pacer: noWait }), null);
});

test("requests to the same site are spaced out", async () => {
  let now = 0;
  const waits: number[] = [];
  const pacer = new Pacer(
    (n) => (n === "instagram" ? 6000 : 3000),
    () => now,
    async (ms) => {
      waits.push(ms);
      now += ms;
    }
  );
  await pacer.wait("x");
  now += 1000;
  await pacer.wait("x"); // 2 s left
  await pacer.wait("telegram"); // another site: no wait
  await pacer.wait("instagram");
  await pacer.wait("instagram");
  assert.deepEqual(waits, [2000, 6000]);
});

test("the sync source: unofficial networks only when turned on, and a blocked site is skipped", async () => {
  const contact = (id: string, urls: string[]) => ({ id, numbers: [], hasPhoto: false, urls });
  assert.deepEqual(contactLinks(contact("a", ["https://instagram.com/a", "https://x.com/a", "https://example.com"]), false).map((l) => l.network), ["x"]);
  assert.deepEqual(contactLinks(contact("a", ["https://instagram.com/a", "https://x.com/a"]), true).map((l) => l.network), ["instagram", "x"]);

  const web = fakeWeb({
    "https://instagram.com/anna": { finalUrl: "https://www.instagram.com/accounts/login/" },
    "https://x.com/anna": { body: page("https://pbs.twimg.com/profile_images/2/anna_200x200.jpg") },
    "https://pbs.twimg.com/profile_images/2/anna_400x400.jpg": { body: jpeg, type: "image/jpeg" },
  });
  const source = linksSource({ bestEffort: true, fetchImpl: web.fetchImpl, pacer: noWait });
  const found = await source.find(contact("anna", ["https://www.instagram.com/anna/", "https://x.com/anna"]));
  assert.deepEqual(found, { photo: jpeg.toString("base64"), source: "links", matchedBy: "x.com/anna" });
  // Instagram asked to sign in: the next contact doesn't try it again.
  web.requests.length = 0;
  assert.equal(await source.find(contact("bea", ["https://instagram.com/bea"])), null);
  assert.deepEqual(web.requests, []);
  // Contacts without links cost nothing.
  assert.equal(await source.find(contact("carl", [])), null);
  assert.deepEqual(web.requests, []);
});

test("only public sites by name are called", async () => {
  assert.equal(parseProfileLink("https://192.168.1.1/@admin"), undefined);
  assert.equal(parseProfileLink("https://localhost/@me"), undefined);
  assert.equal(parseProfileLink("https://router.lan/@me"), undefined);
  assert.equal(parseProfileLink("https://mastodon.social:8443/@me"), undefined);
  // A server answering with a picture on the local network.
  const web = fakeWeb({
    "https://evil.example/api/v1/accounts/lookup?acct=x": { body: JSON.stringify({ avatar: "https://10.0.0.1/admin.png" }), type: "application/json" },
  });
  await assert.rejects(lookupProfileLink("https://evil.example/@x", { fetchImpl: web.fetchImpl, pacer: noWait }), /Not a public https address/);
  assert.deepEqual(web.requests, ["https://evil.example/api/v1/accounts/lookup?acct=x"]);
});
