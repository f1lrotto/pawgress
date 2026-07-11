import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { type Locale, resolveBrowserLocale } from "./locale";
import { resources } from "./resources";

const syncDocumentLanguage = (locale: Locale) => {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.title = i18n.t("meta.title", { lng: locale, ns: "common" });
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute(
      "content",
      i18n.t("meta.description", { lng: locale, ns: "common" }),
    );
};

const initialLocale = resolveBrowserLocale();

i18n.on("languageChanged", (language) =>
  syncDocumentLanguage(resolveBrowserLocale([language])),
);

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLocale,
  fallbackLng: "en",
  supportedLngs: ["en", "sk"],
  defaultNS: "common",
  load: "languageOnly",
  initAsync: false,
  interpolation: { escapeValue: false },
});

syncDocumentLanguage(initialLocale);

export const setLocale = (locale: Locale) => i18n.changeLanguage(locale);

export default i18n;
