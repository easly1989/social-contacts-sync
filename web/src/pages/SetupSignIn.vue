<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ArrowLeft, ArrowRight, CircleCheck, TriangleAlert } from "lucide-vue-next";

import FlowFrame from "../components/FlowFrame.vue";
import { nextDesktopStep } from "../desktopFlow";
import { GoogleAccount, SessionStatus } from "../../../interfaces/api";

// Mockup 1.3 in issue #8. In the desktop app Google's page opens in the
// system browser; the server moves this window to ?connected=1 when done.
const route = useRoute();
const router = useRouter();
const waiting = ref(false);
const account = ref<GoogleAccount>();
const status = ref<SessionStatus>();

async function refresh(): Promise<void> {
  status.value = await fetch("/api/status", { credentials: "include" }).then((r) => r.json());
  if (!status.value?.googleConnected) return;
  waiting.value = false;
  account.value = await fetch("/api/google_account", { credentials: "include" })
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
}

async function signOut(): Promise<void> {
  await fetch("/api/desktop/google_sign_out", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  account.value = undefined;
}

function signIn(): void {
  waiting.value = true;
  window.location.href = "/api/google_auth_start?return=" + encodeURIComponent("/setup/signin?connected=1");
}

onMounted(refresh);
watch(() => route.query.connected, refresh);
</script>

<template>
  <FlowFrame step="signin">
    <div class="mx-auto max-w-lg py-4 text-center">
      <div class="mx-auto grid size-16 place-items-center rounded-2xl border border-base-300 bg-base-100">
        <img class="size-8" alt="" src="/google_logo.svg" />
      </div>
      <h1 class="mt-6 text-2xl font-bold tracking-tight">{{ $t("setup.signin.title") }}</h1>
      <p class="mt-2 text-sm text-base-content/70">{{ $t("setup.signin.lead") }}</p>

      <!-- Google stopped accepting the saved sign-in: say why, and how to stop it happening. -->
      <div v-if="status?.googleExpired && !account" class="mt-6 rounded-box border border-warning/40 bg-warning/10 p-5 text-left text-sm" role="alert" data-testid="signin-expired">
        <div class="flex items-center gap-2 font-semibold"><TriangleAlert class="size-4 shrink-0 text-warning" />{{ $t("setup.signin.expiredTitle") }}</div>
        <p class="mt-1.5 text-base-content/80">{{ $t("setup.signin.expiredText") }}</p>
        <p class="mt-2 text-xs text-base-content/60">{{ $t("setup.signin.expiredTip") }}</p>
      </div>

      <div v-if="account" class="mt-8 flex items-center gap-4 rounded-box border border-success/30 bg-success/5 p-5 text-left" role="status">
        <img v-if="account.photoUrl" :src="account.photoUrl" alt="" class="size-12 rounded-full" referrerpolicy="no-referrer" />
        <div class="flex-1">
          <div class="font-semibold">{{ account.email ? $t("setup.signin.connected", { email: account.email }) : $t("setup.sources.connected") }}</div>
          <div v-if="account.totalContacts !== undefined" class="text-sm text-base-content/60">
            {{ $t("setup.signin.contacts", { count: account.totalContacts.toLocaleString() }) }}
          </div>
        </div>
        <CircleCheck class="size-6 text-success" />
      </div>
      <button v-if="account" type="button" class="btn btn-ghost btn-xs mt-2 text-base-content/60" @click="signOut">{{ $t("setup.signin.signOut") }}</button>
      <div v-else-if="waiting" class="mt-8 rounded-box border border-base-300 p-6">
        <span class="loading loading-dots loading-md text-primary"></span>
        <div class="mt-2 font-semibold">{{ $t("setup.signin.waiting") }}</div>
        <div class="mt-1 text-sm text-base-content/60">{{ $t("setup.signin.unverified") }}</div>
        <div class="mt-4 flex justify-center gap-2">
          <button type="button" class="btn btn-sm" @click="signIn">{{ $t("setup.signin.again") }}</button>
          <button type="button" class="btn btn-ghost btn-sm" @click="waiting = false">{{ $t("setup.signin.cancel") }}</button>
        </div>
      </div>
      <button v-else id="signin-button" type="button" class="btn btn-primary mt-8 gap-3" @click="signIn">
        <span class="grid size-6 place-items-center rounded-full bg-white"><img class="size-4" alt="" src="/google_logo.svg" /></span>
        {{ $t("setup.signin.button") }}
      </button>
      <p class="mt-4 text-xs text-base-content/50">{{ $t("setup.signin.note") }}</p>
    </div>

    <template #actions>
      <router-link to="/setup/google" class="btn btn-ghost"><ArrowLeft class="size-4" />{{ $t("common.back") }}</router-link>
      <span class="flex-1"></span>
      <!-- Signing in again after an expired sign-in: straight back to the app when it's set up. -->
      <button type="button" class="btn btn-primary" :disabled="!account" @click="router.push(status ? nextDesktopStep(status) : '/setup/sources')">
        {{ $t("common.continue") }}<ArrowRight class="size-4" />
      </button>
    </template>
  </FlowFrame>
</template>
