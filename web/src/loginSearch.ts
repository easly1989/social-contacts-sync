import { ref } from "vue";

import { storedFlag } from "./profileLinks";
import { ProfileScanState, SocialNetwork } from "../../interfaces/api";

/*
  Searching a contact's name with the login (issue #104), desktop only: the
  sites the app is signed in to, and the notice shown before the first search,
  which goes against those sites' terms like the login scans.
*/

export const loginSearchNetworks = ["instagram", "facebook", "linkedin"] as const satisfies readonly SocialNetwork[];

/** The desktop app's sign-ins, as To review last read them; empty on the web, which has none. */
export const socialLogins = ref<ProfileScanState[]>([]);
export const signedIn = (network: SocialNetwork) => socialLogins.value.some((s) => s.network === network && s.loggedIn);

/** The notice was accepted once. */
export const loginSearchAccepted = storedFlag("scs.loginSearch.accepted", false);

/** The notice waiting for an answer. */
export const loginSearchNotice = ref<{ networks: SocialNetwork[]; answer: (ok: boolean) => void }>();

/** Resolves true once the notice is accepted, at once when it was before. */
export function confirmLoginSearch(networks: SocialNetwork[]): Promise<boolean> {
  if (loginSearchAccepted.value) return Promise.resolve(true);
  return new Promise((resolve) => {
    loginSearchNotice.value = {
      networks,
      answer: (ok) => {
        loginSearchNotice.value = undefined;
        if (ok) loginSearchAccepted.value = true;
        resolve(ok);
      },
    };
  });
}
