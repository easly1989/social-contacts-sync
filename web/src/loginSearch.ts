import { ref } from "vue";

import { api } from "./api";
import { storedFlag } from "./profileLinks";
import { addHandler } from "./services/ws";
import { isDesktop } from "./settings";
import { EventType, ProfileScanState, SocialNetwork } from "../../interfaces/api";

/*
  Searching a contact's name with the login (issue #104), desktop only: the
  sites the app is signed in to, and the notice shown before the first search,
  which goes against those sites' terms like the login scans.
*/

export const loginSearchNetworks = ["instagram", "facebook", "linkedin"] as const satisfies readonly SocialNetwork[];

/** The desktop app's sign-ins, as To review last read them; empty on the web, which has none. */
export const socialLogins = ref<ProfileScanState[]>([]);
export const signedIn = (network: SocialNetwork) => socialLogins.value.some((s) => s.network === network && s.loggedIn);
export const loginOf = (network: string) => socialLogins.value.find((s) => s.network === network);

/** Reads the sign-ins again (issue #107): the state shown is never an old answer. */
export async function refreshLogins(): Promise<void> {
  if (!isDesktop.value) return;
  socialLogins.value = await api.socialLogins().catch(() => socialLogins.value);
}

// The desktop app says at once when a site signs it in or out (issue #107).
addHandler(EventType.LoginChanged, (state: ProfileScanState) => {
  const others = socialLogins.value.filter((s) => s.network !== state.network);
  const known = socialLogins.value.find((s) => s.network === state.network);
  socialLogins.value = [...others, { ...known, ...state, ...(state.loggedIn ? { closedAt: undefined } : {}) }];
});

/** Opens the site's sign-in window; resolves once it's closed, with the sign-ins read again. */
export async function signInTo(network: SocialNetwork): Promise<void> {
  await api.profileScan("login", network).catch(() => undefined);
  await refreshLogins();
}

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
