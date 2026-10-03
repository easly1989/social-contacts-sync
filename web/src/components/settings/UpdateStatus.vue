<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { ArrowUpCircle, CircleAlert, CircleCheck } from "lucide-vue-next";

import { relativeTime } from "../../format";
import { UpdateCheck } from "../../../../interfaces/api";

// The result of the latest update check, in one line.
defineProps<{ result?: UpdateCheck }>();
const { locale } = useI18n();
</script>

<template>
  <div v-if="result" class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" role="status" data-testid="update-status">
    <template v-if="result.status === 'available' || result.status === 'ready'">
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
    <span class="text-base-content/50">· {{ $t("settings.updates.checked", { when: relativeTime(result.checkedAt, locale) }) }}</span>
  </div>
</template>
