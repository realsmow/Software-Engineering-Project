import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "@/constants";

/**
 * Easter egg, currently a blank placeholder.
 *
 * Reachable only by typing `rule86` into the command palette - it is
 * deliberately absent from `constants/navigation.ts`, so no sidebar, tab bar
 * or palette listing ever points here. The plumbing (route, trigger, exit) is
 * done; what the page actually shows is still to be decided.
 */
export default function Rule86Page() {
  const navigate = useNavigate();

  // Going back only works when there is somewhere to go back to; pasting the
  // URL straight in leaves history at index 0, where back() exits the app.
  const leave = useCallback(() => {
    const first = (window.history.state as { idx?: number } | null)?.idx === 0;
    if (first) navigate(ROUTES.HOME, { replace: true });
    else navigate(-1);
  }, [navigate]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") leave();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leave]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black text-white"
      onClick={leave}
      role="presentation"
    >
      {/* The only thing on the page: without it a blank screen has no exit. */}
      <p className="font-mono text-[11px] uppercase tracking-[0.3em] opacity-40">
        rule86 &middot; esc to leave
      </p>
    </div>
  );
}
