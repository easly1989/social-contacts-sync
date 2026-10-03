<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { HardDrive, Info, KeyRound, Link, Package, Settings } from "lucide-vue-next";

import AppShell from "../../components/AppShell.vue";
import AboutSection from "../../components/settings/AboutSection.vue";
import DataSection from "../../components/settings/DataSection.vue";
import GeneralSection from "../../components/settings/GeneralSection.vue";
import GoogleSection from "../../components/settings/GoogleSection.vue";
import SourcesSection from "../../components/settings/SourcesSection.vue";
import UpdatesSection from "../../components/settings/UpdatesSection.vue";
import { loadDesktopInfo } from "../../desktopInfo";
import { isDesktop } from "../../settings";

// Mockup 6 in issue #8. Data & privacy and Updates exist in the desktop app only.
const allSections = [
  { id: "general", icon: Settings, component: GeneralSection },
  { id: "google", icon: KeyRound, component: GoogleSection },
  { id: "sources", icon: Link, component: SourcesSection },
  { id: "data", icon: HardDrive, component: DataSection, desktop: true },
  { id: "updates", icon: Package, component: UpdatesSection, desktop: true },
  { id: "about", icon: Info, component: AboutSection },
];

const route = useRoute();
const router = useRouter();
const sections = computed(() => allSections.filter((s) => !s.desktop || isDesktop.value));
const current = computed(() => sections.value.find((s) => s.id === route.params.section) ?? sections.value[0]);

onMounted(() => {
  if (current.value.id !== route.params.section) void router.replace(`/app/settings/${current.value.id}`);
  // Fresh folder sizes and update result each time Settings opens.
  if (isDesktop.value) void loadDesktopInfo(true);
});
</script>

<template>
  <AppShell :title="$t('settings.title')">
    <div class="grid gap-6 lg:grid-cols-[220px_1fr]">
      <select
        class="select w-full lg:hidden"
        :aria-label="$t('settings.sections')"
        :value="current.id"
        @change="router.push(`/app/settings/${($event.target as HTMLSelectElement).value}`)"
      >
        <option v-for="s in sections" :key="s.id" :value="s.id">{{ $t(`settings.nav.${s.id}`) }}</option>
      </select>
      <nav class="hidden flex-col gap-1 lg:flex" :aria-label="$t('settings.sections')">
        <router-link
          v-for="s in sections"
          :key="s.id"
          :to="`/app/settings/${s.id}`"
          class="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm font-medium"
          :class="s.id === current.id ? 'border-base-300 bg-base-100 font-semibold' : 'border-transparent text-base-content/70 hover:bg-base-100/60'"
          :aria-current="s.id === current.id ? 'page' : undefined"
        >
          <component :is="s.icon" class="size-4" />{{ $t(`settings.nav.${s.id}`) }}
        </router-link>
      </nav>
      <div class="min-w-0">
        <component :is="current.component" :key="current.id" />
      </div>
    </div>
  </AppShell>
</template>
