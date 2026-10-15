<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { useRoute } from "vue-router";
import { TriangleAlert } from "lucide-vue-next";

import { api } from "../api";
import { sessionStatus } from "../settings";

// Signing in to Google from inside the app, once it's set up: after a
// sign-out, or when Google stopped accepting the saved sign-in. Google's
// page opens in the system browser; this waits for the server to report
// the new sign-in, then reloads the page so it reads the contacts again.
const route = useRoute();
const waiting = ref(false);
let poll: number | undefined;

function signIn(): void {
  waiting.value = true;
  window.location.href = "/api/google_auth_start?return=" + encodeURIComponent(route.fullPath);
  window.clearInterval(poll);
  poll = window.setInterval(async () => {
    const status = await api.status().catch(() => undefined);
    if (status?.googleConnected) {
      window.clearInterval(poll);
      window.location.reload();
    }
  }, 2000);
}

onBeforeUnmount(() => window.clearInterval(poll));
</script>

<template>
  <div class="text-left" data-testid="google-signin">
    <div v-if="sessionStatus?.googleExpired" class="rounded-box border border-warning/40 bg-warning/10 p-4 text-sm" role="alert" data-testid="signin-expired">
      <div class="flex items-center gap-2 font-semibold"><TriangleAlert class="size-4 shrink-0 text-warning" />{{ $t("setup.signin.expiredTitle") }}</div>
      <p class="mt-1.5 text-base-content/80">{{ $t("setup.signin.expiredText") }}</p>
      <p class="mt-2 text-xs text-base-content/60">{{ $t("setup.signin.expiredTip") }}</p>
    </div>
    <div v-if="waiting" class="mt-4 rounded-box border border-base-300 p-4 text-center">
      <span class="loading loading-dots loading-md text-primary"></span>
      <div class="mt-1 text-sm font-semibold">{{ $t("setup.signin.waiting") }}</div>
      <div class="mt-1 text-xs text-base-content/60">{{ $t("setup.signin.unverified") }}</div>
      <div class="mt-3 flex justify-center gap-2">
        <button type="button" class="btn btn-sm" @click="signIn">{{ $t("setup.signin.again") }}</button>
        <button type="button" class="btn btn-ghost btn-sm" @click="waiting = false">{{ $t("setup.signin.cancel") }}</button>
      </div>
    </div>
    <button v-else type="button" class="btn btn-primary mt-4 gap-3" @click="signIn">
      <span class="grid size-6 place-items-center rounded-full bg-white"><img class="size-4" alt="" src="/google_logo.svg" /></span>
      {{ $t("setup.signin.button") }}
    </button>
  </div>
</template>
