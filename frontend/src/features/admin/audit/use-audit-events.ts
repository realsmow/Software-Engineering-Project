import { useQuery } from "@tanstack/react-query";
import { useTRPCClient } from "@/lib/trpc";
import { toAuditEvent } from "./audit-event.adapter";
import type { AuditEvent } from "../mock-data";

/**
 * The audit trail, newest first.
 *
 * The page filters by action, time range and free text on the client, so this
 * fetches a window rather than paging: an audit log grows without bound, and
 * loading all of it would get slower every day the system runs.
 *
 * MAX_EVENTS is the ceiling on that window. Once the log is routinely deeper
 * than this, filtering has to move to the server - the ordering already
 * supports it, `listAudit` takes an `action` filter, and the page would need
 * to stop filtering locally.
 */
const PAGE_SIZE = 100;
const MAX_EVENTS = 500;

export function useAuditEvents() {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: ["admin", "audit"],
    queryFn: async (): Promise<AuditEvent[]> => {
      const rows = [];
      const pages = MAX_EVENTS / PAGE_SIZE;

      for (let page = 1; page <= pages; page++) {
        const result = await trpc.admin.listAudit.query({ page, pageSize: PAGE_SIZE });
        rows.push(...result.items);
        // Stop as soon as the log runs out rather than requesting empty pages.
        if (rows.length >= result.total) break;
      }

      return rows.map(toAuditEvent);
    },
  });
}
