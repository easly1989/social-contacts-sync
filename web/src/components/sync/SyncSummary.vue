<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { ArrowRight, CircleCheck, RefreshCw, RotateCcw } from "lucide-vue-next";

import SourceMark from "../SourceMark.vue";
import StatTile from "../StatTile.vue";
import TelegramLink from "../TelegramLink.vue";
import WhatsAppLink from "../WhatsAppLink.vue";
import { number } from "../../format";
import { loginOf, signInTo } from "../../loginSearch";
import { linkNetworks } from "../../profileLinks";
import { networkInfo } from "../../profileNetworks";
import { resetRun, run, startRun } from "../../runState";
import { sourceInfo } from "../../sources";
import { ProfilesOverview, SocialNetwork, SourceId, SourceKey } from "../../../../interfaces/api";

// Sync › Summary (issue #107): what the session did, what didn't finish with its fix, the report and undo.
const props = defineProps<{ overview?: ProfilesOverview }>();
const emit = defineEmits<{ run: [] }>();
const { t, locale } = useI18n();

const applied = computed(() => run.counters.added + run.counters.replaced);
// Profiles linked from the steps since this sync started.
const linkedSince = computed(() => (props.overview?.linked ?? []).filter((l) => !l.undone && (!run.started || Date.parse(l.at) >= run.startedAt)).length);
const nameOf = (key: string) => linkNetworks[key]?.name ?? sourceInfo[key as SourceId]?.name ?? key;

const signInStops = ["signin", "notSignedIn", "signedOut", "skipped"];
// What didn't finish: a source left out, or profile reads a sign-in page stopped.
const unfinished = computed(() => [
  ...run.issues.map((i) => ({ key: (i.network ?? i.source) as SourceKey, kind: "source" as const, missed: Math.max(0, (run.total ?? i.checked) - i.checked) })),
  ...Object.entries(run.reads)
    // Only what a sign-in fixes: a site asking to slow down or an error wait for the next sync.
    .filter(([, r]) => r?.stopped && signInStops.includes(r.stopped) && r.read < r.total)
    .map(([network, r]) => ({ key: network as SourceKey, kind: "reads" as const, missed: r!.total - r!.read })),
]);
const reconnecting = ref<SourceKey>();
const again = (key: SourceKey) => {
  startRun([key]);
  emit("run");
};
async function readAgain(network: string): Promise<void> {
  await signInTo(network as SocialNetwork);
  // The sign-in window was closed without signing in: nothing to read again yet.
  if (loginOf(network)?.loggedIn) again(network as SourceKey);
}
</script>

<template>
  <div class="space-y-5" data-testid="sync-summary">
    <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatTile :label="$t('summary.applied')" :value="number(applied, locale)" tone="text-success" />
      <StatTile :label="$t('summary.linked')" :value="number(linkedSince, locale)" tone="text-primary" />
      <StatTile :label="$t('summary.photos')" :value="number(overview?.steps.photos ?? 0, locale)" />
      <StatTile :label="$t('summary.search')" :value="number(overview?.steps.search ?? 0, locale)" />
    </div>

    <section v-if="unfinished.length" class="rounded-box border border-warning/40 bg-base-100 p-5" data-testid="summary-unfinished">
      <h2 class="font-semibold">{{ $t("summary.unfinished", unfinished.length) }}</h2>
      <ul class="mt-3 space-y-3 text-sm">
        <li v-for="item in unfinished" :key="item.key" class="flex flex-wrap items-center gap-3">
          <SourceMark :source="item.key" size="size-8" icon-size="size-4" />
          <span class="min-w-[12rem] flex-1">{{ $t(`summary.${item.kind}`, { source: nameOf(item.key), count: number(item.missed, locale) }, item.missed) }}</span>
          <template v-if="item.kind === 'source'">
            <button v-if="(item.key === 'whatsapp' || item.key === 'telegram') && reconnecting !== item.key" type="button" class="btn btn-sm" @click="reconnecting = item.key">
              {{ $t("runTab.reconnect", { source: nameOf(item.key) }) }}
            </button>
            <button type="button" class="btn btn-sm btn-primary" @click="again(item.key)"><RefreshCw class="size-4" />{{ $t("summary.runOnly", { source: nameOf(item.key) }) }}</button>
          </template>
          <button v-else type="button" class="btn btn-sm btn-warning" @click="readAgain(item.key)">{{ $t("summary.readAgain", { network: networkInfo[item.key as SocialNetwork]?.name ?? item.key }) }}</button>
          <div v-if="reconnecting === item.key" class="w-full pl-11">
            <WhatsAppLink v-if="item.key === 'whatsapp'" :size="160" />
            <TelegramLink v-else class="max-w-sm" />
          </div>
        </li>
      </ul>
    </section>
    <p v-else-if="run.runId" class="flex items-center gap-2 text-sm text-success"><CircleCheck class="size-5" />{{ $t("summary.allDone") }}</p>

    <div class="flex flex-wrap gap-3">
      <router-link v-if="run.runId" :to="`/app/history/${run.runId}`" class="btn btn-sm">{{ $t("syncRun.openReport") }}<ArrowRight class="size-4" /></router-link>
      <router-link v-if="run.runId" :to="`/app/history/${run.runId}`" class="btn btn-ghost btn-sm"><RotateCcw class="size-4" />{{ $t("summary.undo") }}</router-link>
      <span class="flex-1"></span>
      <button type="button" class="btn btn-primary btn-sm" @click="resetRun(), emit('run')">{{ $t("summary.newSync") }}</button>
    </div>
  </div>
</template>
