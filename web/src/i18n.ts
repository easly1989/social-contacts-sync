import { ref } from "vue";
import { createI18n } from "vue-i18n";

import en from "./locales/en";
import it from "./locales/it";
import { storedLocale, storeLocale } from "./preferences";

export const locales = [
  { code: "en", name: "English" },
  { code: "it", name: "Italiano" },
] as const;

export type Locale = (typeof locales)[number]["code"];

function isLocale(value: string | null | undefined): value is Locale {
  return locales.some((l) => l.code === value);
}

function systemLocale(): Locale {
  for (const language of navigator.languages ?? [navigator.language]) {
    const code = language.slice(0, 2).toLowerCase();
    if (isLocale(code)) return code;
  }
  return "en";
}

/** The language picked in Settings, or "system" to follow the system language. */
export const localeChoice = ref<Locale | "system">(isLocale(storedLocale()) ? (storedLocale() as Locale) : "system");

/** Stored choice first, then the browser/system language, then English. */
function initialLocale(): Locale {
  return localeChoice.value === "system" ? systemLocale() : localeChoice.value;
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: "en",
  messages: { en, it },
});

document.documentElement.lang = i18n.global.locale.value;

export function setLocale(choice: Locale | "system"): void {
  const locale = choice === "system" ? systemLocale() : choice;
  i18n.global.locale.value = locale;
  document.documentElement.lang = locale;
  localeChoice.value = choice;
  storeLocale(choice === "system" ? null : choice);
}
