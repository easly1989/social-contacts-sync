<script setup lang="ts">
import { computed } from "vue";
import { Check } from "lucide-vue-next";

import BrandLogo from "./BrandLogo.vue";
import PreferencesMenu from "./PreferencesMenu.vue";
import { isDesktop, paymentsEnforced } from "../settings";
import { repoUrl, upstreamAuthor, upstreamName, upstreamUrl } from "../brand";

// Page frame of the guided flow (mockups 1.1–1.4 in issue #8): header with
// stepper and preferences, a card for the step, and an action bar.
const props = defineProps<{ step: string; wide?: boolean }>();

const steps = computed(() =>
  isDesktop.value
    ? ["welcome", "googleProject", "signin", "sources", "options", "sync"]
    : ["welcome", ...(paymentsEnforced.value ? ["contribute"] : []), "whatsapp", "google", "options", "sync"]
);
const current = computed(() => steps.value.indexOf(props.step));
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <header class="flex items-center gap-6 px-4 py-4 sm:px-8">
      <router-link to="/" class="flex items-center gap-2.5 font-bold">
        <BrandLogo size="size-8" />
        <span class="hidden sm:inline">{{ $t("app.name") }}</span>
      </router-link>
      <ol class="mx-auto hidden items-center gap-2 text-sm lg:flex" :aria-label="$t('steps.label')">
        <li
          v-for="(s, i) in steps"
          :key="s"
          class="flex items-center gap-2"
          :class="i === current ? 'font-semibold' : i < current ? 'text-base-content/80' : 'text-base-content/50'"
          :aria-current="i === current ? 'step' : undefined"
        >
          <span
            class="grid size-6 place-items-center rounded-full text-xs font-semibold"
            :class="i <= current ? 'bg-primary text-primary-content' : 'bg-base-300 text-base-content/60'"
          >
            <Check v-if="i < current" class="size-3.5" />
            <template v-else>{{ i + 1 }}</template>
          </span>
          {{ $t(`steps.${s}`) }}
          <span v-if="i < steps.length - 1" class="h-px w-8" :class="i < current ? 'bg-primary' : 'bg-base-300'"></span>
        </li>
      </ol>
      <div class="ml-auto lg:ml-0"><PreferencesMenu /></div>
    </header>

    <main class="grid flex-1 place-items-center px-4 pb-6 sm:px-8">
      <div class="w-full rounded-box border border-base-300 bg-base-100 shadow-sm" :class="wide ? 'max-w-[1040px]' : 'max-w-[960px]'">
        <div class="px-6 py-8 sm:px-10"><slot /></div>
        <div v-if="$slots.actions" class="flex flex-wrap items-center gap-3 border-t border-base-300 px-6 py-5 sm:px-10">
          <slot name="actions" />
        </div>
      </div>
    </main>

    <footer class="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-4 text-xs text-base-content/50 sm:px-8">
      <i18n-t keypath="app.basedOn" tag="span">
        <template #project><a class="link" :href="upstreamUrl">{{ upstreamName }}</a></template>
        <template #author>{{ upstreamAuthor }}</template>
      </i18n-t>
      <span class="flex-1"></span>
      <router-link class="link link-hover" to="/privacy">{{ $t("app.privacy") }}</router-link>
      <a class="link link-hover" :href="repoUrl">{{ $t("app.sourceCode") }}</a>
    </footer>
  </div>
</template>
