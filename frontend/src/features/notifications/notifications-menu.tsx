import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bell, Check, CheckCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NavIcon } from "@/components/layout/nav-icon";
import type { BadgeTone } from "@/components/ui/badge";
import { MOCK_NOTIFICATIONS, NOTIFICATION_META, type AppNotification } from "./mock-notifications";

/** Tone → soft background + text color, using the semantic surface tokens. */
function toneStyle(tone: BadgeTone): React.CSSProperties {
  if (tone === "neutral") {
    return { background: "var(--s-subtle)", color: "var(--s-t2)" };
  }
  return { background: `var(--s-${tone}-bg)`, color: `var(--s-${tone}-t)` };
}

/** Relative time ("5 นาที", "2 ชม.", "3 วัน") — uses Intl.RelativeTimeFormat. */
function useRelativeTime() {
  const { i18n } = useTranslation();
  return useMemo(() => {
    const rtf = new Intl.RelativeTimeFormat(i18n.language === "th" ? "th" : "en", {
      numeric: "auto",
    });
    return (iso: string) => {
      const diffMs = new Date(iso).getTime() - Date.now();
      const min = Math.round(diffMs / 60000);
      if (Math.abs(min) < 60) return rtf.format(min, "minute");
      const hr = Math.round(min / 60);
      if (Math.abs(hr) < 24) return rtf.format(hr, "hour");
      return rtf.format(Math.round(hr / 24), "day");
    };
  }, [i18n.language]);
}

/** Bell + dropdown of notifications with unread badge and mark-read actions. */
export function NotificationsMenu() {
  const { t } = useTranslation();
  const rel = useRelativeTime();
  const [items, setItems] = useState<AppNotification[]>(MOCK_NOTIFICATIONS);
  const [open, setOpen] = useState(false);

  const unread = items.filter((n) => !n.read).length;

  function markOne(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }
  function markAll() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="icon-btn"
          title={t("common.notifications")}
          aria-label={t("common.notifications")}
        >
          <Bell size={15} strokeWidth={2} />
          {unread > 0 ? <span className="dot">{unread}</span> : null}
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-[340px] p-0">
        <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
          <span className="text-sm font-semibold text-foreground">
            {t("notifications.title")}
          </span>
          {unread > 0 ? (
            <button
              type="button"
              onClick={markAll}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <CheckCheck size={13} strokeWidth={2} />
              {t("notifications.markAllRead")}
            </button>
          ) : null}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-3 py-10 text-center text-sm text-muted-foreground">
              {t("notifications.empty")}
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {items.map((n) => {
                const meta = NOTIFICATION_META[n.kind];
                return (
                  <div
                    key={n.id}
                    className={`group flex gap-3 px-3.5 py-3 ${n.read ? "" : "bg-secondary/50"}`}
                  >
                    <span
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                      style={toneStyle(meta.tone)}
                    >
                      <NavIcon name={meta.icon} size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium text-foreground">{n.title}</span>
                        {!n.read ? (
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-red)]" />
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {n.detail}
                      </p>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">{rel(n.at)}</span>
                        {!n.read ? (
                          <button
                            type="button"
                            onClick={() => markOne(n.id)}
                            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                          >
                            <Check size={12} strokeWidth={2} />
                            {t("notifications.markRead")}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
