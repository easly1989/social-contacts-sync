<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ArrowRight, CircleCheck, Lock, QrCode, SlidersHorizontal } from "lucide-vue-next";

import FlowFrame from "../components/FlowFrame.vue";
import IllustrationPortrait from "../components/IllustrationPortrait.vue";
import { isWsReady } from "../services/ws";
import { SessionStatus } from "../../../interfaces/api";
import { track } from "../analytics";

const sessionStatus = ref<SessionStatus>();
const wsReady = ref(false);

// Illustration only: a few contacts getting their photo.
const sample = [
  ["Giulia Bianchi", "+39 347 120 4507"],
  ["Marco Rossi", "+39 333 812 5517"],
  ["Sofia Esposito", "+39 340 221 6527"],
  ["Luca Romano", "+39 328 309 7537"],
  ["Chiara Colombo", "+39 349 418 8547"],
];

onMounted(() => {
  isWsReady.then((value) => (wsReady.value = value));
  fetch("/api/status", { credentials: "include" })
    .then((res) => res.json())
    .then((data) => (sessionStatus.value = data));
  track(`host_${window.location.host}`);
});
</script>

<template>
  <FlowFrame step="welcome">
    <div class="grid items-center gap-10 md:grid-cols-[1.1fr_1fr] md:gap-12">
      <div>
        <div class="badge badge-soft badge-primary mb-4">{{ $t("home.badge") }}</div>
        <h1 class="text-4xl font-bold leading-tight tracking-tight">{{ $t("home.title") }}</h1>
        <p class="mt-4 text-[15px] leading-relaxed text-base-content/70">{{ $t("home.lead") }}</p>
        <ul class="mt-7 space-y-4 text-sm">
          <li class="flex gap-3">
            <Lock class="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <div class="font-semibold">{{ $t("home.privateTitle") }}</div>
              <div class="text-base-content/60">{{ $t("home.privateText") }}</div>
            </div>
          </li>
          <li class="flex gap-3">
            <SlidersHorizontal class="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <div class="font-semibold">{{ $t("home.controlTitle") }}</div>
              <div class="text-base-content/60">{{ $t("home.controlText") }}</div>
            </div>
          </li>
          <li class="flex gap-3">
            <QrCode class="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <div class="font-semibold">{{ $t("home.howTitle") }}</div>
              <div class="text-base-content/60">{{ $t("home.howText") }}</div>
            </div>
          </li>
        </ul>
      </div>
      <div
        class="flex flex-col gap-2.5 rounded-box border border-base-300 bg-gradient-to-br from-primary/10 via-base-200 to-secondary/10 p-6"
        aria-hidden="true"
      >
        <div
          v-for="([name, phone], i) in sample"
          :key="name"
          class="flex items-center gap-3 rounded-xl border border-base-300 bg-base-100 px-4 py-2.5 shadow-sm"
        >
          <IllustrationPortrait v-if="i < 3" :seed="name" size="size-9" />
          <div v-else class="grid size-9 place-items-center rounded-full bg-base-300 text-sm font-semibold text-base-content/50">
            {{ name[0] }}
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-sm font-semibold">{{ name }}</div>
            <div class="whitespace-nowrap text-xs text-base-content/50">{{ phone }}</div>
          </div>
          <span v-if="i < 3" class="flex items-center gap-1 whitespace-nowrap text-xs font-medium text-success">
            <CircleCheck class="size-3.5" />{{ $t("home.photoAdded") }}
          </span>
          <span v-else class="text-xs text-base-content/40">{{ $t("home.waiting") }}</span>
        </div>
      </div>
    </div>

    <template #actions>
      <span class="flex-1"></span>
      <!-- Disabled until the WebSocket connects, i.e. until the backend is serving. -->
      <router-link to="/contribute" class="btn btn-primary" :class="{ 'btn-disabled': !wsReady }">
        {{ sessionStatus?.whatsappConnected || sessionStatus?.googleConnected ? $t("common.continue") : $t("common.getStarted") }}
        <ArrowRight class="size-4" />
      </router-link>
    </template>
  </FlowFrame>
</template>
