import type { Locale } from "./locale";

const presentationLocale = { en: "en-US", sk: "sk-SK" } as const;
type DurationUnit = "day" | "hour" | "minute" | "second";

const unitFormatters: Record<
  Locale,
  Record<DurationUnit, Intl.NumberFormat>
> = {
  en: {
    day: new Intl.NumberFormat("en-US", {
      style: "unit",
      unit: "day",
      unitDisplay: "narrow",
    }),
    hour: new Intl.NumberFormat("en-US", {
      style: "unit",
      unit: "hour",
      unitDisplay: "narrow",
    }),
    minute: new Intl.NumberFormat("en-US", {
      style: "unit",
      unit: "minute",
      unitDisplay: "narrow",
    }),
    second: new Intl.NumberFormat("en-US", {
      style: "unit",
      unit: "second",
      unitDisplay: "narrow",
    }),
  },
  sk: {
    day: new Intl.NumberFormat("sk-SK", {
      style: "unit",
      unit: "day",
      unitDisplay: "narrow",
    }),
    hour: new Intl.NumberFormat("sk-SK", {
      style: "unit",
      unit: "hour",
      unitDisplay: "narrow",
    }),
    minute: new Intl.NumberFormat("sk-SK", {
      style: "unit",
      unit: "minute",
      unitDisplay: "narrow",
    }),
    second: new Intl.NumberFormat("sk-SK", {
      style: "unit",
      unit: "second",
      unitDisplay: "narrow",
    }),
  },
};

const numberFormatters = {
  en: new Intl.NumberFormat("en-US"),
  sk: new Intl.NumberFormat("sk-SK"),
} as const;

const pluralRules = {
  en: new Intl.PluralRules("en-US"),
  sk: new Intl.PluralRules("sk-SK"),
} as const;

export const formatNumber = (value: number, locale: Locale) =>
  numberFormatters[locale].format(value);

export const formatDate = (
  value: number | Date,
  locale: Locale,
  timeZone: string,
  options: Omit<Intl.DateTimeFormatOptions, "timeZone"> = {
    dateStyle: "medium",
  },
) =>
  new Intl.DateTimeFormat(presentationLocale[locale], {
    ...options,
    timeZone,
  }).format(value);

const formatUnit = (value: number, locale: Locale, unit: DurationUnit) =>
  unitFormatters[locale][unit].format(value);

export const formatDuration = (durationMs: number, locale: Locale) => {
  const seconds = Math.floor(Math.max(0, durationMs) / 1_000);
  if (seconds < 60) return formatUnit(seconds, locale, "second");

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return formatUnit(minutes, locale, "minute");

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const remainder = minutes % 60;
    return [
      formatUnit(hours, locale, "hour"),
      remainder && formatUnit(remainder, locale, "minute"),
    ]
      .filter(Boolean)
      .join(" ");
  }

  const days = Math.floor(hours / 24);
  const remainder = hours % 24;
  return [
    formatUnit(days, locale, "day"),
    remainder && formatUnit(remainder, locale, "hour"),
  ]
    .filter(Boolean)
    .join(" ");
};

type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & {
  other: string;
};

export const formatPlural = (
  value: number,
  locale: Locale,
  forms: PluralForms,
) => {
  const category = pluralRules[locale].select(value);
  return `${numberFormatters[locale].format(value)} ${forms[category] ?? forms.other}`;
};
