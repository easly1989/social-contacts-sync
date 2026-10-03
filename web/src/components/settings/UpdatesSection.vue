<script setup lang="ts">
import { RefreshCw } from "lucide-vue-next";

import SettingRow from "./SettingRow.vue";
import SettingsCard from "./SettingsCard.vue";
import UpdateStatus from "./UpdateStatus.vue";
import { repoUrl } from "../../brand";
import { checkForUpdates, checkingUpdates, desktopInfo, packageKey } from "../../desktopInfo";

// Desktop app only.
</script>

<template>
  <SettingsCard>
    <SettingRow :title="$t('settings.updates.version', { version: desktopInfo?.version ?? '…' })">
      <template #description>
        <template v-if="desktopInfo">{{ $t(`settings.packages.${packageKey(desktopInfo.packageKind)}`) }} · {{ $t(`settings.updates.strategy.${desktopInfo.updates}`) }}</template>
      </template>
      <button type="button" class="btn btn-sm" :disabled="checkingUpdates || !desktopInfo || desktopInfo.updates === 'none'" @click="checkForUpdates">
        <RefreshCw class="size-4" :class="{ 'animate-spin': checkingUpdates }" />{{ $t("settings.updates.check") }}
      </button>
    </SettingRow>
    <div class="pt-5">
      <UpdateStatus v-if="desktopInfo?.lastUpdate" :result="desktopInfo.lastUpdate" />
      <p v-else class="text-sm text-base-content/60">{{ $t("settings.updates.notChecked") }}</p>
      <a :href="`${repoUrl}/releases`" target="_blank" class="link link-hover mt-3 inline-block text-sm text-base-content/60">{{ $t("settings.updates.allReleases") }}</a>
    </div>
  </SettingsCard>
</template>
