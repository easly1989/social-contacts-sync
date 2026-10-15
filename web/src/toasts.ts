import { reactive } from "vue";

import { ApiError } from "./api";

/*
  Toasts (issue #65): bottom right, in a card. A confirmation leaves after
  two seconds, one with an action (Undo) a little later, and an error stays
  until it's closed, with its detail to copy.
*/

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  kind: "success" | "error";
  text: string;
  /** For errors: what went wrong, as it can be copied into a report. */
  detail?: string;
  action?: ToastAction;
}

export const toasts = reactive<Toast[]>([]);
let next = 1;

/** How long a toast stays, in ms; errors stay until closed. */
export function toastDuration(toast: Pick<Toast, "kind" | "action">): number | undefined {
  if (toast.kind === "error") return undefined;
  return toast.action ? 5000 : 2000;
}

function push(toast: Omit<Toast, "id">): number {
  const id = next++;
  toasts.push({ id, ...toast });
  // A few at a time: the oldest go first.
  while (toasts.length > 4) toasts.shift();
  return id;
}

export function notify(text: string, action?: ToastAction): number {
  return push({ kind: "success", text, action });
}

/** The error's own words, for the detail line. */
export function errorDetail(e: unknown): string | undefined {
  if (e instanceof ApiError) return e.detail ?? (e.code ? `${e.code} (HTTP ${e.status})` : e.message);
  if (e instanceof Error) return e.message;
  return e === undefined ? undefined : String(e);
}

export function notifyError(text: string, e?: unknown, detail = errorDetail(e)): number {
  return push({ kind: "error", text, detail });
}

export function dismissToast(id: number): void {
  const index = toasts.findIndex((t) => t.id === id);
  if (index >= 0) toasts.splice(index, 1);
}
