<script setup lang="ts">
import { ref } from "vue";
import { RefreshCw } from "lucide-vue-next";

import SettingRow from "./SettingRow.vue";
import SettingsCard from "./SettingsCard.vue";
import UpdateStatus from "./UpdateStatus.vue";
import { repoUrl } from "../../brand";
import { checkForUpdates, checkingUpdates, desktopInfo, packageKey, setAutoUpdates } from "../../desktopInfo";

// Desktop app only.
const saving = ref(false);
const saveError = ref(false);
async function toggleAuto(enabled: boolean): Promise<void> {
  saving.value = true;
  saveError.value = false;
  try {
    await setAutoUpdates(enabled);
  } catch {
    saveError.value = true;
  }
  saving.value = false;
}
</script>

<template>
  <SettingsCard>
    <SettingRow :title="$t('settings.updates.version', { version: desktopInfo?.version ?? '…' })">
      <template #description>
        <template v-if="desktopInfo">{{ $t(`settings.packages.${packageKey(desktopInfo.packageKind)}`) }} · {{ $t(`settings.updates.strategy.${desktopInfo.updates}`) }}</template>
      </template>
      <button type="button" class="btn btn-sm" :disabled="checkingUpdates || !desktopInfo || desktopInfo.updates === 'none' || desktopInfo.lastUpdate?.status === 'downloading'" @click="checkForUpdates">
        <RefreshCw class="size-4" :class="{ 'animate-spin': checkingUpdates }" />{{ $t("settings.updates.check") }}
      </button>
    </SettingRow>
    <SettingRow v-if="desktopInfo?.updates === 'auto'" :title="$t('settings.updates.auto')">
      <template #description>
        {{ desktopInfo.autoUpdates ? $t("settings.updates.autoOn") : $t("settings.updates.autoOff") }}
        <span v-if="saveError" class="mt-1 block text-error">{{ $t("settings.saveError") }}</span>
      </template>
      <input
        type="checkbox"
        class="toggle toggle-primary"
        :aria-label="$t('settings.updates.auto')"
        :checked="desktopInfo.autoUpdates"
        :disabled="saving"
        @change="toggleAuto(($event.target as HTMLInputElement).checked)"
      />
    </SettingRow>
    <div class="pt-5">
      <UpdateStatus v-if="desktopInfo?.lastUpdate" :result="desktopInfo.lastUpdate" :installable="desktopInfo.updates === 'auto'" />
      <p v-else class="text-sm text-base-content/60">{{ $t("settings.updates.notChecked") }}</p>
      <a :href="`${repoUrl}/releases`" target="_blank" class="link link-hover mt-3 inline-block text-sm text-base-content/60">{{ $t("settings.updates.allReleases") }}</a>
    </div>
  </SettingsCard>
</template>
