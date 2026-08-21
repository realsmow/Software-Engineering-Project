import { useMemo } from "react";
import {
  CATALOG_ITEMS,
  MY_REQUESTS,
  STATUS_TAB,
  type MyRequest,
  type RequestTab,
} from "../mock-data";
import { useRequestDraft, type DraftLine } from "../request/request-draft.store";
import { useSubmittedRequests } from "./submitted-requests.store";

/**
 * The saved draft, shown alongside real requests so an unfinished basket is
 * not invisible. It is not a request yet — hence its own shape rather than a
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
 * useMyRequests — everything the "คำขอของฉัน" page lists, in one place:
 * seeded history, requests submitted this session, and the open draft.
 *
 * Not a TanStack query: two of the three sources are client stores, so there
 * is nothing to fetch or cache yet. When GET /loan-requests lands, the mock
 * array becomes the query and this hook keeps merging the local draft on top.
 */
export function useMyRequests() {
  const submitted = useSubmittedRequests((s) => s.requests);
  const draftLines = useRequestDraft((s) => s.lines);
  const startDate = useRequestDraft((s) => s.startDate);
  const endDate = useRequestDraft((s) => s.endDate);

  const requests = useMemo<MyRequest[]>(
    // Session submissions first — they are the most recent thing that happened.
    () => [...submitted, ...MY_REQUESTS],
    [submitted],
  );

  const draft = useMemo<DraftSummary | null>(
    () => summariseDraft(draftLines, startDate, endDate),
    [draftLines, startDate, endDate],
  );

  const countByTab = useMemo(() => {
    const counts: Record<RequestTab, number> = { active: 0, using: 0, history: 0 };
    for (const r of requests) counts[STATUS_TAB[r.status]] += 1;
    // The draft sits with the in-progress work.
    if (draft) counts.active += 1;
    return counts;
  }, [requests, draft]);

  return { requests, draft, countByTab };
}

export function requestsInTab(requests: MyRequest[], tab: RequestTab): MyRequest[] {
  return requests.filter((r) => STATUS_TAB[r.status] === tab);
}

function summariseDraft(
  lines: DraftLine[],
  startDate: string,
  endDate: string | null,
): DraftSummary | null {
  if (lines.length === 0) return null;

  const names = lines.flatMap((l) => {
    const item = CATALOG_ITEMS.find((c) => c.id === l.itemId);
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
