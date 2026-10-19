<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { ChevronDown, ChevronUp, CircleAlert, GripVertical } from "lucide-vue-next";

import SourceMark from "../SourceMark.vue";
import TelegramLink from "../TelegramLink.vue";
import WhatsAppLink from "../WhatsAppLink.vue";
import { api } from "../../api";
import { number, relativeTime } from "../../format";
import { isDesktop } from "../../settings";
import { loginOf, refreshLogins, signInTo } from "../../loginSearch";
import { linkedinRereads, linkNetworks, loginNetworks } from "../../profileLinks";
import { sourceInfo } from "../../sources";
import { isNetwork, setEnabled, syncPrefs } from "../../syncPrefs";
import { LinkedNetworks, SessionStatus, SocialNetwork, SourceId, SourceKey, TelegramState } from "../../../../interfaces/api";

// Sync › Sources (issue #107): every source in one order, profile networks included, each with its
// real state, checked when the step opens and as soon as a site signs the app out, and its fix on its row.
const { t, locale } = useI18n();
const status = ref<SessionStatus>();
const linked = ref<LinkedNetworks>();
onMounted(async () => {
  void refreshLogins();
  status.value = await api.status();
  linked.value = await api.linkedNetworks().catch(() => undefined);
});

const nameOf = (key: SourceKey) => (isNetwork(key) ? linkNetworks[key].name : sourceInfo[key as SourceId].name);
const profilesOn = (network: string) => linked.value?.networks[network]?.profiles ?? 0;
const noProfiles = (key: SourceKey) => isNetwork(key) && Boolean(linked.value) && !profilesOn(key);
const withLogin = (key: SourceKey) => isDesktop.value && loginNetworks.includes(key);

type State = "connected" | "signedIn" | "ready" | "closed" | "signedOut" | "notConnected" | "unavailable";
function state(key: SourceKey): State {
  if (key === "whatsapp") return status.value?.whatsappConnected ? "connected" : "notConnected";
  if (key === "telegram") return status.value?.telegramConnected ? "connected" : status.value && !status.value.telegramAvailable ? "unavailable" : "notConnected";
  if (withLogin(key)) {
    const login = loginOf(key);
    return login?.loggedIn ? "signedIn" : login?.closedAt ? "closed" : "signedOut";
  }
  return "ready";
}
const usable = (key: SourceKey) => !["notConnected", "unavailable"].includes(state(key));
const tone: Record<State, string> = {
  connected: "bg-success/10 text-success",
  signedIn: "bg-success/10 text-success",
  ready: "bg-success/10 text-success",
  closed: "bg-warning/15 text-warning",
  signedOut: "bg-base-200 text-base-content/60",
  notConnected: "bg-base-200 text-base-content/60",
  unavailable: "bg-base-200 text-base-content/60",
};

function detail(key: SourceKey): string {
  if (!isNetwork(key)) return t({ phone: "setup.sources.byPhone", email: "setup.sources.byEmail", link: "links.byLink" }[sourceInfo[key as SourceId].matchedBy]);
  if (noProfiles(key)) return t("sources.noProfiles");
  const info = linked.value?.networks[key];
  const how = !loginNetworks.includes(key) ? t("sources.public") : !isDesktop.value ? t("sources.unofficial") : key === "linkedin" && !linkedinRereads.value ? t("sources.linkedinOff") : key === "linkedin" ? t("sources.withLoginVisit") : t("sources.withLogin");
  return [
    info ? t("sources.profiles", { count: number(info.profiles, locale.value) }, info.profiles) : "",
    how,
    info?.oldestRead ? t("sources.oldestRead", { when: relativeTime(info.oldestRead, locale.value) }) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function move(index: number, delta: number): void {
  const order = [...syncPrefs.value.order];
  const [item] = order.splice(index, 1);
  order.splice(index + delta, 0, item);
  syncPrefs.value.order = order;
}

// Networks with no linked profile wait behind "Show all" (issue #104).
const showEmpty = ref(false);
const emptyCount = computed(() => syncPrefs.value.order.filter(noProfiles).length);
const shown = computed(() => syncPrefs.value.order.map((key, index) => ({ key, index })).filter(({ key }) => showEmpty.value || !noProfiles(key)));
// A site that closed the app's session: said once, above the list.
const closed = computed(() => syncPrefs.value.order.filter((k) => state(k) === "closed"));

const signingIn = ref<string>();
async function signIn(key: SourceKey): Promise<void> {
  signingIn.value = key;
  await signInTo(key as SocialNetwork);
  signingIn.value = undefined;
}

// Connecting WhatsApp or Telegram in place: the status is read again once it reports in.
const connecting = ref<SourceKey>();
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
  <section class="space-y-3" data-testid="source-order">
    <div v-for="key in closed" :key="key" role="alert" class="alert alert-warning alert-soft text-sm" data-testid="session-closed">
      <CircleAlert class="size-5" /><span>{{ $t("sources.closedBanner", { network: nameOf(key) }) }}</span>
    </div>
    <ol class="space-y-2" :aria-label="$t('syncSetup.sources')">
      <li v-for="({ key, index }, position) in shown" :key="key" class="rounded-xl border border-base-300 bg-base-100" :data-testid="`source-${key}`">
        <div class="flex flex-wrap items-center gap-3 px-4 py-3" :class="{ 'opacity-60': noProfiles(key) || (!usable(key) && connecting !== key) }">
          <GripVertical class="size-4 text-base-content/30" aria-hidden="true" />
          <span class="w-4 text-xs font-semibold text-base-content/50">{{ position + 1 }}</span>
          <SourceMark :source="key" size="size-9" icon-size="size-5" />
          <div class="min-w-[9rem] flex-1">
            <div class="text-sm font-semibold">{{ nameOf(key) }}</div>
            <div class="text-xs text-base-content/60">{{ detail(key) }}</div>
          </div>
          <span v-if="!noProfiles(key)" class="badge badge-sm border-0" :class="tone[state(key)]" :data-testid="`state-${key}`">{{ $t(`sources.state.${state(key)}`) }}</span>
          <!-- The fix, right on the row. The web version links WhatsApp on its own page, as the first run does. -->
          <router-link v-if="key === 'whatsapp' && state(key) === 'notConnected' && !isDesktop" to="/whatsapp" class="btn btn-sm">{{ $t("dashboard.connect") }}</router-link>
          <button
            v-else-if="(key === 'whatsapp' || key === 'telegram') && state(key) === 'notConnected' && connecting !== key"
            type="button"
            class="btn btn-sm"
            :aria-label="$t('sources.connect', { name: nameOf(key) })"
            @click="connecting = key"
          >
            {{ $t("dashboard.connect") }}
          </button>
          <button
            v-else-if="withLogin(key) && !noProfiles(key) && (state(key) === 'closed' || state(key) === 'signedOut')"
            type="button"
            class="btn btn-sm"
            :class="state(key) === 'closed' ? 'btn-warning' : ''"
            :disabled="signingIn === key"
            @click="signIn(key)"
          >
            <span v-if="signingIn === key" class="loading loading-spinner loading-xs"></span>{{ state(key) === "closed" ? $t("sources.signInAgain") : $t("sources.signIn") }}
          </button>
          <div class="join">
            <button type="button" class="btn btn-ghost btn-xs join-item" :disabled="index === 0" :aria-label="$t('syncSetup.moveUp', { name: nameOf(key) })" @click="move(index, -1)"><ChevronUp class="size-4" /></button>
            <button type="button" class="btn btn-ghost btn-xs join-item" :disabled="index === syncPrefs.order.length - 1" :aria-label="$t('syncSetup.moveDown', { name: nameOf(key) })" @click="move(index, 1)">
              <ChevronDown class="size-4" />
            </button>
          </div>
          <input
            type="checkbox"
            class="toggle toggle-primary toggle-sm"
            :aria-label="$t('sources.use', { name: nameOf(key) })"
            :disabled="!usable(key) || noProfiles(key)"
            :checked="usable(key) && !noProfiles(key) && syncPrefs.enabled.includes(key)"
            @change="setEnabled(key, ($event.target as HTMLInputElement).checked)"
          />
        </div>

        <div v-if="connecting === key && key === 'whatsapp'" class="flex flex-wrap items-start gap-5 border-t border-base-300 p-4" data-testid="sources-whatsapp-link">
          <WhatsAppLink :size="180" @connecting="watchWhatsApp" />
          <ol class="min-w-[12rem] flex-1 list-inside list-decimal space-y-1 text-sm text-base-content/70">
            <li>{{ $t("whatsapp.step1") }}</li>
            <li>{{ $t("whatsapp.step2") }}</li>
            <li>{{ $t("whatsapp.step3") }}</li>
          </ol>
          <button type="button" class="btn btn-ghost btn-sm" @click="connecting = undefined">{{ $t("common.cancel") }}</button>
        </div>
        <div v-if="connecting === key && key === 'telegram'" class="flex flex-wrap items-start gap-3 border-t border-base-300 p-4" data-testid="sources-telegram-link">
          <div class="min-w-[14rem] flex-1 sm:max-w-sm"><TelegramLink @change="onTelegram" /></div>
          <button type="button" class="btn btn-ghost btn-sm" @click="connecting = undefined">{{ $t("common.cancel") }}</button>
        </div>
      </li>
    </ol>
    <button v-if="emptyCount" type="button" class="btn btn-ghost btn-xs" :aria-expanded="showEmpty" data-testid="networks-show-all" @click="showEmpty = !showEmpty">
      {{ showEmpty ? $t("sources.hideEmpty") : $t("sources.showEmpty", { count: emptyCount }) }}<ChevronUp v-if="showEmpty" class="size-3.5" /><ChevronDown v-else class="size-3.5" />
    </button>
  </section>
</template>
