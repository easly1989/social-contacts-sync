/*
  Google's People API now and then answers a write with a 5xx or a 429,
  with an HTML page as the message. Photo writes are safe to repeat, so
  they're retried, and what is kept for the report is one readable line.
*/

const retryable = new Set([429, 500, 502, 503, 504]);

export function googleStatus(e: unknown): number | undefined {
  const error = e as { status?: unknown; code?: unknown; response?: { status?: unknown } };
  const status = error?.status ?? error?.response?.status ?? error?.code;
  return typeof status === "number" ? status : Number.isInteger(Number(status)) ? Number(status) : undefined;
}

/** One line for the report, never Google's HTML error page. */
export function googleErrorMessage(e: unknown): string {
  const status = googleStatus(e);
  if (status && retryable.has(status)) return `Google had a temporary problem (${status}) and nothing was changed. Try again later.`;
  const message = e instanceof Error ? e.message : String(e);
  const text = /<\w|<!doctype/i.test(message) ? "" : message.replace(/\s+/g, " ").trim();
  const line = text.length > 200 ? `${text.slice(0, 199)}…` : text;
  return line || `Google returned an error${status ? ` (${status})` : ""}.`;
}

export async function withGoogleRetry<T>(
  call: () => Promise<T>,
  delays: number[] = [2000, 8000, 30000],
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (e) {
      const status = googleStatus(e);
      if (attempt >= delays.length || !status || !retryable.has(status)) throw Object.assign(new Error(googleErrorMessage(e)), { cause: e });
      await sleep(delays[attempt]);
    }
  }
}
