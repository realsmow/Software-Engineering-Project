import { useMemo } from "react";
import { STATUS_TAB, type MyRequest, type RequestTab } from "../request-status";
import type { CatalogItem } from "../catalog/catalog.types";
import { useMyRequestsApi } from "./use-my-requests-api";
import { useEquipmentTypes } from "../catalog/use-equipment-types";
import {
  useRequestDraft,
  type DraftLine,
  type RequestTime,
} from "../request/request-draft.store";

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
  pickupTime: RequestTime;
  endDate: string | null;
  returnTime: RequestTime;
}

/**
 * useMyRequests - everything the "คำขอของฉัน" page lists: the borrower's real
 * requests from the server, plus the unsent draft sitting in the local store.
 *
 * The seeded `MY_REQUESTS` array is gone; `loan.list` answers for real now.
 * The draft stays local because it is not a request yet - nothing has been
 * sent, so there is nothing for the server to have an opinion about.
 *
 * Nothing is layered over the server rows any more. Extension state comes
 * from `loan.extensionOptions`/`loan.myExtensions` and penalties from
 * `appeal.*`; a local copy of either showed changes the server never saw.
 */
/**
 * A listed row, plus the loan key when the server knows one.
 *
 * A server row only gains a usageKey once staff set a unit, or a room, aside. `loan.extensionOptions` keys
 * on it, so it has to survive the merge rather than being narrowed away.
 */
export type LoanRow = MyRequest & { usageKey?: number | null };

export function useMyRequests() {
  // Only the draft needs it: a saved line is an id, and the card title is the
  // item's name. Submitted requests already carry their own name.
  const { data: catalog } = useEquipmentTypes();
  const { data: server, isLoading } = useMyRequestsApi();
  const draftLines = useRequestDraft((s) => s.lines);
  const startDate = useRequestDraft((s) => s.startDate);
  const pickupTime = useRequestDraft((s) => s.pickupTime);
  const endDate = useRequestDraft((s) => s.endDate);
  const returnTime = useRequestDraft((s) => s.returnTime);

  // Equipment and room bookings both come from `loan.list`; a room booking is
  // a reservation like any other, marked `kind: "room"`.
  const requests = useMemo<LoanRow[]>(() => server ?? [], [server]);

  const draft = useMemo<DraftSummary | null>(
    () => summariseDraft(draftLines, catalog ?? [], startDate, pickupTime, endDate, returnTime),
    [draftLines, catalog, startDate, pickupTime, endDate, returnTime],
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
  pickupTime: RequestTime,
  endDate: string | null,
  returnTime: RequestTime,
): DraftSummary | null {
  if (lines.length === 0) return null;

  const names = lines.flatMap((l) => {
    const item = catalog.find((c) => c.id === l.itemId);
    return item ? [item.name] : [];
  });

  return {
    title: `${names.slice(0, 2).join(" · ")}${names.length > 2 ? " ·  . . ." : ""}`,
    lines: lines.length,
    units: lines.reduce((sum, l) => sum + l.qty, 0),
    startDate,
    pickupTime,
    endDate,
    returnTime,
  };
}
