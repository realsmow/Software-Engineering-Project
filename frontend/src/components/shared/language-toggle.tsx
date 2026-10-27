import { useTranslation } from "react-i18next";
import { useLocale } from "@/i18n/useLocale";

/**
 * Language toggle - flips between Thai and English. Shows the current locale
 * ("TH" / "EN"). Selection is persisted by the i18next language detector.
 */
export function LanguageToggle({ className = "chip-btn" }: { className?: string }) {
  const { t } = useTranslation();
  const { locale, toggleLocale } = useLocale();

  return (
    <button
      type="button"
      className={className}
      onClick={toggleLocale}
      title={t("common.switchLanguage")}
      // #226: the spoken name starts with the visible "TH"/"EN" (WCAG 2.5.3).
      aria-label={`${locale.toUpperCase()} ${t("common.switchLanguage")}`}
    >
      <span>{locale.toUpperCase()}</span>
    </button>
  );
}
