export const supportedLocales = ["en", "sk"] as const;

export type Locale = (typeof supportedLocales)[number];

export const isSupportedLocale = (value: string): value is Locale =>
  supportedLocales.includes(value as Locale);

const supportedLanguage = (value: string) => {
  try {
    const language = new Intl.Locale(value).language;
    return isSupportedLocale(language) ? language : null;
  } catch {
    return null;
  }
};

export const resolveBrowserLocale = (
  languages: readonly string[] = typeof navigator === "undefined"
    ? []
    : navigator.languages.length
      ? navigator.languages
      : [navigator.language],
) => languages.map(supportedLanguage).find((locale) => locale !== null) ?? "en";
