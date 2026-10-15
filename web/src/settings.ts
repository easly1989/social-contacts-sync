import { ref } from "vue";
import { Deferred } from "./deferred";
import { SessionStatus } from "../../interfaces/api";

export const enforcePayments: Deferred<boolean> = new Deferred();
/** Reactive copy of the server's payment setting, for templates. */
export const paymentsEnforced = ref(false);
/** Running inside the desktop app (from the server's status). */
export const isDesktop = ref(false);
/** The latest /api/status answer: the app frame asks for a Google sign-in when it's gone. */
export const sessionStatus = ref<SessionStatus>();

export function setEnforcePayments(value: boolean): void {
  enforcePayments.resolve(value);
  paymentsEnforced.value = value;
}

/** Keeps the app-wide settings in line with the latest /api/status answer. */
export function applyStatus(status: SessionStatus): void {
  setEnforcePayments(status.enforcePayments);
  isDesktop.value = Boolean(status.desktop);
  sessionStatus.value = status;
}
