import { localInstant } from "@/lib/datetime";
import type { RequestTime } from "../request/request-draft.store";

/** The exact instants the borrower is shopping for. */
export interface EquipmentAvailabilityWindow {
  startTime: string;
  endTime: string;
}

/** Converts the shared draft period into the API shape used by availability. */
export function toAvailabilityWindow(
  startDate: string,
  pickupTime: RequestTime,
  endDate: string | null,
  returnTime: RequestTime,
): EquipmentAvailabilityWindow | undefined {
  if (!startDate || !endDate) return undefined;
  const start = catalogInstant(startDate, pickupTime);
  const end = catalogInstant(endDate, returnTime);
  if (end <= start) return undefined;
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

function catalogInstant(day: string, time: RequestTime): Date {
  const [hour, minute] = time.split(":").map(Number);
  return localInstant(day, hour, minute);
}
