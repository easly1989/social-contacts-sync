// Locale-aware formatting for dates, durations and numbers.

export function relativeTime(iso: string, locale: string, now = Date.now()): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 365 * 86400],
    ["month", 30 * 86400],
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

export function bytes(value: number, locale: string): string {
  const units = [
    ["byte", 1],
    ["kilobyte", 1024],
    ["megabyte", 1024 ** 2],
    ["gigabyte", 1024 ** 3],
  ] as const;
  const [unit, size] = [...units].reverse().find(([, s]) => value >= s) ?? units[0];
  return new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "short", maximumFractionDigits: 1 }).format(value / size);
}

/** "1990-03-12" → "12 March 1990"; "--03-12" (no year) → "12 March". */
export function birthday(value: string, locale: string): string {
  const match = /^(\d{4}|-)-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const year = match[1] === "-" ? undefined : Number(match[1]);
  const date = new Date(Date.UTC(year ?? 2000, Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: year ? "numeric" : undefined, timeZone: "UTC" }).format(date);
}
