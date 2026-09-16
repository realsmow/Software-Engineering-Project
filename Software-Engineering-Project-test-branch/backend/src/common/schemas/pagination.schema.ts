import { z } from 'zod';

/**
 * Page-based pagination, shared by every `list` procedure (ว-07).
 *
 * Page numbers, not cursors: the frontend's tables show "หน้า 3 จาก 12" and let
 * the user jump around, which a cursor cannot express. The cost is that a row
 * inserted while the user pages can shift results - acceptable for admin
 * tables, and the reason the borrower-facing realtime lists poll instead.
 */
export const paginationInput = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  /** Free-text search. What it searches is per-procedure and documented there. */
  q: z.string().trim().min(1).optional(),
  /** Sort field name from the procedure's own whitelist - never a raw column. */
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('asc'),
});

export type PaginationInput = z.infer<typeof paginationInput>;

/** Wraps an item schema in the standard list envelope (ว-07). */
export function paginated<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().min(0),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
  });
}

/** Prisma's skip/take for a given page. */
export function toSkipTake(input: Pick<PaginationInput, 'page' | 'pageSize'>) {
  return {
    skip: (input.page - 1) * input.pageSize,
    take: input.pageSize,
  };
}

/**
 * Resolves `sort` against a whitelist of Prisma column names.
 *
 * The whitelist is the whole point: `sort` arrives from the client, and
 * handing an arbitrary string to Prisma's orderBy turns a query parameter into
 * a way to probe the schema. Unknown values fall back to the default rather
 * than erroring, so a stale bookmark still loads.
 */
export function toOrderBy<TField extends string>(
  input: Pick<PaginationInput, 'sort' | 'order'>,
  allowed: Record<string, TField>,
  fallback: TField,
): Record<TField, 'asc' | 'desc'> {
  const column = (input.sort && allowed[input.sort]) || fallback;
  return { [column]: input.order } as Record<TField, 'asc' | 'desc'>;
}

/** Builds the list envelope, echoing back the page the caller actually got. */
export function toPage<T>(
  items: T[],
  total: number,
  input: Pick<PaginationInput, 'page' | 'pageSize'>,
) {
  return { items, total, page: input.page, pageSize: input.pageSize };
}
