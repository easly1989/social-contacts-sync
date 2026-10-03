<script setup lang="ts">
import { ref } from "vue";
import { Monitor, Moon, Sun } from "lucide-vue-next";

import SettingRow from "./SettingRow.vue";
import SettingsCard from "./SettingsCard.vue";
import { api } from "../../api";
import { desktopInfo, loadDesktopInfo } from "../../desktopInfo";
import { locales, localeChoice, setLocale } from "../../i18n";
import { setTheme, themePreference, ThemePreference } from "../../preferences";
import { isDesktop } from "../../settings";

const themes: { value: ThemePreference; icon: typeof Sun }[] = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
];
const saving = ref(false);
const saveError = ref(false);

async function setRemember(enabled: boolean): Promise<void> {
  saving.value = true;
  saveError.value = false;
  try {
    await api.setRememberSignIns(enabled);
    await loadDesktopInfo(true);
  } catch {
    saveError.value = true;
  }
  saving.value = false;
}
</script>

<template>
  <SettingsCard>
    <SettingRow :title="$t('settings.general.language')" :description="$t('settings.general.languageHint')">
      <select
        class="select select-sm w-48"
        :aria-label="$t('settings.general.language')"
        :value="localeChoice"
        @change="setLocale(($event.target as HTMLSelectElement).value as typeof localeChoice)"
      >
        <option value="system">{{ $t("settings.general.systemLanguage") }}</option>
        <option v-for="l in locales" :key="l.code" :value="l.code" :lang="l.code">{{ l.name }}</option>
      </select>
    </SettingRow>
    <SettingRow :title="$t('preferences.theme')" :description="$t('settings.general.themeHint')">
      <div class="join" role="group" :aria-label="$t('preferences.theme')">
        <button
          v-for="t in themes"
          :key="t.value"
          type="button"
          class="btn btn-sm join-item gap-1.5 font-medium"
          :class="{ 'btn-active btn-primary': themePreference === t.value }"
          :aria-pressed="themePreference === t.value"
          @click="setTheme(t.value)"
        >
          <component :is="t.icon" class="size-3.5" />{{ $t(`preferences.${t.value}`) }}
        </button>
      </div>
    </SettingRow>
    <SettingRow v-if="isDesktop" :title="$t('settings.general.remember')">
      <template #description>
        {{ $t("settings.general.rememberHint") }}
        <span v-if="desktopInfo && !desktopInfo.rememberSignIns" class="mt-1 block">{{ $t("settings.general.rememberOff") }}</span>
        <span v-if="saveError" class="mt-1 block text-error">{{ $t("settings.saveError") }}</span>
      </template>
      <input
        type="checkbox"
        class="toggle toggle-primary"
        :aria-label="$t('settings.general.remember')"
        :checked="desktopInfo?.rememberSignIns ?? true"
        :disabled="!desktopInfo || saving"
        @change="setRemember(($event.target as HTMLInputElement).checked)"
      />
    </SettingRow>
  </SettingsCard>
</template>
