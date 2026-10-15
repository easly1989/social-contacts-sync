<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { ExternalLink, RefreshCw, Undo2, X } from "lucide-vue-next";

import AppShell from "../../components/AppShell.vue";
import NetworkMark from "../../components/profiles/NetworkMark.vue";
import ProfileReview from "../../components/profiles/ProfileReview.vue";
import ProfileSources from "../../components/profiles/ProfileSources.vue";
import { api, withGoogleDetail } from "../../api";
import { dateTime, number } from "../../format";
import { networkInfo } from "../../profileNetworks";
import { signInAgainIfNeeded } from "../../signInAgain";
import { ProfileLinked, ProfilesOverview, SocialNetwork } from "../../../../interfaces/api";

// Find profiles (issue #61): review the suggested profiles contact by
// contact, choose where they come from, and see what was linked.
const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();

type Tab = "review" | "sources" | "linked";
const tab = computed<Tab>(() => (["review", "sources", "linked"].includes(String(route.query.tab)) ? (route.query.tab as Tab) : "review"));
const setTab = (key: Tab) => router.replace({ query: { ...route.query, tab: key } });

const overview = ref<ProfilesOverview>();
const loadError = ref(false);
const notice = ref<{ text: string; error?: boolean }>();
const filter = ref<SocialNetwork | "">("");

async function load(): Promise<void> {
  try {
    overview.value = await api.profiles();
    loadError.value = false;
  } catch {
    loadError.value = !overview.value;
    await signInAgainIfNeeded(router);
  }
}

// While a search or a scan runs, its progress and new suggestions come in.
let poll: number | undefined;
const busy = computed(() => overview.value?.search.running || overview.value?.scans?.some((s) => s.running));
onMounted(async () => {
  await load();
  poll = window.setInterval(() => busy.value && void load(), 2500);
});
onBeforeUnmount(() => window.clearInterval(poll));

const queue = computed(() =>
  (overview.value?.suggestions ?? [])
    .map((s) => ({ ...s, candidates: filter.value ? s.candidates.filter((c) => c.person.network === filter.value) : s.candidates }))
    .filter((s) => s.candidates.length)
);
const networksInQueue = computed(() => [...new Set((overview.value?.suggestions ?? []).flatMap((s) => s.candidates.map((c) => c.person.network)))]);
const hasSources = computed(() => overview.value?.sources.some((s) => s.people > 0));

async function reviewed(text?: string): Promise<void> {
  if (text) notice.value = { text };
  await load();
}

async function undo(item: ProfileLinked): Promise<void> {
  try {
    await api.undoProfile(item.contactId, item.person.id);
    notice.value = { text: t("profiles.undone", { name: item.name }) };
  } catch (e) {
    notice.value = { text: withGoogleDetail(t("profiles.errors.undo"), e), error: true };
  }
  await load();
}
</script>

<template>
  <AppShell :title="$t('profiles.title')" :subtitle="$t('profiles.subtitle')">
    <template #actions>
      <button type="button" class="btn btn-ghost btn-sm" @click="load"><RefreshCw class="size-4" />{{ $t("dashboard.refresh") }}</button>
    </template>

    <div v-if="overview" class="flex flex-col gap-4">
      <div role="tablist" class="tabs tabs-border">
        <button
          v-for="key in ['review', 'sources', 'linked'] as const"
          :key="key"
          type="button"
          role="tab"
          class="tab"
          :class="{ 'tab-active': tab === key }"
          :aria-selected="tab === key"
          @click="setTab(key)"
        >
          {{ $t(`profiles.tabs.${key}`) }}<template v-if="key === 'review'"> ({{ number(overview.suggestions.length, locale) }})</template
          ><template v-else-if="key === 'linked'"> ({{ number(overview.linked.filter((l) => !l.undone).length, locale) }})</template>
        </button>
      </div>

      <template v-if="tab === 'review'">
        <div v-if="networksInQueue.length > 1" class="flex flex-wrap items-center gap-3 text-sm text-base-content/60">
          <span class="flex-1"></span>
          <select v-model="filter" class="select select-sm w-48" :aria-label="$t('profiles.filter')">
            <option value="">{{ $t("profiles.allSources") }}</option>
            <option v-for="n in networksInQueue" :key="n" :value="n">{{ networkInfo[n].name }}</option>
          </select>
        </div>
        <ProfileReview v-if="queue.length" :key="queue[0].contactId" :suggestion="queue[0]" :position="1" :total="queue.length" @done="reviewed" />
        <section v-else class="rounded-box border border-base-300 bg-base-100 p-8 text-center text-sm text-base-content/60">
          <p>{{ hasSources ? $t("profiles.emptyReview") : $t("profiles.noSources") }}</p>
          <button type="button" class="btn btn-primary btn-sm mt-4" @click="setTab('sources')">{{ $t("profiles.goSources") }}</button>
        </section>
      </template>

      <ProfileSources v-else-if="tab === 'sources'" :overview="overview" @changed="load" />

      <section v-else class="overflow-x-auto rounded-box border border-base-300 bg-base-100" data-testid="profiles-linked">
        <table v-if="overview.linked.length" class="table">
          <tbody>
            <tr v-for="item in overview.linked" :key="`${item.contactId}-${item.person.id}-${item.at}`" :class="{ 'opacity-60': item.undone }">
              <td class="w-44 whitespace-nowrap text-base-content/70">{{ dateTime(item.at, locale) }}</td>
              <td class="font-medium">{{ item.name }}</td>
              <td>
                <div class="flex items-center gap-2"><NetworkMark :network="item.person.network" badge /><a :href="item.person.url" target="_blank" rel="noopener" class="link link-hover text-sm">{{ item.person.url.replace("https://", "") }}<ExternalLink class="ml-1 inline size-3" /></a></div>
              </td>
              <td class="text-xs text-base-content/60">{{ item.photoSet ? $t("profiles.withPhoto") : "" }}</td>
              <td class="text-right">
                <span v-if="item.undone" class="badge badge-ghost badge-sm">{{ $t("history.undone") }}</span>
                <button v-else type="button" class="btn btn-ghost btn-xs" @click="undo(item)"><Undo2 class="size-3.5" />{{ $t("report.undo") }}</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="p-8 text-center text-sm text-base-content/60">{{ $t("profiles.noneLinked") }}</p>
      </section>
    </div>
    <div v-else-if="loadError" class="flex flex-col items-center gap-3 py-12 text-sm text-base-content/60">
      {{ $t("contacts.errors.load") }}<button type="button" class="btn btn-sm" @click="load"><RefreshCw class="size-4" />{{ $t("contacts.retry") }}</button>
    </div>
    <div v-else class="grid place-items-center py-12"><span class="loading loading-spinner"></span></div>

    <div v-if="notice" class="toast toast-center z-40" role="status">
      <div class="alert" :class="notice.error ? 'alert-error' : ''">
        <span>{{ notice.text }}</span>
        <button type="button" class="btn btn-ghost btn-sm btn-square" :aria-label="$t('contacts.close')" @click="notice = undefined"><X class="size-4" /></button>
      </div>
    </div>
  </AppShell>
</template>
