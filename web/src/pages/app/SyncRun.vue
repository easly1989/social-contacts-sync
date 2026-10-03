<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { ArrowRight, Check, CircleAlert, CircleCheck, Image, ImagePlus, Keyboard, Replace, Search, Square, Undo2 } from "lucide-vue-next";

import AppShell from "../../components/AppShell.vue";
import SourceBadge from "../../components/SourceBadge.vue";
import StatTile from "../../components/StatTile.vue";
import { addHandler, sendEvent } from "../../services/ws";
import { api } from "../../api";
import { number } from "../../format";
import { EventType, ReviewRequest, SourceId, SyncCounters, SyncProgress } from "../../../../interfaces/api";

// Mockups 3.2 (progress) and 3.3 (review) in issue #8.
const route = useRoute();
const { locale, t } = useI18n();

const mode = computed(() => (["fill", "replace", "review"].includes(String(route.query.mode)) ? String(route.query.mode) : "fill"));
const progress = ref(0);
const checked = ref(0);
const total = ref<number>();
const counters = ref<SyncCounters>({ added: 0, replaced: 0, kept: 0, alreadyHadPhoto: 0, noMatch: 0, errors: 0 });
const latest = ref<{ image: string; name?: string; source: SourceId; key: number }[]>([]);
const error = ref<string>();
const runId = ref<string>();
const cancelled = ref(false);
const stopping = ref(false);
const startedAt = Date.now();
const lastEventAt = ref<number>();
const disconnected = ref(false);
const review = ref<ReviewRequest>();
const choice = ref(0);
const waitingForNext = ref(false);
let timer: number | undefined;

const done = computed(() => Boolean(runId.value));
const title = computed(() =>
  cancelled.value ? t("syncRun.stopped") : done.value ? t("syncRun.done") : mode.value === "review" ? t("syncRun.review") : t("syncRun.running")
);
const eta = computed(() => {
  if (!total.value || checked.value < 5 || done.value) return undefined;
  const perContact = (Date.now() - startedAt) / checked.value;
  return Math.max(1, Math.round((perContact * (total.value - checked.value)) / 60000));
});

function onProgress(update: SyncProgress): void {
  lastEventAt.value = Date.now();
  progress.value = update.progress;
  if (update.checked !== undefined) checked.value = update.checked;
  if (update.totalContacts !== undefined) total.value = update.totalContacts;
  if (update.counters) counters.value = update.counters;
  error.value = update.error;
  if (update.image && update.latest) {
    latest.value = [{ image: update.image, ...update.latest, key: checked.value }, ...latest.value].slice(0, 12);
  }
  if (update.runId) {
    runId.value = update.runId;
    cancelled.value = Boolean(update.cancelled);
    review.value = undefined;
  }
}

function onReview(request: ReviewRequest): void {
  review.value = request;
  choice.value = 0;
  waitingForNext.value = false;
}

function answer(accept: boolean): void {
  if (!review.value) return;
  sendEvent(EventType.SyncPhotoConfirm, { accept, choice: choice.value });
  review.value = undefined;
  waitingForNext.value = true;
}

function onKey(event: KeyboardEvent): void {
  if (!review.value) return;
  const n = Number(event.key);
  if (n >= 1 && n <= review.value.candidates.length) choice.value = n - 1;
  else if (event.key === "ArrowLeft" || event.key.toLowerCase() === "s") answer(false);
  else if (event.key === "Enter") answer(true);
}

async function stop(): Promise<void> {
  stopping.value = true;
  await api.stopSync().catch(() => undefined);
}

function photo(base64: string): string {
  return "data:image/jpeg;base64, " + base64;
}

onMounted(() => {
  addHandler(EventType.SyncProgress, onProgress);
  addHandler(EventType.SyncConfirm, onReview);
  window.addEventListener("keydown", onKey);
  const params = new URLSearchParams({
    manual_sync: String(mode.value === "review"),
    overwrite_photos: String(mode.value === "replace"),
    sources: String(route.query.sources ?? "whatsapp"),
  });
  fetch(`/api/init_sync?${params}`, { credentials: "include" });
  timer = window.setInterval(() => {
    disconnected.value = Boolean(lastEventAt.value) && !done.value && !review.value && Date.now() - lastEventAt.value! > 60_000;
  }, 5000);
});

onUnmounted(() => {
  window.clearInterval(timer);
  window.removeEventListener("keydown", onKey);
});
</script>

<template>
  <AppShell :title="title" :subtitle="eta ? $t('syncRun.eta', { minutes: eta }) : undefined">
    <template #actions>
      <button v-if="!done" type="button" class="btn btn-ghost btn-sm text-error" :disabled="stopping" @click="stop">
        <Square class="size-4" />{{ stopping ? $t("syncRun.stopping") : $t("syncRun.stop") }}
      </button>
    </template>

    <div class="space-y-5">
      <div v-if="error || disconnected" role="alert" class="alert alert-error alert-soft">
        <CircleAlert class="size-5" /><span>{{ error ?? $t("sync.disconnected") }}</span>
      </div>

      <section v-if="done" class="flex flex-wrap items-center gap-5 rounded-box border border-success/30 bg-gradient-to-r from-success/15 to-primary/10 p-6" role="status">
        <span class="grid size-12 place-items-center rounded-full bg-success text-success-content"><Check class="size-6" /></span>
        <div class="flex-1">
          <div class="text-xl font-bold">{{ $t("report.banner", counters.added + counters.replaced) }}</div>
          <div class="text-sm text-base-content/70">{{ $t("syncRun.checked", { checked: number(checked, locale), total: number(total ?? checked, locale) }) }}</div>
        </div>
        <router-link :to="`/app/history/${runId}`" class="btn btn-primary btn-sm">{{ $t("syncRun.openReport") }}<ArrowRight class="size-4" /></router-link>
      </section>

      <section v-else class="rounded-box border border-base-300 bg-base-100 p-6">
        <div class="flex items-end justify-between text-sm">
          <span class="font-semibold">{{ total === undefined ? $t("syncRun.loading") : $t("syncRun.checked", { checked: number(checked, locale), total: number(total, locale) }) }}</span>
          <span class="tabular-nums text-base-content/60">{{ Math.floor(progress) }}%</span>
        </div>
        <progress class="progress progress-primary mt-3 h-2.5 w-full" :value="progress" max="100"></progress>
      </section>

      <!-- Review mode -->
      <section v-if="review" class="rounded-box border border-base-300 bg-base-100 p-6 sm:p-8" data-testid="review">
        <div class="flex flex-wrap items-center gap-4">
          <div class="flex-1 text-xl font-bold">{{ review.contactName ?? $t("sync.review.unknown") }}</div>
          <span class="text-sm text-base-content/60">{{ $t("syncRun.reviewProgress", { checked: checked + 1, total: total ?? "?" }) }}</span>
        </div>
        <div class="mt-8 grid items-center gap-8 lg:grid-cols-[1fr_auto_2fr]">
          <div class="text-center">
            <div class="mb-3 text-xs font-semibold uppercase tracking-wide text-base-content/50">{{ $t("sync.review.current") }}</div>
            <div class="inline-block rounded-full border-2 border-base-300 p-1.5">
              <img v-if="review.existingPhoto" :src="photo(review.existingPhoto)" :alt="$t('sync.review.current')" class="size-36 rounded-full object-cover" />
              <div v-else class="grid size-36 place-items-center rounded-full bg-base-200 text-sm text-base-content/50">{{ $t("sync.review.noPhoto") }}</div>
            </div>
            <div class="mt-4"><button type="button" class="btn btn-sm" @click="answer(false)">{{ $t("sync.review.keep") }} <kbd class="kbd kbd-xs">←</kbd></button></div>
          </div>
          <ArrowRight class="mx-auto hidden size-8 text-base-content/30 lg:block" />
          <div>
            <div class="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-base-content/50">{{ $t("syncRun.candidates") }}</div>
            <div class="flex flex-wrap justify-center gap-6" role="radiogroup" :aria-label="$t('syncRun.candidates')">
              <button
                v-for="(candidate, index) in review.candidates"
                :key="index"
                type="button"
                role="radio"
                :aria-checked="choice === index"
                :aria-label="`${index + 1}. ${candidate.source}`"
                class="text-center"
                @click="choice = index"
              >
                <span class="relative inline-block rounded-full p-1.5" :class="choice === index ? 'border-[3px] border-primary' : 'border-2 border-base-300'">
                  <img :src="photo(candidate.photo)" alt="" class="size-36 rounded-full object-cover" />
                  <span v-if="choice === index" class="absolute -right-1 -top-1 grid size-7 place-items-center rounded-full bg-primary text-primary-content"><Check class="size-4" /></span>
                </span>
                <span class="mt-2 flex items-center justify-center gap-1.5"><kbd class="kbd kbd-xs">{{ index + 1 }}</kbd><SourceBadge :source="candidate.source" /></span>
              </button>
            </div>
            <div class="mt-4 text-center"><button type="button" class="btn btn-primary btn-sm" @click="answer(true)">{{ $t("sync.review.use") }} <kbd class="kbd kbd-xs">Enter</kbd></button></div>
          </div>
        </div>
        <div class="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-base-content/50">
          <span class="flex items-center gap-1.5"><Keyboard class="size-4" />{{ $t("sync.review.shortcuts") }}:</span>
          <span><kbd class="kbd kbd-xs">←</kbd> {{ $t("sync.review.keep") }}</span>
          <span><kbd class="kbd kbd-xs">Enter</kbd> {{ $t("sync.review.use") }}</span>
          <span><kbd class="kbd kbd-xs">1</kbd>–<kbd class="kbd kbd-xs">3</kbd> {{ $t("syncRun.pick") }}</span>
          <span><kbd class="kbd kbd-xs">S</kbd> {{ $t("syncRun.skip") }}</span>
        </div>
      </section>
      <div v-else-if="waitingForNext && !done" class="flex items-center justify-center gap-3 py-6 text-base-content/70">
        <span class="loading loading-spinner"></span>{{ $t("sync.review.loading") }}
      </div>

      <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile :label="$t('outcomes.added')" :value="number(counters.added, locale)" :icon="ImagePlus" tone="text-success" data-testid="count-added" />
        <StatTile v-if="mode !== 'fill'" :label="$t('outcomes.replaced')" :value="number(counters.replaced, locale)" :icon="Replace" data-testid="count-replaced" />
        <StatTile v-else :label="$t('outcomes.alreadyHadPhoto')" :value="number(counters.alreadyHadPhoto, locale)" :icon="Image" data-testid="count-already" />
        <StatTile :label="$t('outcomes.noMatch')" :value="number(counters.noMatch, locale)" :icon="Search" data-testid="count-nomatch" />
        <StatTile :label="$t('outcomes.errors')" :value="number(counters.errors, locale)" :icon="CircleAlert" tone="text-error" data-testid="count-errors" />
      </div>
      <p v-if="mode === 'review' && counters.kept" class="flex items-center gap-1.5 text-sm text-base-content/60"><Undo2 class="size-4" />{{ $t("outcomes.kept") }}: {{ counters.kept }}</p>

      <section v-if="latest.length" class="rounded-box border border-base-300 bg-base-100 p-6">
        <div class="flex items-center">
          <span class="flex-1 font-semibold">{{ $t("syncRun.justAdded") }}</span>
          <span class="text-xs text-base-content/50">{{ $t("syncRun.newestFirst") }}</span>
        </div>
        <ul class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" :aria-label="$t('syncRun.justAdded')">
          <li v-for="item in latest" :key="item.key" class="flex items-center gap-3 rounded-xl bg-base-200/60 p-2.5">
            <img :src="photo(item.image)" alt="" class="size-10 rounded-full object-cover" />
            <div class="min-w-0">
              <div class="truncate text-sm font-medium">{{ item.name ?? $t("sync.review.unknown") }}</div>
              <SourceBadge :source="item.source" />
            </div>
          </li>
        </ul>
      </section>
      <p v-if="done && !counters.errors" class="flex items-center gap-1.5 text-sm text-success"><CircleCheck class="size-4" />{{ $t("syncSetup.backupNote") }}</p>
    </div>
  </AppShell>
</template>
