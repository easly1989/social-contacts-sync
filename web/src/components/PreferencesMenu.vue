<script setup lang="ts">
import { Check, ChevronDown, Languages, Monitor, Moon, Sun } from "lucide-vue-next";
import { useI18n } from "vue-i18n";

import { locales, setLocale } from "../i18n";
import { setTheme, themePreference, ThemePreference } from "../preferences";

const { locale } = useI18n();
const themes: { value: ThemePreference; icon: typeof Sun }[] = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
];
</script>

<template>
  <div class="dropdown dropdown-end">
    <div tabindex="0" role="button" class="btn btn-ghost btn-sm gap-1.5 font-normal text-base-content/70" :aria-label="$t('preferences.title')">
      <Languages class="size-4" />
      {{ locales.find((l) => l.code === locale)?.name }}
      <ChevronDown class="size-3.5" />
    </div>
    <div tabindex="0" class="dropdown-content z-20 mt-2 w-60 rounded-box border border-base-300 bg-base-100 p-3 shadow-lg">
      <div class="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-base-content/50">{{ $t("preferences.language") }}</div>
      <ul class="menu w-full p-0">
        <li v-for="l in locales" :key="l.code">
          <button type="button" :lang="l.code" @click="setLocale(l.code)">
            <span class="flex-1">{{ l.name }}</span>
            <Check v-if="l.code === locale" class="size-4 text-primary" />
          </button>
        </li>
      </ul>
      <div class="px-1 pb-1.5 pt-3 text-xs font-semibold uppercase tracking-wide text-base-content/50">{{ $t("preferences.theme") }}</div>
      <div class="join w-full">
        <button
          v-for="t in themes"
          :key="t.value"
          type="button"
          class="btn btn-sm join-item flex-1 gap-1 px-1 font-medium"
          :class="{ 'btn-active btn-primary': themePreference === t.value }"
          :aria-pressed="themePreference === t.value"
          @click="setTheme(t.value)"
        >
          <component :is="t.icon" class="size-3.5" />{{ $t(`preferences.${t.value}`) }}
        </button>
      </div>
    </div>
  </div>
</template>
