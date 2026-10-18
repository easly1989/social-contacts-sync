<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { ArrowRight, CircleAlert, ImagePlus, ListChecks, PinOff, RefreshCw, Search, Sparkles, UserSearch } from "lucide-vue-next";

import AppShell from "../../components/AppShell.vue";
import PhotoZoom from "../../components/PhotoZoom.vue";
import SourceMark from "../../components/SourceMark.vue";
import { signInAgainIfNeeded } from "../../signInAgain";
import { api } from "../../api";
import { cleanupSummary } from "../../cleanupState";
import { dateTime, duration, number, relativeTime } from "../../format";
import { isDesktop } from "../../settings";
import { sourceInfo } from "../../sources";
import { Coverage, GoogleAccount, RunRecord, RunSummary, SessionStatus } from "../../../../interfaces/api";

// Mockup 2 in issue #8, reshaped by issue #85: what to do now.
const router = useRouter();
const { locale, t } = useI18n();
const status = ref<SessionStatus>();
const account = ref<GoogleAccount>();
const coverage = ref<Coverage>();
const coverageError = ref(false);
const runs = ref<RunSummary[]>([]);
const lastRun = ref<RunRecord>();
// Review entries (issue #84) are in the activity, but the last sync is a sync.
const lastSync = computed(() => runs.value.find((r) => r.mode !== "session"));
const loading = ref(false);

const percent = (count: number) => (coverage.value?.total ? Math.round((count / coverage.value.total) * 100) : 0);
// The three parts, in the ring's order; the legend names each one, so colour isn't needed to read it.
const parts = computed(() => {
  const c = coverage.value;
  if (!c) return [];
  return [
    { key: "withPhoto", count: c.withPhoto, dot: "bg-primary", stroke: "text-primary" },
    { key: "ready", count: c.ready, dot: "bg-accent", stroke: "text-accent" },
    { key: "noSource", count: c.noSource, dot: "border-2 border-base-content/30", stroke: "" },
  ] as const;
});
const circumference = 2 * Math.PI * 46;
const arcs = computed(() => {
  let start = 0;
  return parts.value.slice(0, 2).map((part) => {
    const length = coverage.value?.total ? (part.count / coverage.value.total) * circumference : 0;
    const arc = { key: part.key, stroke: part.stroke, dasharray: `${length} ${circumference}`, dashoffset: -start };
    start += length;
    return arc;
  });
});

const readyFrom = computed(() => {
  const names = (coverage.value?.readySources ?? []).map((s) => (s === "links" ? t("dashboard.steps.aLinkedProfile") : sourceInfo[s].name));
  return names.length ? t("dashboard.steps.readyFrom", { sources: new Intl.ListFormat(locale.value, { type: "disjunction" }).format(names) }) : "";
});
// In order of impact, only the ones with something to do.
const steps = computed(() => {
  const c = coverage.value;
  if (!c) return [];
  return [
    { key: "ready", count: c.ready, icon: ImagePlus, tone: "bg-accent/15 text-accent", detail: readyFrom.value, to: "/app/sync?tab=run", action: t("dashboard.syncNow"), primary: true },
    {
      key: "toReview",
      count: c.toReview,
      icon: UserSearch,
      tone: "bg-primary/10 text-primary",
      detail: c.toReviewWithoutPhoto ? t("dashboard.steps.toReviewWithoutPhoto", c.toReviewWithoutPhoto) : "",
      to: "/app/sync?tab=review",
      action: t("dashboard.review"),
    },
    { key: "changed", count: c.changed, icon: PinOff, tone: "bg-warning/15 text-warning", detail: t("dashboard.steps.changedDetail"), to: "/app/sync?tab=review", action: t("dashboard.review") },
    {
      key: "noSource",
      count: c.noSource,
      icon: Search,
      tone: "bg-base-200 text-base-content/60",
      detail: c.lastSearch ? t("dashboard.steps.lastSearch", { when: dateTime(c.lastSearch, locale.value) }) : t("dashboard.steps.noSearchYet"),
      to: "/app/sync?tab=sources",
      action: t("dashboard.steps.sources"),
    },
  ].filter((s) => s.count > 0);
});

const recentPhotos = computed(() =>
  (lastRun.value?.results ?? [])
    .map((result, index) => ({ result, index }))
    .filter(({ result }) => result.hasPhoto && !result.undone)
    .slice(0, 7)
);
// The desktop app links sources in Settings once set up (the wizard is for the first run).
const whatsappLink = computed(() => (isDesktop.value ? "/app/settings/sources" : "/whatsapp"));

function activityText(run: RunSummary): string {
  if (run.mode === "session") return t("history.reviewResult", run.totalContacts);
  if (run.mode === "sync") return t("dashboard.syncResult", { applied: run.counters.added + run.counters.replaced, queued: run.counters.queued ?? 0 });
  return t("history.resultText", { added: run.counters.added + run.counters.replaced, errors: run.counters.errors });
}

async function load(refresh = false): Promise<void> {
  loading.value = true;
  coverageError.value = false;
  const [s, a, r] = await Promise.all([api.status(), api.account().catch(() => undefined), api.runs().catch(() => [])]);
  status.value = s;
  account.value = a;
  runs.value = r;
  lastRun.value = lastSync.value ? await api.run(lastSync.value.id).catch(() => undefined) : undefined;
  try {
    coverage.value = await api.coverage(refresh);
  } catch {
    coverageError.value = true;
    if (await signInAgainIfNeeded(router)) return;
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
      <!-- Photo coverage in three parts (issue #85) -->
      <section class="rounded-box border border-base-300 bg-base-100 xl:col-span-2" data-testid="coverage">
        <div class="flex flex-wrap items-center gap-x-8 gap-y-4 p-6">
          <div class="relative grid shrink-0 place-items-center">
            <svg viewBox="0 0 100 100" class="size-28 -rotate-90 sm:size-32" aria-hidden="true">
              <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-width="10" class="text-base-300" />
              <circle
                v-for="arc in arcs"
                :key="arc.key"
                cx="50"
                cy="50"
                r="46"
                fill="none"
                stroke="currentColor"
                stroke-width="10"
                :class="arc.stroke"
                :stroke-dasharray="arc.dasharray"
                :stroke-dashoffset="arc.dashoffset"
              />
            </svg>
            <div class="absolute text-center">
              <div class="text-xl font-bold sm:text-2xl">{{ coverage ? `${percent(coverage.withPhoto)}%` : "—" }}</div>
              <div class="-mt-0.5 text-[11px] text-base-content/60">{{ $t("dashboard.withPhoto") }}</div>
            </div>
          </div>
          <div class="min-w-[15rem] flex-1">
            <div class="flex items-center gap-2 text-sm text-base-content/60">
              <span class="grid size-6 place-items-center rounded-md border border-base-300 bg-base-100"><img src="/google_logo.svg" alt="" class="size-3.5" /></span>
              Google Contacts<template v-if="account?.email"> · {{ account.email }}</template>
            </div>
            <ul v-if="coverage" class="mt-3 space-y-2 text-sm" :aria-label="$t('dashboard.parts.label', { total: number(coverage.total, locale) })">
              <li v-for="part in parts" :key="part.key" class="flex items-center gap-3" :data-testid="`coverage-${part.key}`">
                <span class="size-2.5 shrink-0 rounded-full" :class="part.dot" aria-hidden="true"></span>
                <span class="flex-1">{{ $t(`dashboard.parts.${part.key}`) }}</span>
                <b class="tabular-nums">{{ number(part.count, locale) }}</b>
                <span class="w-10 text-right tabular-nums text-base-content/50">{{ percent(part.count) }}%</span>
              </li>
            </ul>
            <div v-else-if="coverageError" class="mt-2 flex items-center gap-1.5 text-sm text-error"><CircleAlert class="size-4" />{{ $t("dashboard.statsError") }}</div>
            <div v-else class="mt-3 space-y-2"><div class="skeleton h-4 w-64"></div><div class="skeleton h-4 w-56"></div><div class="skeleton h-4 w-60"></div></div>
            <div v-if="lastSync" class="mt-3 flex items-center gap-1.5 text-xs text-base-content/60">
              <ImagePlus class="size-3.5" />{{ $t("dashboard.lastSync", { count: lastSync.counters.added + lastSync.counters.replaced, when: relativeTime(lastSync.startedAt, locale) }) }}
            </div>
            <div v-else class="mt-3 text-xs text-base-content/60">{{ $t("dashboard.noSyncYet") }}</div>
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

      <!-- Next steps (issue #85) -->
      <section class="rounded-box border border-base-300 bg-base-100 px-6 pb-3 pt-5 xl:col-span-2" data-testid="next-steps">
        <h2 class="font-semibold">{{ $t("dashboard.steps.title") }}</h2>
        <ul v-if="steps.length" class="mt-2 divide-y divide-base-300">
          <li v-for="step in steps" :key="step.key" class="flex items-center gap-3 py-3" :data-testid="`step-${step.key}`">
            <span class="grid size-9 shrink-0 place-items-center rounded-lg" :class="step.tone"><component :is="step.icon" class="size-4" /></span>
            <div class="min-w-0 flex-1">
              <div class="text-sm font-medium">{{ $t(`dashboard.steps.${step.key}`, { count: number(step.count, locale) }, step.count) }}</div>
              <div v-if="step.detail" class="text-xs text-base-content/60">{{ step.detail }}</div>
            </div>
            <router-link :to="step.to" class="btn btn-sm shrink-0" :class="step.primary ? 'btn-primary' : ''">{{ step.action }}</router-link>
          </li>
        </ul>
        <p v-else-if="coverage" class="py-6 text-center text-sm text-base-content/50">{{ $t("dashboard.steps.none") }}</p>
        <div v-else class="space-y-3 py-3"><div class="skeleton h-9 w-full"></div><div class="skeleton h-9 w-full"></div></div>
      </section>

      <!-- Sources -->
      <section class="rounded-box border border-base-300 bg-base-100 px-6 pb-2 pt-5" data-testid="dashboard-sources">
        <h2 class="font-semibold">{{ $t("dashboard.sources") }}</h2>
        <ul class="mt-1 divide-y divide-base-300">
          <li class="flex items-center gap-3 py-3">
            <SourceMark source="whatsapp" />
            <div class="flex-1 text-sm font-semibold">WhatsApp</div>
            <template v-if="status?.whatsappConnected">
              <span v-if="coverage?.whatsapp !== undefined" class="text-xs text-base-content/60">{{ $t("dashboard.contactsCount", { count: number(coverage.whatsapp, locale) }, coverage.whatsapp) }}</span>
              <span v-else class="badge badge-soft badge-success badge-sm">{{ $t("dashboard.connected") }}</span>
            </template>
            <router-link v-else :to="whatsappLink" class="btn btn-xs">{{ $t("dashboard.connect") }}</router-link>
          </li>
          <li class="flex items-center gap-3 py-3">
            <SourceMark source="links" />
            <div class="flex-1 text-sm font-semibold">{{ $t("dashboard.linkedProfiles") }}</div>
            <router-link v-if="coverage" to="/app/sync?tab=sources" class="link link-hover text-xs text-base-content/60">
              {{ $t("dashboard.linkedCount", { profiles: number(coverage.linkedProfiles, locale), contacts: number(coverage.linkedContacts, locale) }) }}
            </router-link>
          </li>
          <li class="flex items-center gap-3 py-3">
            <SourceMark source="gravatar" />
            <div class="flex-1 text-sm font-semibold">Gravatar</div>
            <span class="text-xs text-base-content/60">{{ $t("dashboard.ready") }}</span>
          </li>
          <li class="flex items-center gap-3 py-3" :class="{ 'opacity-60': status && !status.telegramAvailable }">
            <SourceMark source="telegram" />
            <div class="flex-1 text-sm font-semibold">Telegram</div>
            <span v-if="status?.telegramConnected" class="badge badge-soft badge-success badge-sm">{{ $t("dashboard.connected") }}</span>
            <router-link v-else-if="status?.telegramAvailable" to="/app/settings/sources" class="btn btn-xs">{{ $t("dashboard.connect") }}</router-link>
            <span v-else-if="status" class="badge badge-ghost badge-sm">{{ $t("dashboard.unavailable") }}</span>
          </li>
        </ul>
      </section>

      <!-- Recent activity: syncs and review sessions -->
      <section class="rounded-box border border-base-300 bg-base-100 px-6 pb-3 pt-5 xl:col-span-3">
        <div class="flex items-center">
          <h2 class="flex-1 font-semibold">{{ $t("dashboard.activity") }}</h2>
          <router-link v-if="runs.length" to="/app/history" class="link link-hover text-xs text-base-content/60">{{ $t("dashboard.seeAll") }}</router-link>
        </div>
        <ul v-if="runs.length" class="mt-2 divide-y divide-base-300 text-sm">
          <li v-for="run in runs.slice(0, 4)" :key="run.id">
            <router-link :to="`/app/history/${run.id}`" class="flex items-center gap-3 py-2.5">
              <span class="grid size-8 place-items-center rounded-lg bg-base-200 text-primary"><ListChecks v-if="run.mode === 'session'" class="size-4" /><RefreshCw v-else class="size-4" /></span>
              <div class="flex-1">
                <div class="font-medium">{{ run.mode === "session" ? $t("history.review") : $t("history.photoSync") }} · {{ $t(`history.modes.${run.mode}`) }}</div>
                <div class="text-xs text-base-content/60">
                  {{ activityText(run) }}
                  <template v-if="run.finishedAt && run.mode !== 'session'"> · {{ duration(Date.parse(run.finishedAt) - Date.parse(run.startedAt), locale) }}</template>
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
          <PhotoZoom v-for="{ index } in recentPhotos" :key="index" :src="api.photoUrl(lastRun.id, index, 'photo')">
            <img :src="api.photoUrl(lastRun.id, index, 'photo')" alt="" class="size-10 rounded-full object-cover ring-2 ring-base-100" />
          </PhotoZoom>
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
