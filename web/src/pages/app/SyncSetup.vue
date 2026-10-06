<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { ChevronDown, ChevronUp, GripVertical, Info, RefreshCw, ShieldCheck } from "lucide-vue-next";

import AppShell from "../../components/AppShell.vue";
import SourceMark from "../../components/SourceMark.vue";
import SourceBadge from "../../components/SourceBadge.vue";
import { api } from "../../api";
import { number } from "../../format";
import { isDesktop } from "../../settings";
import { sourceInfo } from "../../sources";
import { GoogleStats, SessionStatus, SourceId } from "../../../../interfaces/api";

// Mockup 3.1 in issue #8.
type Mode = "fill" | "replace" | "review";
const modes: Mode[] = ["fill", "replace", "review"];
const prefsKey = "scs.syncSetup";

interface Prefs {
  order: SourceId[];
  enabled: SourceId[];
  mode: Mode;
}

function readPrefs(): Prefs {
  const defaults: Prefs = { order: ["whatsapp", "gravatar", "telegram", "links"], enabled: ["whatsapp", "gravatar", "links"], mode: "fill" };
  try {
    const stored = JSON.parse(localStorage.getItem(prefsKey) ?? "{}");
    const order = Array.isArray(stored.order) ? stored.order.filter((s: SourceId) => defaults.order.includes(s)) : [];
    // Sources added since the choice was saved start as they do for everyone.
    const added = defaults.order.filter((s) => !order.includes(s));
    return {
      order: [...order, ...added],
      enabled: Array.isArray(stored.enabled) ? [...stored.enabled, ...added.filter((s) => defaults.enabled.includes(s))] : defaults.enabled,
      mode: modes.includes(stored.mode) ? stored.mode : defaults.mode,
    };
  } catch {
    return defaults;
  }
}

const { locale } = useI18n();
const router = useRouter();
const prefs = ref<Prefs>(readPrefs());
const status = ref<SessionStatus>();
const stats = ref<GoogleStats>();

watch(prefs, (value) => {
  try {
    localStorage.setItem(prefsKey, JSON.stringify(value));
  } catch {
    // Only a convenience.
  }
}, { deep: true });

function available(source: SourceId): boolean {
  if (source === "whatsapp") return Boolean(status.value?.whatsappConnected);
  if (source === "telegram") return Boolean(status.value?.telegramConnected);
  return source === "gravatar" || source === "links";
}

const selected = computed(() => prefs.value.order.filter((s) => available(s) && prefs.value.enabled.includes(s)));

function toggle(source: SourceId, on: boolean): void {
  prefs.value.enabled = on ? [...prefs.value.enabled, source] : prefs.value.enabled.filter((s) => s !== source);
}

function move(index: number, delta: number): void {
  const order = [...prefs.value.order];
  const [item] = order.splice(index, 1);
  order.splice(index + delta, 0, item);
  prefs.value.order = order;
}

// Writes are limited to ~40 per minute; only contacts that get a photo cost time.
const estimate = computed(() => {
  if (!stats.value || prefs.value.mode === "review") return undefined;
  const candidates = prefs.value.mode === "fill" ? stats.value.totalContacts - stats.value.withPhoto : stats.value.totalContacts;
  return Math.max(1, Math.ceil((candidates * 1.5) / 60));
});

function start(): void {
  const params = new URLSearchParams({ mode: prefs.value.mode, sources: selected.value.join(",") });
  router.push(`/app/sync/run?${params}`);
}

onMounted(async () => {
  status.value = await api.status();
  stats.value = await api.stats().catch(() => undefined);
});
</script>

<template>
  <AppShell :title="$t('syncSetup.title')" :subtitle="$t('syncSetup.subtitle')">
    <div class="grid gap-5 xl:grid-cols-[1fr_320px]">
      <div class="space-y-5">
        <section class="rounded-box border border-base-300 bg-base-100 p-6">
          <h2 class="font-semibold">{{ $t("syncSetup.sourcesTitle") }}</h2>
          <p class="mt-0.5 text-sm text-base-content/60">{{ $t("syncSetup.sourcesHint") }}</p>
          <ol class="mt-4 space-y-2" :aria-label="$t('syncSetup.sources')">
            <li
              v-for="(source, index) in prefs.order"
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
                <button type="button" class="btn btn-ghost btn-xs join-item" :disabled="index === prefs.order.length - 1" :aria-label="$t('syncSetup.moveDown', { name: sourceInfo[source].name })" @click="move(index, 1)"><ChevronDown class="size-4" /></button>
              </div>
              <router-link v-if="source === 'whatsapp' && !available(source)" :to="isDesktop ? '/setup/sources' : '/whatsapp'" class="btn btn-xs">{{ $t("dashboard.connect") }}</router-link>
              <router-link v-else-if="source === 'telegram' && !available(source) && status?.telegramAvailable" to="/app/settings/sources" class="btn btn-xs">{{ $t("dashboard.connect") }}</router-link>
              <input
                v-else
                type="checkbox"
                class="toggle toggle-primary toggle-sm"
                :aria-label="sourceInfo[source].name"
                :disabled="!available(source)"
                :checked="available(source) && prefs.enabled.includes(source)"
                @change="toggle(source, ($event.target as HTMLInputElement).checked)"
              />
            </li>
          </ol>
        </section>

        <section class="rounded-box border border-base-300 bg-base-100 p-6">
          <h2 class="font-semibold">{{ $t("syncSetup.modeTitle") }}</h2>
          <div class="mt-4 space-y-2" role="radiogroup">
            <label
              v-for="m in modes"
              :key="m"
              class="flex cursor-pointer gap-3 rounded-xl border px-4 py-3"
              :class="prefs.mode === m ? 'border-primary bg-primary/5' : 'border-base-300'"
            >
              <input v-model="prefs.mode" type="radio" name="mode" :value="m" class="radio radio-primary radio-sm mt-0.5" />
              <div class="flex-1">
                <div class="flex items-center gap-2 text-sm font-semibold">
                  {{ $t(`options.${m}Title`) }}
                  <span v-if="m === 'fill'" class="badge badge-soft badge-primary badge-xs">{{ $t("options.recommended") }}</span>
                </div>
                <div class="mt-0.5 text-sm text-base-content/60">{{ $t(`options.${m}Text`) }}</div>
              </div>
            </label>
          </div>
          <details class="mt-4 text-sm">
            <summary class="cursor-pointer font-medium text-base-content/70">{{ $t("syncSetup.advanced") }}</summary>
            <div class="mt-3 flex flex-wrap items-center gap-3">
              <span class="flex-1 text-base-content/70">{{ $t("syncSetup.country") }}</span>
              <span class="text-base-content/60">{{ $t("syncSetup.countryAuto") }}</span>
            </div>
          </details>
        </section>
      </div>

      <div class="space-y-5">
        <section class="rounded-box border border-base-300 bg-base-100 p-6">
          <h2 class="font-semibold">{{ $t("syncSetup.summary") }}</h2>
          <dl class="mt-4 space-y-3 text-sm">
            <div class="flex justify-between"><dt class="text-base-content/60">{{ $t("syncSetup.contacts") }}</dt><dd class="font-semibold tabular-nums">{{ stats ? number(stats.totalContacts, locale) : "—" }}</dd></div>
            <div class="flex justify-between"><dt class="text-base-content/60">{{ $t("syncSetup.withoutPhoto") }}</dt><dd class="font-semibold tabular-nums">{{ stats ? number(stats.totalContacts - stats.withPhoto, locale) : "—" }}</dd></div>
            <div class="flex items-center justify-between gap-2">
              <dt class="text-base-content/60">{{ $t("syncSetup.sources") }}</dt>
              <dd class="flex flex-wrap justify-end gap-1"><SourceBadge v-for="s in selected" :key="s" :source="s" /></dd>
            </div>
            <div class="flex justify-between"><dt class="text-base-content/60">{{ $t("syncSetup.estimate") }}</dt><dd class="font-semibold">{{ estimate ? $t("syncSetup.upTo", { minutes: estimate }) : "—" }}</dd></div>
          </dl>
          <div class="mt-4 flex gap-2 rounded-lg bg-base-200 p-3 text-xs text-base-content/60">
            <ShieldCheck class="size-4 shrink-0 text-success" /><span>{{ $t("syncSetup.backupNote") }}</span>
          </div>
          <p v-if="!selected.length" class="mt-4 text-sm text-error">{{ $t("syncSetup.noSources") }}</p>
          <button type="button" class="btn btn-primary mt-5 w-full" :disabled="!selected.length" @click="start"><RefreshCw class="size-4" />{{ $t("syncSetup.start") }}</button>
        </section>
        <p class="flex gap-2 px-1 text-xs text-base-content/50"><Info class="size-4 shrink-0" />{{ $t("syncSetup.rateNote") }}</p>
      </div>
    </div>
  </AppShell>
</template>
