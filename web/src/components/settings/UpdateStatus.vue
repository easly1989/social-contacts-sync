<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { ArrowUpCircle, CircleAlert, CircleCheck, Download, RotateCw } from "lucide-vue-next";

import { api } from "../../api";
import { relativeTime } from "../../format";
import { UpdateCheck } from "../../../../interfaces/api";

// The result of the latest update check, in one line; while an update
// downloads, its progress, and once it's ready, a way to install it now.
const props = defineProps<{ result?: UpdateCheck; installable?: boolean }>();
const { locale } = useI18n();

const installing = ref(false);
const installFailed = ref(false);
async function install(): Promise<void> {
  installing.value = true;
  installFailed.value = false;
  try {
    // The app closes, installs the update and opens again.
    await api.installUpdate();
  } catch {
    installFailed.value = true;
    installing.value = false;
  }
}
const progress = () => props.result?.progress ?? 0;
</script>

<template>
  <div v-if="result" class="space-y-3" role="status" data-testid="update-status">
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <template v-if="result.status === 'downloading'">
        <Download class="size-4 text-primary" />
        <span class="font-medium">{{ $t("settings.updates.downloading", { version: result.version, progress: progress() }) }}</span>
        <a v-if="result.url" :href="result.url" target="_blank" class="link link-primary">{{ $t("settings.updates.releaseNotes") }}</a>
      </template>
      <template v-else-if="result.status === 'available' || result.status === 'ready'">
        <ArrowUpCircle class="size-4 text-primary" />
        <span class="font-medium">{{ $t(`settings.updates.${result.status}`, { version: result.version }) }}</span>
        <a v-if="result.url" :href="result.url" target="_blank" class="link link-primary">{{ $t("settings.updates.releaseNotes") }}</a>
      </template>
      <template v-else-if="result.status === 'current'">
        <CircleCheck class="size-4 text-success" /><span>{{ $t("settings.updates.upToDate") }}</span>
      </template>
      <template v-else-if="result.status === 'error'">
        <CircleAlert class="size-4 text-error" /><span>{{ $t("settings.updates.error") }}</span>
      </template>
      <template v-else>{{ $t("settings.updates.disabled") }}</template>
      <span v-if="result.status !== 'downloading'" class="text-base-content/50">· {{ $t("settings.updates.checked", { when: relativeTime(result.checkedAt, locale) }) }}</span>
    </div>
    <template v-if="result.status === 'downloading'">
      <progress class="progress progress-primary h-1.5 w-full max-w-md" :value="progress() || undefined" max="100" :aria-label="$t('settings.updates.downloadProgress')"></progress>
      <p class="text-xs text-base-content/60">{{ $t("settings.updates.downloadingHint") }}</p>
    </template>
    <p v-else-if="result.status === 'available' && installable" class="text-xs text-base-content/60">{{ $t("settings.updates.availableHint") }}</p>
    <template v-else-if="result.status === 'ready' && installable">
      <p class="text-xs text-base-content/60">{{ $t("settings.updates.readyHint") }}</p>
      <button type="button" class="btn btn-primary btn-sm" :disabled="installing" @click="install">
        <span v-if="installing" class="loading loading-spinner loading-xs"></span><RotateCw v-else class="size-4" />{{ $t("settings.updates.installNow") }}
      </button>
      <p v-if="installFailed" class="text-xs text-error" role="alert">{{ $t("settings.updates.installFailed") }}</p>
    </template>
  </div>
</template>
