import { ref } from "vue";

// Per-browser preferences. Storage can be unavailable (private windows,
// blocked site data), so every access is guarded and defaults still work.
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not persisted; the choice still applies to this page.
  }
}

export type ThemePreference = "light" | "dark" | "system";

const themeKey = "scs.theme";
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function storedTheme(): ThemePreference {
  const value = read(themeKey);
  return value === "light" || value === "dark" ? value : "system";
}

export const themePreference = ref<ThemePreference>(storedTheme());

export function applyTheme(): void {
  const dark =
    themePreference.value === "dark" ||
    (themePreference.value === "system" && darkQuery.matches);
  document.documentElement.dataset.theme = dark ? "scs-dark" : "scs-light";
}

export function setTheme(value: ThemePreference): void {
  themePreference.value = value;
  write(themeKey, value);
  applyTheme();
}

darkQuery.addEventListener("change", applyTheme);

const localeKey = "scs.locale";

export function storedLocale(): string | null {
  return read(localeKey);
}

/** `null` forgets the choice, so the system language applies again. */
export function storeLocale(locale: string | null): void {
  if (locale !== null) return write(localeKey, locale);
  try {
    localStorage.removeItem(localeKey);
  } catch {
    // Nothing stored then.
  }
}
