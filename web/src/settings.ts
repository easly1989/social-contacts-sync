import { ref } from "vue";
import { Deferred } from "./deferred";

export const enforcePayments: Deferred<boolean> = new Deferred();
/** Reactive copy of the server's payment setting, for templates. */
export const paymentsEnforced = ref(false);

export function setEnforcePayments(value: boolean): void {
  enforcePayments.resolve(value);
  paymentsEnforced.value = value;
}
