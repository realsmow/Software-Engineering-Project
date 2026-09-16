/** The list envelope every paginated procedure returns (ว-07). */
export interface Page<T> {
  items: T[];
  total: number;
}

interface FetchAllOptions {
  /** Server caps this at 100; asking for more is rejected with a 400. */
  pageSize?: number;
  /** Ceiling on how much is pulled, so an unbounded table cannot hang the page. */
  maxItems?: number;
}

/**
 * Fetches every page of a paginated procedure.
 *
 * Three pages did this by hand with three slightly different stop conditions,
 * which is three chances to get the last page wrong. It also ran the requests
 * in series, even though the first response reports `total` and therefore how
 * many pages remain: the rest can go at once.
 *
 * Use this only where the UI genuinely needs the whole set - catalogue facet
 * counts, admin filters. Anything that just displays rows should page properly
 * instead, and anything routinely deeper than `maxItems` should filter
 * server-side.
 */
export async function fetchAllPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<Page<T>>,
  { pageSize = 100, maxItems = 1000 }: FetchAllOptions = {},
): Promise<T[]> {
  const first = await fetchPage(1, pageSize);
  if (first.items.length === 0) return [];

  const wanted = Math.min(first.total, maxItems);
  const lastPage = Math.ceil(wanted / pageSize);
  if (lastPage <= 1) return first.items;

  const rest = await Promise.all(
    Array.from({ length: lastPage - 1 }, (_, i) => fetchPage(i + 2, pageSize)),
  );

  return [first, ...rest].flatMap((p) => p.items).slice(0, maxItems);
}
