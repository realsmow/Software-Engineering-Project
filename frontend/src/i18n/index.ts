import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import th from "./locales/th.json";
import en from "./locales/en.json";

/**
 * i18next setup for ULMs.
 * - Default + fallback language: Thai ('th').
 * - Locale is detected from localStorage first, then the browser, and any
 *   change is persisted back to localStorage under LOCALE_STORAGE_KEY.
 * - `escapeValue: false` because React already escapes interpolated values.
 */
export const LOCALE_STORAGE_KEY = "ulms-locale";
export const SUPPORTED_LOCALES = ["th", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      th: { translation: th },
      en: { translation: en },
    },
    fallbackLng: "th",
    supportedLngs: [...SUPPORTED_LOCALES],
    // Normalize e.g. "en-US" → "en" so navigator detection maps to a locale.
    load: "languageOnly",
    nonExplicitSupportedLngs: true,
    debug: import.meta.env.DEV,
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: LOCALE_STORAGE_KEY,
      caches: ["localStorage"],
    },
  });

export default i18n;
