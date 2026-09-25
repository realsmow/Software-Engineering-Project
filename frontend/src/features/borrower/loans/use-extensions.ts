import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAllPages } from "@/lib/paging";
import { queryKeys } from "@/lib/query-client";
import { useTRPCClient } from "@/lib/trpc";
import type { MyRequest } from "../mock-data";
import type { ServerExtension, ServerExtensionOptions } from "./extension.adapter";
import {
  EXTENSION_LOADING,
  NO_EXTENSION,
  extensionStateFromServer,
  type ExtensionState,
} from "./extension-rules";
import { MY_REQUESTS_KEY } from "./use-my-requests-api";

/**
 * Extensions, answered by the server rather than recomputed here.
 *
 * `extensionOptions` is a dry run of `requestExtension`, so the screen can ask
 * "would this work, and who decides" without writing anything. It replaces the
 * copy of the tier quota and credit band rules that used to live in
 * `extension-rules.ts`, where it could drift from the server that enforces them.
 */
const EXT_KEY = ["borrower", "extensions"] as const;

export function useExtensionOptions(usageKey: number | null) {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: [...EXT_KEY, "options", usageKey],
    enabled: usageKey !== null,
    queryFn: (): Promise<ServerExtensionOptions> =>
      trpc.loan.extensionOptions.query({ usageKey: usageKey as number }),
  });
}

/**
 * The borrower's extension requests still waiting on staff or a supervisor.
 *
 * One query for every loan on the page (the key carries no usageKey), so a
 * table of five loans asks once, not five times.
 */
export function usePendingExtensions(enabled = true) {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: [...EXT_KEY, "pending"],
    enabled,
    queryFn: (): Promise<ServerExtension[]> =>
      fetchAllPages((page, pageSize) =>
        trpc.loan.myExtensions.query({ page, pageSize, status: "Pending" }),
      ),
  });
}

/** Everything that has to be refetched once an extension changes hands. */
function useInvalidateExtensions() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: EXT_KEY });
    // `loan.list` carries the due date, which an auto-granted extension has
    // just moved; the grant also files a notification.
    void queryClient.invalidateQueries({ queryKey: MY_REQUESTS_KEY });
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
  };
}

/**
 * Asks for more time on a loan.
 *
 * `requestedDueAt` is sent back exactly as `extensionOptions` reported it.
 * Deriving it here would mean turning a calendar day into an instant, and
 * `new Date("2026-09-20")` is UTC midnight, which is the previous evening in
 * Bangkok - the borrower would be a day short of what they asked for. Letting
 * the server name the instant removes the question.
 */
export function useRequestExtension() {
  const trpc = useTRPCClient();
  const invalidate = useInvalidateExtensions();

  return useMutation({
    mutationFn: ({
      usageKey,
      requestedDueAt,
      reason,
    }: {
      usageKey: number;
      requestedDueAt: string;
      reason?: string;
    }) => trpc.loan.requestExtension.mutate({ usageKey, requestedDueAt, reason }),
    onSuccess: invalidate,
  });
}

/** Withdraws a request nobody has decided yet. */
export function useCancelExtension() {
  const trpc = useTRPCClient();
  const invalidate = useInvalidateExtensions();

  return useMutation({
    mutationFn: ({ extensionKey }: { extensionKey: number }) =>
      trpc.loan.cancelExtension.mutate({ extensionKey }),
    onSuccess: invalidate,
  });
}

export interface LoanExtension {
  state: ExtensionState;
  /** Extensions already granted on this loan, per the server. */
  extensionsUsed: number;
  /** Sends the request `state` describes. Only call while `state.canRequest`. */
  request: () => void;
  /** Withdraws the open request. Only call while `state.isPending`. */
  withdraw: () => void;
  busy: boolean;
  error: unknown;
}

/**
 * The extend control for one loan: the server's answer and the two writes.
 *
 * Only equipment on loan is asked about. A room is booked by the hour, and
 * `maxRequestedDueAt` is a day-based ceiling, so offering it would ask to keep
 * a room for days; a row not yet collected has nothing to extend.
 */
export function useLoanExtension(row: MyRequest): LoanExtension {
  const usageKey =
    row.kind === "equipment" && row.status === "inUse" && row.usageKey != null
      ? row.usageKey
      : null;

  const { data: options } = useExtensionOptions(usageKey);
  const pendingKey = options?.pendingExtensionKey ?? null;
  const { data: pendingRows } = usePendingExtensions(pendingKey !== null);
  const requestExtension = useRequestExtension();
  const cancelExtension = useCancelExtension();

  const pending = pendingRows?.find((e) => e.extensionKey === pendingKey) ?? null;
  const state =
    usageKey === null
      ? NO_EXTENSION
      : options
        ? extensionStateFromServer(options, pending)
        : EXTENSION_LOADING;

  return {
    state,
    // The dry run stops before counting when a request is already open and
    // reports 0 used; the open request itself carries the real count.
    extensionsUsed: pending?.extensionsUsed ?? options?.extensionsUsed ?? 0,
    request: () => {
      if (!options?.canRequest) return;
      cancelExtension.reset();
      requestExtension.mutate({
        usageKey: options.usageKey,
        requestedDueAt: options.maxRequestedDueAt,
      });
    },
    withdraw: () => {
      if (pendingKey === null) return;
      requestExtension.reset();
      cancelExtension.mutate({ extensionKey: pendingKey });
    },
    busy: requestExtension.isPending || cancelExtension.isPending,
    error: requestExtension.error ?? cancelExtension.error,
  };
}
