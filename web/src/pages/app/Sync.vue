<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { List, RefreshCw, Search, SquareStack } from "lucide-vue-next";

import AppShell from "../../components/AppShell.vue";
import ProfileList from "../../components/profiles/ProfileList.vue";
import ProfileReview from "../../components/profiles/ProfileReview.vue";
import ProfileSources from "../../components/profiles/ProfileSources.vue";
import RunTab from "../../components/sync/RunTab.vue";
import SourceOrder from "../../components/sync/SourceOrder.vue";
import { api } from "../../api";
import { number } from "../../format";
import { initialPick, ProfilePick, wantsPhotoFor } from "../../profilePick";
import { loadReviewCount, reviewCount } from "../../reviewState";
import { run, running } from "../../runState";
import { signInAgainIfNeeded } from "../../signInAgain";
import { notify, notifyError } from "../../toasts";
import { ProfilesOverview, ProfileSuggestion } from "../../../../interfaces/api";

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

// While a search, a scan, a bulk confirm or a sync runs, its progress (and what a sync queues) comes in.
let poll: number | undefined;
const busy = computed(() => running.value || overview.value?.search.running || overview.value?.bulk?.running || overview.value?.scans?.some((s) => s.running));
onMounted(() => (poll = window.setInterval(() => busy.value && tab.value !== "run" && void load(), 2500)));
onBeforeUnmount(() => window.clearInterval(poll));
// A finished sync leaves new contacts to review.
watch(
  () => run.runId,
  (runId) => {
    if (!runId) return;
    if (tab.value === "run") overview.value = undefined;
    else void load();
    void loadReviewCount(true);
  }
);
const runLabel = computed(() => (running.value ? ` · ${Math.floor(run.progress)}%` : ""));

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

// To review's filters and search by name (issue #104): one kind of card at a time.
type Filter = "noPhoto" | "different" | "profiles" | "changed" | "all";
const filters: Filter[] = ["noPhoto", "different", "profiles", "changed", "all"];
const matches: Record<Filter, (s: ProfileSuggestion) => boolean> = {
  noPhoto: wantsPhotoFor,
  different: (s) => s.queue?.kind === "photo" && s.hasPhoto && !s.placeholder,
  profiles: (s) => s.candidates.length > 0,
  changed: (s) => s.queue?.kind === "changed",
  all: () => true,
};
const suggestions = computed(() => overview.value?.suggestions ?? []);
const counts = computed(() => Object.fromEntries(filters.map((f) => [f, suggestions.value.filter(matches[f]).length])) as Record<Filter, number>);
const chosenFilter = ref<Filter>();
// Contacts without a photo first, while there are some: a choice there adds a face rather than swapping one.
const filter = computed<Filter>(() => chosenFilter.value ?? (counts.value.noPhoto ? "noPhoto" : "all"));
const search = ref("");
const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const queue = computed(() => suggestions.value.filter(matches[filter.value]).filter((s) => !search.value.trim() || fold(s.name).includes(fold(search.value.trim()))));
const hasSources = computed(() => overview.value?.sources.some((s) => s.people > 0));

// What each card has ticked, kept while moving between views and pages.
const picks = reactive<Record<string, ProfilePick>>({});
/** When each card's sync photos came, to start the card afresh when a later sync changes them. */
const queuedAt: Record<string, string | undefined> = {};
watch(
  suggestions,
  (list) => {
    for (const s of list) {
      const ids = new Set(s.candidates.map((c) => c.person.id));
      const pick = picks[s.contactId];
      if (!pick || pick.ticked.some((id) => !ids.has(id)) || queuedAt[s.contactId] !== s.queue?.addedAt) picks[s.contactId] = initialPick(s);
      queuedAt[s.contactId] = s.queue?.addedAt;
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
            {{ $t(`sync.tabs.${key}`) }}<template v-if="key === 'review' && toReview !== undefined"> ({{ number(toReview, locale) }})</template><template v-if="key === 'run'">{{ runLabel }}</template>
          </button>
        </div>
      </div>
      <div v-if="tab === 'review' && overview && suggestions.length" class="flex flex-wrap items-center gap-2" data-testid="review-filters">
        <div class="flex flex-wrap gap-2" role="group" :aria-label="$t('sync.filters.label')">
          <template v-for="f in filters" :key="f">
            <button
              v-if="counts[f] || f === 'all' || f === filter"
              type="button"
              class="btn btn-sm rounded-full"
              :class="f === filter ? 'btn-primary' : 'btn-ghost border-base-300'"
              :aria-pressed="f === filter"
              @click="chosenFilter = f"
            >
              {{ $t(`sync.filters.${f}`) }}<span class="badge badge-sm" :class="f === filter ? 'badge-ghost' : ''">{{ number(counts[f], locale) }}</span>
            </button>
          </template>
        </div>
        <label class="input input-sm w-full sm:ml-auto sm:w-56">
          <Search class="size-4 opacity-50" aria-hidden="true" /><input v-model="search" type="search" :placeholder="$t('sync.filters.search')" :aria-label="$t('sync.filters.search')" />
        </label>
      </div>

      <RunTab v-if="tab === 'run'" @review="setTab('review')" @sources="setTab('sources')" />
      <!-- The sources a sync uses don't need the address book. -->
      <SourceOrder v-if="tab === 'sources'" />
      <template v-if="tab !== 'run' && overview">
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
          <p v-else-if="suggestions.length" class="rounded-box border border-base-300 bg-base-100 p-8 text-center text-sm text-base-content/60">
            {{ search.trim() ? $t("sync.filters.empty", { query: search.trim() }) : $t("profiles.emptyReview") }}
          </p>
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
      <div v-else-if="tab !== 'run' && loadError" class="flex flex-col items-center gap-3 py-12 text-sm text-base-content/60">
        {{ $t("contacts.errors.load") }}<button type="button" class="btn btn-sm" @click="load"><RefreshCw class="size-4" />{{ $t("contacts.retry") }}</button>
      </div>
      <div v-else-if="tab !== 'run'" class="grid place-items-center py-12"><span class="loading loading-spinner"></span></div>
    </div>
  </AppShell>
</template>
