import test from "node:test";
import assert from "node:assert/strict";

import { googleErrorMessage, withGoogleRetry } from "./googleRetry";

const googlePage = `<!DOCTYPE html><html lang=en><meta charset=utf-8><title>Error 502 (Server Error)!!1</title><p><b>502.</b> <ins>That’s an error.</ins>`;
const failure = (status: number, message = googlePage) => Object.assign(new Error(message), { status });

test("a temporary Google error is retried, and then the write goes through", async () => {
  const waits: number[] = [];
  let calls = 0;
  const result = await withGoogleRetry(
    async () => {
      if (++calls < 3) throw failure(calls === 1 ? 502 : 429);
      return "saved";
    },
    [10, 20, 30],
    async (ms) => void waits.push(ms)
  );
  assert.equal(result, "saved");
  assert.deepEqual(waits, [10, 20]);
});

test("the report gets one readable line, not Google's HTML page", async () => {
  const waits: number[] = [];
  await assert.rejects(
    withGoogleRetry(async () => Promise.reject(failure(502)), [10, 20], async (ms) => void waits.push(ms)),
    { message: "Google had a temporary problem (502) and nothing was changed. Try again later." }
  );
  assert.deepEqual(waits, [10, 20]);
  // Other errors aren't retried.
  let calls = 0;
  await assert.rejects(
    withGoogleRetry(async () => Promise.reject(failure(++calls && 400, "Request contains an invalid argument.")), [10]),
    { message: "Request contains an invalid argument." }
  );
  assert.equal(calls, 1);
  assert.equal(googleErrorMessage(failure(404)), "Google returned an error (404).");
});
