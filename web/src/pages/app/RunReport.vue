<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { ArrowLeft, ArrowRight, Check, CircleAlert, FileDown, Image, ImagePlus, Link, Replace, Search, Undo2 } from "lucide-vue-next";

import AppShell from "../../components/AppShell.vue";
import PhotoCompare from "../../components/PhotoCompare.vue";
import PhotoZoom from "../../components/PhotoZoom.vue";
import ProfileLinkLookup from "../../components/ProfileLinkLookup.vue";
import SourceBadge from "../../components/SourceBadge.vue";
import StatTile from "../../components/StatTile.vue";
import { api, withGoogleDetail } from "../../api";
import { dateTime, duration, number } from "../../format";
import { ContactResult, LinkLookup, RunRecord } from "../../../../interfaces/api";

// Mockup 3.4 in issue #8.
const route = useRoute();
const { locale, t } = useI18n();
const runId = String(route.params.id);
const run = ref<RunRecord>();
const missing = ref(false);
const tab = ref<"changed" | "noMatch" | "errors" | "all">("changed");
const search = ref("");
const undoing = ref(false);
let poll: number | undefined;

const changed = (r: ContactResult) => r.outcome === "added" || r.outcome === "replaced";
const rows = computed(() => {
  const term = search.value.trim().toLowerCase();
  return (run.value?.results ?? [])
    .map((result, index) => ({ result, index }))
    .filter(({ result }) =>
      tab.value === "all" ? true : tab.value === "changed" ? changed(result) : tab.value === "errors" ? result.outcome === "error" : result.outcome === "noMatch"
    )
    .filter(({ result }) => !term || (result.name ?? "").toLowerCase().includes(term) || (result.matchedBy ?? "").toLowerCase().includes(term));
});
const tabCount = (key: string) =>
  (run.value?.results ?? []).filter((r) => (key === "changed" ? changed(r) : key === "errors" ? r.outcome === "error" : key === "noMatch" ? r.outcome === "noMatch" : true)).length;
const undoable = computed(() => (run.value?.results ?? []).some((r) => changed(r) && !r.undone));

async function load(): Promise<void> {
  try {
    run.value = await api.run(runId);
  } catch {
    missing.value = true;
  }
}

// Undo runs in the background at Google's pace: refresh until the asked
// entries are undone (or the run has nothing left to undo).
function watchUndo(indexes?: number[]): void {
  undoing.value = true;
  window.clearInterval(poll);
  const settled = () =>
    !undoable.value || (indexes ?? []).length > 0 && indexes!.every((i) => run.value?.results[i]?.undone);
  const check = async () => {
    await load();
    if (settled()) {
      undoing.value = false;
      window.clearInterval(poll);
    }
  };
  void check();
  poll = window.setInterval(check, 2000);
}

async function undoAll(): Promise<void> {
  if (!window.confirm(t("report.undoConfirm"))) return;
  await api.undo(runId);
  watchUndo();
}

async function undoOne(index: number): Promise<void> {
  await api.undo(runId, [index]);
  watchUndo([index]);
}

// "No photo found" → add a profile link (issue #51).
const linking = ref<number>();
const found = ref<LinkLookup>();
const saving = ref(false);
const saveError = ref<string>();

function startLink(index: number): void {
  linking.value = index;
  found.value = undefined;
  saveError.value = undefined;
}

async function saveLink(index: number): Promise<void> {
  if (!found.value || !run.value) return;
  saving.value = true;
  saveError.value = undefined;
  try {
    const { result, counters } = await api.saveRunLink(run.value.id, index, found.value.token);
    run.value.results[index] = result;
    run.value.counters = counters;
    linking.value = undefined;
  } catch (e) {
    saveError.value = withGoogleDetail(t("links.saveError"), e);
  }
  saving.value = false;
}

function exportCsv(): void {
  const quote = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["name", "outcome", "source", "matched_by", "error", "undone"];
  const lines = (run.value?.results ?? []).map((r) => [r.name, r.outcome, r.source, r.matchedBy, r.error, r.undone ? "yes" : ""].map(quote).join(","));
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `social-contacts-sync-${runId}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

onMounted(load);
onUnmounted(() => window.clearInterval(poll));
</script>

<template>
  <AppShell :title="$t('report.title')">
    <template #actions>
      <router-link to="/app/history" class="btn btn-ghost btn-sm"><ArrowLeft class="size-4" />{{ $t("report.back") }}</router-link>
    </template>

    <p v-if="missing" class="rounded-box border border-base-300 bg-base-100 py-12 text-center text-sm text-base-content/60">{{ $t("report.notFound") }}</p>
    <div v-else-if="run" class="space-y-5">
      <section class="flex flex-wrap items-center gap-5 rounded-box border border-success/30 bg-gradient-to-r from-success/15 to-primary/10 p-6">
        <span class="grid size-12 place-items-center rounded-full bg-success text-success-content"><Check class="size-6" /></span>
        <div class="flex-1">
          <div class="text-xl font-bold">{{ $t("report.banner", run.counters.added + run.counters.replaced) }}</div>
          <div class="text-sm text-base-content/70">
            {{ $t("report.finished", {
              duration: run.finishedAt ? duration(Date.parse(run.finishedAt) - Date.parse(run.startedAt), locale) : "—",
              checked: number(run.results.length, locale),
              when: dateTime(run.startedAt, locale),
            }) }}
          </div>
        </div>
        <button type="button" class="btn btn-sm" :disabled="!undoable || undoing" @click="undoAll">
          <span v-if="undoing" class="loading loading-spinner loading-xs"></span><Undo2 v-else class="size-4" />
          {{ undoing ? $t("report.undoing") : $t("report.undoRun") }}
        </button>
        <button type="button" class="btn btn-ghost btn-sm" @click="exportCsv"><FileDown class="size-4" />{{ $t("report.exportCsv") }}</button>
      </section>

      <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile :label="$t('outcomes.added')" :value="number(run.counters.added, locale)" :icon="ImagePlus" tone="text-success" />
        <StatTile v-if="run.mode !== 'fill'" :label="$t('outcomes.replaced')" :value="number(run.counters.replaced, locale)" :icon="Replace" />
        <StatTile v-else :label="$t('outcomes.alreadyHadPhoto')" :value="number(run.counters.alreadyHadPhoto, locale)" :icon="Image" />
        <StatTile :label="$t('outcomes.noMatch')" :value="number(run.counters.noMatch, locale)" :icon="Search" />
        <StatTile :label="$t('outcomes.errors')" :value="number(run.counters.errors, locale)" :icon="CircleAlert" tone="text-error" />
      </div>
      <p v-if="run.mode === 'fill' && run.counters.replaced" class="-mt-2 flex items-center gap-1.5 text-sm text-base-content/60" data-testid="count-placeholders">
        <Replace class="size-4" />{{ $t("outcomes.placeholders") }}: {{ number(run.counters.replaced, locale) }}
      </p>
      <p v-if="run.mode !== 'fill' && run.counters.alreadyHadPhoto" class="-mt-2 flex items-center gap-1.5 text-sm text-base-content/60" data-testid="count-kept-google">
        <Image class="size-4" />{{ $t("outcomes.keptGoogle") }}: {{ number(run.counters.alreadyHadPhoto, locale) }}
      </p>

      <section class="rounded-box border border-base-300 bg-base-100 px-4 pt-4 sm:px-6">
        <div class="flex flex-wrap items-center gap-3">
          <div role="tablist" class="tabs tabs-border">
            <button
              v-for="key in ['changed', 'noMatch', 'errors', 'all'] as const"
              :key="key"
              type="button"
              role="tab"
              class="tab"
              :class="{ 'tab-active': tab === key }"
              :aria-selected="tab === key"
              @click="tab = key"
            >
              {{ $t(`report.tabs.${key}`) }} ({{ tabCount(key) }})
            </button>
          </div>
          <span class="flex-1"></span>
          <label class="input input-sm w-56"><Search class="size-4 opacity-50" /><input v-model="search" :placeholder="$t('report.search')" :aria-label="$t('report.search')" /></label>
        </div>
        <div class="overflow-x-auto">
          <p v-if="tab === 'noMatch' && rows.length" class="mt-3 flex gap-1.5 text-xs text-base-content/60"><Link class="mt-px size-3.5 shrink-0" />{{ $t("links.reportHint") }}</p>
          <table v-if="rows.length" class="table table-sm mt-2">
            <thead>
              <tr>
                <th>{{ $t("report.contact") }}</th>
                <th>{{ $t("report.matchedBy") }}</th>
                <th>{{ $t("report.source") }}</th>
                <th>{{ $t("report.beforeAfter") }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <template v-for="{ result, index } in rows" :key="index">
              <tr :class="{ 'opacity-60': result.undone }">
                <td class="font-medium">{{ result.name ?? "—" }}</td>
                <td class="text-base-content/60">
                  <span v-if="!result.matchedBy && result.error" class="line-clamp-2 max-w-[36rem] break-words text-error/80" :title="result.error">{{ result.error }}</span>
                  <template v-else>{{ result.matchedBy ?? "—" }}</template>
                </td>
                <td><SourceBadge v-if="result.source" :source="result.source" /></td>
                <td>
                  <PhotoCompare
                    v-if="changed(result)"
                    :name="result.name"
                    :source="result.source"
                    :matched-by="result.matchedBy"
                    :before="result.hasPrevious ? api.photoUrl(run.id, index, 'previous') : undefined"
                    :after="result.hasPhoto ? api.photoUrl(run.id, index, 'photo') : undefined"
                  />
                  <span v-else class="text-xs text-base-content/50">{{ $t(`outcomes.${result.outcome === "error" ? "errors" : result.outcome}`) }}</span>
                </td>
                <td class="text-right">
                  <span v-if="result.undone" class="badge badge-ghost badge-sm">{{ $t("report.undone") }}</span>
                  <button v-else-if="changed(result)" type="button" class="btn btn-ghost btn-xs" :disabled="undoing" @click="undoOne(index)"><Undo2 class="size-3.5" />{{ $t("report.undo") }}</button>
                  <button v-else-if="result.outcome === 'noMatch' && linking !== index" type="button" class="btn btn-ghost btn-xs" @click="startLink(index)">
                    <Link class="size-3.5" />{{ $t("links.add") }}
                  </button>
                </td>
              </tr>
              <tr v-if="linking === index" class="bg-base-200/60" :data-testid="`link-row-${index}`">
                <td colspan="5">
                  <div class="flex items-start gap-3">
                    <ProfileLinkLookup :label="$t('links.fieldFor', { name: result.name ?? '—' })" autofocus @found="(lookup) => (found = lookup)" />
                    <button type="button" class="btn btn-ghost btn-sm" @click="linking = undefined">{{ $t("common.cancel") }}</button>
                  </div>
                  <div v-if="found" class="mt-3 flex flex-wrap items-center gap-4 rounded-xl border border-base-300 bg-base-100 p-3">
                    <span class="grid size-12 place-items-center rounded-full bg-base-300 text-base font-semibold text-base-content/50">{{ (result.name ?? "?")[0] }}</span>
                    <ArrowRight class="size-4 text-base-content/40" />
                    <PhotoZoom :src="`data:image/jpeg;base64,${found.photo}`" :name="result.name"><img :src="`data:image/jpeg;base64,${found.photo}`" :alt="$t('links.foundOn', { network: found.network })" class="size-12 rounded-full object-cover" /></PhotoZoom>
                    <div class="min-w-[12rem] flex-1">
                      <div class="text-sm font-medium">{{ $t("links.foundOn", { network: found.network }) }}</div>
                      <div class="text-xs text-base-content/60">{{ $t("links.saveHint") }}</div>
                    </div>
                    <button type="button" class="btn btn-primary btn-sm" :disabled="saving" @click="saveLink(index)">
                      <span v-if="saving" class="loading loading-spinner loading-xs"></span><Check v-else class="size-4" />{{ $t("links.save") }}
                    </button>
                    <p v-if="saveError" class="w-full text-xs text-error" role="alert">{{ saveError }}</p>
                  </div>
                </td>
              </tr>
              </template>
            </tbody>
          </table>
          <p v-else class="py-8 text-center text-sm text-base-content/50">{{ $t("report.empty") }}</p>
        </div>
      </section>
    </div>
    <div v-else class="grid place-items-center py-12"><span class="loading loading-spinner"></span></div>
  </AppShell>
</template>
