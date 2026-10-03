<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { ArrowRight, CircleAlert, CircleCheck, Coffee, ImagePlus, Keyboard, Users } from "lucide-vue-next";

import FlowFrame from "../components/FlowFrame.vue";
import { EventType, SyncProgress } from "../../../interfaces/api";
import { addHandler, sendEvent } from "../services/ws";
import { track } from "../analytics";

interface ManualSyncData {
  existingPhoto: string | null;
  newPhoto: string;
  contactName: string | null;
}

const shownImages = 9;

const progress = ref(0);
const syncCount = ref(0);
const totalContacts = ref<number>();
const images = ref<string[]>([]);
const errorMessage = ref<string>();
const disconnected = ref(false);
const lastSyncReceived = ref<number | null>(null);
const isManualSync = ref<boolean | undefined>(false);
const isManualSyncLoading = ref<boolean | undefined>(false);
const manualSyncData = ref<ManualSyncData | null>(null);
let totalContactsTracked = false;
let disconnectTimer: number | undefined;

const done = computed(() => progress.value === 100);
const reviewing = computed(() => isManualSync.value && !isManualSyncLoading.value && !done.value);
const hiddenCount = computed(() => Math.max(0, syncCount.value - shownImages));

function photo(base64: string): string {
  return "data:image/jpeg;base64, " + base64;
}

function onSyncProgress(update: SyncProgress): void {
  if (!totalContactsTracked) {
    track("num_contacts_synced", { value: update.totalContacts });
    totalContactsTracked = true;
  }
  lastSyncReceived.value = Date.now();
  progress.value = update.progress;
  syncCount.value = update.syncCount;
  if (update.totalContacts !== undefined) totalContacts.value = update.totalContacts;
  errorMessage.value = update.error;
  isManualSync.value = update.isManualSync;
  if (update.image) {
    images.value.push(update.image);
    if (images.value.length > shownImages) images.value.shift();
  }
}

function onSyncConfirm(data: ManualSyncData): void {
  manualSyncData.value = data;
  isManualSyncLoading.value = false;
}

function answer(accept: boolean): void {
  isManualSyncLoading.value = true;
  manualSyncData.value = null;
  sendEvent(EventType.SyncPhotoConfirm, { accept });
}

function onKey(event: KeyboardEvent): void {
  if (!reviewing.value || !manualSyncData.value) return;
  if (event.key === "ArrowLeft") answer(false);
  else if (event.key === "Enter") answer(true);
}

function checkServerDisconnected(): void {
  disconnected.value =
    !!lastSyncReceived.value && !done.value && Date.now() - lastSyncReceived.value > 30 * 1000;
}

onMounted(() => {
  addHandler(EventType.SyncProgress, onSyncProgress);
  addHandler(EventType.SyncConfirm, onSyncConfirm);
  fetch(`/api/init_sync${window.location.search}`, { credentials: "include" });
  disconnectTimer = window.setInterval(checkServerDisconnected, 5 * 1000);
  window.addEventListener("keydown", onKey);
});

onUnmounted(() => {
  window.clearInterval(disconnectTimer);
  window.removeEventListener("keydown", onKey);
});
</script>

<template>
  <FlowFrame step="sync" wide>
    <div class="flex flex-wrap items-start gap-4">
      <div class="flex-1">
        <h1 class="text-2xl font-bold tracking-tight">
          {{ done ? $t("sync.titleDone") : isManualSync ? $t("sync.review.title") : $t("sync.titleRunning") }}
        </h1>
        <p class="mt-1 text-sm text-base-content/60">{{ done ? $t("sync.leadDone") : $t("sync.leadRunning") }}</p>
      </div>
      <span v-if="done" class="badge badge-success gap-1.5 py-3"><CircleCheck class="size-4" />{{ $t("sync.titleDone") }}</span>
    </div>

    <div v-if="errorMessage || disconnected" role="alert" class="alert alert-error alert-soft mt-5">
      <CircleAlert class="size-5" />
      <span>{{ errorMessage ?? $t("sync.disconnected") }}</span>
    </div>

    <div v-if="!done" class="mt-6">
      <div class="flex justify-end text-sm tabular-nums text-base-content/60">{{ $t("sync.progress", { percent: Math.floor(progress) }) }}</div>
      <progress class="progress progress-primary mt-2 h-2.5 w-full" :value="progress" max="100"></progress>
    </div>

    <!-- Review mode: one contact at a time. -->
    <section v-if="reviewing" class="mt-6 rounded-box border border-base-300 p-6">
      <div class="text-xl font-bold">{{ manualSyncData?.contactName ?? $t("sync.review.unknown") }}</div>
      <div class="mt-6 grid items-center gap-6 sm:grid-cols-[1fr_auto_1fr]">
        <div class="text-center">
          <div class="mb-3 text-xs font-semibold uppercase tracking-wide text-base-content/50">{{ $t("sync.review.current") }}</div>
          <div class="inline-block rounded-full border-2 border-base-300 p-1.5">
            <img v-if="manualSyncData?.existingPhoto" class="size-36 rounded-full object-cover" :src="photo(manualSyncData.existingPhoto)" :alt="$t('sync.review.current')" />
            <div v-else class="grid size-36 place-items-center rounded-full bg-base-200 text-sm text-base-content/50">{{ $t("sync.review.noPhoto") }}</div>
          </div>
          <div class="mt-4">
            <button type="button" class="btn btn-sm" @click="answer(false)">{{ $t("sync.review.keep") }} <kbd class="kbd kbd-xs">←</kbd></button>
          </div>
        </div>
        <ArrowRight class="mx-auto hidden size-8 text-base-content/30 sm:block" />
        <div class="text-center">
          <div class="mb-3 text-xs font-semibold uppercase tracking-wide text-base-content/50">{{ $t("sync.review.new") }}</div>
          <div class="inline-block rounded-full border-[3px] border-primary p-1.5">
            <img v-if="manualSyncData?.newPhoto" class="size-36 rounded-full object-cover" :src="photo(manualSyncData.newPhoto)" :alt="$t('sync.review.new')" />
            <div v-else class="grid size-36 place-items-center rounded-full bg-base-200 text-sm text-base-content/50">{{ $t("sync.review.noPhoto") }}</div>
          </div>
          <div class="mt-4">
            <button type="button" class="btn btn-sm btn-primary" @click="answer(true)">{{ $t("sync.review.use") }} <kbd class="kbd kbd-xs">Enter</kbd></button>
          </div>
        </div>
      </div>
      <div class="mt-6 flex items-center justify-center gap-4 text-xs text-base-content/50">
        <span class="flex items-center gap-1.5"><Keyboard class="size-4" />{{ $t("sync.review.shortcuts") }}:</span>
        <span><kbd class="kbd kbd-xs">←</kbd> {{ $t("sync.review.keep") }}</span>
        <span><kbd class="kbd kbd-xs">Enter</kbd> {{ $t("sync.review.use") }}</span>
      </div>
    </section>
    <div v-else-if="isManualSync && isManualSyncLoading && !done" class="mt-6 flex items-center justify-center gap-3 py-10 text-base-content/70">
      <span class="loading loading-spinner"></span>{{ $t("sync.review.loading") }}
    </div>

    <div class="mt-6 grid gap-4 sm:grid-cols-2">
      <div class="rounded-box border border-base-300 px-5 py-4">
        <div class="flex items-center gap-1.5 text-xs font-medium text-base-content/60"><ImagePlus class="size-3.5 text-success" />{{ $t("sync.photosAdded") }}</div>
        <div class="mt-1 text-2xl font-bold tabular-nums" data-testid="photos-added">{{ syncCount }}</div>
      </div>
      <div class="rounded-box border border-base-300 px-5 py-4">
        <div class="flex items-center gap-1.5 text-xs font-medium text-base-content/60"><Users class="size-3.5" />{{ $t("sync.contacts") }}</div>
        <div class="mt-1 text-2xl font-bold tabular-nums">{{ totalContacts ?? "—" }}</div>
      </div>
    </div>

    <section v-if="images.length" class="mt-6">
      <div class="text-sm font-semibold">{{ $t("sync.justAdded") }}</div>
      <ul class="mt-3 flex flex-wrap items-center gap-2" :aria-label="$t('sync.justAdded')">
        <li v-for="(image, index) in [...images].reverse()" :key="images.length - index">
          <img class="size-12 rounded-full object-cover ring-2 ring-base-100" :src="photo(image)" alt="" />
        </li>
        <li v-if="hiddenCount > 0" class="grid size-12 place-items-center rounded-full bg-neutral text-sm font-semibold text-neutral-content">
          +{{ hiddenCount }}
        </li>
      </ul>
    </section>

    <template #actions>
      <a class="btn btn-ghost btn-sm" href="https://www.buymeacoffee.com/guyzyl" target="_blank"><Coffee class="size-4" />{{ $t("sync.supportOriginal") }}</a>
    </template>
  </FlowFrame>
</template>
