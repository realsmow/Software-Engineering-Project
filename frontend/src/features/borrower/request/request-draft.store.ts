import { create } from "zustand";
import { toLocalDayKey, todayLocalDayKey } from "@/lib/datetime";

/**
 * The borrower's in-progress loan request ("cart").
 *
 * Global because two pages write to it: the catalog adds lines, the request
 * page edits quantities, serials, and dates. Zustand rather than context so
 * adding a line from a table row doesn't re-render the whole catalog.
 *
 * NOTE: memory only - a refresh clears the draft. Persisting is the backend's
 * job (POST /loan-requests as status "draft"); revisit when that lands.
 */
export interface DraftLine {
  /** CatalogItem id. */
  itemId: string;
  qty: number;
  /** Chosen unit serials. T2 only; may be shorter than `qty` while picking. */
  serials: string[];
}

export const REQUEST_TIMES = ["08:00", "13:00", "16:00"] as const;
export type RequestTime = (typeof REQUEST_TIMES)[number];

interface RequestDraftState {
  lines: DraftLine[];
  /** Pickup date, ISO yyyy-MM-dd. Defaults to today. */
  startDate: string;
  /** Time at which the borrower plans to collect the equipment. */
  pickupTime: RequestTime;
  /** Return date, ISO yyyy-MM-dd. Null until the borrower picks one. */
  endDate: string | null;
  /** Time at which the borrower plans to return the equipment. */
  returnTime: RequestTime;

  /**
   * `stock` comes from the caller because the catalogue is a server query now:
   * the store cannot look availability up without holding a second copy of it.
   * The cap is still enforced here so a stale button cannot overfill a line.
   */
  addItem: (itemId: string, stock: number) => void;
  setQty: (itemId: string, qty: number, stock: number) => void;
  removeItem: (itemId: string) => void;
  /** Replaces the basket after a partially accepted backend submission. */
  replaceLines: (lines: DraftLine[]) => void;
  /** Check/uncheck one serial on a line. */
  toggleSerial: (itemId: string, serial: string) => void;
  setStartDate: (iso: string) => void;
  setPickupTime: (time: RequestTime) => void;
  setEndDate: (iso: string | null) => void;
  setReturnTime: (time: RequestTime) => void;
  clear: () => void;
}

/**
 * How many more units of this item the draft can still take.
 * Callers use it to disable "add" once the shelf is empty; the store enforces
 * the same cap so a stale button can never push a line past stock.
 */
export function remainingUnits(
  lines: DraftLine[],
  item: { id: string; availableUnits: number },
): number {
  const qty = lines.find((l) => l.itemId === item.id)?.qty ?? 0;
  return Math.max(0, item.availableUnits - qty);
}

/**
 * Today, and today plus N, as the counter reckons them.
 *
 * `format(new Date(), "yyyy-MM-dd")` answers in the *browser's* timezone. A
 * borrower on a laptop still set to somewhere west of Bangkok would be offered
 * yesterday as the earliest pickup date, and the server would reject it.
 */
export function todayIso(): string {
  return todayLocalDayKey();
}

export function isoOffset(days: number): string {
  return toLocalDayKey(new Date(Date.now() + days * 86_400_000));
}

export const useRequestDraft = create<RequestDraftState>((set) => ({
  lines: [],
  startDate: todayIso(),
  pickupTime: "08:00",
  endDate: todayIso(),
  returnTime: "16:00",

  addItem: (itemId, stock) =>
    set((s) => {
      // Nothing on the shelf: adding it would only fail the pre-submit check.
      if (stock === 0) return s;

      const existing = s.lines.find((l) => l.itemId === itemId);
      if (!existing) return { lines: [...s.lines, { itemId, qty: 1, serials: [] }] };
      if (existing.qty >= stock) return s;
      return {
        lines: s.lines.map((l) => (l.itemId === itemId ? { ...l, qty: l.qty + 1 } : l)),
      };
    }),

  setQty: (itemId, qty, stock) =>
    set((s) => ({
      lines: s.lines.map((l) => {
        if (l.itemId !== itemId) return l;
        // Never below one unit, never past what is on the shelf.
        const next = Math.min(Math.max(1, qty), Math.max(1, stock));
        // Dropping the quantity must drop any serials that no longer fit.
        return { ...l, qty: next, serials: l.serials.slice(0, next) };
      }),
    })),

  removeItem: (itemId) => set((s) => ({ lines: s.lines.filter((l) => l.itemId !== itemId) })),
  replaceLines: (lines) => set({ lines }),

  toggleSerial: (itemId, serial) =>
    set((s) => ({
      lines: s.lines.map((l) => {
        if (l.itemId !== itemId) return l;
        if (l.serials.includes(serial)) {
          return { ...l, serials: l.serials.filter((sn) => sn !== serial) };
        }
        // One serial per unit requested - ignore the click once the line is full.
        if (l.serials.length >= l.qty) return l;
        return { ...l, serials: [...l.serials, serial] };
      }),
    })),

  setStartDate: (iso) => set({ startDate: iso }),
  setPickupTime: (time) => set({ pickupTime: time }),
  setEndDate: (iso) => set({ endDate: iso }),
  setReturnTime: (time) => set({ returnTime: time }),

  clear: () => set({
    lines: [],
    startDate: todayIso(),
    pickupTime: "08:00",
    endDate: todayIso(),
    returnTime: "16:00",
  }),
}));
