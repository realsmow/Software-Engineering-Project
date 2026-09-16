import { useTranslation } from "react-i18next";
import { SUPPORTED_LOCALES, type Locale } from "./index";

/**
 * useLocale - read the current locale and switch it.
 * `changeLanguage` also persists to localStorage via the language detector.
 */
export function useLocale() {
  const { i18n } = useTranslation();

  const current: Locale = (SUPPORTED_LOCALES as readonly string[]).includes(
    i18n.language,
  )
    ? (i18n.language as Locale)
    : "th";

  const setLocale = (locale: Locale) => i18n.changeLanguage(locale);
  const toggleLocale = () => setLocale(current === "th" ? "en" : "th");

  return { locale: current, setLocale, toggleLocale };
}
