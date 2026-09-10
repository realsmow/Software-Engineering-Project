import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPCClient } from "@/lib/trpc";
import type { LendingSettings, UpdateLendingSettingsInput } from "./settings.types";

/**
 * The lending rules table.
 *
 * Not polled, unlike the queues: these change when somebody deliberately
 * changes them, and a background refetch while a form is half filled in would
 * throw away what the user typed.
 */
const LENDING_SETTINGS_KEY = ["admin", "lending-settings"] as const;

export function useLendingSettings() {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: LENDING_SETTINGS_KEY,
    queryFn: async (): Promise<LendingSettings> => trpc.admin.getLendingSettings.query(),
  });
}

/**
 * Saves one borrow rule.
 *
 * Refetches rather than trusting the local edit: the server returns the whole
 * settings object, and a row it normalised differently from what was typed
 * should show up immediately rather than at the next reload.
 */
export function useUpdateLendingSettings() {
  const trpc = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateLendingSettingsInput): Promise<LendingSettings> =>
      trpc.admin.updateLendingSettings.mutate(input),
    onSuccess: (settings) => {
      // The mutation answers with the new table, so this seeds the cache
      // directly and the invalidate below only guards against a racing edit.
      queryClient.setQueryData(LENDING_SETTINGS_KEY, settings);
      void queryClient.invalidateQueries({ queryKey: LENDING_SETTINGS_KEY });
      // The borrow window a borrower sees comes from this table via credit.me.
      void queryClient.invalidateQueries({ queryKey: ["credit", "me"] });
    },
  });
}
