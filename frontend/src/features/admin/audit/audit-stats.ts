import { APP_TIME_ZONE, toLocalDayKey } from "@/lib/datetime";
import type { Role } from "@/types/domain";
import type { AuditAction, AuditEvent } from "../mock-data";

/**
 * Chart data for the admin screens, derived from the audit trail the server
 * actually returned.
 *
 * These used to be hand-written arrays in `mock-data.ts`, which meant the
 * charts showed invented traffic beside real tables. Everything here is a
 * count of rows from `admin.listAudit`, so an empty log draws an empty chart
 * rather than a plausible-looking one.
 *
 * `useAuditEvents` caps its window at 500 events, so these describe that
 * window, not all of history.
 */

export const ROLE_KEYS: Role[] = ["borrower", "staff", "supervisor", "admin"];

/** Hour of day in Bangkok, not UTC - a 00:30 local event belongs to hour 0. */
const hourFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIME_ZONE,
  hour: "2-digit",
  hour12: false,
});

function localHour(at: string): number {
  return Number(hourFmt.format(new Date(at)));
}

export interface HourBucket {
  hour: number;
  events: number;
}

/** All 24 hours, so a quiet hour reads as a gap rather than vanishing. */
export function eventsByHour(events: AuditEvent[]): HourBucket[] {
  const counts = new Array<number>(24).fill(0);
  for (const e of events) {
    const h = localHour(e.at);
    if (Number.isInteger(h) && h >= 0 && h < 24) counts[h] += 1;
  }
  return counts.map((n, hour) => ({ hour, events: n }));
}

export interface ActionCount {
  action: AuditAction;
  count: number;
}

/** Only actions that occurred; an unused action type is not a zero bar. */
export function eventsByAction(events: AuditEvent[]): ActionCount[] {
  const counts = new Map<AuditAction, number>();
  for (const e of events) counts.set(e.action, (counts.get(e.action) ?? 0) + 1);
  return [...counts.entries()]
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count);
}

export type ActivityDay = { date: string } & Record<Role, number>;

/** One stacked column per day present in the window, oldest first. */
export function activityByRole(events: AuditEvent[]): ActivityDay[] {
  const days = new Map<string, ActivityDay>();
  for (const e of events) {
    const date = toLocalDayKey(e.at);
    let row = days.get(date);
    if (!row) {
      row = { date, borrower: 0, staff: 0, supervisor: 0, admin: 0 };
      days.set(date, row);
    }
    if (ROLE_KEYS.includes(e.actorRole)) row[e.actorRole] += 1;
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface ActorCount {
  name: string;
  actions: number;
}

/** Busiest actors in the window, most active first. */
export function topActors(events: AuditEvent[], limit = 6): ActorCount[] {
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.actorName, (counts.get(e.actorName) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, actions]) => ({ name, actions }))
    .sort((a, b) => b.actions - a.actions)
    .slice(0, limit);
}
