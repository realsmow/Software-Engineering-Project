import { useMutation, useQueryClient } from "@tanstack/react-query";
import { localInstant } from "@/lib/datetime";
import { useTRPCClient } from "@/lib/trpc";
import type { Tier } from "@/types/domain";
import {
  toUnitState,
  type ServerItemUnit,
} from "../catalog/item.adapter";
import type { RequestTime } from "./request-draft.store";

export const MAX_REQUEST_UNITS = 10;

export interface RequestLineForSubmit {
  itemId: string;
  name: string;
  tier: Tier | null;
  qty: number;
  serials: string[];
}

export interface SelectedRequestUnit {
  itemId: string;
  itemName: string;
  resourceKey: number;
  serial: string;
}

interface SubmitRequestInput {
  rows: RequestLineForSubmit[];
  startDate: string;
  pickupTime: RequestTime;
  endDate: string;
  returnTime: RequestTime;
}

export class RequestPreparationError extends Error {
  constructor(
    readonly reason: "TOO_MANY_UNITS" | "INVALID_ITEM_ID" | "UNITS_CHANGED",
    readonly itemName?: string,
  ) {
    super(reason);
    this.name = "RequestPreparationError";
  }
}

/**
 * Resolves the editable basket to physical resources, then opens the real
 * Reservations rows through loan.create.
 *
 * T2 respects the serials the borrower picked. T0/T1 take the first currently
 * lendable units because those tiers are issued from a pool; the backend still
 * rechecks every resource and reports races or future-window clashes per line.
 */
export function useCreateEquipmentRequest() {
  const trpc = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SubmitRequestInput) => {
      const requested = input.rows.reduce((sum, row) => sum + row.qty, 0);
      if (requested > MAX_REQUEST_UNITS) {
        throw new RequestPreparationError("TOO_MANY_UNITS");
      }

      const startTime = requestInstant(input.startDate, input.pickupTime).toISOString();
      const endTime = requestInstant(input.endDate, input.returnTime).toISOString();
      const unitsByItem = await Promise.all(
        input.rows.map(async (row) => {
          const itemKey = Number(row.itemId);
          if (!Number.isInteger(itemKey) || itemKey <= 0) {
            throw new RequestPreparationError("INVALID_ITEM_ID", row.name);
          }
          const units = await trpc.item.listUnits.query({ id: itemKey, startTime, endTime });
          return [row.itemId, units] as const;
        }),
      );

      const byItem = new Map<string, ServerItemUnit[]>(unitsByItem);
      const selectedUnits = input.rows.flatMap((row) => selectUnits(row, byItem.get(row.itemId) ?? []));

      const result = await trpc.loan.create.mutate({
        startTime,
        endTime,
        lines: selectedUnits.map((unit) => ({ resourceKey: unit.resourceKey })),
      });

      return { ...result, selectedUnits };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["loan", "my-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["equipment-types"] });
    },
  });
}

function selectUnits(
  row: RequestLineForSubmit,
  units: ServerItemUnit[],
): SelectedRequestUnit[] {
  const free = units.filter((unit) => toUnitState(unit) === "free");
  let selected: ServerItemUnit[];

  if (row.tier === "T2") {
    const bySerial = new Map(free.map((unit) => [unit.assetTag, unit]));
    selected = row.serials.slice(0, row.qty).flatMap((serial) => {
      const unit = bySerial.get(serial);
      return unit ? [unit] : [];
    });
  } else {
    selected = free.slice(0, row.qty);
  }

  if (selected.length !== row.qty) {
    throw new RequestPreparationError("UNITS_CHANGED", row.name);
  }

  return selected.map((unit) => ({
    itemId: row.itemId,
    itemName: row.name,
    resourceKey: unit.resourceKey,
    serial: unit.assetTag,
  }));
}

export function requestInstant(day: string, time: RequestTime): Date {
  const [hour, minute] = time.split(":").map(Number);
  return localInstant(day, hour, minute);
}
