import test from "node:test";
import assert from "node:assert/strict";

import {
  blockedReason,
  browserUserAgent,
  facebookPeople,
  facebookProfile,
  FacebookProfilePage,
  facebookSearch,
  instagramPage,
  instagramPageProfile,
  instagramProfile,
  instagramSearch,
  isAbortedLoad,
  linkedinPage,
  linkedinProfile,
  linkedinSearch,
  pause,
  profilePageUrl,
  searchPath,
  siteAnswer,
  sessionChange,
} from "./socialParse";

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

test("one Instagram profile (issue #79): the largest photo and the name, nothing for a missing profile", () => {
  assert.deepEqual(
    instagramProfile({ data: { user: { username: "davide.gallo", full_name: "Davide Gallo", profile_pic_url: "https://scontent.cdninstagram.com/s150.jpg", profile_pic_url_hd: "https://scontent.cdninstagram.com/s320.jpg" } }, status: "ok" }),
    { name: "Davide Gallo", photoUrl: "https://scontent.cdninstagram.com/s320.jpg" }
  );
  assert.deepEqual(instagramProfile({ data: { user: { full_name: "", profile_pic_url: "https://scontent.cdninstagram.com/s150.jpg" } } }), { name: undefined, photoUrl: "https://scontent.cdninstagram.com/s150.jpg" });
  assert.equal(instagramProfile({ data: { user: null }, status: "ok" }), undefined);
  assert.equal(instagramProfile("nope"), undefined);
});

test("one Facebook profile (issue #79): the profile picture is the header's SVG picture, the name its heading", () => {
  const page: FacebookProfilePage = {
    heading: "Davide Gallo",
    images: [
      { src: "https://scontent.xx.fbcdn.net/small.jpg", width: 40, svg: true },
      { src: "https://scontent.xx.fbcdn.net/profile.jpg", width: 168, svg: true },
      // The cover, or without one a blurred copy of the profile picture (issue #104): larger, but not the picture.
      { src: "https://scontent.xx.fbcdn.net/cover-blurred.jpg", width: 940, svg: false },
      { src: "http://insecure.example/big.jpg", width: 400, svg: true },
      { src: "https://static.example.com/other.png", width: 300, svg: true },
    ],
  };
  assert.deepEqual(facebookProfile(page), { name: "Davide Gallo", photoUrl: "https://scontent.xx.fbcdn.net/profile.jpg" });
  assert.equal(facebookProfile({ heading: "", images: [{ src: "https://scontent.xx.fbcdn.net/small.jpg", width: 40, svg: true }] }), undefined);
  // Only a cover: no profile picture rather than a blurred one.
  assert.equal(facebookProfile({ heading: "Davide Gallo", images: [{ src: "https://scontent.xx.fbcdn.net/cover.jpg", width: 940, svg: false }] }), undefined);
});

test("profile addresses the desktop app reads (issue #79): only a plain handle", () => {
  assert.equal(profilePageUrl("instagram", "davide.gallo"), "https://www.instagram.com/davide.gallo/");
  assert.equal(profilePageUrl("facebook", "davide.gallo"), "https://www.facebook.com/davide.gallo");
  assert.equal(profilePageUrl("facebook", "100012345"), "https://www.facebook.com/profile.php?id=100012345");
  assert.equal(profilePageUrl("instagram", "../accounts"), undefined);
  assert.equal(profilePageUrl("facebook", "a/b"), undefined);
  assert.equal(profilePageUrl("linkedin", "davidegallo"), "https://www.linkedin.com/in/davidegallo/");
  assert.equal(profilePageUrl("linkedin", "../feed"), undefined);
  assert.equal(profilePageUrl("x", "davide"), undefined);
});

test("one LinkedIn profile (issue #80): the profile asked for, with its largest picture", () => {
  const picture = { displayImageReference: { vectorImage: { rootUrl: "https://media.licdn.com/dms/image/d/", artifacts: [{ width: 200, fileIdentifyingUrlPathSegment: "200.jpg" }, { width: 800, fileIdentifyingUrlPathSegment: "800.jpg" }] } } };
  const answer = {
    data: { "*elements": ["urn:li:fsd_profile:1"] },
    included: [
      { $type: "com.linkedin.voyager.dash.identity.profile.Profile", publicIdentifier: "someone-else", firstName: "Someone", profilePicture: picture },
      { $type: "com.linkedin.voyager.dash.identity.profile.Profile", publicIdentifier: "DavideGallo", firstName: "Davide", lastName: "Gallo", profilePicture: picture },
    ],
  };
  assert.deepEqual(linkedinProfile(answer, "davidegallo"), { name: "Davide Gallo", photoUrl: "https://media.licdn.com/dms/image/d/800.jpg" });
  // Without a picture: the name only. Not in the answer: nothing.
  assert.deepEqual(linkedinProfile({ elements: [{ publicIdentifier: "davidegallo", firstName: "Davide" }] }, "davidegallo"), { name: "Davide", photoUrl: undefined });
  assert.equal(linkedinProfile(answer, "nobody"), undefined);
  assert.equal(linkedinProfile("nope", "davidegallo"), undefined);
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

test("Facebook friends page: the picture link and the name link meet by profile (issue #71)", () => {
  assert.deepEqual(
    facebookPeople([
      // The picture's link comes first and has no text.
      { href: "https://www.facebook.com/elisa.tasini?__cft__=abc", name: "", img: "https://scontent-mxp1-1.xx.fbcdn.net/v/t39.30808-1/e.jpg?oe=1" },
      { href: "https://www.facebook.com/elisa.tasini?__cft__=abc", name: "Elisa Tasini" },
      { href: "https://www.facebook.com/profile.php?id=1570023761&__tn__=R", name: "", img: "https://scontent-mxp1-1.xx.fbcdn.net/v/p.jpg" },
      { href: "https://www.facebook.com/profile.php?id=1570023761", name: "Francesco Pimpinelli" },
      // A picture that isn't https is not kept.
      { href: "https://www.facebook.com/manuel.girometti", name: "", img: "data:image/gif;base64,R0lGOD" },
      { href: "https://www.facebook.com/manuel.girometti", name: "Manuel Girometti" },
    ]).map((p) => [p.url, p.name, p.photoUrl]),
    [
      ["https://facebook.com/elisa.tasini", "Elisa Tasini", "https://scontent-mxp1-1.xx.fbcdn.net/v/t39.30808-1/e.jpg?oe=1"],
      ["https://facebook.com/profile.php?id=1570023761", "Francesco Pimpinelli", "https://scontent-mxp1-1.xx.fbcdn.net/v/p.jpg"],
      ["https://facebook.com/manuel.girometti", "Manuel Girometti", undefined],
    ]
  );
});

test("the sites see Chrome, and a redirect isn't a failed load (issue #65)", () => {
  const electron =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) social-contacts-sync/1.3.1 Chrome/142.0.7444.59 Electron/44.5.1 Safari/537.36";
  assert.equal(browserUserAgent(electron), "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7444.59 Safari/537.36");
  const chrome = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
  assert.equal(browserUserAgent(chrome), chrome);
  assert.ok(isAbortedLoad(new Error("ERR_ABORTED (-3) loading 'https://www.facebook.com/me/friends'")));
  assert.ok(!isAbortedLoad(new Error("ERR_NAME_NOT_RESOLVED (-105) loading 'https://www.facebook.com/'")));
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

test("Instagram's 'Please wait' with require_login asks to sign in, not to slow down", () => {
  const body = '{"message":"Please wait a few minutes before you try again.","require_login":true,"status":"fail"}';
  assert.equal(blockedReason(429, "https://www.instagram.com/api/v1/users/web_profile_info/?username=x", body), "signin");
  assert.equal(blockedReason(401, "https://www.instagram.com/api/v1/x", body), "signin");
  assert.equal(blockedReason(429, "https://www.instagram.com/api/v1/x", '{"message":"Please wait a few minutes before you try again.","status":"fail"}'), "limited");
});

test("the site's answer is kept short: the status and its message", () => {
  assert.equal(siteAnswer(429, '{"message":"Please wait a few minutes before you try again.","status":"fail"}'), "HTTP 429: Please wait a few minutes before you try again.");
  assert.equal(siteAnswer(400, '{"status":"fail","require_login":true}'), 'HTTP 400: {"status":"fail","require_login":true}');
  assert.equal(siteAnswer(500, "<html><head><title>Error</title></head><body><script>var x=1</script></body></html>"), "HTTP 500: Error");
  assert.equal(siteAnswer(503), "HTTP 503");
  assert.equal(siteAnswer(429, "x".repeat(500)).length, "HTTP 429: ".length + 200);
});

test("Instagram profile page: the picture and name from its og tags", () => {
  const page = (ogImage: string, ogTitle = "") => ({ ogImage, ogTitle, text: "" });
  assert.deepEqual(instagramPageProfile(page("https://scontent-mxp2-1.cdninstagram.com/v/t51/p.jpg?stp=s150x150", "Elisa Tasini (@elisa.tasini) • Instagram photos and videos")), {
    name: "Elisa Tasini",
    photoUrl: "https://scontent-mxp2-1.cdninstagram.com/v/t51/p.jpg?stp=s150x150",
  });
  assert.deepEqual(instagramPageProfile(page("https://instagram.fmxp1-1.fna.fbcdn.net/v/p.jpg", "@solo.handle")), { name: undefined, photoUrl: "https://instagram.fmxp1-1.fna.fbcdn.net/v/p.jpg" });
  // Instagram's own logo, or nothing: no picture there.
  assert.equal(instagramPageProfile(page("https://static.cdninstagram.com/rsrc.php/v4/yG/r/logo.png")), undefined);
  assert.equal(instagramPageProfile(page("")), undefined);
});

test("searching a name with the login: at most five people per site (issue #104)", () => {
  // /api/v1/fbsearch/account_serp/: the users themselves, not wrapped (the old topsearch answers 404 since 2026-10).
  const users = Array.from({ length: 7 }, (_, i) => ({ pk: String(i), username: `anna.r${i}`, full_name: "Anna Rossi", profile_pic_url: `https://scontent.cdninstagram.com/${i}.jpg` }));
  const ig = instagramSearch({ num_results: 8, users: [{ username: "bad name!" }, ...users], has_more: false, status: "ok" });
  assert.equal(ig.length, 5);
  assert.deepEqual(ig[0], { id: "instagram:anna.r0", network: "instagram", url: "https://instagram.com/anna.r0", handle: "anna.r0", name: "Anna Rossi", photoUrl: "https://scontent.cdninstagram.com/0.jpg", source: "loginSearch" });
  assert.deepEqual(instagramSearch({ status: "fail" }), []);

  // /voyager/api/search/dash/clusters (the old typeahead answers 404): one EntityResultViewModel per person.
  const result = (handle: string, name: string, rootUrl?: string) => ({
    $type: "com.linkedin.voyager.dash.search.EntityResultViewModel",
    navigationUrl: `https://www.linkedin.com/in/${handle}?miniProfileUrn=urn%3Ali%3Afs_miniProfile%3AACoAA`,
    title: { text: name },
    primarySubtitle: { text: "Architect" },
    image: { attributes: [{ detailDataUnion: { nonEntityProfilePicture: { "*profile": "urn:li:fsd_profile:ACoAA", vectorImage: { rootUrl, artifacts: [{ width: 100, fileIdentifyingUrlPathSegment: "100.jpg" }, { width: 400, fileIdentifyingUrlPathSegment: "400.jpg" }] } } } }] },
  });
  const li = linkedinSearch({
    data: { elements: [{ items: [{ itemUnion: { "*entityResult": "urn:li:fsd_entityResultViewModel:1" } }] }] },
    included: [
      { $type: "com.linkedin.voyager.dash.identity.profile.Profile", entityUrn: "urn:li:fsd_profile:ACoAA" },
      result("anna-rossi-1a2b", "Anna Rossi", "https://media.licdn.com/dms/image/x/"),
      result("anna-rossi-1a2b", "Anna Rossi"),
      result("mario-bianchi", "Mario Bianchi"),
      // The search answers with an empty rootUrl and the whole address in the segment.
      {
        ...result("sara-verdi", "Sara Verdi", ""),
        image: { attributes: [{ detailDataUnion: { nonEntityProfilePicture: { vectorImage: { rootUrl: "", artifacts: [{ width: 100, fileIdentifyingUrlPathSegment: "https://media.licdn.com/dms/image/y/100.jpg" }] } } } }] },
      },
      { $type: "com.linkedin.voyager.dash.search.EntityResultViewModel", navigationUrl: "https://www.linkedin.com/company/acme/", title: { text: "Acme" } },
    ],
  });
  assert.deepEqual(li, [
    { id: "linkedin:anna-rossi-1a2b", network: "linkedin", url: "https://linkedin.com/in/anna-rossi-1a2b", handle: "anna-rossi-1a2b", name: "Anna Rossi", photoUrl: "https://media.licdn.com/dms/image/x/400.jpg", source: "loginSearch", detail: "Architect" },
    // No picture: LinkedIn's placeholder has no address.
    { id: "linkedin:mario-bianchi", network: "linkedin", url: "https://linkedin.com/in/mario-bianchi", handle: "mario-bianchi", name: "Mario Bianchi", photoUrl: undefined, source: "loginSearch", detail: "Architect" },
    { id: "linkedin:sara-verdi", network: "linkedin", url: "https://linkedin.com/in/sara-verdi", handle: "sara-verdi", name: "Sara Verdi", photoUrl: "https://media.licdn.com/dms/image/y/100.jpg", source: "loginSearch", detail: "Architect" },
  ]);

  const fb = facebookSearch([
    { href: "https://www.facebook.com/profile.php?id=1000", name: "Me Myself", img: "https://scontent.fbcdn.net/me.jpg" },
    { href: "https://www.facebook.com/anna.rossi.77", name: "", img: "https://scontent.fbcdn.net/a.jpg" },
    { href: "https://www.facebook.com/anna.rossi.77", name: "Anna Rossi" },
    { href: "https://www.facebook.com/groups/annarossi", name: "Anna Rossi fan club" },
  ], "1000");
  assert.deepEqual(fb, [{ id: "facebook:anna.rossi.77", network: "facebook", url: "https://facebook.com/anna.rossi.77", handle: "anna.rossi.77", name: "Anna Rossi", photoUrl: "https://scontent.fbcdn.net/a.jpg", source: "loginSearch" }]);

  assert.equal(searchPath("instagram", " Anna Rossi "), "/api/v1/fbsearch/account_serp/?query=Anna%20Rossi");
  assert.equal(
    searchPath("linkedin", "Anna (Rossi), Jr"),
    "/voyager/api/search/dash/clusters?decorationId=com.linkedin.voyager.dash.deco.search.SearchClusterCollection-174&origin=GLOBAL_SEARCH_HEADER&q=all&query=(keywords:Anna%20Rossi%20Jr,flagshipSearchIntent:SEARCH_SRP,queryParameters:(resultType:List(PEOPLE)))&start=0&count=10"
  );
  assert.equal(searchPath("facebook", "Anna & co"), "https://www.facebook.com/search/people/?q=Anna%20%26%20co");
});

test("a site's session cookie tells when it signs the app in or out; a refresh doesn't count (issue #107)", () => {
  assert.equal(sessionChange("li_at", "li_at", "explicit", false), true);
  assert.equal(sessionChange("li_at", "li_at", "overwrite", true), undefined);
  assert.equal(sessionChange("li_at", "li_at", "expired-overwrite", true), false);
  assert.equal(sessionChange("li_at", "li_at", "explicit", true), false);
  assert.equal(sessionChange("JSESSIONID", "li_at", "explicit", true), undefined);
});
