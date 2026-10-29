/** Rows collected at one counter (#239, team decision D-08). */
export interface PickupStop<T> {
  /** The department or club that hands them out; null when it has no name. */
  place: string | null;
  rows: T[];
}

/**
 * #239: one cart may hold items of several departments, each collected at its
 * own counter. Groups rows by that counter, in the order they first appear, so
 * a page can say how many places to go and what to collect at each.
 */
export function byPickupPlace<T>(
  rows: readonly T[],
  placeOf: (row: T) => string | null | undefined,
): PickupStop<T>[] {
  const stops = new Map<string, PickupStop<T>>();
  for (const row of rows) {
    const place = placeOf(row) ?? null;
    const stop = stops.get(place ?? "") ?? { place, rows: [] };
    stop.rows.push(row);
    stops.set(place ?? "", stop);
  }
  return [...stops.values()];
}
