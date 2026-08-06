import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-client";
import type { Loan, LoanStatus } from "@/types/domain";

/**
 * useMyLoans — the current borrower's loans, optionally filtered by status.
 *
 * No API is wired yet (brief note #5): the queryFn returns typed mock data.
 * When the backend lands, swap the queryFn for an apiClient call to
 * GET /loans?me=1 (keys already live in query-client).
 */
const MOCK_MY_LOANS: Loan[] = [
  {
    id: "loan-1001",
    requestItemId: "ri-2001",
    unitId: "unit-osc-03",
    borrowerId: "u-borrower",
    pickedUpAt: "2026-08-01T10:15:00+07:00",
    dueAt: "2026-08-15T17:00:00+07:00",
    status: "borrowed",
    onlineRenewLeft: 1,
  },
  {
    id: "loan-1002",
    requestItemId: "ri-2002",
    unitId: "unit-mm-11",
    borrowerId: "u-borrower",
    pickedUpAt: "2026-07-20T09:00:00+07:00",
    dueAt: "2026-08-03T17:00:00+07:00",
    status: "overdue",
    onlineRenewLeft: 0,
  },
  {
    id: "loan-0998",
    requestItemId: "ri-1990",
    unitId: "unit-sd-02",
    borrowerId: "u-borrower",
    pickedUpAt: "2026-07-01T13:30:00+07:00",
    dueAt: "2026-07-10T17:00:00+07:00",
    returnedAt: "2026-07-09T15:20:00+07:00",
    status: "returned",
    onlineRenewLeft: 0,
  },
];

export function useMyLoans(status?: LoanStatus) {
  return useQuery({
    queryKey: queryKeys.myLoans(status),
    queryFn: async (): Promise<Loan[]> =>
      status ? MOCK_MY_LOANS.filter((loan) => loan.status === status) : MOCK_MY_LOANS,
  });
}
