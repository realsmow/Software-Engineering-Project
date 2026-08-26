/**
 * Theme helpers (framework-agnostic).
 * Light/dark is applied by toggling the `dark` class on <body>, matching the
 * reference HTML (`body.dark { ... }`). Choice persists in localStorage.
 */
export type Theme = "light" | "dark";

const STORAGE_KEY = "ulms-theme";

/** Resolve the initial theme: stored choice → OS preference → light. */
export function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;

  // First visit - respect system preference.
  const prefersDark =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

/**
 * Apply a theme to <body> (adds/removes the `dark` class).
 *
 * Components declare their own transitions at different durations
 * (0.1s / 0.15s / 0.2s), which makes a themed color transition finish at
 * different moments and look "staggered". To make the whole UI flip at once,
 * we suppress every transition (`.theme-switching`) for the frame in which the
 * class changes, then restore them.
 */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const body = document.body;
  body.classList.add("theme-switching");
  body.classList.toggle("dark", theme === "dark");
  // Restore transitions after the swap has painted.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => body.classList.remove("theme-switching"));
  });
}

/** Persist the chosen theme. */
export function storeTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, theme);
}
