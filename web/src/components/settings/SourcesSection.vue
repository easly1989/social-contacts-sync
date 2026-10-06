<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Check, FlaskConical, Info } from "lucide-vue-next";

import SettingsCard from "./SettingsCard.vue";
import SourceMark from "../SourceMark.vue";
import TelegramLink from "../TelegramLink.vue";
import { api } from "../../api";
import { isDesktop } from "../../settings";
import { bestEffortLinks, bestEffortNetworks, stableNetworks } from "../../profileLinks";
import { SessionStatus } from "../../../../interfaces/api";

const status = ref<SessionStatus>();
const unlinking = ref(false);

async function unlink(): Promise<void> {
  unlinking.value = true;
  await api.whatsappUnlink().catch(() => undefined);
  status.value = await api.status();
  unlinking.value = false;
}

onMounted(async () => {
  status.value = await api.status();
});
</script>

<template>
  <SettingsCard>
    <div class="flex flex-wrap items-center gap-3 py-4 first:pt-0" data-testid="settings-source-whatsapp">
      <SourceMark source="whatsapp" />
      <div class="min-w-[10rem] flex-1">
        <div class="font-medium">WhatsApp</div>
        <div class="text-sm text-base-content/60">{{ $t("setup.sources.byPhone") }}</div>
      </div>
      <template v-if="status?.whatsappConnected">
        <span class="badge badge-soft badge-success badge-sm">{{ $t("dashboard.connected") }}</span>
        <button v-if="isDesktop" type="button" class="btn btn-ghost btn-sm" :disabled="unlinking" @click="unlink">{{ $t("setup.sources.unlink") }}</button>
      </template>
      <span v-else-if="status?.whatsappStarting" class="badge badge-ghost badge-sm">{{ $t("setup.sources.reconnecting") }}</span>
      <router-link v-else-if="status" :to="isDesktop ? '/setup/sources' : '/whatsapp'" class="btn btn-sm">{{ $t("dashboard.connect") }}</router-link>
    </div>
    <div class="flex flex-wrap items-center gap-3 py-4">
      <SourceMark source="gravatar" />
      <div class="min-w-[10rem] flex-1">
        <div class="font-medium">Gravatar</div>
        <div class="text-sm text-base-content/60">{{ $t("setup.sources.byEmail") }} · {{ $t("dashboard.noSignIn") }}</div>
      </div>
      <span class="badge badge-soft badge-success badge-sm">{{ $t("dashboard.ready") }}</span>
    </div>
    <div class="flex flex-wrap items-start gap-3 py-4" data-testid="settings-source-telegram">
      <SourceMark source="telegram" />
      <div class="min-w-[10rem] flex-1">
        <div class="font-medium">Telegram</div>
        <div class="text-sm text-base-content/60">{{ $t("setup.sources.byPhone") }}</div>
      </div>
      <div class="w-full sm:w-80"><TelegramLink /></div>
    </div>
    <!-- Profile links (issue #51) -->
    <div class="py-4" data-testid="settings-source-links">
      <div class="flex flex-wrap items-center gap-3">
        <SourceMark source="links" />
        <div class="min-w-[10rem] flex-1">
          <div class="font-medium">{{ $t("links.name") }}</div>
          <div class="text-sm text-base-content/60">{{ $t("links.byLink") }} · {{ $t("dashboard.noSignIn") }}</div>
        </div>
        <span class="badge badge-soft badge-success badge-sm">{{ $t("dashboard.ready") }}</span>
      </div>
      <div class="mt-3 space-y-3 sm:ml-12">
        <ul class="flex flex-wrap gap-1.5" :aria-label="$t('links.networks')">
          <li v-for="n in stableNetworks" :key="n" class="inline-flex items-center gap-1 rounded-full border border-base-300 px-2 py-0.5 text-xs"><Check class="size-3 text-success" />{{ n }}</li>
        </ul>
        <label class="flex cursor-pointer items-start gap-3 rounded-xl border border-base-300 p-3">
          <input v-model="bestEffortLinks" type="checkbox" class="toggle toggle-primary toggle-sm mt-0.5" />
          <span class="flex-1">
            <span class="flex flex-wrap items-center gap-2 text-sm font-medium">{{ $t("links.bestEffort") }}<span class="badge badge-warning badge-soft badge-xs">{{ $t("links.unofficial") }}</span></span>
            <span class="mt-1 block text-xs text-base-content/60">{{ $t("links.bestEffortText") }}</span>
            <span class="mt-2 flex flex-wrap gap-1.5">
              <span v-for="n in bestEffortNetworks" :key="n" class="inline-flex items-center gap-1 rounded-full border border-base-300 px-2 py-0.5 text-xs text-base-content/60"><FlaskConical class="size-3" />{{ n }}</span>
            </span>
          </span>
        </label>
        <p class="flex gap-1.5 text-xs text-base-content/50"><Info class="mt-px size-3.5 shrink-0" />{{ $t("links.settingsHint") }}</p>
      </div>
    </div>
    <p class="flex items-start gap-1.5 pt-4 text-xs text-base-content/50"><Info class="mt-px size-3.5 shrink-0" />{{ $t("setup.sources.unavailable") }}</p>
  </SettingsCard>
</template>
