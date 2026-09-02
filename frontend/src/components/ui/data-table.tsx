import { useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Cell renderer. */
  render: (row: T) => ReactNode;
  /** Alignment helper. */
  align?: "left" | "right" | "center";
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  /** Optional title bar rendered inside the table frame. */
  title?: ReactNode;
  /** Optional actions rendered on the right of the title bar. */
  headerActions?: ReactNode;
  /**
   * Optional strip rendered inside the frame, between the title bar and the
   * table head (filter chips, legends, inline notices).
   */
  beforeRows?: ReactNode;
  /** Localized empty-state strings. */
  emptyTitle?: string;
  emptyDescription?: string;
  /** Localized "showing X–Y of Z" builder. */
  rangeLabel?: (start: number, end: number, total: number) => string;
}

function alignClass(align?: "left" | "right" | "center") {
  if (align === "right") return "text-right tabular-nums";
  if (align === "center") return "text-center";
  return undefined;
}

const pagerBtn =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-border bg-card px-2 text-sm text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Generic paginated table. Pagination is internal (client-side) - swap for
 * cursor-based server pagination when the API lands. Renders an empty state
 * when `rows` is empty and hides the footer when everything fits on one page.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  pageSize = 10,
  title,
  headerActions,
  beforeRows,
  emptyTitle = "No data",
  emptyDescription,
  rangeLabel = (s, e, t) => `${s}–${e} of ${t}`,
}: DataTableProps<T>) {
  const [page, setPage] = useState(1);
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);

  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, safePage, pageSize]);

  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);

  const pageNumbers = useMemo(() => {
    const nums: number[] = [];
    const from = Math.max(1, safePage - 1);
    const to = Math.min(pageCount, from + 2);
    for (let i = from; i <= to; i++) nums.push(i);
    return nums;
  }, [safePage, pageCount]);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {title ? (
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {headerActions ? <div className="flex items-center gap-2">{headerActions}</div> : null}
        </div>
      ) : null}

      {beforeRows}

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((c) => (
              <TableHead key={c.key} className={cn(alignClass(c.align), c.className)}>
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageRows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length}>
                <div className="flex flex-col items-center gap-1 py-10 text-center">
                  <div className="text-sm font-medium text-foreground">{emptyTitle}</div>
                  {emptyDescription ? (
                    <div className="text-xs text-muted-foreground">{emptyDescription}</div>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          ) : (
            pageRows.map((row) => (
              <TableRow
                key={rowKey(row)}
                className={onRowClick ? "cursor-pointer" : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c) => (
                  <TableCell key={c.key} className={cn(alignClass(c.align), c.className)}>
                    {c.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {total > pageSize ? (
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
          <span className="text-xs text-muted-foreground">{rangeLabel(start, end, total)}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={pagerBtn}
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft size={15} strokeWidth={2} />
            </button>
            {pageNumbers[0] > 1 ? <span className="px-1 text-xs text-muted-foreground">…</span> : null}
            {pageNumbers.map((n) => (
              <button
                key={n}
                type="button"
                className={cn(pagerBtn, n === safePage && "border-primary bg-primary text-primary-foreground hover:bg-primary")}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            ))}
            {pageNumbers[pageNumbers.length - 1] < pageCount ? (
              <span className="px-1 text-xs text-muted-foreground">…</span>
            ) : null}
            <button
              type="button"
              className={pagerBtn}
              disabled={safePage >= pageCount}
              onClick={() => setPage(safePage + 1)}
              aria-label="Next page"
            >
              <ChevronRight size={15} strokeWidth={2} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default DataTable;
