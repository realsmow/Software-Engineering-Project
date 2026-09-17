import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPCClient } from "@/lib/trpc";
import type { ServerExtensionOptions } from "./extension.adapter";

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

/** Everything that has to be refetched once an extension changes hands. */
function useInvalidateExtensions() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: EXT_KEY });
    // The loan list carries the due date and the pending flag, both of which
    // this just moved.
    void queryClient.invalidateQueries({ queryKey: ["borrower", "requests"] });
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
