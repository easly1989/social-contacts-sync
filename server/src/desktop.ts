import { NextFunction, Request, Response } from "express";

/*
  Desktop mode: the server runs inside the Electron app (SCS_DESKTOP=1) as a
  utility process, bound to 127.0.0.1, for a single user.
*/

export const desktopMode = process.env.SCS_DESKTOP === "1";

interface ParentPort {
  postMessage(message: unknown): void;
  on(event: "message", listener: (event: { data: any }) => void): void;
}

// Electron's channel to the main process; absent outside the desktop app.
// Tests stand in for the main process over Node's IPC (SCS_DESKTOP_IPC=1).
const parentPort: ParentPort | undefined =
  (process as unknown as { parentPort?: ParentPort }).parentPort ??
  (process.env.SCS_DESKTOP_IPC === "1" && process.send
    ? {
        postMessage: (message) => process.send!(message),
        on: (_event, listener) => process.on("message", (data) => listener({ data })),
      }
    : undefined);

let nextRequestId = 1;
const pendingRequests = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();

parentPort?.on("message", ({ data }) => {
  if (data?.type !== "reply") return;
  const request = pendingRequests.get(data.id);
  if (!request) return;
  pendingRequests.delete(data.id);
  if (data.error) request.reject(new Error(data.error));
  else request.resolve(data.value);
});

/**
 * Asks the desktop app's main process, which owns config.env, the file
 * manager, updates and the data folder (see desktop/src/main.ts).
 */
export function askDesktop<T = void>(request: string, payload: Record<string, unknown> = {}, timeoutMs = 5000): Promise<T> {
  const port = parentPort;
  if (!port) return Promise.reject(new Error("Not running inside the desktop app."));
  const id = nextRequestId++;
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    port.postMessage({ type: "request", id, request, payload });
    setTimeout(() => {
      if (pendingRequests.delete(id)) reject(new Error("The desktop app did not answer."));
    }, timeoutMs);
  });
}

/** Asks the desktop app, the only writer of config.env, to save `values`. */
export function saveDesktopConfig(values: Record<string, string>): Promise<void> {
  return askDesktop("save-config", { values });
}

/**
 * The local server can be reached by any page open in the user's browser.
 * Refuse requests the browser marks as cross-site, except Google's redirect
 * back to the OAuth callback.
 */
export function crossSiteGuard(req: Request, res: Response, next: NextFunction): void {
  if (req.get("sec-fetch-site") === "cross-site" && req.path !== "/google_callback") {
    res.status(403).send("Forbidden");
    return;
  }
  next();
}

/** A same-app path to return to after sign-in, or undefined. */
export function safeReturnPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!/^\/[A-Za-z0-9/_?=&.-]*$/.test(value) || value.startsWith("//") || value.startsWith("/api")) return undefined;
  return value;
}
