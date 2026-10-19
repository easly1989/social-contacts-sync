<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-vue-next";

import SourceBadge from "../SourceBadge.vue";
import SourceMark from "../SourceMark.vue";
import TelegramLink from "../TelegramLink.vue";
import WhatsAppLink from "../WhatsAppLink.vue";
import { api } from "../../api";
import { number, relativeTime } from "../../format";
import { isDesktop } from "../../settings";
import { linkedinRereads, linkNetworks, loginNetworks } from "../../profileLinks";
import { sourceInfo } from "../../sources";
import { networksOff, setNetwork, syncPrefs } from "../../syncPrefs";
import { LinkedNetworks, SessionStatus, SourceId, TelegramState } from "../../../../interfaces/api";

// Sync › Sources: where a sync looks for photos and in which order (moved from Run in issue #82),
// with Linked profiles one row per network, and WhatsApp and Telegram connected right here (issue #83).
const { t, locale } = useI18n();
const status = ref<SessionStatus>();
const linked = ref<LinkedNetworks>();
onMounted(async () => {
  status.value = await api.status();
  linked.value = await api.linkedNetworks().catch(() => undefined);
});

function available(source: SourceId): boolean {
  if (source === "whatsapp") return Boolean(status.value?.whatsappConnected);
  if (source === "telegram") return Boolean(status.value?.telegramConnected);
  return source === "gravatar" || source === "links";
}

function toggle(source: SourceId, on: boolean): void {
  syncPrefs.value.enabled = on ? [...syncPrefs.value.enabled, source] : syncPrefs.value.enabled.filter((s) => s !== source);
}

function move(index: number, delta: number): void {
  const order = [...syncPrefs.value.order];
  const [item] = order.splice(index, 1);
  order.splice(index + delta, 0, item);
  syncPrefs.value.order = order;
}

// Linked profiles: the networks with profiles first, the most first.
const showNetworks = ref(true);
const profilesOn = (network: string) => linked.value?.networks[network]?.profiles ?? 0;
const networks = computed(() => Object.keys(linkNetworks).sort((a, b) => profilesOn(b) - profilesOn(a)));
const noProfiles = (network: string) => Boolean(linked.value) && !profilesOn(network);
// Networks with no linked profile wait behind "Show all" (issue #104).
const showEmpty = ref(false);
const emptyCount = computed(() => networks.value.filter(noProfiles).length);
const shownNetworks = computed(() => (showEmpty.value ? networks.value : networks.value.filter((n) => !noProfiles(n))));
function readHow(network: string): string {
  if (!loginNetworks.includes(network)) return t("sources.public");
  if (!isDesktop.value) return t("sources.unofficial");
  if (network === "linkedin") return linkedinRereads.value ? t("sources.withLoginVisit") : t("sources.linkedinOff");
  return t("sources.withLogin");
}
function networkText(network: string): string {
  if (noProfiles(network)) return t("sources.noProfiles");
  const info = linked.value?.networks[network];
  return [
    info ? t("sources.profiles", { count: number(info.profiles, locale.value) }, info.profiles) : "",
    readHow(network),
    info?.oldestRead ? t("sources.oldestRead", { when: relativeTime(info.oldestRead, locale.value) }) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

// Connecting WhatsApp or Telegram in place: the status is read again once it reports in.
const connecting = ref<SourceId>();
let poll: number | undefined;
function watchWhatsApp(): void {
  window.clearInterval(poll);
  poll = window.setInterval(async () => {
    status.value = await api.status();
    if (status.value.whatsappConnected) {
      window.clearInterval(poll);
      connecting.value = undefined;
    }
  }, 2000);
}
async function onTelegram(state: TelegramState): Promise<void> {
  if (!state.connected) return;
  status.value = await api.status();
  connecting.value = undefined;
}
onUnmounted(() => window.clearInterval(poll));
</script>

<template>
  <section class="rounded-box border border-base-300 bg-base-100 p-6" data-testid="source-order">
    <h2 class="font-semibold">{{ $t("syncSetup.sourcesTitle") }}</h2>
    <p class="mt-0.5 text-sm text-base-content/60">{{ $t("syncSetup.sourcesHint") }}</p>
    <ol class="mt-4 space-y-2" :aria-label="$t('syncSetup.sources')">
      <li v-for="(source, index) in syncPrefs.order" :key="source" class="rounded-xl border border-base-300" :data-testid="`source-${source}`">
        <div class="flex flex-wrap items-center gap-3 p-3" :class="{ 'opacity-60': !available(source) && connecting !== source }">
          <GripVertical class="size-4 text-base-content/30" />
          <span class="w-4 text-xs font-semibold text-base-content/50">{{ index + 1 }}</span>
          <SourceMark :source="source" size="size-8" icon-size="size-4" />
          <div class="min-w-[8rem] flex-1">
            <div class="text-sm font-semibold">{{ sourceInfo[source].name }}</div>
            <div class="text-xs text-base-content/60">
              <template v-if="source === 'telegram' && status && !status.telegramAvailable">{{ $t("dashboard.unavailable") }}</template>
              <template v-else-if="!available(source)">{{ $t("dashboard.notConnected") }}</template>
              <template v-else-if="source === 'links' && linked">{{ $t("sources.linkedSummary", { profiles: number(linked.profiles, locale), contacts: number(linked.contacts, locale) }) }}</template>
              <template v-else>{{ $t({ phone: "setup.sources.byPhone", email: "setup.sources.byEmail", link: "links.byLink" }[sourceInfo[source].matchedBy]) }}</template>
            </div>
          </div>
          <div class="join">
            <button type="button" class="btn btn-ghost btn-xs join-item" :disabled="index === 0" :aria-label="$t('syncSetup.moveUp', { name: sourceInfo[source].name })" @click="move(index, -1)"><ChevronUp class="size-4" /></button>
            <button type="button" class="btn btn-ghost btn-xs join-item" :disabled="index === syncPrefs.order.length - 1" :aria-label="$t('syncSetup.moveDown', { name: sourceInfo[source].name })" @click="move(index, 1)"><ChevronDown class="size-4" /></button>
          </div>
          <button v-if="source === 'links'" type="button" class="btn btn-ghost btn-xs" :aria-expanded="showNetworks" aria-controls="link-networks" @click="showNetworks = !showNetworks">
            {{ showNetworks ? $t("sources.hideNetworks") : $t("sources.showNetworks") }}<ChevronUp v-if="showNetworks" class="size-3.5" /><ChevronDown v-else class="size-3.5" />
          </button>
          <template v-if="!available(source)">
            <!-- The web version links WhatsApp on its own page, as the first run does. -->
            <router-link v-if="source === 'whatsapp' && !isDesktop" to="/whatsapp" class="btn btn-xs">{{ $t("dashboard.connect") }}</router-link>
            <button
              v-else-if="(source === 'whatsapp' || status?.telegramAvailable) && connecting !== source"
              type="button"
              class="btn btn-xs"
              :aria-label="$t('sources.connect', { name: sourceInfo[source].name })"
              @click="connecting = source"
            >
              {{ $t("dashboard.connect") }}
            </button>
          </template>
          <input
            v-else
            type="checkbox"
            class="toggle toggle-primary toggle-sm"
            :aria-label="sourceInfo[source].name"
            :checked="syncPrefs.enabled.includes(source)"
            @change="toggle(source, ($event.target as HTMLInputElement).checked)"
          />
        </div>

        <div v-if="connecting === source && source === 'whatsapp'" class="flex flex-wrap items-start gap-5 border-t border-base-300 p-4" data-testid="sources-whatsapp-link">
          <WhatsAppLink :size="180" @connecting="watchWhatsApp" />
          <ol class="min-w-[12rem] flex-1 list-inside list-decimal space-y-1 text-sm text-base-content/70">
            <li>{{ $t("whatsapp.step1") }}</li>
            <li>{{ $t("whatsapp.step2") }}</li>
            <li>{{ $t("whatsapp.step3") }}</li>
          </ol>
          <button type="button" class="btn btn-ghost btn-sm" @click="connecting = undefined">{{ $t("common.cancel") }}</button>
        </div>
        <div v-if="connecting === source && source === 'telegram'" class="flex flex-wrap items-start gap-3 border-t border-base-300 p-4" data-testid="sources-telegram-link">
          <div class="min-w-[14rem] flex-1 sm:max-w-sm"><TelegramLink @change="onTelegram" /></div>
          <button type="button" class="btn btn-ghost btn-sm" @click="connecting = undefined">{{ $t("common.cancel") }}</button>
        </div>

        <ul v-if="source === 'links'" v-show="showNetworks" id="link-networks" class="border-t border-base-300 py-1 sm:pl-14" :aria-label="$t('sources.networks')" data-testid="link-networks">
          <li v-for="network in shownNetworks" :key="network" class="flex items-center gap-3 border-b border-base-300/60 px-3 py-2 last:border-0" :data-testid="`network-${network}`">
            <SourceBadge source="links" :network="linkNetworks[network].name" class="w-28 shrink-0" :class="{ 'opacity-60': noProfiles(network) }" />
            <span class="min-w-0 flex-1 text-xs" :class="noProfiles(network) ? 'text-base-content/50' : 'text-base-content/70'">{{ networkText(network) }}</span>
            <input
              type="checkbox"
              class="toggle toggle-primary toggle-sm"
              :aria-label="$t('sources.networkToggle', { name: linkNetworks[network].name })"
              :disabled="noProfiles(network)"
              :checked="!noProfiles(network) && !networksOff.includes(network)"
              @change="setNetwork(network, ($event.target as HTMLInputElement).checked)"
            />
          </li>
          <li v-if="emptyCount" class="px-3 py-2">
            <button type="button" class="btn btn-ghost btn-xs" :aria-expanded="showEmpty" data-testid="networks-show-all" @click="showEmpty = !showEmpty">
              {{ showEmpty ? $t("sources.hideEmpty") : $t("sources.showEmpty", { count: emptyCount }) }}<ChevronUp v-if="showEmpty" class="size-3.5" /><ChevronDown v-else class="size-3.5" />
            </button>
          </li>
        </ul>
      </li>
    </ol>
  </section>
</template>
