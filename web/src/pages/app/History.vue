<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Globe, GitMerge, ListChecks, Phone, RefreshCw, Trash2, Undo2 } from "lucide-vue-next";

import AppShell from "../../components/AppShell.vue";
import SourceBadge from "../../components/SourceBadge.vue";
import { api } from "../../api";
import { dateTime, duration } from "../../format";
import { linkNetworks } from "../../profileLinks";
import { networkInfo } from "../../profileNetworks";
import { CleanupActionSummary, RunRecord, RunSummary } from "../../../../interfaces/api";

// Mockup 5 in issue #8.
const { locale, t } = useI18n();
const runs = ref<RunSummary[]>();
const actions = ref<CleanupActionSummary[]>([]);
const undoing = ref<string>();

async function undo(action: CleanupActionSummary): Promise<void> {
  const question =
    action.kind === "merge"
      ? t("history.undoMergeConfirm", { name: action.title })
      : action.kind === "delete"
        ? t("history.undoDeleteConfirm", action.contacts)
        : t("history.undoNumbersConfirm");
  if (!window.confirm(question)) return;
  undoing.value = action.id;
  try {
    await api.undoCleanup(action.id);
    action.undone = true;
  } finally {
    undoing.value = undefined;
  }
}

// Syncs and Review entries (issue #84), and the profiles linked in To review.
type Filter = "all" | "syncs" | "reviews" | "linked";
const filters: Filter[] = ["all", "syncs", "reviews", "linked"];
const filter = ref<Filter>("all");
const shown = computed(() => (runs.value ?? []).filter((r) => filter.value === "all" || (filter.value === "reviews") === (r.mode === "session")));

const reviews = ref<RunRecord[]>();
const networkName = (network: string) => ({ ...linkNetworks, ...networkInfo } as Record<string, { name: string }>)[network]?.name ?? network;
const linkedRows = computed(() =>
  (reviews.value ?? [])
    .flatMap((run) => run.results.flatMap((result, index) => (result.profiles ?? []).filter((p) => p.added).map((profile) => ({ run, result, index, profile, at: result.at ?? run.startedAt }))))
    .sort((a, b) => b.at.localeCompare(a.at))
);
async function loadReviews(): Promise<void> {
  const records = await Promise.all((runs.value ?? []).filter((r) => r.mode === "session").map((r) => api.run(r.id).catch(() => undefined)));
  reviews.value = records.filter((r): r is RunRecord => Boolean(r));
}
// Once the entries are known: the tab can be picked before they are.
watch([filter, runs], () => filter.value === "linked" && runs.value && !reviews.value && void loadReviews());

// Undo runs in the background at Google's pace: read the entry again until it's done, for a minute at most.
const undoingLinked = ref<string>();
let poll: number | undefined;
async function undoLinked(run: RunRecord, index: number): Promise<void> {
  undoingLinked.value = `${run.id}:${index}`;
  try {
    await api.undo(run.id, [index]);
  } catch {
    undoingLinked.value = undefined;
    return;
  }
  let tries = 0;
  window.clearInterval(poll);
  poll = window.setInterval(async () => {
    const fresh = await api.run(run.id).catch(() => undefined);
    if (fresh && reviews.value) reviews.value = reviews.value.map((r) => (r.id === run.id ? fresh : r));
    if (!fresh || fresh.results[index]?.undone || ++tries >= 40) {
      window.clearInterval(poll);
      undoingLinked.value = undefined;
      runs.value = await api.runs().catch(() => runs.value);
    }
  }, 1500);
}

onMounted(async () => {
  [runs.value, actions.value] = await Promise.all([api.runs().catch(() => []), api.cleanupActions().catch(() => [])]);
});
onUnmounted(() => window.clearInterval(poll));
</script>

<template>
  <AppShell :title="$t('history.title')" :subtitle="$t('history.subtitle')">
    <div role="tablist" class="tabs tabs-border mb-3">
      <button v-for="key in filters" :key="key" type="button" role="tab" class="tab" :class="{ 'tab-active': filter === key }" :aria-selected="filter === key" @click="filter = key">
        {{ $t(`history.filters.${key}`) }}
      </button>
    </div>

    <section v-if="filter === 'linked'" class="overflow-x-auto rounded-box border border-base-300 bg-base-100" data-testid="linked-profiles">
      <template v-if="reviews && linkedRows.length">
        <p class="px-4 pt-4 text-sm text-base-content/60">{{ $t("history.linkedHint") }}</p>
        <table class="table">
          <thead>
            <tr>
              <th>{{ $t("report.contact") }}</th>
              <th>{{ $t("history.profile") }}</th>
              <th class="hidden sm:table-cell">{{ $t("history.when") }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in linkedRows" :key="`${row.run.id}:${row.index}:${row.profile.url}`" :class="{ 'opacity-60': row.result.undone }">
              <td class="font-medium">
                {{ row.result.name ?? "—" }}
                <div class="text-xs font-normal text-base-content/60 sm:hidden">{{ dateTime(row.at, locale) }}</div>
              </td>
              <td>
                <span class="badge badge-sm badge-soft mr-2">{{ networkName(row.profile.network) }}</span>
                <a :href="row.profile.url" target="_blank" rel="noopener noreferrer" class="link link-hover text-sm wrap-anywhere">{{ row.profile.url.replace(/^https:\/\//, "") }}</a>
              </td>
              <td class="hidden whitespace-nowrap text-base-content/70 sm:table-cell">
                {{ dateTime(row.at, locale) }}
                <router-link :to="`/app/history/${row.run.id}`" class="link link-hover ml-1 text-xs">{{ $t("history.entry") }}</router-link>
              </td>
              <td class="text-right">
                <span v-if="row.result.undone" class="badge badge-ghost badge-sm">{{ $t("history.undone") }}</span>
                <button v-else type="button" class="btn btn-ghost btn-xs" :disabled="Boolean(undoingLinked)" :aria-label="$t('history.undoFor', { name: row.result.name ?? row.profile.url })" @click="undoLinked(row.run, row.index)">
                  <span v-if="undoingLinked === `${row.run.id}:${row.index}`" class="loading loading-spinner loading-xs"></span><Undo2 v-else class="size-3.5" />{{ $t("report.undo") }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </template>
      <p v-else-if="reviews" class="py-12 text-center text-sm text-base-content/50">{{ $t("history.emptyLinked") }}</p>
      <div v-else class="grid place-items-center py-12"><span class="loading loading-spinner"></span></div>
    </section>

    <section v-else class="overflow-x-auto rounded-box border border-base-300 bg-base-100">
      <table v-if="shown.length" class="table">
        <thead>
          <tr>
            <th>{{ $t("history.when") }}</th>
            <th>{{ $t("history.what") }}</th>
            <th>{{ $t("history.sources") }}</th>
            <th>{{ $t("history.result") }}</th>
            <th>{{ $t("history.duration") }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="run in shown" :key="run.id" :class="{ 'opacity-60': run.undone }">
            <td class="whitespace-nowrap text-base-content/70">{{ dateTime(run.startedAt, locale) }}</td>
            <td>
              <div class="flex items-center gap-3">
                <span class="grid size-8 place-items-center rounded-lg bg-base-200 text-primary"><ListChecks v-if="run.mode === 'session'" class="size-4" /><RefreshCw v-else class="size-4" /></span>
                <div>
                  <div class="font-medium">{{ run.mode === "session" ? $t("history.review") : $t("history.photoSync") }}</div>
                  <div class="text-xs text-base-content/60">{{ $t(`history.modes.${run.mode}`) }}</div>
                </div>
              </div>
            </td>
            <td><div class="flex flex-wrap gap-1"><SourceBadge v-for="s in run.sources" :key="s" :source="s" /></div></td>
            <td>
              <b v-if="run.mode === 'session'" class="text-success">{{ $t("history.reviewResult", run.totalContacts) }}</b>
              <b v-else class="text-success">{{ $t("history.resultText", { added: run.counters.added + run.counters.replaced, errors: run.counters.errors }) }}</b>
              <span v-if="run.undone" class="badge badge-ghost badge-sm ml-2">{{ $t("history.undone") }}</span>
              <span v-else-if="run.cancelled" class="badge badge-ghost badge-sm ml-2">{{ $t("history.stopped") }}</span>
            </td>
            <td class="text-base-content/70">{{ run.finishedAt ? duration(Date.parse(run.finishedAt) - Date.parse(run.startedAt), locale) : "—" }}</td>
            <td class="text-right"><router-link :to="`/app/history/${run.id}`" class="btn btn-ghost btn-xs">{{ $t("history.report") }}</router-link></td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="runs" class="py-12 text-center text-sm text-base-content/50">{{ $t(filter === "reviews" ? "history.emptyReviews" : "history.empty") }}</p>
      <div v-else class="grid place-items-center py-12"><span class="loading loading-spinner"></span></div>
    </section>

    <section v-if="actions.length && filter === 'all'" class="mt-6 overflow-x-auto rounded-box border border-base-300 bg-base-100" data-testid="cleanup-history">
      <h2 class="px-4 pt-4 font-semibold">{{ $t("history.cleanup") }}</h2>
      <table class="table">
        <tbody>
          <tr v-for="action in actions" :key="action.id" :class="{ 'opacity-60': action.undone }">
            <td class="w-48 whitespace-nowrap text-base-content/70">{{ dateTime(action.at, locale) }}</td>
            <td>
              <div class="flex items-center gap-3">
                <span class="grid size-8 place-items-center rounded-lg bg-base-200 text-secondary">
                  <GitMerge v-if="action.kind === 'merge'" class="size-4" /><Phone v-else-if="action.kind === 'keepNumber'" class="size-4" /><Trash2 v-else-if="action.kind === 'delete'" class="size-4" /><Globe v-else class="size-4" />
                </span>
                <div>
                  <div class="font-medium">
                    <template v-if="action.kind === 'merge'">{{ $t("history.merge", { name: action.title }) }}</template>
                    <template v-else-if="action.kind === 'delete'">{{ action.title ? $t("history.deleted", { name: action.title }) : $t("history.deletedMany", { count: action.contacts }) }}</template>
                    <template v-else-if="action.kind === 'keepNumber'">{{ $t("history.keepNumber", { number: action.number, name: action.title }) }}</template>
                    <template v-else>{{ $t("history.countryCodes", Number(action.title)) }}</template>
                  </div>
                  <div class="text-xs text-base-content/60">{{ $t("cleanup.contacts", { count: action.contacts }) }}</div>
                </div>
              </div>
            </td>
            <td>
              <span v-if="action.undone" class="badge badge-ghost badge-sm">{{ $t("history.undone") }}</span>
              <span v-else-if="action.incomplete" class="badge badge-warning badge-soft badge-sm">{{ $t("history.incomplete") }}</span>
            </td>
            <td class="text-right">
              <button v-if="!action.undone" type="button" class="btn btn-ghost btn-xs" :disabled="undoing === action.id" @click="undo(action)">{{ $t("report.undo") }}</button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </AppShell>
</template>
