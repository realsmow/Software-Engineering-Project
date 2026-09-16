import { useCallback, useEffect, useState } from "react";
import { applyTheme, getInitialTheme, storeTheme, type Theme } from "@/lib/theme";

/**
 * useTheme - reads the initial theme on mount (localStorage → OS pref),
 * keeps <body class="dark"> in sync, and persists changes.
 *
 * Because every ULMs surface animates its colors together (see the
 * synchronized transitions in globals.css), toggling flips the whole UI
 * at once with no laggy component.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => getInitialTheme());

  // Apply on mount + whenever theme changes.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    storeTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      storeTheme(next);
      return next;
    });
  }, []);

  return { theme, setTheme, toggleTheme, isDark: theme === "dark" };
}
