<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Info } from "lucide-vue-next";

import SettingsCard from "./SettingsCard.vue";
import SourceMark from "../SourceMark.vue";
import { api } from "../../api";
import { isDesktop } from "../../settings";
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
    <div class="flex flex-wrap items-center gap-3 py-4 opacity-60">
      <SourceMark source="telegram" />
      <div class="min-w-[10rem] flex-1">
        <div class="font-medium">Telegram</div>
        <div class="text-sm text-base-content/60">{{ $t("setup.sources.byPhone") }}</div>
      </div>
      <span class="badge badge-ghost badge-sm">{{ $t("setup.sources.soon") }}</span>
    </div>
    <p class="flex items-start gap-1.5 pt-4 text-xs text-base-content/50"><Info class="mt-px size-3.5 shrink-0" />{{ $t("setup.sources.unavailable") }}</p>
  </SettingsCard>
</template>
