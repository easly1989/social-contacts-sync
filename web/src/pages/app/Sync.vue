<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { List, RefreshCw, SquareStack } from "lucide-vue-next";

import AppShell from "../../components/AppShell.vue";
import ProfileList from "../../components/profiles/ProfileList.vue";
import ProfileReview from "../../components/profiles/ProfileReview.vue";
import ProfileSources from "../../components/profiles/ProfileSources.vue";
import RunSetup from "../../components/sync/RunSetup.vue";
import { api } from "../../api";
import { number } from "../../format";
import { networkInfo } from "../../profileNetworks";
import { initialPick, ProfilePick } from "../../profilePick";
import { reviewCount } from "../../reviewState";
import { signInAgainIfNeeded } from "../../signInAgain";
import { notify, notifyError } from "../../toasts";
import { ProfilesOverview, SocialNetwork } from "../../../../interfaces/api";

// Sync (issue #81): To review, Sources and Run in one page, each tab with its
// own address. /app/sync on its own opens Run, Sync photos' old page.
const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();

type Tab = "review" | "sources" | "run";
const tabs: Tab[] = ["review", "sources", "run"];
const tab = computed<Tab>(() => (tabs.includes(route.query.tab as Tab) ? (route.query.tab as Tab) : "run"));
const setTab = (key: Tab) => router.replace({ query: { ...route.query, tab: key } });

type View = "list" | "single";
const viewKey = "scs-profiles-view";
const readView = (): View => {
  try {
    return localStorage.getItem(viewKey) === "single" ? "single" : "list";
  } catch {
    return "list";
  }
};
const view = ref<View>(readView());
watch(view, (v) => {
  try {
    localStorage.setItem(viewKey, v);
  } catch {
    // Remembering the view is a convenience.
  }
});

const overview = ref<ProfilesOverview>();
const loadError = ref(false);
const filter = ref<SocialNetwork | "">("");

async function load(): Promise<void> {
  try {
    overview.value = await api.profiles();
    reviewCount.value = overview.value.suggestions.length;
    loadError.value = false;
  } catch {
    loadError.value = !overview.value;
    await signInAgainIfNeeded(router);
  }
}

// To review and Sources read the address book; Run doesn't need to.
watch(tab, (key) => key !== "run" && !overview.value && void load(), { immediate: true });

// While a search, a scan or a bulk confirm runs, its progress comes in.
let poll: number | undefined;
const busy = computed(() => overview.value?.search.running || overview.value?.bulk?.running || overview.value?.scans?.some((s) => s.running));
onMounted(() => (poll = window.setInterval(() => busy.value && tab.value !== "run" && void load(), 2500)));
onBeforeUnmount(() => window.clearInterval(poll));

// When a bulk confirm ends: how it went.
watch(
  () => overview.value?.bulk?.running,
  (running, was) => {
    const bulk = overview.value?.bulk;
    if (was !== true || running || !bulk) return;
    if (bulk.contacts) notify(t("sync.bulkDone", bulk.contacts));
    if (bulk.failed.length)
      notifyError(
        t("profiles.list.failed", { count: bulk.failed.length, names: bulk.failed.map((f) => f.name).join(", ") }, bulk.failed.length),
        undefined,
        bulk.failed.map((f) => `${f.name}: ${f.error}`).join("\n")
      );
  }
);

const queue = computed(() =>
  (overview.value?.suggestions ?? [])
    .map((s) => ({ ...s, candidates: filter.value ? s.candidates.filter((c) => c.person.network === filter.value) : s.candidates }))
    .filter((s) => s.candidates.length)
);
const networksInQueue = computed(() => [...new Set((overview.value?.suggestions ?? []).flatMap((s) => s.candidates.map((c) => c.person.network)))]);
const hasSources = computed(() => overview.value?.sources.some((s) => s.people > 0));

// What each card has ticked, kept while moving between views and pages.
const picks = reactive<Record<string, ProfilePick>>({});
watch(
  queue,
  (list) => {
    for (const s of list) {
      const ids = new Set(s.candidates.map((c) => c.person.id));
      const pick = picks[s.contactId];
      if (!pick || pick.ticked.some((id) => !ids.has(id))) picks[s.contactId] = initialPick(s);
    }
  },
  { immediate: true }
);
const setPick = (contactId: string, pick: ProfilePick) => (picks[contactId] = pick);
const toReview = computed(() => overview.value?.suggestions.length ?? reviewCount.value);
</script>

<template>
  <AppShell :title="$t('sync.title')" :subtitle="$t('sync.subtitle')">
    <template v-if="tab !== 'run'" #actions>
      <button type="button" class="btn btn-ghost btn-sm" @click="load"><RefreshCw class="size-4" />{{ $t("dashboard.refresh") }}</button>
    </template>

    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-end gap-3">
        <div role="tablist" class="tabs tabs-border flex-1">
          <button v-for="key in tabs" :key="key" type="button" role="tab" class="tab" :class="{ 'tab-active': tab === key }" :aria-selected="tab === key" @click="setTab(key)">
            {{ $t(`sync.tabs.${key}`) }}<template v-if="key === 'review' && toReview !== undefined"> ({{ number(toReview, locale) }})</template>
          </button>
        </div>
        <select v-if="tab === 'review' && networksInQueue.length > 1" v-model="filter" class="select select-sm w-48" :aria-label="$t('profiles.filter')">
          <option value="">{{ $t("profiles.allSources") }}</option>
          <option v-for="n in networksInQueue" :key="n" :value="n">{{ networkInfo[n].name }}</option>
        </select>
      </div>

      <RunSetup v-if="tab === 'run'" />
      <template v-else-if="overview">
        <template v-if="tab === 'review'">
          <template v-if="queue.length">
            <ProfileList v-if="view === 'list'" :queue="queue" :picks="picks" :bulk="overview.bulk" @update:pick="setPick" @changed="load">
              <template #view>
                <div class="join" role="group" :aria-label="$t('profiles.view.label')">
                  <button type="button" class="btn join-item btn-sm btn-active" :aria-label="$t('profiles.view.list')" :title="$t('profiles.view.list')" aria-pressed="true"><List class="size-4" /></button>
                  <button type="button" class="btn join-item btn-sm" :aria-label="$t('profiles.view.single')" :title="$t('profiles.view.single')" aria-pressed="false" @click="view = 'single'"><SquareStack class="size-4" /></button>
                </div>
              </template>
            </ProfileList>
            <template v-else>
              <div class="flex justify-end">
                <div class="join" role="group" :aria-label="$t('profiles.view.label')">
                  <button type="button" class="btn join-item btn-sm" :aria-label="$t('profiles.view.list')" :title="$t('profiles.view.list')" aria-pressed="false" @click="view = 'list'"><List class="size-4" /></button>
                  <button type="button" class="btn join-item btn-sm btn-active" :aria-label="$t('profiles.view.single')" :title="$t('profiles.view.single')" aria-pressed="true"><SquareStack class="size-4" /></button>
                </div>
              </div>
              <ProfileReview :key="queue[0].contactId" :suggestion="queue[0]" :pick="picks[queue[0].contactId]" :total="queue.length" @update:pick="setPick(queue[0].contactId, $event)" @done="load" />
            </template>
          </template>
          <section v-else class="rounded-box border border-base-300 bg-base-100 p-8 text-center text-sm text-base-content/60">
            <p>{{ hasSources ? $t("profiles.emptyReview") : $t("profiles.noSources") }}</p>
            <button type="button" class="btn btn-primary btn-sm mt-4" @click="setTab('sources')">{{ $t("profiles.goSources") }}</button>
          </section>
        </template>

        <section v-else class="space-y-3">
          <div>
            <h2 class="text-lg font-semibold">{{ $t("sync.findNew") }}</h2>
            <p class="text-sm text-base-content/60">{{ $t("sync.findNewLead") }}</p>
          </div>
          <ProfileSources :overview="overview" @changed="load" />
        </section>
      </template>
      <div v-else-if="loadError" class="flex flex-col items-center gap-3 py-12 text-sm text-base-content/60">
        {{ $t("contacts.errors.load") }}<button type="button" class="btn btn-sm" @click="load"><RefreshCw class="size-4" />{{ $t("contacts.retry") }}</button>
      </div>
      <div v-else class="grid place-items-center py-12"><span class="loading loading-spinner"></span></div>
    </div>
  </AppShell>
</template>
