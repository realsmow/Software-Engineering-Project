import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { getNavForRole } from "@/constants/navigation";
import { NavIcon } from "./nav-icon";
import { useAuthStore } from "@/features/auth/auth.store";
import type { Role } from "@/types/domain";

interface PageEntry {
  key: string;
  label: string;
  icon: string;
  section: string;
  route: string;
}

/**
 * ⌘K command palette (pages only). Flattens the current role's navigation
 * into a searchable list of destinations and jumps to the chosen page.
 */
export function CommandMenu({ triggerClassName }: { triggerClassName?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = (useAuthStore((s) => s.user?.role) ?? "borrower") as Role;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // All navigable destinations for the active role (deduped by route).
  const pages = useMemo<PageEntry[]>(() => {
    const seen = new Set<string>();
    const out: PageEntry[] = [];
    for (const section of getNavForRole(role).sections) {
      for (const item of section.items) {
        if (!item.route || seen.has(item.route)) continue;
        seen.add(item.route);
        out.push({
          key: item.key,
          label: t(item.labelKey),
          icon: item.icon,
          section: t(section.labelKey),
          route: item.route,
        });
      }
    }
    return out;
  }, [role, t]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter(
      (p) => p.label.toLowerCase().includes(q) || p.section.toLowerCase().includes(q),
    );
  }, [pages, query]);

  // Global ⌘K / Ctrl+K to open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Reset transient state whenever the palette opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
    }
  }, [open]);

  // Keep the cursor within bounds as results shrink.
  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, results.length - 1)));
  }, [results.length]);

  function go(entry: PageEntry | undefined) {
    if (!entry) return;
    setOpen(false);
    navigate(entry.route);
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[cursor]);
    }
  }

  return (
    <>
      <button
        type="button"
        className={triggerClassName ?? "top-search"}
        aria-label={t("common.search")}
        onClick={() => setOpen(true)}
      >
        <Search size={14} strokeWidth={2} />
        <span className="top-search-label">{t("common.searchHint")}</span>
        <span className="kbd">⌘K</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          hideClose
          className="max-w-lg gap-0 overflow-hidden p-0"
          onKeyDown={onListKeyDown}
        >
          <DialogTitle className="sr-only">{t("common.search")}</DialogTitle>
          <div className="flex items-center gap-2 border-b border-border px-3.5">
            <Search size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("command.placeholder")}
              className="h-11 w-full bg-transparent text-sm text-foreground outline-none shadow-none focus:shadow-none focus-visible:shadow-none focus-visible:outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div ref={listRef} className="max-h-80 overflow-y-auto p-1.5">
            {results.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                {t("command.empty")}
              </div>
            ) : (
              results.map((p, i) => (
                <button
                  key={p.route}
                  type="button"
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(p)}
                  className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    i === cursor ? "bg-secondary text-foreground" : "text-foreground/80"
                  }`}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                    <NavIcon name={p.icon} size={15} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{p.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{p.section}</span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
