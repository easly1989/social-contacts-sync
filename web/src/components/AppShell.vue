<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { ArrowUpCircle, CircleCheck, ContactRound, HandHeart, History, LayoutDashboard, RefreshCw, Settings, Sparkles } from "lucide-vue-next";

import BrandLogo from "./BrandLogo.vue";
import PreferencesMenu from "./PreferencesMenu.vue";
import { cleanupSummary, loadCleanupSummary } from "../cleanupState";
import { desktopInfo, loadDesktopInfo } from "../desktopInfo";
import { isDesktop } from "../settings";

// The app frame from the mockups in issue #8: sidebar on wide windows,
// bottom tabs on phones.
defineProps<{ title: string; subtitle?: string }>();
const route = useRoute();
const version = computed(() => desktopInfo.value?.version ?? (import.meta.env.VITE_APP_VERSION as string | undefined));
const update = computed(() => desktopInfo.value?.lastUpdate);

onMounted(() => {
  if (isDesktop.value) void loadDesktopInfo();
  void loadCleanupSummary();
});

const items = [
  { to: "/app", key: "dashboard", icon: LayoutDashboard, exact: true },
  { to: "/app/contacts", key: "contacts", icon: ContactRound },
  { to: "/app/sync", key: "sync", icon: RefreshCw },
  { to: "/app/cleanup", key: "cleanup", icon: Sparkles },
  { to: "/app/history", key: "history", icon: History },
  { to: "/app/settings", key: "settings", icon: Settings },
];
const active = computed(() => (item: (typeof items)[number]) =>
  item.exact ? route.path === item.to : route.path === item.to || route.path.startsWith(`${item.to}/`)
);
</script>

<template>
  <div class="flex min-h-screen bg-base-200 text-base-content">
    <aside class="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-1 border-r border-base-300 bg-base-100 p-4 lg:flex">
      <router-link to="/app" class="flex items-center gap-2.5 px-2 pb-5 pt-1">
        <BrandLogo size="size-8" />
        <span class="text-[15px] font-bold leading-tight">Social Contacts<br />Sync</span>
      </router-link>
      <nav class="flex flex-col gap-1" :aria-label="$t('app.navigation')">
        <router-link
          v-for="item in items"
          :key="item.key"
          :to="item.to"
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium"
          :class="active(item) ? 'bg-primary/10 text-primary' : 'text-base-content/70 hover:bg-base-200'"
          :aria-current="active(item) ? 'page' : undefined"
        >
          <component :is="item.icon" class="size-[18px]" /><span class="flex-1">{{ $t(`app.nav.${item.key}`) }}</span>
          <span v-if="item.key === 'cleanup' && cleanupSummary?.duplicates" class="badge badge-secondary badge-sm" data-testid="cleanup-badge">{{ cleanupSummary.duplicates }}</span>
        </router-link>
      </nav>
      <span class="flex-1"></span>
      <router-link to="/app/settings/about" class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-base-content/70 hover:bg-base-200">
        <HandHeart class="size-[18px] text-secondary" />{{ $t("app.support") }}
      </router-link>
      <div v-if="version" class="mt-2 flex items-center gap-2 border-t border-base-300 px-3 pt-3 text-xs text-base-content/50" data-testid="app-version">
        <span class="flex-1">v{{ version }}</span>
        <router-link v-if="update?.status === 'available' || update?.status === 'ready'" to="/app/settings/updates" class="flex items-center gap-1 font-medium text-primary">
          <ArrowUpCircle class="size-3.5" />{{ $t("settings.updates.newVersion", { version: update.version }) }}
        </router-link>
        <span v-else-if="update?.status === 'current'" class="flex items-center gap-1"><CircleCheck class="size-3.5 text-success" />{{ $t("settings.updates.upToDate") }}</span>
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col pb-16 lg:pb-0">
      <header class="flex flex-wrap items-end gap-x-4 gap-y-3 px-4 pb-5 pt-6 sm:px-8 sm:pt-7">
        <div class="flex min-w-[14rem] flex-1 items-center gap-3">
          <router-link to="/app" class="lg:hidden" :aria-label="$t('app.nav.dashboard')"><BrandLogo size="size-9" /></router-link>
          <div class="min-w-0">
            <h1 class="text-2xl font-bold tracking-tight">{{ title }}</h1>
            <p v-if="subtitle" class="mt-1 text-sm text-base-content/60">{{ subtitle }}</p>
          </div>
        </div>
        <div class="flex items-center gap-2"><slot name="actions" /><PreferencesMenu /></div>
      </header>
      <main class="flex-1 px-4 pb-8 sm:px-8"><slot /></main>
    </div>

    <nav class="fixed inset-x-0 bottom-0 z-10 grid grid-cols-6 border-t border-base-300 bg-base-100 text-[11px] font-medium lg:hidden" :aria-label="$t('app.navigation')">
      <router-link
        v-for="item in items"
        :key="item.key"
        :to="item.to"
        class="flex flex-col items-center gap-1 py-2.5"
        :class="active(item) ? 'text-primary' : 'text-base-content/60'"
      >
        <component :is="item.icon" class="size-5" />{{ $t(`app.nav.${item.key}`) }}
      </router-link>
    </nav>
  </div>
</template>
