<script setup lang="ts">
import FlowFrame from "../components/FlowFrame.vue";

function signIn(): void {
  window.location.href = "/api/google_auth_start";
}
</script>

<template>
  <FlowFrame step="google">
    <div class="mx-auto max-w-lg py-4 text-center">
      <div class="mx-auto grid size-16 place-items-center rounded-2xl border border-base-300 bg-base-100">
        <img class="size-8" alt="" src="/google_logo.svg" />
      </div>
      <h1 class="mt-6 text-2xl font-bold tracking-tight">{{ $t("google.title") }}</h1>
      <p class="mt-2 text-sm text-base-content/70">{{ $t("google.lead") }}</p>
      <button id="signin-button" type="button" class="btn btn-primary mt-8 gap-3" @click="signIn">
        <span class="grid size-6 place-items-center rounded-full bg-white"><img class="size-4" alt="" src="/google_logo.svg" /></span>
        {{ $t("google.button") }}
      </button>
      <p class="mt-4 text-xs text-base-content/50">{{ $t("google.note") }}</p>
    </div>
  </FlowFrame>
</template>

