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

  // First visit — respect system preference.
  const prefersDark =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

/** Apply a theme to <body> (adds/removes the `dark` class). */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.body.classList.toggle("dark", theme === "dark");
}

/** Persist the chosen theme. */
export function storeTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, theme);
}
