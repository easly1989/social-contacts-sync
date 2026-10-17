import test from "node:test";
import assert from "node:assert/strict";

import { PhotoPin } from "../../../interfaces/api";
import { photoHash } from "../contacts/photoPins";
import { SimpleContact } from "../interfaces";
import { linksSource, Pacer } from "../sources/links";
import { runSync, SyncTarget } from "../syncEngine";
import { planRereads, ReadProfile, rereading, StoredRead } from "./rereads";

// Pinned Instagram and Facebook profiles read again with the login (issue #79), against a fake desktop app.
const at = (minute: number) => `2026-10-01T00:${String(minute).padStart(2, "0")}:00.000Z`;
const pin = (matchedBy: string, extra: Partial<PhotoPin> = {}): PhotoPin => ({ source: "links", matchedBy, readAt: at(0), ...extra });

test("the plan: per network the profiles read longest ago, never read first, up to the cap", () => {
  const pins = {
    a: pin("instagram.com/anna"),
    b: pin("instagram.com/bruno"),
    c: pin("instagram.com/carla"),
    d: pin("facebook.com/davide.gallo"),
    e: pin("x.com/elena"), // read anonymously, not with the login
    f: pin("instagram.com/fede", { suspended: true }),
    g: { source: "gravatar", readAt: at(0) } as PhotoPin,
    h: pin("instagram.com/anna"), // the same profile twice
  };
  const reads: Record<string, StoredRead> = { "https://instagram.com/anna": { readAt: at(5) }, "https://instagram.com/bruno": { readAt: at(1) } };
  const plan = planRereads(pins, reads, 2);
  assert.deepEqual([...plan.selected].sort(), ["https://facebook.com/davide.gallo", "https://instagram.com/bruno", "https://instagram.com/carla"]);
  assert.deepEqual(plan.waiting, { instagram: 1, facebook: 0 });
});

test("LinkedIn profiles are read only when the setting leaves them on (issue #80)", () => {
  const pins = { a: pin("linkedin.com/in/davidegallo"), b: pin("instagram.com/anna") };
  assert.deepEqual([...planRereads(pins, {}, 10).selected].sort(), ["https://instagram.com/anna", "https://linkedin.com/in/davidegallo"]);
  assert.deepEqual([...planRereads(pins, {}, 10, ["instagram", "facebook"]).selected], ["https://instagram.com/anna"]);
});

const image = (n: number) => Buffer.alloc(1000, n);
const fetchImpl = (async (url: string) =>
  new Response(new Uint8Array(image(Number(/v(\d+)/.exec(url)?.[1] ?? 0))), { headers: { "content-type": "image/jpeg" } })) as typeof fetch;

function contact(id: string, handle: string, photo: number): SimpleContact {
  return {
    id,
    name: handle,
    numbers: [],
    urls: [`https://instagram.com/${handle}`],
    hasPhoto: true,
    photoUrl: `https://photos.example/${id}/v1=s100`,
    pin: pin(`instagram.com/${handle}`, { network: "Instagram", hash: photoHash(image(photo).toString("base64")), photoKey: `https://photos.example/${id}/v1` }),
  };
}

async function sync(contacts: SimpleContact[], answers: Record<string, Awaited<ReturnType<ReadProfile>>>, cap = 10) {
  const reads: Record<string, StoredRead> = {};
  const scanned: Record<string, string> = Object.fromEntries(contacts.map((c) => [c.urls![0], "https://cdn.example/v1.jpg"]));
  const asked: string[] = [];
  const waits: number[] = [];
  const inner = linksSource({ fetchImpl, pacer: new Pacer(() => 0), storedPhoto: (link) => reads[link.url]?.photoUrl ?? scanned[link.url] });
  const pins = Object.fromEntries(contacts.map((c) => [c.id, c.pin!]));
  const rereads = rereading(inner, planRereads(pins, reads, cap), async (network, handle) => (asked.push(`${network}:${handle}`), answers[handle] ?? { missing: true }), {
    sleep: async (ms) => void waits.push(ms),
    random: () => 0.5,
    record: (url, read) => void (reads[url] = read),
  });
  const writes: string[] = [];
  const target: SyncTarget = {
    listContacts: async () => contacts,
    currentPhoto: async () => "old",
    setPhoto: async (id) => void writes.push(id),
    savePin: () => {},
  };
  const { run } = await runSync(target, [rereads.source], "fill", { progress: () => {}, cancelled: () => false }, { shuffle: false });
  return { run, asked, waits, writes, reads, report: rereads.report() };
}

test("a changed photo is written, an unchanged one isn't; reads are spaced out", async () => {
  const { asked, writes, reads, report, waits } = await sync([contact("c/anna", "anna", 1), contact("c/bruno", "bruno", 1)], {
    anna: { profile: { name: "Anna", photoUrl: "https://cdn.example/v2.jpg" } },
    bruno: { profile: { name: "Bruno", photoUrl: "https://cdn.example/v1.jpg" } },
  });
  assert.deepEqual(asked, ["instagram:anna", "instagram:bruno"]);
  assert.deepEqual(writes, ["c/anna"]);
  assert.equal(reads["https://instagram.com/anna"].photoUrl, "https://cdn.example/v2.jpg");
  assert.deepEqual(report, { instagram: { read: 2, waiting: 0 } });
  // The second read waits for the rest of the 3–7 seconds (5 with this random).
  assert.equal(waits.length, 1);
  assert.ok(waits[0] > 4000 && waits[0] <= 5000);
});

test("a limit stops that network for the rest of the sync; the others wait, with the reason in the run", async () => {
  const { asked, writes, report } = await sync(
    [contact("c/anna", "anna", 1), contact("c/bruno", "bruno", 1), contact("c/carla", "carla", 1)],
    { anna: { profile: { photoUrl: "https://cdn.example/v1.jpg" } }, bruno: { stopped: "limited" } },
    2
  );
  assert.deepEqual(asked, ["instagram:anna", "instagram:bruno"]);
  assert.deepEqual(writes, []);
  // Bruno hit the limit and Carla was over the cap: both wait.
  assert.deepEqual(report, { instagram: { read: 1, waiting: 2, stopped: "limited" } });
});

test("a missing profile keeps the photo a scan read", async () => {
  const { writes, reads, report } = await sync([contact("c/anna", "anna", 1)], {});
  assert.deepEqual(writes, []);
  assert.equal(reads["https://instagram.com/anna"].photoUrl, undefined);
  assert.deepEqual(report, { instagram: { read: 1, waiting: 0 } });
});
