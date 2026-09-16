import { Outlet } from "react-router-dom";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { MobileTabBar } from "./mobile-tab-bar";

/**
 * AppShell: the authenticated layout. `.shell` is a 240px sidebar + main grid;
 * main stacks the sticky Topbar over the scrollable body which renders the
 * routed page via <Outlet/>. The dev role switcher is mounted globally (see
 * App) so it is reachable from the login screen too.
 */
export function AppShell() {
  return (
    <div className="shell">
      <Sidebar />
      <div className="main">
        <Topbar />
        <div className="app-body">
          <div className="body-inner">
            <Outlet />
          </div>
        </div>
      </div>
      <MobileTabBar />
    </div>
  );
}
