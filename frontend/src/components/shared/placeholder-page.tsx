import { useLocation } from "react-router-dom";
import { ROUTE_TITLES } from "@/constants/navigation";

/**
 * Generic placeholder for routes whose real page isn't built yet. Renders the
 * page's Thai title (from `title` prop, else looked up from ROUTE_TITLES by the
 * current path) plus a "work in progress" note. Sits inside AppShell via the
 * router's layout <Outlet/>, so it does not render the shell itself.
 */
export function PlaceholderPage({ title }: { title?: string }) {
  const { pathname } = useLocation();
  const heading = title ?? ROUTE_TITLES[pathname] ?? "หน้านี้";

  return (
    <div className="ph-page">
      <h1 className="ph-title">{heading}</h1>
      <p className="ph-note">อยู่ระหว่างการพัฒนา — เนื้อหาหน้านี้จะเพิ่มในภายหลัง</p>
    </div>
  );
}

export default PlaceholderPage;
