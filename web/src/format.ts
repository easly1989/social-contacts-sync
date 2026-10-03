// Locale-aware formatting for dates, durations and numbers.

export function relativeTime(iso: string, locale: string, now = Date.now()): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  return format.format(0, "minute");
}

export function duration(ms: number, locale: string): string {
  const minutes = Math.round(ms / 60000);
  if (minutes >= 1) return new Intl.NumberFormat(locale, { style: "unit", unit: "minute", unitDisplay: "short" }).format(minutes);
  return new Intl.NumberFormat(locale, { style: "unit", unit: "second", unitDisplay: "short" }).format(Math.max(1, Math.round(ms / 1000)));
}

export function dateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export function number(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}
