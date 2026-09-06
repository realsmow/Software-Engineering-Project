import { useMemo } from "react";
import {
  STATUS_TAB,
  type CatalogItem,
  type MyRequest,
  type RequestTab,
} from "../mock-data";
import { useMyRequestsApi } from "./use-my-requests-api";
import { useEquipmentTypes } from "../catalog/use-equipment-types";
import { useRequestDraft, type DraftLine } from "../request/request-draft.store";
import { useSubmittedRequests } from "./submitted-requests.store";

/**
 * The saved draft, shown alongside real requests so an unfinished basket is
 * not invisible. It is not a request yet - hence its own shape rather than a
 * MyRequest with a fake status.
 */
export interface DraftSummary {
  /** Names of the first few items, for the card title. */
  title: string;
  lines: number;
  units: number;
  startDate: string;
  endDate: string | null;
}

/**
 * useMyRequests - everything the "คำขอของฉัน" page lists: the borrower's real
 * requests from the server, plus the unsent draft sitting in the local store.
 *
 * The seeded `MY_REQUESTS` array is gone; `loan.list` answers for real now.
 * The draft stays local because it is not a request yet - nothing has been
 * sent, so there is nothing for the server to have an opinion about.
 *
 * `overrides` also stays. It carries the extension and inspection state the
 * pages show, and `requestOutput` cannot supply any of it: a reservation
 * describes what was asked for, not the loan that follows. Those fields are
 * still local until a borrower-side view of UsageLog exists.
 */
export function useMyRequests() {
  // Only the draft needs it: a saved line is an id, and the card title is the
  // item's name. Submitted requests already carry their own name.
  const { data: catalog } = useEquipmentTypes();
  const { data: server, isLoading } = useMyRequestsApi();
  const submitted = useSubmittedRequests((s) => s.requests);
  const overrides = useSubmittedRequests((s) => s.overrides);
  const draftLines = useRequestDraft((s) => s.lines);
  const startDate = useRequestDraft((s) => s.startDate);
  const endDate = useRequestDraft((s) => s.endDate);

  const requests = useMemo<MyRequest[]>(() => {
    // Equipment comes from the server. Room bookings do not: there is no
    // reservation router yet, so a booking only exists in this session's store
    // and dropping it here would make it vanish from the page that just
    // confirmed it.
    const rooms = submitted.filter((r) => r.kind === "room");

    return [...rooms, ...(server ?? [])].map((r) => {
      // Local extension/inspection state layered on top of the server row.
      // Keyed by the reservation number, which is what `id` now holds.
      const changes = overrides[r.id];
      return changes ? { ...r, ...changes } : r;
    });
  }, [server, submitted, overrides]);

  const draft = useMemo<DraftSummary | null>(
    () => summariseDraft(draftLines, catalog ?? [], startDate, endDate),
    [draftLines, catalog, startDate, endDate],
  );

  const countByTab = useMemo(() => {
    const counts: Record<RequestTab, number> = { active: 0, using: 0, history: 0 };
    for (const r of requests) counts[STATUS_TAB[r.status]] += 1;
    // The draft sits with the in-progress work.
    if (draft) counts.active += 1;
    return counts;
  }, [requests, draft]);

  return { requests, draft, countByTab, isLoading };
}

export function requestsInTab(requests: MyRequest[], tab: RequestTab): MyRequest[] {
  return requests.filter((r) => STATUS_TAB[r.status] === tab);
}

function summariseDraft(
  lines: DraftLine[],
  catalog: CatalogItem[],
  startDate: string,
  endDate: string | null,
): DraftSummary | null {
  if (lines.length === 0) return null;

  const names = lines.flatMap((l) => {
    const item = catalog.find((c) => c.id === l.itemId);
    return item ? [item.name] : [];
  });

  return {
    title: names.slice(0, 2).join(" · "),
    lines: lines.length,
    units: lines.reduce((sum, l) => sum + l.qty, 0),
    startDate,
    endDate,
  };
}
