import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { ROUTE_TITLE_KEYS } from "@/constants/navigation";

/**
 * Generic placeholder for routes whose real page isn't built yet. Renders the
 * page's title plus a "work in progress" note. The title comes from a `titleKey`
 * i18n key, else the current route's label key, else a generic fallback. Sits
 * inside AppShell via the router's layout <Outlet/>, so it does not render the
 * shell itself.
 */
export function PlaceholderPage({ titleKey }: { titleKey?: string }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const key = titleKey ?? ROUTE_TITLE_KEYS[pathname] ?? "nav.thisPage";

  return (
    <div className="ph-page">
      <h1 className="ph-title">{t(key)}</h1>
      <p className="ph-note">{t("common.underDevelopment")}</p>
    </div>
  );
}

export default PlaceholderPage;
