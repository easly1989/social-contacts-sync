<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Globe, GitMerge, Phone, RefreshCw, Trash2 } from "lucide-vue-next";

import AppShell from "../../components/AppShell.vue";
import SourceBadge from "../../components/SourceBadge.vue";
import { api } from "../../api";
import { dateTime, duration } from "../../format";
import { CleanupActionSummary, RunSummary } from "../../../../interfaces/api";

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

onMounted(async () => {
  [runs.value, actions.value] = await Promise.all([api.runs().catch(() => []), api.cleanupActions().catch(() => [])]);
});
</script>

<template>
  <AppShell :title="$t('history.title')" :subtitle="$t('history.subtitle')">
    <section class="overflow-x-auto rounded-box border border-base-300 bg-base-100">
      <table v-if="runs?.length" class="table">
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
          <tr v-for="run in runs" :key="run.id" :class="{ 'opacity-60': run.undone }">
            <td class="whitespace-nowrap text-base-content/70">{{ dateTime(run.startedAt, locale) }}</td>
            <td>
              <div class="flex items-center gap-3">
                <span class="grid size-8 place-items-center rounded-lg bg-base-200 text-primary"><RefreshCw class="size-4" /></span>
                <div>
                  <div class="font-medium">{{ $t("history.photoSync") }}</div>
                  <div class="text-xs text-base-content/60">{{ $t(`history.modes.${run.mode}`) }}</div>
                </div>
              </div>
            </td>
            <td><div class="flex flex-wrap gap-1"><SourceBadge v-for="s in run.sources" :key="s" :source="s" /></div></td>
            <td>
              <b class="text-success">{{ $t("history.resultText", { added: run.counters.added + run.counters.replaced, errors: run.counters.errors }) }}</b>
              <span v-if="run.undone" class="badge badge-ghost badge-sm ml-2">{{ $t("history.undone") }}</span>
              <span v-else-if="run.cancelled" class="badge badge-ghost badge-sm ml-2">{{ $t("history.stopped") }}</span>
            </td>
            <td class="text-base-content/70">{{ run.finishedAt ? duration(Date.parse(run.finishedAt) - Date.parse(run.startedAt), locale) : "—" }}</td>
            <td class="text-right"><router-link :to="`/app/history/${run.id}`" class="btn btn-ghost btn-xs">{{ $t("history.report") }}</router-link></td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="runs" class="py-12 text-center text-sm text-base-content/50">{{ $t("history.empty") }}</p>
      <div v-else class="grid place-items-center py-12"><span class="loading loading-spinner"></span></div>
    </section>

    <section v-if="actions.length" class="mt-6 overflow-x-auto rounded-box border border-base-300 bg-base-100" data-testid="cleanup-history">
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
