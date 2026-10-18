import test from "node:test";
import assert from "node:assert/strict";

import { Contact, SocialPerson } from "../../../interfaces/api";
import { parseInstagramExport, parseLinkedInConnections } from "./imports";
import { candidatesFor, contactWords, scoreMatch } from "./match";
import { runSearch, searchNetwork } from "./search";
import { storedProfilePhotos } from "./store";
import { parseProfileLink } from "../sources/links";
import { linkKey } from "../contactLinks";

const contact = (id: string, extra: Partial<Contact>): Contact => ({ id, phones: [], emails: [], urls: [], addresses: [], labels: [], hasPhoto: false, ...extra });

test("Instagram exports: followers (a list) and following (an object), old and new layouts", () => {
  const followers = JSON.stringify([
    { title: "", media_list_data: [], string_list_data: [{ href: "https://www.instagram.com/davide.gallo", value: "davide.gallo", timestamp: 1690000000 }] },
    { title: "", string_list_data: [{ href: "https://www.instagram.com/p/xyz", value: "" }] },
  ]);
  const following = JSON.stringify({ relationships_following: [{ title: "elena_conti", string_list_data: [{ href: "https://www.instagram.com/_u/elena_conti", timestamp: 1 }] }] });
  assert.deepEqual(parseInstagramExport(followers, "followers_1.json"), [
    { id: "instagram:davide.gallo", network: "instagram", url: "https://instagram.com/davide.gallo", handle: "davide.gallo", source: "export", relation: "follower" },
  ]);
  assert.deepEqual(parseInstagramExport(following, "following.json").map((p) => [p.handle, p.relation]), [["elena_conti", "following"]]);
  assert.throws(() => parseInstagramExport("<html>", "followers.html"));
});

test("LinkedIn's Connections.csv, notes and quotes included", () => {
  const csv = [
    "Notes:",
    '"When exporting your connection data, you may notice that some of the email addresses are missing."',
    "",
    "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
    'Davide,Gallo,https://www.linkedin.com/in/davidegallo,,"Gallo Ceramiche, S.r.l.",Owner,01 Oct 2026',
    "Nobody,Here,,,,,",
  ].join("\r\n");
  assert.deepEqual(parseLinkedInConnections(csv), [
    { id: "linkedin:davidegallo", network: "linkedin", url: "https://linkedin.com/in/davidegallo", handle: "davidegallo", name: "Davide Gallo", source: "export", relation: "connection", detail: "Owner · Gallo Ceramiche, S.r.l." },
  ]);
  assert.throws(() => parseLinkedInConnections("a,b,c"), /not_linkedin_connections/);
});

test("names match on both words; prefixes, suffixes and single names don't", () => {
  assert.deepEqual(contactWords({ name: "(Volley) Davide Gallo, Coach" }), ["davide", "gallo"]);
  assert.deepEqual(contactWords({ honorificPrefix: "(Volley)", givenName: "Davide", middleName: "Maria", familyName: "Gallò" } as Contact), ["davide", "maria", "gallo"]);
  const p = (extra: Partial<SocialPerson>): SocialPerson => ({ id: "x", network: "instagram", url: "https://instagram.com/x", source: "export", ...extra });
  const name = ["davide", "gallo"];
  assert.deepEqual(scoreMatch(name, p({ name: "Gallo Davide" })), { score: 1, reason: "sameName" });
  assert.deepEqual(scoreMatch(name, p({ name: "Davide Gallo Rossi" })), { score: 0.7, reason: "similarName" });
  assert.deepEqual(scoreMatch(name, p({ handle: "davide.gallo" })), { score: 0.85, reason: "handleMatchesName" });
  assert.deepEqual(scoreMatch(name, p({ handle: "davidegallo89" })), { score: 0.85, reason: "handleMatchesName" });
  assert.deepEqual(scoreMatch(name, p({ handle: "il_davide_gallo" })), { score: 0.6, reason: "handleMatchesName" });
  assert.equal(scoreMatch(name, p({ name: "Davide Rossi", handle: "drossi" })), undefined);
  assert.equal(scoreMatch(name, p({ name: "my daddy is Davide Gallo" })), undefined);
  // Bluesky handles are domains.
  assert.deepEqual(scoreMatch(name, p({ network: "bluesky", handle: "davidegallo.bsky.social" })), { score: 0.85, reason: "handleMatchesName" });
  assert.deepEqual(scoreMatch(name, p({ network: "bluesky", handle: "davidegallo.it" })), { score: 0.85, reason: "handleMatchesName" });
  assert.equal(scoreMatch(["mamma"], p({ name: "Mamma" })), undefined);
});

test("candidates leave out refused profiles and networks the contact is already linked to", () => {
  const people: SocialPerson[] = [
    { id: "instagram:davide.gallo", network: "instagram", url: "https://instagram.com/davide.gallo", handle: "davide.gallo", source: "export" },
    { id: "linkedin:davidegallo", network: "linkedin", url: "https://linkedin.com/in/davidegallo", name: "Davide Gallo", source: "export" },
    { id: "bluesky:dgallo.bsky.social", network: "bluesky", url: "https://bsky.app/profile/dgallo.bsky.social", name: "Davide Gallo", source: "search" },
  ];
  const davide = contact("people/dg", { name: "Davide Gallo", givenName: "Davide", familyName: "Gallo", urls: [{ value: "https://www.linkedin.com/in/davidegallo/" }] });
  assert.deepEqual(
    candidatesFor(davide, people, { rejected: { "people/dg": ["bluesky:dgallo.bsky.social"] } }).map((c) => [c.person.id, c.reason]),
    [["instagram:davide.gallo", "handleMatchesName"]]
  );
});

test("a profile already on another contact isn't suggested again", () => {
  const people: SocialPerson[] = [
    { id: "instagram:davide.gallo", network: "instagram", url: "https://instagram.com/davide.gallo", name: "Davide Gallo", source: "scan" },
    { id: "facebook:davide.gallo.9", network: "facebook", url: "https://facebook.com/davide.gallo.9", name: "Davide Gallo", source: "scan" },
  ];
  // Another Davide Gallo in the address book has this Instagram already, written by hand.
  const other = contact("people/dg2", { name: "Davide Gallo", urls: [{ value: "https://www.instagram.com/Davide.Gallo/" }] });
  const davide = contact("people/dg", { name: "Davide Gallo", givenName: "Davide", familyName: "Gallo" });
  const taken = new Set([davide, other].flatMap((c) => c.urls.map((u) => linkKey(u.value))));
  assert.deepEqual(
    candidatesFor(davide, people, { taken }).map((c) => c.person.id),
    ["facebook:davide.gallo.9"]
  );
});

test("the public search: exact names only, slowly, and a site that limits is left out", async () => {
  const requests: string[] = [];
  const fetchImpl = (async (url: string) => {
    requests.push(url);
    const body = url.includes("bsky")
      ? { actors: [{ handle: "dgallo.bsky.social", displayName: "Davide Gallo", avatar: "https://cdn.bsky.app/a.jpg" }, { handle: "other.bsky.social", displayName: "Davide Galli" }] }
      : url.includes("mastodon")
        ? null
        : { items: [{ html_url: "https://github.com/dgallo", avatar_url: "https://avatars.githubusercontent.com/u/1?v=4" }] };
    return body ? new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }) : new Response("", { status: 429 });
  }) as typeof fetch;
  assert.deepEqual((await searchNetwork("github", "Davide Gallo", fetchImpl))[0], {
    id: "github:dgallo",
    network: "github",
    url: "https://github.com/dgallo",
    handle: "dgallo",
    source: "search",
    name: "Davide Gallo",
    photoUrl: "https://avatars.githubusercontent.com/u/1?v=4&s=460",
  });

  requests.length = 0;
  const found: SocialPerson[] = [];
  const waits: number[] = [];
  const searched: Record<string, string[]> = { bluesky: ["people/old"] };
  const result = await runSearch({
    contacts: [
      contact("people/old", { name: "Old Search" }),
      contact("people/dg", { name: "Davide Gallo", givenName: "Davide", familyName: "Gallo" }),
      contact("people/m", { name: "Mamma" }),
      contact("people/ec", { name: "Elena Conti", urls: [{ value: "https://bsky.app/profile/elena.bsky.social" }] }),
    ],
    networks: ["bluesky", "mastodon"],
    searched,
    found: (people) => found.push(...people),
    progress: () => {},
    cancelled: () => false,
    fetchImpl,
    sleep: async (ms) => void waits.push(ms),
  });
  assert.equal(result.stopped, "mastodon");
  assert.deepEqual(found.map((p) => p.id), ["bluesky:dgallo.bsky.social"]);
  // Old Search was done; Mamma has one word; Elena has a Bluesky link already; Mastodon is skipped after its 429.
  assert.deepEqual(requests.map((u) => new URL(u).hostname), ["mastodon.social", "public.api.bsky.app"]);
  assert.deepEqual(searched.bluesky, ["people/old", "people/dg"]);
  assert.deepEqual(waits, [1500, 1000]);
});

test("the photos read with each person, by their normalized profile address (issue #77)", () => {
  const people = [
    { id: "instagram:anna", network: "instagram", url: "https://instagram.com/anna", handle: "anna", photoUrl: "https://scontent.cdninstagram.com/anna.jpg", source: "scan" },
    { id: "github:bo", network: "github", url: "https://github.com/bo", handle: "bo", source: "search" },
  ] as SocialPerson[];
  const photoOf = storedProfilePhotos(people);
  assert.equal(photoOf(parseProfileLink("https://www.instagram.com/anna/?hl=it")!), "https://scontent.cdninstagram.com/anna.jpg");
  assert.equal(photoOf(parseProfileLink("https://github.com/bo")!), undefined);
  assert.equal(photoOf(parseProfileLink("https://x.com/anna")!), undefined);
});
