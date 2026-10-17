<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-vue-next";

import SourceMark from "../SourceMark.vue";
import { api } from "../../api";
import { isDesktop } from "../../settings";
import { sourceInfo } from "../../sources";
import { syncPrefs } from "../../syncPrefs";
import { SessionStatus, SourceId } from "../../../../interfaces/api";

// Sync › Sources: where a sync looks for photos and in which order (moved from Run in issue #82).
const status = ref<SessionStatus>();
onMounted(async () => (status.value = await api.status()));

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
</script>

<template>
  <section class="rounded-box border border-base-300 bg-base-100 p-6" data-testid="source-order">
    <h2 class="font-semibold">{{ $t("syncSetup.sourcesTitle") }}</h2>
    <p class="mt-0.5 text-sm text-base-content/60">{{ $t("syncSetup.sourcesHint") }}</p>
    <ol class="mt-4 space-y-2" :aria-label="$t('syncSetup.sources')">
      <li
        v-for="(source, index) in syncPrefs.order"
        :key="source"
        class="flex items-center gap-3 rounded-xl border border-base-300 p-3"
        :class="{ 'opacity-60': !available(source) }"
        :data-testid="`source-${source}`"
      >
        <GripVertical class="size-4 text-base-content/30" />
        <span class="w-4 text-xs font-semibold text-base-content/50">{{ index + 1 }}</span>
        <SourceMark :source="source" size="size-8" icon-size="size-4" />
        <div class="flex-1">
          <div class="text-sm font-semibold">{{ sourceInfo[source].name }}</div>
          <div class="text-xs text-base-content/60">
            <template v-if="source === 'telegram' && status && !status.telegramAvailable">{{ $t("dashboard.unavailable") }}</template>
            <template v-else-if="!available(source)">{{ $t("dashboard.notConnected") }}</template>
            <template v-else>{{ $t({ phone: "setup.sources.byPhone", email: "setup.sources.byEmail", link: "links.byLink" }[sourceInfo[source].matchedBy]) }}</template>
          </div>
        </div>
        <div class="join">
          <button type="button" class="btn btn-ghost btn-xs join-item" :disabled="index === 0" :aria-label="$t('syncSetup.moveUp', { name: sourceInfo[source].name })" @click="move(index, -1)"><ChevronUp class="size-4" /></button>
          <button type="button" class="btn btn-ghost btn-xs join-item" :disabled="index === syncPrefs.order.length - 1" :aria-label="$t('syncSetup.moveDown', { name: sourceInfo[source].name })" @click="move(index, 1)"><ChevronDown class="size-4" /></button>
        </div>
        <router-link v-if="source === 'whatsapp' && !available(source)" :to="isDesktop ? '/app/settings/sources' : '/whatsapp'" class="btn btn-xs">{{ $t("dashboard.connect") }}</router-link>
        <router-link v-else-if="source === 'telegram' && !available(source) && status?.telegramAvailable" to="/app/settings/sources" class="btn btn-xs">{{ $t("dashboard.connect") }}</router-link>
        <input
          v-else
          type="checkbox"
          class="toggle toggle-primary toggle-sm"
          :aria-label="sourceInfo[source].name"
          :disabled="!available(source)"
          :checked="available(source) && syncPrefs.enabled.includes(source)"
          @change="toggle(source, ($event.target as HTMLInputElement).checked)"
        />
      </li>
    </ol>
  </section>
</template>
