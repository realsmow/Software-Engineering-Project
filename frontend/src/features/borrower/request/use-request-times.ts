import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTRPCClient } from "@/lib/trpc";
import { useRequestDraft } from "./request-draft.store";

type WorkHours = { start: number; end: number };

/** The server's own default, used until it answers. */
const DEFAULT_HOURS: WorkHours = { start: 8, end: 17 };

const hhmm = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
const hourOf = (time: string) => Number(time.slice(0, 2)) + Number(time.slice(3, 5)) / 60;

/** FR-ADM-04: the counter's hours, readable by every signed-in role (#224). */
export function useWorkHours() {
  const trpc = useTRPCClient();
  return useQuery({
    queryKey: ["admin", "workHours"],
    queryFn: async (): Promise<WorkHours> => trpc.admin.workHours.query(),
    staleTime: 5 * 60_000,
  });
}

/** Opening, 13:00 when the counter is open then, an hour before closing, and closing. */
export function requestTimes(hours: WorkHours): string[] {
  return [...new Set([hours.start, 13, hours.end - 1, hours.end])]
    .filter((hour) => hour >= hours.start && hour <= hours.end)
    .sort((a, b) => a - b)
    .map(hhmm);
}

/**
 * #224: pickup and return times offered from the admin's work hours, so the
 * screen never offers a time the server refuses with OUTSIDE_WORK_HOURS. A
 * saved draft time the new hours no longer allow moves to opening or closing.
 */
export function useRequestTimes(): string[] {
  const { data } = useWorkHours();
  const hours = data ?? DEFAULT_HOURS;
  const times = requestTimes(hours);
  const pickupTime = useRequestDraft((s) => s.pickupTime);
  const returnTime = useRequestDraft((s) => s.returnTime);
  const setPickupTime = useRequestDraft((s) => s.setPickupTime);
  const setReturnTime = useRequestDraft((s) => s.setReturnTime);

  useEffect(() => {
    if (!data) return;
    // A T0 "now" pickup is any minute inside the day (#189), so only one
    // outside the hours is moved.
    const pickup = hourOf(pickupTime);
    if (pickup < data.start || pickup > data.end) setPickupTime(hhmm(data.start));
    // Return has no "now", so it is always one of the offered times.
    if (!requestTimes(data).includes(returnTime)) setReturnTime(hhmm(data.end));
  }, [data, pickupTime, returnTime, setPickupTime, setReturnTime]);

  return times;
}
