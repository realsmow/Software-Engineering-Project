import { create } from "zustand";
import { addDays, format } from "date-fns";
import { CATALOG_ITEMS } from "../mock-data";

/**
 * The borrower's in-progress loan request ("cart").
 *
 * Global because two pages write to it: the catalog adds lines, the request
 * page edits quantities, serials, and dates. Zustand rather than context so
 * adding a line from a table row doesn't re-render the whole catalog.
 *
 * NOTE: memory only — a refresh clears the draft. Persisting is the backend's
 * job (POST /loan-requests as status "draft"); revisit when that lands.
 */
export interface DraftLine {
  /** CatalogItem id. */
  itemId: string;
  qty: number;
  /** Chosen unit serials. T2 only; may be shorter than `qty` while picking. */
  serials: string[];
}

interface RequestDraftState {
  lines: DraftLine[];
  /** Pickup date, ISO yyyy-MM-dd. Defaults to today. */
  startDate: string;
  /** Return date, ISO yyyy-MM-dd. Null until the borrower picks one. */
  endDate: string | null;

  addItem: (itemId: string) => void;
  setQty: (itemId: string, qty: number) => void;
  removeItem: (itemId: string) => void;
  /** Check/uncheck one serial on a line. */
  toggleSerial: (itemId: string, serial: string) => void;
  setStartDate: (iso: string) => void;
  setEndDate: (iso: string | null) => void;
  clear: () => void;
}

/**
 * One entry per physical unit. The draft groups by equipment type so the cart
 * stays editable, but on submission each unit becomes its own request with its
 * own number, approved and handed over and returned on its own — which is also
 * why T2 units carry their own serial.
 */
export interface RequestUnit {
  itemId: string;
  /** 1-based position within its line. */
  index: number;
  /** Serial reserved for this unit (T2 only; undefined until picked). */
  serial?: string;
}

export function expandToUnits(lines: DraftLine[]): RequestUnit[] {
  return lines.flatMap((l) =>
    Array.from({ length: l.qty }, (_, i) => ({
      itemId: l.itemId,
      index: i + 1,
      serial: l.serials[i],
    })),
  );
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
 * Units on the shelf for an item. Reads mock data today; swap for the fetched
 * availability once the API lands. Unknown ids cap at 0 so a bad id cannot
 * silently create an unbounded line.
 */
function stockOf(itemId: string): number {
  return CATALOG_ITEMS.find((i) => i.id === itemId)?.availableUnits ?? 0;
}

export function todayIso(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function isoOffset(days: number): string {
  return format(addDays(new Date(), days), "yyyy-MM-dd");
}

export const useRequestDraft = create<RequestDraftState>((set) => ({
  lines: [],
  startDate: todayIso(),
  endDate: null,

  addItem: (itemId) =>
    set((s) => {
      const stock = stockOf(itemId);
      // Nothing on the shelf: adding it would only fail the pre-submit check.
      if (stock === 0) return s;

      const existing = s.lines.find((l) => l.itemId === itemId);
      if (!existing) return { lines: [...s.lines, { itemId, qty: 1, serials: [] }] };
      if (existing.qty >= stock) return s;
      return {
        lines: s.lines.map((l) => (l.itemId === itemId ? { ...l, qty: l.qty + 1 } : l)),
      };
    }),

  setQty: (itemId, qty) =>
    set((s) => ({
      lines: s.lines.map((l) => {
        if (l.itemId !== itemId) return l;
        // Never below one unit, never past what is on the shelf.
        const next = Math.min(Math.max(1, qty), Math.max(1, stockOf(itemId)));
        // Dropping the quantity must drop any serials that no longer fit.
        return { ...l, qty: next, serials: l.serials.slice(0, next) };
      }),
    })),

  removeItem: (itemId) => set((s) => ({ lines: s.lines.filter((l) => l.itemId !== itemId) })),

  toggleSerial: (itemId, serial) =>
    set((s) => ({
      lines: s.lines.map((l) => {
        if (l.itemId !== itemId) return l;
        if (l.serials.includes(serial)) {
          return { ...l, serials: l.serials.filter((sn) => sn !== serial) };
        }
        // One serial per unit requested — ignore the click once the line is full.
        if (l.serials.length >= l.qty) return l;
        return { ...l, serials: [...l.serials, serial] };
      }),
    })),

  setStartDate: (iso) => set({ startDate: iso }),
  setEndDate: (iso) => set({ endDate: iso }),

  clear: () => set({ lines: [], startDate: todayIso(), endDate: null }),
}));
