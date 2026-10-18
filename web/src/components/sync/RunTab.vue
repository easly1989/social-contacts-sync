<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ArrowRight, Check, CircleAlert, ImagePlus, Info, ListChecks, Pin, RefreshCw, RotateCcw, Search, ShieldCheck, Square } from "lucide-vue-next";

import PhotoZoom from "../PhotoZoom.vue";
import SourceBadge from "../SourceBadge.vue";
import StatTile from "../StatTile.vue";
import { api } from "../../api";
import { number } from "../../format";
import { isDesktop } from "../../settings";
import { linkedinNoticeSeen, linkedinRereads } from "../../profileLinks";
import { networkInfo } from "../../profileNetworks";
import { resetRun, run, running, startRun, stopRun } from "../../runState";
import { networksOff, syncPrefs } from "../../syncPrefs";
import { GoogleStats, PinnedProfiles, RunOptions, SessionStatus, SourceId } from "../../../../interfaces/api";

// Sync › Run (issue #82, mockups in #76): what a sync does, then its progress.
const emit = defineEmits<{ review: []; sources: [] }>();
const { locale, t } = useI18n();

const status = ref<SessionStatus>();
const stats = ref<GoogleStats>();
const pinned = ref<PinnedProfiles>({});
// Start waits for it: the LinkedIn notice depends on it.
const pinnedLoaded = isDesktop.value ? api.pinnedProfiles().then((p) => void (pinned.value = p), () => undefined) : Promise.resolve();
onMounted(async () => {
  status.value = await api.status();
  stats.value = await api.stats().catch(() => undefined);
});

const options = computed(() => syncPrefs.value.options);
const optionKeys: (keyof RunOptions)[] = ["fillMissing", "updatePinned", "lookDifferent", "decideAll"];
// "I decide every contact" applies nothing: the two options that apply photos don't count then.
const optionDisabled = (key: keyof RunOptions) => options.value.decideAll && (key === "fillMissing" || key === "updatePinned");

function available(source: SourceId): boolean {
  if (source === "whatsapp") return Boolean(status.value?.whatsappConnected);
  if (source === "telegram") return Boolean(status.value?.telegramConnected);
  return source === "gravatar" || source === "links";
}
const selected = computed(() => syncPrefs.value.order.filter((s) => available(s) && syncPrefs.value.enabled.includes(s)));

const withoutPhoto = computed(() => (stats.value ? stats.value.totalContacts - stats.value.withPhoto : undefined));
// Desktop: pinned profiles read again with the login, per network up to the cap.
const toRead = computed(() =>
  selected.value.includes("links") ? Object.entries(pinned.value).reduce((n, [network, count]) => n + ((network === "linkedin" && !linkedinRereads.value) || networksOff.value.includes(network) ? 0 : Math.min(count ?? 0, syncPrefs.value.readsCap)), 0) : 0
);
// Google takes about 40 photos a minute; a profile is read every 3–7 seconds.
const estimate = computed(() => {
  if (!stats.value) return undefined;
  const writes = options.value.decideAll ? 0 : options.value.fillMissing ? (withoutPhoto.value ?? 0) : 0;
  return Math.max(1, Math.ceil((writes * 1.5 + toRead.value * 5) / 60));
});

// The first sync that would read LinkedIn profiles with the login says so once (issue #80).
const linkedinNotice = ref<HTMLDialogElement>();
async function start(): Promise<void> {
  await pinnedLoaded;
  if (isDesktop.value && linkedinRereads.value && !linkedinNoticeSeen.value && selected.value.includes("links") && !networksOff.value.includes("linkedin") && pinned.value.linkedin) return linkedinNotice.value?.showModal();
  startRun(selected.value);
}
function answerNotice(keepReading: boolean): void {
  linkedinRereads.value = keepReading;
  linkedinNoticeSeen.value = true;
  linkedinNotice.value?.close();
  startRun(selected.value);
}

// While it runs.
const done = computed(() => Boolean(run.runId));
const applied = computed(() => run.counters.added + run.counters.replaced);
const queued = computed(() => run.counters.queued ?? 0);
const readNetworks = computed(() => Object.entries(run.reads) as [keyof typeof networkInfo, { read: number; total: number; stopped?: string }][]);
const title = computed(() => (run.cancelled ? t("syncRun.stopped") : done.value ? t("syncRun.done") : t("syncRun.running")));
const eta = computed(() => {
  if (!run.total || run.checked < 5 || done.value) return undefined;
  const perContact = (Date.now() - run.startedAt) / run.checked;
  return Math.max(1, Math.round((perContact * (run.total - run.checked)) / 60000));
});
const counts = () => t("runTab.counts", { applied: number(applied.value, locale.value), queued: number(queued.value, locale.value), noMatch: number(run.counters.noMatch, locale.value), errors: number(run.counters.errors, locale.value) });
// One status message for screen readers, every few seconds rather than at each contact.
const announced = ref("");
let timer: number | undefined;
const disconnected = ref(false);
const restarting = ref(false);
// Desktop: a sync stuck on a call that never answers; the window reloads once the new server is up.
function restart(): void {
  restarting.value = true;
  void api.restartServer().catch(() => (restarting.value = false));
}
watch(
  () => run.started,
  (started) => {
    window.clearInterval(timer);
    if (!started) return;
    timer = window.setInterval(() => {
      announced.value = counts();
      disconnected.value = Boolean(run.lastEventAt) && running.value && Date.now() - run.lastEventAt! > 60_000;
    }, 4000);
  },
  { immediate: true }
);
watch(done, (finished) => finished && (announced.value = counts()));
onBeforeUnmount(() => window.clearInterval(timer));
const photo = (base64: string) => `data:image/jpeg;base64,${base64}`;
const stoppedReason = (network: keyof typeof networkInfo, stopped: string) => t(`report.profileReads.${stopped.startsWith("error") ? "error" : stopped}`, { network: networkInfo[network].name });
</script>

<template>
  <!-- Before starting -->
  <div v-if="!run.started" class="grid gap-5 xl:grid-cols-[1fr_320px]">
    <section class="rounded-box border border-base-300 bg-base-100 p-6" data-testid="run-options">
      <h2 class="font-semibold">{{ $t("runTab.optionsTitle") }}</h2>
      <p class="mt-0.5 text-sm text-base-content/60">{{ $t("runTab.optionsLead") }}</p>
      <div class="mt-4 space-y-2">
        <label
          v-for="key in optionKeys"
          :key="key"
          class="flex cursor-pointer gap-3 rounded-xl border px-4 py-3"
          :class="[options[key] && !optionDisabled(key) ? 'border-primary bg-primary/5' : 'border-base-300', { 'opacity-60': optionDisabled(key) }]"
        >
          <input v-model="syncPrefs.options[key]" type="checkbox" class="checkbox checkbox-primary checkbox-sm mt-0.5" :disabled="optionDisabled(key)" />
          <div class="flex-1">
            <div class="text-sm font-semibold">{{ $t(`runTab.options.${key}.title`) }}</div>
            <div class="mt-0.5 text-sm text-base-content/60">{{ $t(`runTab.options.${key}.text`) }}</div>
          </div>
        </label>
      </div>
      <div v-if="isDesktop" class="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-base-200/60 px-4 py-3 text-sm">
        <label for="reads-cap" class="flex-1">{{ $t("runTab.cap") }}</label>
        <input id="reads-cap" v-model.number="syncPrefs.readsCap" type="number" min="1" max="1000" class="input input-sm w-24" />
        <p class="w-full text-xs text-base-content/60">{{ $t("runTab.capHint") }}</p>
      </div>
    </section>

    <div class="space-y-5">
      <section class="rounded-box border border-base-300 bg-base-100 p-6" data-testid="run-summary">
        <h2 class="font-semibold">{{ $t("syncSetup.summary") }}</h2>
        <dl class="mt-4 space-y-3 text-sm">
          <div class="flex justify-between"><dt class="text-base-content/60">{{ $t("syncSetup.contacts") }}</dt><dd class="font-semibold tabular-nums">{{ stats ? number(stats.totalContacts, locale) : "—" }}</dd></div>
          <div class="flex justify-between"><dt class="text-base-content/60">{{ $t("syncSetup.withoutPhoto") }}</dt><dd class="font-semibold tabular-nums">{{ withoutPhoto !== undefined ? number(withoutPhoto, locale) : "—" }}</dd></div>
          <div v-if="isDesktop" class="flex justify-between"><dt class="text-base-content/60">{{ $t("runTab.toRead") }}</dt><dd class="font-semibold tabular-nums">{{ number(toRead, locale) }}</dd></div>
          <div class="flex items-center justify-between gap-2">
            <dt class="text-base-content/60">{{ $t("syncSetup.sources") }}</dt>
            <dd class="flex flex-wrap justify-end gap-1"><SourceBadge v-for="s in selected" :key="s" :source="s" /></dd>
          </div>
          <div class="flex justify-between"><dt class="text-base-content/60">{{ $t("syncSetup.estimate") }}</dt><dd class="font-semibold">{{ estimate ? $t("syncSetup.upTo", { minutes: estimate }) : "—" }}</dd></div>
        </dl>
        <button type="button" class="btn btn-ghost btn-xs mt-2 px-0 text-primary" @click="emit('sources')">{{ $t("runTab.changeSources") }}<ArrowRight class="size-3.5" /></button>
        <div class="mt-3 flex gap-2 rounded-lg bg-base-200 p-3 text-xs text-base-content/60">
          <ShieldCheck class="size-4 shrink-0 text-success" /><span>{{ $t("runTab.safeNote") }}</span>
        </div>
        <p v-if="!selected.length" class="mt-4 text-sm text-error">{{ $t("syncSetup.noSources") }}</p>
        <button type="button" class="btn btn-primary mt-5 w-full" :disabled="!selected.length" @click="start"><RefreshCw class="size-4" />{{ $t("syncSetup.start") }}</button>
      </section>
      <p class="flex gap-2 px-1 text-xs text-base-content/50"><Info class="size-4 shrink-0" />{{ $t("syncSetup.rateNote") }}</p>
    </div>
  </div>

  <!-- Running, or done -->
  <div v-else class="space-y-5" data-testid="run-progress">
    <p class="sr-only" role="status">{{ announced }}</p>
    <div v-if="run.error || disconnected" role="alert" class="alert alert-error alert-soft">
      <CircleAlert class="size-5" /><span>{{ run.error ?? $t("sync.disconnected") }}</span>
      <button v-if="disconnected && isDesktop" type="button" class="btn btn-sm" :disabled="restarting" data-testid="run-restart" @click="restart">
        <span v-if="restarting" class="loading loading-spinner loading-xs"></span><RotateCcw v-else class="size-4" />{{ $t("sync.restartServer") }}
      </button>
    </div>

    <section class="rounded-box border bg-base-100 p-6" :class="done ? 'border-success/40' : 'border-base-300'">
      <div class="flex flex-wrap items-center gap-3">
        <span v-if="done" class="grid size-10 place-items-center rounded-full bg-success text-success-content"><Check class="size-5" /></span>
        <div class="min-w-[14rem] flex-1">
          <h2 class="text-lg font-bold">{{ title }}</h2>
          <p class="text-sm text-base-content/60">{{ done ? $t("syncRun.checked", { checked: number(run.checked, locale), total: number(run.total ?? run.checked, locale) }) : eta ? $t("syncRun.eta", { minutes: eta }) : $t("runTab.keepOpen") }}</p>
        </div>
        <button v-if="queued" type="button" class="btn btn-primary btn-sm" @click="emit('review')"><ListChecks class="size-4" />{{ $t("runTab.startReviewing", queued) }}</button>
        <router-link v-if="done" :to="`/app/history/${run.runId}`" class="btn btn-sm">{{ $t("syncRun.openReport") }}<ArrowRight class="size-4" /></router-link>
        <button v-if="done" type="button" class="btn btn-ghost btn-sm" @click="resetRun">{{ $t("runTab.again") }}</button>
        <button v-else type="button" class="btn btn-ghost btn-sm text-error" :disabled="run.stopping" @click="stopRun"><Square class="size-4" />{{ run.stopping ? $t("syncRun.stopping") : $t("syncRun.stop") }}</button>
      </div>

      <ol class="mt-5 space-y-4">
        <li v-if="readNetworks.length" data-testid="phase-profiles">
          <div class="flex items-center gap-2 text-sm font-semibold">
            <span class="grid size-5 place-items-center rounded-full text-[11px]" :class="run.phase === 'profiles' ? 'bg-primary text-primary-content' : 'bg-success text-success-content'">1</span>{{ $t("runTab.phaseProfiles") }}
          </div>
          <ul class="mt-2 space-y-1.5 pl-7 text-sm">
            <li v-for="[network, read] in readNetworks" :key="network" class="flex flex-wrap items-center gap-x-3">
              <span class="w-20 font-medium">{{ networkInfo[network].name }}</span>
              <progress class="progress progress-primary h-1.5 w-32" :value="read.read" :max="read.total || 1"></progress>
              <span class="text-base-content/60">{{ $t("runTab.readOf", { read: number(read.read, locale), total: number(read.total, locale) }) }}</span>
              <span v-if="read.stopped" class="text-xs text-warning">{{ stoppedReason(network, read.stopped) }}</span>
            </li>
          </ul>
        </li>
        <li data-testid="phase-photos">
          <div class="flex items-center gap-2 text-sm font-semibold">
            <span v-if="readNetworks.length" class="grid size-5 place-items-center rounded-full text-[11px]" :class="done ? 'bg-success text-success-content' : run.phase === 'photos' ? 'bg-primary text-primary-content' : 'bg-base-300'">2</span>{{ $t("runTab.phasePhotos") }}
          </div>
          <div class="mt-2" :class="{ 'pl-7': readNetworks.length }">
            <div class="flex items-end justify-between text-sm">
              <span class="text-base-content/70">{{ run.total === undefined ? $t("syncRun.loading") : $t("syncRun.checked", { checked: number(run.checked, locale), total: number(run.total, locale) }) }}</span>
              <span class="tabular-nums text-base-content/60">{{ Math.floor(run.progress) }}%</span>
            </div>
            <progress class="progress progress-primary mt-2 h-2.5 w-full" :value="run.progress" max="100"></progress>
          </div>
        </li>
      </ol>
    </section>

    <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatTile :label="$t('runTab.applied')" :value="number(applied, locale)" :icon="ImagePlus" tone="text-success" data-testid="count-applied" />
      <StatTile :label="$t('runTab.toReview')" :value="number(queued, locale)" :icon="ListChecks" tone="text-primary" data-testid="count-queued" />
      <StatTile :label="$t('outcomes.noMatch')" :value="number(run.counters.noMatch, locale)" :icon="Search" data-testid="count-nomatch" />
      <StatTile :label="$t('outcomes.errors')" :value="number(run.counters.errors, locale)" :icon="CircleAlert" tone="text-error" data-testid="count-errors" />
    </div>

    <section v-if="run.latest.length" class="rounded-box border border-base-300 bg-base-100 p-6">
      <div class="flex items-center">
        <h2 class="flex-1 font-semibold">{{ $t("runTab.justApplied") }}</h2>
        <span class="text-xs text-base-content/50">{{ $t("syncRun.newestFirst") }}</span>
      </div>
      <ul class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" :aria-label="$t('runTab.justApplied')">
        <li v-for="item in run.latest" :key="item.key" class="flex items-center gap-3 rounded-xl bg-base-200/60 p-2.5">
          <PhotoZoom :src="photo(item.image)" :name="item.name"><img :src="photo(item.image)" alt="" class="size-10 rounded-full object-cover" /></PhotoZoom>
          <div class="min-w-0">
            <div class="truncate text-sm font-medium">{{ item.name ?? $t("sync.review.unknown") }}</div>
            <div class="flex flex-wrap items-center gap-1">
              <SourceBadge :source="item.source" :label="item.network" />
              <span v-if="item.pinned" class="flex items-center gap-0.5 text-[11px] text-primary"><Pin class="size-3" />{{ $t("runTab.updatedPinned") }}</span>
            </div>
          </div>
        </li>
      </ul>
    </section>
  </div>

  <dialog ref="linkedinNotice" class="modal" aria-labelledby="linkedin-notice-title" data-testid="linkedin-notice">
    <div class="modal-box">
      <h3 id="linkedin-notice-title" class="text-lg font-bold">{{ $t("links.linkedinNoticeTitle") }}</h3>
      <p class="mt-2 text-sm text-base-content/70">{{ $t("links.linkedinNoticeText", { count: pinned.linkedin ?? 0 }, pinned.linkedin ?? 0) }}</p>
      <p class="mt-2 text-xs text-base-content/60">{{ $t("links.linkedinNoticeHint") }}</p>
      <div class="modal-action flex-wrap">
        <button type="button" class="btn btn-ghost" @click="answerNotice(false)">{{ $t("links.linkedinTurnOff") }}</button>
        <button type="button" class="btn btn-primary" @click="answerNotice(true)">{{ $t("links.linkedinGotIt") }}</button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button tabindex="-1" aria-hidden="true">{{ $t("common.cancel") }}</button></form>
  </dialog>
</template>
