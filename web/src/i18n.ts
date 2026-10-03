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

/** Stored choice first, then the browser/system language, then English. */
function initialLocale(): Locale {
  const stored = storedLocale();
  if (isLocale(stored)) return stored;
  for (const language of navigator.languages ?? [navigator.language]) {
    const code = language.slice(0, 2).toLowerCase();
    if (isLocale(code)) return code;
  }
  return "en";
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: "en",
  messages: { en, it },
});

document.documentElement.lang = i18n.global.locale.value;

export function setLocale(locale: Locale): void {
  i18n.global.locale.value = locale;
  document.documentElement.lang = locale;
  storeLocale(locale);
}
