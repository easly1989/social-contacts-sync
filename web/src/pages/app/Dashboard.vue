<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { ArrowRight, CircleAlert, ImagePlus, RefreshCw, Sparkles } from "lucide-vue-next";

import AppShell from "../../components/AppShell.vue";
import SourceMark from "../../components/SourceMark.vue";
import { api } from "../../api";
import { cleanupSummary } from "../../cleanupState";
import { duration, number, relativeTime } from "../../format";
import { isDesktop } from "../../settings";
import { GoogleAccount, GoogleStats, RunRecord, RunSummary, SessionStatus } from "../../../../interfaces/api";

// Mockup 2 in issue #8.
const { locale } = useI18n();
const status = ref<SessionStatus>();
const account = ref<GoogleAccount>();
const stats = ref<GoogleStats>();
const statsError = ref(false);
const runs = ref<RunSummary[]>([]);
const lastRun = ref<RunRecord>();
const loading = ref(false);

const coverage = computed(() => (stats.value?.totalContacts ? Math.round((stats.value.withPhoto / stats.value.totalContacts) * 100) : 0));
const ring = computed(() => {
  const circumference = 2 * Math.PI * 46;
  return `${(coverage.value / 100) * circumference} ${circumference}`;
});
const recentPhotos = computed(() =>
  (lastRun.value?.results ?? [])
    .map((result, index) => ({ result, index }))
    .filter(({ result }) => result.hasPhoto && !result.undone)
    .slice(0, 7)
);
const whatsappLink = computed(() => (isDesktop.value ? "/setup/sources" : "/whatsapp"));

async function load(refresh = false): Promise<void> {
  loading.value = true;
  statsError.value = false;
  const [s, a, r] = await Promise.all([api.status(), api.account().catch(() => undefined), api.runs().catch(() => [])]);
  status.value = s;
  account.value = a;
  runs.value = r;
  lastRun.value = r[0] ? await api.run(r[0].id).catch(() => undefined) : undefined;
  try {
    stats.value = await api.stats(refresh);
  } catch {
    statsError.value = true;
  }
  loading.value = false;
}

onMounted(() => load());
</script>

<template>
  <AppShell :title="$t('dashboard.title')" :subtitle="$t('dashboard.subtitle')">
    <template #actions>
      <button type="button" class="btn btn-ghost btn-sm" :disabled="loading" @click="load(true)">
        <RefreshCw class="size-4" :class="{ 'animate-spin': loading }" />{{ $t("dashboard.refresh") }}
      </button>
    </template>

    <div class="grid gap-5 xl:grid-cols-3">
      <!-- Photo coverage -->
      <section class="rounded-box border border-base-300 bg-base-100 xl:col-span-2" data-testid="coverage">
        <div class="flex flex-wrap items-center gap-x-6 gap-y-4 p-6">
          <div class="relative grid shrink-0 place-items-center">
            <svg viewBox="0 0 100 100" class="size-22 -rotate-90 sm:size-28" aria-hidden="true">
              <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-width="8" class="text-base-300" />
              <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" class="text-primary" :stroke-dasharray="ring" />
            </svg>
            <div class="absolute text-center">
              <div class="text-xl font-bold sm:text-2xl">{{ stats ? `${coverage}%` : "—" }}</div>
              <div class="-mt-0.5 text-[11px] text-base-content/60">{{ $t("dashboard.withPhoto") }}</div>
            </div>
          </div>
          <div class="min-w-[11rem] flex-1">
            <div class="flex items-center gap-2 text-sm text-base-content/60">
              <span class="grid size-6 place-items-center rounded-md border border-base-300 bg-base-100"><img src="/google_logo.svg" alt="" class="size-3.5" /></span>
              Google Contacts<template v-if="account?.email"> · {{ account.email }}</template>
            </div>
            <div v-if="stats" class="mt-2 flex flex-wrap items-baseline gap-2">
              <span class="text-3xl font-bold tabular-nums">{{ number(stats.withPhoto, locale) }}</span>
              <span class="text-sm text-base-content/60">{{ $t("dashboard.haveAPhoto", { total: number(stats.totalContacts, locale) }) }}</span>
            </div>
            <div v-else-if="statsError" class="mt-2 flex items-center gap-1.5 text-sm text-error"><CircleAlert class="size-4" />{{ $t("dashboard.statsError") }}</div>
            <div v-else class="skeleton mt-2 h-8 w-64"></div>
            <div v-if="runs[0]" class="mt-1 flex items-center gap-1.5 text-sm text-success">
              <ImagePlus class="size-4" />{{ $t("dashboard.lastSync", { count: runs[0].counters.added + runs[0].counters.replaced, when: relativeTime(runs[0].startedAt, locale) }) }}
            </div>
            <div v-else class="mt-1 text-sm text-base-content/60">{{ $t("dashboard.noSyncYet") }}</div>
          </div>
          <router-link to="/app/sync" class="btn btn-primary w-full sm:w-auto"><RefreshCw class="size-4" />{{ $t("dashboard.syncNow") }}</router-link>
        </div>
      </section>

      <!-- Clean up -->
      <section class="flex flex-col rounded-box border border-base-300 bg-base-100 p-6" data-testid="cleanup-card">
        <div class="flex items-center gap-2">
          <Sparkles class="size-5 text-secondary" /><span class="flex-1 font-semibold">{{ $t("dashboard.cleanupTitle") }}</span>
        </div>
        <template v-if="cleanupSummary?.scannedAt">
          <ul class="mt-3 space-y-2 text-sm">
            <li v-for="key in ['duplicates', 'sharedNumbers', 'missingCountryCode'] as const" :key="key" class="flex items-center justify-between">
              <span class="text-base-content/70">{{ $t(`dashboard.findings.${key}`) }}</span><b class="tabular-nums">{{ cleanupSummary[key] }}</b>
            </li>
          </ul>
          <span class="flex-1"></span>
          <router-link to="/app/cleanup" class="btn btn-sm mt-4 self-start">{{ $t("dashboard.review") }}<ArrowRight class="size-4" /></router-link>
        </template>
        <template v-else>
          <p class="mt-2 text-sm text-base-content/60">{{ $t("dashboard.cleanupText") }}</p>
          <span class="flex-1"></span>
          <router-link to="/app/cleanup" class="btn btn-sm mt-4 self-start">{{ $t("dashboard.scan") }}<ArrowRight class="size-4" /></router-link>
        </template>
      </section>

      <!-- Sources -->
      <section class="rounded-box border border-base-300 bg-base-100 px-6 pb-2 pt-5">
        <div class="font-semibold">{{ $t("dashboard.sources") }}</div>
        <ul class="mt-1 divide-y divide-base-300">
          <li class="flex items-center gap-3 py-3">
            <SourceMark source="whatsapp" />
            <div class="flex-1"><div class="text-sm font-semibold">WhatsApp</div><div class="text-xs text-base-content/60">{{ $t("setup.sources.byPhone") }}</div></div>
            <span v-if="status?.whatsappConnected" class="badge badge-soft badge-success badge-sm">{{ $t("dashboard.connected") }}</span>
            <router-link v-else :to="whatsappLink" class="btn btn-xs">{{ $t("dashboard.connect") }}</router-link>
          </li>
          <li class="flex items-center gap-3 py-3" :class="{ 'opacity-60': status && !status.telegramAvailable }">
            <SourceMark source="telegram" />
            <div class="flex-1"><div class="text-sm font-semibold">Telegram</div><div class="text-xs text-base-content/60">{{ $t("setup.sources.byPhone") }}</div></div>
            <span v-if="status?.telegramConnected" class="badge badge-soft badge-success badge-sm">{{ $t("dashboard.connected") }}</span>
            <router-link v-else-if="status?.telegramAvailable" to="/app/settings/sources" class="btn btn-xs">{{ $t("dashboard.connect") }}</router-link>
            <span v-else-if="status" class="badge badge-ghost badge-sm">{{ $t("dashboard.unavailable") }}</span>
          </li>
          <li class="flex items-center gap-3 py-3">
            <SourceMark source="gravatar" />
            <div class="flex-1"><div class="text-sm font-semibold">Gravatar</div><div class="text-xs text-base-content/60">{{ $t("dashboard.noSignIn") }}</div></div>
            <span class="badge badge-soft badge-success badge-sm">{{ $t("dashboard.ready") }}</span>
          </li>
          <li class="flex items-center gap-3 py-3">
            <SourceMark source="links" />
            <div class="flex-1"><div class="text-sm font-semibold">{{ $t("links.name") }}</div><div class="text-xs text-base-content/60">{{ $t("dashboard.noSignIn") }}</div></div>
            <span class="badge badge-soft badge-success badge-sm">{{ $t("dashboard.ready") }}</span>
          </li>
        </ul>
      </section>

      <!-- Recent activity -->
      <section class="rounded-box border border-base-300 bg-base-100 px-6 pb-3 pt-5 xl:col-span-2">
        <div class="flex items-center">
          <span class="flex-1 font-semibold">{{ $t("dashboard.activity") }}</span>
          <router-link v-if="runs.length" to="/app/history" class="link link-hover text-xs text-base-content/60">{{ $t("dashboard.seeAll") }}</router-link>
        </div>
        <ul v-if="runs.length" class="mt-2 divide-y divide-base-300 text-sm">
          <li v-for="run in runs.slice(0, 4)" :key="run.id">
            <router-link :to="`/app/history/${run.id}`" class="flex items-center gap-3 py-2.5">
              <span class="grid size-8 place-items-center rounded-lg bg-base-200 text-primary"><RefreshCw class="size-4" /></span>
              <div class="flex-1">
                <div class="font-medium">{{ $t("history.photoSync") }} · {{ $t(`history.modes.${run.mode}`) }}</div>
                <div class="text-xs text-base-content/60">
                  {{ $t("history.resultText", { added: run.counters.added + run.counters.replaced, errors: run.counters.errors }) }}
                  <template v-if="run.finishedAt"> · {{ duration(Date.parse(run.finishedAt) - Date.parse(run.startedAt), locale) }}</template>
                </div>
              </div>
              <span class="text-xs text-base-content/50">{{ relativeTime(run.startedAt, locale) }}</span>
            </router-link>
          </li>
        </ul>
        <p v-else class="py-6 text-center text-sm text-base-content/50">{{ $t("dashboard.noActivity") }}</p>
      </section>

      <!-- Latest photos -->
      <section v-if="lastRun" class="flex flex-wrap items-center gap-5 rounded-box border border-base-300 bg-base-100 p-6 xl:col-span-3">
        <div class="flex -space-x-3">
          <img
            v-for="{ index } in recentPhotos"
            :key="index"
            :src="api.photoUrl(lastRun.id, index, 'photo')"
            alt=""
            class="size-10 rounded-full object-cover ring-2 ring-base-100"
          />
        </div>
        <div class="min-w-[12rem] flex-1 text-sm">
          <div class="font-semibold">{{ $t("dashboard.recentPhotos") }}</div>
          <div class="text-base-content/60">{{ $t("dashboard.recentText", lastRun.counters.added + lastRun.counters.replaced) }}</div>
        </div>
        <router-link :to="`/app/history/${lastRun.id}`" class="btn btn-ghost btn-sm">{{ $t("dashboard.openReport") }}<ArrowRight class="size-4" /></router-link>
      </section>
    </div>
  </AppShell>
</template>
