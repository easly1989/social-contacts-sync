<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { ChevronRight, CircleCheck, Copy, Globe, Phone, RefreshCw, Sparkles, TriangleAlert } from "lucide-vue-next";

import AppShell from "../../components/AppShell.vue";
import ContactAvatar from "../../components/ContactAvatar.vue";
import MergePanel from "../../components/cleanup/MergePanel.vue";
import SharedNumberCard from "../../components/cleanup/SharedNumberCard.vue";
import { api, withGoogleDetail } from "../../api";
import { browserRegion, cleanupSummary } from "../../cleanupState";
import { number, relativeTime } from "../../format";
import { CleanupScan, DuplicateGroup, MissingCountryCode } from "../../../../interfaces/api";

// Mockup 4 in issue #8 (issues #28 and #30).
type Tab = "duplicates" | "shared" | "missing";
const { locale, t } = useI18n();
const scan = ref<CleanupScan | null>();
const scanning = ref(false);
const scanError = ref(false);
const tab = ref<Tab>("duplicates");
const selectedId = ref<string>();
/** The last change, with undo: a merge, a kept number or fixed country codes. */
const done = ref<{ message: string; undoneMessage: string; actionId: string; undone?: boolean; undoing?: boolean }>();
const busy = ref(false);
const actionError = ref<string>();

const selected = computed(() => scan.value?.duplicates.find((g) => g.id === selectedId.value) ?? scan.value?.duplicates[0]);
const tabs = computed(() => [
  { id: "duplicates" as const, icon: Copy, count: scan.value?.duplicates.length ?? 0 },
  { id: "shared" as const, icon: Phone, count: scan.value?.sharedNumbers.length ?? 0 },
  { id: "missing" as const, icon: Globe, count: scan.value?.missingCountryCode.length ?? 0 },
]);

function syncSummary(): void {
  const s = scan.value;
  cleanupSummary.value = s
    ? { scannedAt: s.scannedAt, totalContacts: s.totalContacts, duplicates: s.duplicates.length, sharedNumbers: s.sharedNumbers.length, missingCountryCode: s.missingCountryCode.length }
    : undefined;
}

async function runScan(): Promise<void> {
  scanning.value = true;
  scanError.value = false;
  try {
    scan.value = await api.scan(browserRegion());
    selectedId.value = undefined;
    done.value = undefined;
    syncSummary();
  } catch {
    scanError.value = true;
  }
  scanning.value = false;
}

function reasonText(group: DuplicateGroup): string {
  const what = group.reasons.map((r) => t(`cleanup.reasons.${r}`));
  return t("cleanup.same", { what: new Intl.ListFormat(locale.value, { type: "conjunction" }).format(what) });
}

function removeSelected(): void {
  const list = scan.value!.duplicates;
  const index = list.findIndex((g) => g.id === selected.value?.id);
  list.splice(index, 1);
  selectedId.value = list[Math.min(index, list.length - 1)]?.id;
  syncSummary();
}

function onMerged(actionId: string): void {
  const name = scan.value!.contacts[selected.value!.contactIds[0]]?.name ?? t("cleanup.noName");
  done.value = { message: t("cleanup.merged", { name }), undoneMessage: t("cleanup.undone", { name }), actionId };
  removeSelected();
}

/** Runs a change, then removes what it fixed from the page. */
async function act(run: () => Promise<void>): Promise<void> {
  busy.value = true;
  actionError.value = undefined;
  try {
    await run();
  } catch (e) {
    actionError.value = withGoogleDetail(t("cleanup.actionError"), e);
  }
  busy.value = false;
  syncSummary();
}

function nameOf(id: string): string {
  return scan.value!.contacts[id]?.name ?? t("cleanup.noName");
}

const keepNumber = (e164: string, contactId: string) =>
  act(async () => {
    const { actionId } = await api.keepNumber(e164, contactId);
    scan.value!.sharedNumbers = scan.value!.sharedNumbers.filter((s) => s.e164 !== e164);
    done.value = { message: t("cleanup.keptNumber", { name: nameOf(contactId) }), undoneMessage: t("cleanup.undoneChange"), actionId };
  });

const markShared = (e164: string, shared = true) =>
  act(async () => {
    await api.markShared(e164, shared);
    const marked = new Set(scan.value!.markedShared ?? []);
    if (shared) marked.add(e164);
    else marked.delete(e164);
    scan.value!.markedShared = [...marked];
    if (shared) scan.value!.sharedNumbers = scan.value!.sharedNumbers.filter((s) => s.e164 !== e164);
  });

const mergeNumber = (e164: string) =>
  act(async () => {
    const { group } = await api.groupFromNumber(e164);
    scan.value!.sharedNumbers = scan.value!.sharedNumbers.filter((s) => s.e164 !== e164);
    scan.value!.duplicates = [group, ...scan.value!.duplicates.filter((g) => g.id !== group.id)];
    selectedId.value = group.id;
    tab.value = "duplicates";
  });

// Missing country codes: every fixable number is selected to start with.
const fixKey = (m: MissingCountryCode) => `${m.contactId}\n${m.value}`;
const unselected = ref(new Set<string>());
const fixable = computed(() => scan.value?.missingCountryCode.filter((m) => m.suggestion) ?? []);
const toFix = computed(() => fixable.value.filter((m) => !unselected.value.has(fixKey(m))));
const regionName = computed(() => {
  const region = scan.value?.region;
  try {
    return region ? new Intl.DisplayNames([locale.value], { type: "region" }).of(region) : undefined;
  } catch {
    return region;
  }
});

function setFix(m: MissingCountryCode, on: boolean): void {
  const next = new Set(unselected.value);
  if (on) next.delete(fixKey(m));
  else next.add(fixKey(m));
  unselected.value = next;
}

function setAll(on: boolean): void {
  unselected.value = on ? new Set() : new Set(fixable.value.map(fixKey));
}

const fixCountryCodes = () =>
  act(async () => {
    const items = toFix.value.map(({ contactId, value }) => ({ contactId, value }));
    const { actionId, fixed } = await api.fixCountryCodes(items);
    const keys = new Set(items.map((i) => `${i.contactId}\n${i.value}`));
    scan.value!.missingCountryCode = scan.value!.missingCountryCode.filter((m) => !keys.has(fixKey(m)));
    done.value = { message: t("cleanup.fixed", fixed), undoneMessage: t("cleanup.undoneChange"), actionId };
  });

async function notDuplicates(): Promise<void> {
  await api.notDuplicates(selected.value!.id).catch(() => undefined);
  removeSelected();
}

function skip(): void {
  const list = scan.value!.duplicates;
  const index = list.findIndex((g) => g.id === selected.value?.id);
  selectedId.value = list[(index + 1) % list.length]?.id;
}

async function undoDone(): Promise<void> {
  const m = done.value!;
  m.undoing = true;
  try {
    await api.undoCleanup(m.actionId);
    m.undone = true;
    scan.value!.stale = true;
  } finally {
    m.undoing = false;
  }
}

onMounted(async () => {
  scan.value = (await api.cleanup().catch(() => ({ scan: null }))).scan;
});
</script>

<template>
  <AppShell :title="$t('cleanup.title')" :subtitle="scan ? $t('cleanup.scanned', { count: number(scan.totalContacts, locale), when: relativeTime(scan.scannedAt, locale) }) : $t('cleanup.subtitle')">
    <template #actions>
      <button v-if="scan" type="button" class="btn btn-ghost btn-sm" :disabled="scanning" @click="runScan">
        <RefreshCw class="size-4" :class="{ 'animate-spin': scanning }" />{{ $t("cleanup.scanAgain") }}
      </button>
    </template>

    <div v-if="scan === undefined" class="grid place-items-center py-16"><span class="loading loading-spinner"></span></div>

    <!-- Before the first scan -->
    <section v-else-if="scan === null" class="mx-auto max-w-xl rounded-box border border-base-300 bg-base-100 p-8 text-center">
      <div class="mx-auto grid size-14 place-items-center rounded-2xl bg-secondary/10 text-secondary"><Sparkles class="size-7" /></div>
      <h2 class="mt-5 text-lg font-semibold">{{ $t("cleanup.introTitle") }}</h2>
      <p class="mt-2 text-sm text-base-content/70">{{ $t("cleanup.introText") }}</p>
      <p v-if="scanError" class="mt-4 text-sm text-error">{{ $t("cleanup.scanError") }}</p>
      <button type="button" class="btn btn-primary mt-6" :disabled="scanning" @click="runScan">
        <span v-if="scanning" class="loading loading-spinner loading-sm"></span><RefreshCw v-else class="size-4" />
        {{ scanning ? $t("cleanup.scanning") : $t("cleanup.scan") }}
      </button>
    </section>

    <template v-else>
      <div v-if="scanError" class="alert alert-error mb-4 text-sm" role="alert">{{ $t("cleanup.scanError") }}</div>
      <div v-if="done" class="alert mb-4 text-sm" :class="done.undone ? '' : 'alert-success alert-soft'" role="status">
        <CircleCheck class="size-4" />
        <span class="flex-1">{{ done.undone ? done.undoneMessage : done.message }}</span>
        <button v-if="!done.undone" type="button" class="btn btn-ghost btn-xs" :disabled="done.undoing" @click="undoDone">{{ $t("report.undo") }}</button>
      </div>
      <div v-if="actionError" class="alert alert-error alert-soft mb-4 text-sm" role="alert">{{ actionError }}</div>
      <div v-if="scan.stale && !done?.undone" class="alert alert-warning alert-soft mb-4 text-sm" role="status">
        <TriangleAlert class="size-4" /><span class="flex-1">{{ $t("cleanup.stale") }}</span>
        <button type="button" class="btn btn-ghost btn-xs" :disabled="scanning" @click="runScan">{{ $t("cleanup.scanAgain") }}</button>
      </div>

      <div role="tablist" class="tabs tabs-box w-fit max-w-full overflow-x-auto bg-base-100">
        <button
          v-for="item in tabs"
          :key="item.id"
          type="button"
          role="tab"
          class="tab gap-2"
          :class="{ 'tab-active': tab === item.id }"
          :aria-selected="tab === item.id"
          @click="tab = item.id"
        >
          <component :is="item.icon" class="size-4" />{{ $t(`cleanup.tabs.${item.id}`) }}
          <span class="badge badge-sm">{{ item.count }}</span>
        </button>
      </div>

      <!-- Duplicates -->
      <div v-if="tab === 'duplicates'" class="mt-5">
        <div v-if="scan.duplicates.length" class="grid gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <ul class="max-h-[34rem] space-y-1 overflow-y-auto rounded-box border border-base-300 bg-base-100 p-2" :aria-label="$t('cleanup.tabs.duplicates')">
            <li v-for="group in scan.duplicates" :key="group.id">
              <button
                type="button"
                class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left"
                :class="group.id === selected?.id ? 'bg-primary/10' : 'hover:bg-base-200'"
                :aria-current="group.id === selected?.id ? 'true' : undefined"
                @click="selectedId = group.id"
              >
                <span class="flex -space-x-3">
                  <ContactAvatar v-for="id in group.contactIds.slice(0, 2)" :key="id" :name="scan.contacts[id]?.name" :photo-url="scan.contacts[id]?.photoUrl" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-medium">{{ scan.contacts[group.contactIds[0]]?.name ?? $t("cleanup.noName") }}</span>
                  <span class="block truncate text-xs text-base-content/60">{{ reasonText(group) }}<template v-if="group.contactIds.length > 2"> · {{ $t("cleanup.contacts", { count: group.contactIds.length }) }}</template></span>
                </span>
                <ChevronRight v-if="group.id === selected?.id" class="size-4 text-primary" />
              </button>
            </li>
          </ul>
          <MergePanel v-if="selected" :group="selected" :contacts="scan.contacts" @merged="onMerged" @not-duplicates="notDuplicates" @skip="skip" />
        </div>
        <p v-else class="rounded-box border border-base-300 bg-base-100 py-12 text-center text-sm text-base-content/60">{{ $t("cleanup.noDuplicates") }}</p>
      </div>

      <!-- Shared numbers -->
      <div v-else-if="tab === 'shared'" class="mt-5 space-y-3">
        <p class="text-sm text-base-content/70">{{ $t("cleanup.sharedLead") }}</p>
        <SharedNumberCard
          v-for="item in scan.sharedNumbers"
          :key="item.e164"
          :item="item"
          :contacts="scan.contacts"
          :busy="busy"
          @keep="(id) => keepNumber(item.e164, id)"
          @merge="mergeNumber(item.e164)"
          @mark-shared="markShared(item.e164)"
        />
        <p v-if="!scan.sharedNumbers.length" class="rounded-box border border-base-300 bg-base-100 py-12 text-center text-sm text-base-content/60">{{ $t("cleanup.noShared") }}</p>
        <div v-if="scan.markedShared?.length" class="rounded-box border border-base-300 bg-base-100 p-5" data-testid="marked-shared">
          <h2 class="text-sm font-semibold">{{ $t("cleanup.markedTitle") }}</h2>
          <p class="mt-0.5 text-xs text-base-content/60">{{ $t("cleanup.markedHint") }}</p>
          <ul class="mt-3 flex flex-wrap gap-2">
            <li v-for="number in scan.markedShared" :key="number" class="flex items-center gap-2 rounded-full border border-base-300 py-1 pl-3 pr-1 text-sm tabular-nums">
              {{ number }}<button type="button" class="btn btn-ghost btn-xs" :disabled="busy" @click="markShared(number, false)">{{ $t("cleanup.unmark") }}</button>
            </li>
          </ul>
        </div>
      </div>

      <!-- Missing country code -->
      <div v-else class="mt-5 space-y-3">
        <p class="text-sm text-base-content/70">{{ $t("cleanup.missingLead") }}</p>
        <section class="overflow-x-auto rounded-box border border-base-300 bg-base-100">
          <template v-if="scan.missingCountryCode.length">
            <div class="flex flex-wrap items-center gap-3 border-b border-base-300 px-4 py-3">
              <span class="flex-1 text-sm text-base-content/60">{{ regionName ? $t("cleanup.country", { country: regionName }) : $t("cleanup.noCountry") }}</span>
              <button type="button" class="btn btn-primary btn-sm" :disabled="busy || !toFix.length" @click="fixCountryCodes">
                <span v-if="busy" class="loading loading-spinner loading-xs"></span>
                {{ busy ? $t("cleanup.fixing", toFix.length) : $t("cleanup.fixSelected", toFix.length) }}
              </button>
            </div>
            <table class="table">
              <thead>
                <tr>
                  <th class="w-10">
                    <input type="checkbox" class="checkbox checkbox-primary checkbox-sm" :aria-label="$t('cleanup.selectAll')" :checked="toFix.length === fixable.length && fixable.length > 0" @change="setAll(($event.target as HTMLInputElement).checked)" />
                  </th>
                  <th>{{ $t("report.contact") }}</th><th>{{ $t("cleanup.savedAs") }}</th><th>{{ $t("cleanup.suggestion") }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in scan.missingCountryCode" :key="fixKey(item)" :class="{ 'opacity-60': !item.suggestion }">
                  <td>
                    <input
                      type="checkbox"
                      class="checkbox checkbox-primary checkbox-sm"
                      :aria-label="`${nameOf(item.contactId)} ${item.value}`"
                      :disabled="!item.suggestion"
                      :checked="Boolean(item.suggestion) && !unselected.has(fixKey(item))"
                      @change="setFix(item, ($event.target as HTMLInputElement).checked)"
                    />
                  </td>
                  <td>
                    <div class="flex items-center gap-2"><ContactAvatar :name="scan.contacts[item.contactId]?.name" :photo-url="scan.contacts[item.contactId]?.photoUrl" size="size-7" />{{ nameOf(item.contactId) }}</div>
                  </td>
                  <td class="tabular-nums">{{ item.value }}</td>
                  <td class="tabular-nums">{{ item.suggestion ?? $t("cleanup.cantParse") }}</td>
                </tr>
              </tbody>
            </table>
          </template>
          <p v-else class="py-12 text-center text-sm text-base-content/60">{{ $t("cleanup.noMissing") }}</p>
        </section>
      </div>
    </template>
  </AppShell>
</template>
