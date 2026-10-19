<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { ArrowLeft, ArrowRight, ChevronDown, List, RefreshCw, Search, SquareStack } from "lucide-vue-next";

import AppShell from "../../components/AppShell.vue";
import LoginSearchNotice from "../../components/profiles/LoginSearchNotice.vue";
import ProfileList from "../../components/profiles/ProfileList.vue";
import ProfileReview from "../../components/profiles/ProfileReview.vue";
import ProfileSources from "../../components/profiles/ProfileSources.vue";
import RunTab from "../../components/sync/RunTab.vue";
import SourceOrder from "../../components/sync/SourceOrder.vue";
import SyncSummary from "../../components/sync/SyncSummary.vue";
import { api } from "../../api";
import { number } from "../../format";
import { socialLogins } from "../../loginSearch";
import { initialPick, ProfilePick, wantsPhotoFor } from "../../profilePick";
import { loadReviewCount, reviewCount } from "../../reviewState";
import { run, running } from "../../runState";
import { signInAgainIfNeeded } from "../../signInAgain";
import { notify, notifyError } from "../../toasts";
import { networkInfo } from "../../profileNetworks";
import { ProfilesOverview, ProfileSuggestion, ReviewStep, SocialNetwork } from "../../../../interfaces/api";

// Sync (issue #107): six steps, each with its own address, all skippable and reachable from the stepper.
const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();

const steps = ["sources", "profiles", "run", "photos", "search", "summary"] as const;
type Step = (typeof steps)[number];
// The tabs before issue #107 lead to their step.
const legacy: Record<string, Step> = { review: "photos", sources: "sources", run: "run" };
const step = computed<Step>(() => {
  const asked = (route.query.step ?? legacy[String(route.query.tab)]) as Step;
  if (steps.includes(asked)) return asked;
  return running.value ? "run" : "sources";
});
const index = computed(() => steps.indexOf(step.value));
const go = (key: Step) => router.replace({ query: { step: key } });
const next = () => index.value < steps.length - 1 && go(steps[index.value + 1]);
const back = () => index.value > 0 && go(steps[index.value - 1]);
const reviewStep = computed(() => (["profiles", "photos", "search"].includes(step.value) ? (step.value as ReviewStep) : undefined));

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
    // As the sidebar counts them: every card outside To search, once.
    reviewCount.value = overview.value.suggestions.filter((s) => !s.steps.includes("search")).length;
    socialLogins.value = overview.value.scans ?? socialLogins.value;
    loadError.value = false;
  } catch {
    loadError.value = !overview.value;
    await signInAgainIfNeeded(router);
  }
}
// The counts in the stepper come with the address book.
onMounted(() => void load());

// While a search, a scan, a bulk confirm or a sync runs, its progress (and what a sync queues) comes in.
let poll: number | undefined;
const busy = computed(
  () => running.value || overview.value?.search.running || overview.value?.bulk?.running || overview.value?.loginSearch?.running || overview.value?.scans?.some((s) => s.running)
);
onMounted(() => (poll = window.setInterval(() => busy.value && step.value !== "run" && void load(), 2500)));
onBeforeUnmount(() => window.clearInterval(poll));
// A finished sync leaves new cards.
watch(
  () => run.runId,
  (runId) => {
    if (!runId) return;
    void load();
    void loadReviewCount(true);
  }
);

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
// When a search with the login ends: what it found, and which site said no.
watch(
  () => overview.value?.loginSearch?.running,
  (running, was) => {
    const search = overview.value?.loginSearch;
    if (was !== true || running || !search) return;
    notify(t("sync.search.done", search.suggested));
    for (const stop of search.stopped ?? []) {
      const [reason, network] = [stop.slice(0, stop.lastIndexOf(":")), stop.slice(stop.lastIndexOf(":") + 1)];
      const name = networkInfo[network as SocialNetwork]?.name ?? network;
      notifyError(t(`sync.search.stopped.${reason.startsWith("error") ? "error" : reason}`, { network: name }));
    }
  }
);

// Photos' filters (issue #104), and a search by name in every review step.
type Filter = "noPhoto" | "different" | "changed" | "all";
const filters: Filter[] = ["noPhoto", "different", "changed", "all"];
const matches: Record<Filter, (s: ProfileSuggestion) => boolean> = {
  noPhoto: wantsPhotoFor,
  different: (s) => s.queue?.kind === "photo" && s.hasPhoto && !s.placeholder,
  changed: (s) => s.queue?.kind === "changed",
  all: () => true,
};
const suggestions = computed(() => overview.value?.suggestions ?? []);
const inStep = computed(() => (reviewStep.value ? suggestions.value.filter((s) => s.steps.includes(reviewStep.value!)) : []));
const counts = computed(() => Object.fromEntries(filters.map((f) => [f, inStep.value.filter(matches[f]).length])) as Record<Filter, number>);
const chosenFilter = ref<Filter>();
// Contacts without a photo first, while there are some: a choice there adds a face rather than swapping one.
const filter = computed<Filter>(() => (step.value !== "photos" ? "all" : (chosenFilter.value ?? (counts.value.noPhoto ? "noPhoto" : "all"))));
const search = ref("");
const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const queue = computed(() => inStep.value.filter(matches[filter.value]).filter((s) => !search.value.trim() || fold(s.name).includes(fold(search.value.trim()))));
watch(step, () => (search.value = ""));

// What each card has ticked, kept while moving between steps and pages.
const picks = reactive<Record<string, ProfilePick>>({});
/** When each card's sync photos came, and which profiles it suggested: a card starts afresh when a later sync or a search (issue #104) changes them. */
const queuedAt: Record<string, string | undefined> = {};
const suggested: Record<string, string> = {};
watch(
  suggestions,
  (list) => {
    for (const s of list) {
      const ids = new Set(s.candidates.map((c) => c.person.id));
      const pick = picks[s.contactId];
      const key = [...ids].join();
      const grew = suggested[s.contactId] !== undefined && suggested[s.contactId] !== key && !pick?.ticked.length;
      if (!pick || grew || pick.ticked.some((id) => !ids.has(id)) || queuedAt[s.contactId] !== s.queue?.addedAt) picks[s.contactId] = initialPick(s);
      queuedAt[s.contactId] = s.queue?.addedAt;
      suggested[s.contactId] = key;
    }
  },
  { immediate: true }
);
const setPick = (contactId: string, pick: ProfilePick) => (picks[contactId] = pick);

const count = (key: Step) => (key === "profiles" || key === "photos" || key === "search" ? overview.value?.steps[key] : undefined);
const runLabel = computed(() => (running.value ? `${Math.floor(run.progress)}%` : ""));
const menuOpen = ref(false);
</script>

<template>
  <AppShell :title="$t('sync.title')" :subtitle="$t('sync.subtitle')">
    <template #actions>
      <button type="button" class="btn btn-ghost btn-sm" @click="load"><RefreshCw class="size-4" />{{ $t("dashboard.refresh") }}</button>
    </template>

    <div class="flex flex-col gap-4">
      <!-- The stepper; on a phone, folded into "Step N of 6" with the steps in a menu. -->
      <nav :aria-label="$t('wizard.label')" data-testid="wizard-steps">
        <ol class="hidden items-center gap-2 md:flex">
          <template v-for="(key, i) in steps" :key="key">
            <li v-if="i" class="h-px min-w-3 flex-1 bg-base-300" aria-hidden="true"></li>
            <li>
              <button
                type="button"
                class="flex items-center gap-2 rounded-full px-1 py-1 text-sm whitespace-nowrap"
                :class="key === step ? 'font-semibold text-base-content' : 'text-base-content/60 hover:text-base-content'"
                :aria-current="key === step ? 'step' : undefined"
                :data-testid="`wizard-step-${key}`"
                @click="go(key)"
              >
                <span
                  class="grid size-6 place-items-center rounded-full border text-xs font-semibold"
                  :class="key === step ? 'border-primary bg-primary text-primary-content' : i < index ? 'border-primary/40 text-primary' : 'border-base-300'"
                  >{{ i + 1 }}</span
                >{{ $t(`wizard.steps.${key}`) }}<span v-if="count(key)" class="badge badge-primary badge-soft badge-sm">{{ number(count(key)!, locale) }}</span
                ><span v-if="key === 'run' && runLabel" class="text-xs text-primary">{{ runLabel }}</span>
              </button>
            </li>
          </template>
        </ol>
        <div class="md:hidden">
          <button type="button" class="flex w-full items-center gap-3 rounded-box border border-base-300 bg-base-100 px-3 py-2 text-left" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">
            <span class="radial-progress text-[10px] text-primary" :style="{ '--value': ((index + 1) / steps.length) * 100, '--size': '2rem', '--thickness': '3px' }" aria-hidden="true">{{ index + 1 }}/6</span>
            <span class="flex-1"
              ><span class="block text-xs text-base-content/60">{{ $t("wizard.stepOf", { step: index + 1, total: steps.length }) }}</span><b>{{ $t(`wizard.steps.${step}`) }}</b></span
            ><ChevronDown class="size-4" aria-hidden="true" />
          </button>
          <ol v-if="menuOpen" class="menu mt-1 w-full rounded-box border border-base-300 bg-base-100">
            <li v-for="(key, i) in steps" :key="key">
              <button type="button" :class="{ 'menu-active': key === step }" :aria-current="key === step ? 'step' : undefined" @click="go(key), (menuOpen = false)">
                {{ i + 1 }}. {{ $t(`wizard.steps.${key}`) }}<span v-if="count(key)" class="badge badge-sm">{{ number(count(key)!, locale) }}</span>
              </button>
            </li>
          </ol>
        </div>
      </nav>

      <header>
        <div class="hidden text-xs font-semibold text-base-content/50 md:block">{{ $t("wizard.stepOf", { step: index + 1, total: steps.length }) }}</div>
        <h2 class="text-xl font-bold">{{ $t(`wizard.titles.${step}`) }}</h2>
        <p class="text-sm text-base-content/60">{{ $t(`wizard.leads.${step}`) }}</p>
      </header>

      <SourceOrder v-if="step === 'sources'" />
      <RunTab v-else-if="step === 'run'" @review="go('photos')" @sources="go('sources')" />
      <SyncSummary v-else-if="step === 'summary'" :overview="overview" @run="go('run')" />
      <template v-else-if="overview">
        <details v-if="step === 'profiles'" class="rounded-box border border-base-300 bg-base-100 px-4 py-3" data-testid="find-more">
          <summary class="cursor-pointer text-sm font-semibold">{{ $t("sync.findNew") }}</summary>
          <p class="mt-1 text-sm text-base-content/60">{{ $t("sync.findNewLead") }}</p>
          <ProfileSources class="mt-3" :overview="overview" @changed="load" />
        </details>
        <div v-if="inStep.length" class="flex flex-wrap items-center gap-2" data-testid="review-filters">
          <div v-if="step === 'photos'" class="flex flex-wrap gap-2" role="group" :aria-label="$t('sync.filters.label')">
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
        <template v-if="queue.length">
          <ProfileList
            v-if="view === 'list' || step !== 'photos'"
            :queue="queue"
            :picks="picks"
            :bulk="overview.bulk"
            :login-search="overview.loginSearch"
            :mode="reviewStep"
            @update:pick="setPick"
            @changed="load"
          >
            <template v-if="step === 'photos'" #view>
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
            <ProfileReview :key="queue[0].contactId" :suggestion="queue[0]" :pick="picks[queue[0].contactId]" :total="queue.length" mode="photos" @update:pick="setPick(queue[0].contactId, $event)" @done="load" />
          </template>
        </template>
        <p v-else class="rounded-box border border-base-300 bg-base-100 p-8 text-center text-sm text-base-content/60" data-testid="step-empty">
          {{ search.trim() ? $t("sync.filters.empty", { query: search.trim() }) : $t(`wizard.empty.${step}`) }}
        </p>
      </template>
      <div v-else-if="loadError" class="flex flex-col items-center gap-3 py-12 text-sm text-base-content/60">
        {{ $t("contacts.errors.load") }}<button type="button" class="btn btn-sm" @click="load"><RefreshCw class="size-4" />{{ $t("contacts.retry") }}</button>
      </div>
      <div v-else class="grid place-items-center py-12"><span class="loading loading-spinner"></span></div>

      <!-- Back, Skip and Next on every step. -->
      <footer class="sticky bottom-16 z-10 lg:bottom-0 flex flex-wrap items-center gap-2 border-t border-base-300 bg-base-200/95 py-3 backdrop-blur" data-testid="wizard-footer">
        <button v-if="index > 0" type="button" class="btn btn-ghost btn-sm" @click="back"><ArrowLeft class="size-4" />{{ $t(`wizard.steps.${steps[index - 1]}`) }}</button>
        <span class="flex-1"></span>
        <button v-if="index > 0 && index < steps.length - 1" type="button" class="btn btn-ghost btn-sm" data-testid="wizard-skip" @click="next">{{ $t("wizard.skip") }}</button>
        <button v-if="index < steps.length - 1" type="button" class="btn btn-primary btn-sm" data-testid="wizard-next" @click="next">
          {{ $t(`wizard.steps.${steps[index + 1]}`) }}<ArrowRight class="size-4" />
        </button>
      </footer>
    </div>
    <LoginSearchNotice />
  </AppShell>
</template>
