import test from "node:test";
import assert from "node:assert/strict";

import { blockedReason, facebookPeople, instagramPage, linkedinPage, pause } from "./socialParse";

// Shaped like the sites' answers (issue #61); the scan itself needs the real sites.
test("Instagram followers pages: people and the next cursor", () => {
  const page = instagramPage(
    {
      users: [
        { pk: "1", username: "davide.gallo", full_name: "Davide Gallo", profile_pic_url: "https://scontent.cdninstagram.com/d.jpg" },
        { pk: "2", username: "bad name!" },
        { pk: "3", username: "elena_conti", full_name: "", profile_pic_url: "http://insecure/e.jpg" },
      ],
      next_max_id: "QVFE",
    },
    "follower"
  );
  assert.deepEqual(page.people, [
    { id: "instagram:davide.gallo", network: "instagram", url: "https://instagram.com/davide.gallo", handle: "davide.gallo", name: "Davide Gallo", photoUrl: "https://scontent.cdninstagram.com/d.jpg", source: "scan", relation: "follower" },
    { id: "instagram:elena_conti", network: "instagram", url: "https://instagram.com/elena_conti", handle: "elena_conti", name: undefined, photoUrl: undefined, source: "scan", relation: "follower" },
  ]);
  assert.equal(page.next, "QVFE");
  assert.equal(instagramPage({ users: [], next_max_id: null }, "following").next, undefined);
});

test("LinkedIn connections: profiles from `included`, with the largest picture", () => {
  const page = linkedinPage({
    data: { "*elements": ["urn:1"] },
    included: [
      { $type: "com.linkedin.voyager.dash.relationships.Connection", connectedMember: "urn:li:fsd_profile:1" },
      {
        $type: "com.linkedin.voyager.dash.identity.profile.Profile",
        firstName: "Davide",
        lastName: "Gallo",
        publicIdentifier: "davidegallo",
        headline: "Owner at Gallo Ceramiche",
        profilePicture: { displayImageReference: { vectorImage: { rootUrl: "https://media.licdn.com/dms/image/x/", artifacts: [{ width: 100, fileIdentifyingUrlPathSegment: "100.jpg" }, { width: 400, fileIdentifyingUrlPathSegment: "400.jpg" }] } } },
      },
    ],
  });
  assert.equal(page.elements, 1);
  assert.deepEqual(page.people, [
    { id: "linkedin:davidegallo", network: "linkedin", url: "https://linkedin.com/in/davidegallo", handle: "davidegallo", name: "Davide Gallo", photoUrl: "https://media.licdn.com/dms/image/x/400.jpg", source: "scan", relation: "connection", detail: "Owner at Gallo Ceramiche" },
  ]);
});

test("Facebook friends page: profile links only, once each", () => {
  assert.deepEqual(
    facebookPeople([
      { href: "https://www.facebook.com/ruggiero.carlo", name: "Carlo Ruggiero", img: "https://scontent.xx.fbcdn.net/c.jpg" },
      { href: "https://www.facebook.com/ruggiero.carlo?ref=x", name: "Carlo Ruggiero" },
      { href: "https://www.facebook.com/profile.php?id=1000123&sk=friends", name: "Anna Costa" },
      { href: "https://www.facebook.com/groups/123", name: "Volley" },
      { href: "https://www.facebook.com/friends", name: "Friends" },
      { href: "https://evil.example/ruggiero.carlo", name: "Fake" },
    ]).map((p) => [p.url, p.name, p.photoUrl]),
    [
      ["https://facebook.com/ruggiero.carlo", "Carlo Ruggiero", "https://scontent.xx.fbcdn.net/c.jpg"],
      ["https://facebook.com/profile.php?id=1000123", "Anna Costa", undefined],
    ]
  );
});

test("sign-in pages and limits stop the scan; pauses vary", () => {
  assert.equal(blockedReason(200, "https://www.instagram.com/accounts/login/?next=/"), "signin");
  assert.equal(blockedReason(200, "https://www.instagram.com/api/v1/x", '{"message":"checkpoint_required"}'), "limited");
  assert.equal(blockedReason(429, "https://www.instagram.com/api/v1/x"), "limited");
  assert.equal(blockedReason(999, "https://www.linkedin.com/voyager/api/x"), "limited");
  assert.equal(blockedReason(200, "https://www.facebook.com/checkpoint/123"), "signin");
  assert.equal(blockedReason(200, "https://www.facebook.com/me/friends"), undefined);
  assert.equal(pause(3000, 7000, () => 0.5), 5000);
});
