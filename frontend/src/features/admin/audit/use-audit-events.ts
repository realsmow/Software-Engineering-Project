import { useQuery } from "@tanstack/react-query";
import { useTRPCClient } from "@/lib/trpc";
import { fetchAllPages } from "@/lib/paging";
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
/** An audit log grows without bound, so the window is capped rather than paged. */
const MAX_EVENTS = 500;

export function useAuditEvents() {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: ["admin", "audit"],
    queryFn: async (): Promise<AuditEvent[]> => {
      const rows = await fetchAllPages(
        (page, pageSize) => trpc.admin.listAudit.query({ page, pageSize }),
        { maxItems: MAX_EVENTS },
      );
      return rows.map(toAuditEvent);
    },
  });
}
