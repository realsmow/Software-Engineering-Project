import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ShoppingCart, SlidersHorizontal, X } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { TierBadge, TierDot, TIERS, tierNoteKey } from "@/components/shared/tier-badge";
import { ImageThumb } from "@/components/shared/image-thumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ROUTES } from "@/constants";
import { cn } from "@/lib/utils";
import { STOCK_STATUSES, type CatalogItem } from "../mock-data";
import { fmtDateTime } from "../format";
import { FacetFilters, type FilterGroup } from "../facet-filters";
import { remainingUnits, useRequestDraft } from "../request/request-draft.store";
import { AddButton } from "./add-button";
import { useEquipmentTypes } from "./use-equipment-types";

/** Facet groups, in rail order. Keys namespace the option keys ("owner:12"). */
const GROUP_KEYS = ["owner", "tier", "st"] as const;
type GroupKey = (typeof GROUP_KEYS)[number];

type SortKey = "avail" | "name" | "popular";

/** Page size matches the reference mockup (CAT_PAGE = 8). */
const PAGE_SIZE = 8;

/**
 * Equipment catalog - the borrower's entry point for browsing what the faculty
 * lends. Layout follows the reference mockup: a filter rail beside a single
 * card that stacks toolbar → active chips → tier legend → table.
 *
 * Filtering/sorting/paging are all client-side over mock data (see
 * `useEquipmentTypes`); when the API lands, `query`/`sort`/`selected` become
 * request params and this component keeps its shape.
 */
export default function CatalogPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: items = [], isLoading } = useEquipmentTypes();

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("avail");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Draft lines live in the shared store so the request page picks them up.
  const draftLines = useRequestDraft((s) => s.lines);
  const addItem = useRequestDraft((s) => s.addItem);
  const setQty = useRequestDraft((s) => s.setQty);
  const removeItem = useRequestDraft((s) => s.removeItem);

  function decreaseItem(item: CatalogItem) {
    const qty = useRequestDraft.getState().lines.find((line) => line.itemId === item.id)?.qty ?? 0;
    if (qty <= 1) removeItem(item.id);
    else setQty(item.id, qty - 1, item.availableUnits);
  }

  const groups = useMemo<FilterGroup[]>(() => {
    const countBy = (group: GroupKey, id: string) =>
      items.filter((it) => facetOf(it, group) === id).length;

    const owners = new Map<string, NonNullable<CatalogItem["owner"]>>();
    let hasUnowned = false;
    for (const item of items) {
      if (item.owner) owners.set(item.owner.id, item.owner);
      else hasUnowned = true;
    }
    const ownerOptions = [...owners.values()]
      .sort((a, b) => (a.name ?? a.type).localeCompare(b.name ?? b.type, "th"))
      .map((owner) => {
        const name = owner.name ?? t(`borrower.catalog.owner${owner.type}`);
        return {
          key: `owner:${owner.id}`,
          label: name,
          chipLabel: `${t("borrower.catalog.fDept")}: ${name}`,
          count: countBy("owner", owner.id),
        };
      });
    if (hasUnowned) {
      ownerOptions.push({
        key: "owner:unowned",
        label: t("borrower.catalog.ownerUnknown"),
        chipLabel: `${t("borrower.catalog.fDept")}: ${t("borrower.catalog.ownerUnknown")}`,
        count: countBy("owner", "unowned"),
      });
    }

    return [
      {
        key: "owner",
        label: t("borrower.catalog.fDept"),
        options: ownerOptions,
      },
      {
        key: "tier",
        label: t("borrower.catalog.fTier"),
        options: TIERS.map((tier) => ({
          key: `tier:${tier}`,
          label: `${tier} · ${t(tierNoteKey(tier))}`,
          chipLabel: `Tier: ${tier}`,
          count: countBy("tier", tier),
        })),
      },
      {
        key: "st",
        label: t("borrower.catalog.fStatus"),
        options: STOCK_STATUSES.map((st) => ({
          key: `st:${st}`,
          label: t(`borrower.catalog.st${cap(st)}`),
          count: countBy("st", st),
        })),
      },
    ];
  }, [items, t]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Selections are OR-ed inside a group and AND-ed across groups.
    const picked = GROUP_KEYS.map((g) => ({
      group: g,
      keys: [...selected].filter((k) => k.startsWith(`${g}:`)),
    })).filter((p) => p.keys.length > 0);

    const list = items.filter((it) => {
      if (q && !`${it.name} ${it.code}`.toLowerCase().includes(q)) return false;
      return picked.every((p) => p.keys.includes(`${p.group}:${facetOf(it, p.group)}`));
    });

    return [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "th");
      if (sort === "popular") return b.totalUnits - a.totalUnits;
      // "avail": in-stock first, then by how many units are free.
      return (
        Number(b.availableUnits > 0) - Number(a.availableUnits > 0) ||
        b.availableUnits - a.availableUnits
      );
    });
  }, [items, query, selected, sort]);

  const chips = useMemo(
    () =>
      groups
        .flatMap((g) => g.options)
        .filter((o) => selected.has(o.key))
        .map((o) => ({ key: o.key, label: o.chipLabel ?? o.label })),
    [groups, selected],
  );

  const draftTotal = draftLines.reduce((sum, l) => sum + l.qty, 0);
  const qtyOf = (id: string) => draftLines.find((l) => l.itemId === id)?.qty ?? 0;
  // Out of stock, or the draft already holds every free unit.
  const atCap = (item: CatalogItem) => remainingUnits(draftLines, item) === 0;

  function toggleFilter(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  function clearFilters() {
    setSelected(new Set());
    setQuery("");
  }

  function openDetail(item: CatalogItem) {
    navigate(ROUTES.EQUIPMENT_DETAIL.replace(":id", item.id));
  }

  const columns: Column<CatalogItem>[] = [
    {
      key: "item",
      header: t("borrower.catalog.colItem"),
      render: (e) => (
        <div className="flex items-center gap-3">
          <ImageThumb src={e.imageUrl} size={44} />
          <div className="min-w-0">
            <div className="font-medium text-foreground">{e.name}</div>
            <div className="mt-0.5 font-mono text-[11px] text-t4">{e.code}</div>
          </div>
        </div>
      ),
    },
    {
      key: "dept",
      header: t("borrower.catalog.colDept"),
      className: "whitespace-nowrap",
      render: (e) => (
        <span className="text-t2">
          {e.owner?.name ??
            (e.owner
              ? t(`borrower.catalog.owner${e.owner.type}`)
              : t("borrower.catalog.ownerUnknown"))}
        </span>
      ),
    },
    {
      key: "tier",
      header: t("borrower.catalog.colTier"),
      render: (e) => <TierBadge tier={e.tier} note />,
    },
    {
      key: "avail",
      header: t("borrower.catalog.colAvail"),
      align: "right",
      render: (e) => <AvailCount item={e} />,
    },
    {
      key: "next",
      header: t("borrower.catalog.colNext"),
      className: "whitespace-nowrap",
      render: (e) => (
        <span className="font-mono text-xs text-t3">{fmtDateTime(e.nextAvailableAt)}</span>
      ),
    },
    {
      key: "add",
      header: "",
      align: "right",
      render: (e) => (
        // Button carries `disabled:pointer-events-none`, so once it is capped
        // the click lands on the row behind it and opens the detail page. The
        // wrapper still takes pointer events, so it swallows the click - and
        // it is where the tooltip has to live for the same reason.
        <span
          className="inline-flex"
          title={atCap(e) ? t("borrower.catalog.addCapped") : undefined}
          onClick={(ev) => ev.stopPropagation()}
        >
          <AddButton
            qty={qtyOf(e.id)}
            capped={atCap(e)}
            size="sm"
            onDecrease={() => decreaseItem(e)}
            onAdd={(ev) => {
              ev.stopPropagation();
              addItem(e.id, e.availableUnits);
            }}
          />
        </span>
      ),
    },
  ];

  /** Toolbar → chips → legend, stacked inside the table card (desktop). */
  const strips = (
    <>
      <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-2.5">
        <Input
          type="search"
          className="min-w-0 flex-1"
          placeholder={t("borrower.catalog.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t("borrower.catalog.searchPlaceholder")}
        />
        <Button
          type="button"
          variant="outline"
          className="lg:hidden"
          onClick={() => setFiltersOpen(true)}
        >
          <SlidersHorizontal size={15} strokeWidth={2} />
          {t("borrower.filters.button")}
          {selected.size > 0 ? ` (${selected.size})` : ""}
        </Button>
        <SortSelect value={sort} onChange={setSort} />
      </div>
      <ChipsStrip chips={chips} shown={rows.length} total={items.length} onRemove={toggleFilter} />
      <LegendStrip />
    </>
  );

  const showEmpty = !isLoading && rows.length === 0;

  return (
    <div>
      <PageHeader
        title={t("nav.catalog")}
        subtitle={t("borrower.catalog.subtitle")}
        actions={
          draftTotal > 0 ? (
            <DraftPill count={draftTotal} onOpen={() => navigate(ROUTES.REQUEST)} />
          ) : undefined
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-[224px_minmax(0,1fr)]">
        <aside className="hidden overflow-hidden rounded-lg border border-border bg-card shadow-sm lg:block">
          <FacetFilters
            groups={groups}
            selected={selected}
            onToggle={toggleFilter}
            onClear={clearFilters}
          />
        </aside>

        <div className="min-w-0">
          {/* Desktop / tablet: one card, table rows. */}
          <div className="hidden md:block">
            {showEmpty ? (
              <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                {strips}
                <EmptyState onClear={clearFilters} />
              </div>
            ) : (
              <DataTable
                // Remount on any change to the result set so pagination starts
                // over - DataTable owns its page state and has no reset prop.
                key={`${query}|${sort}|${[...selected].sort().join(",")}`}
                columns={columns}
                rows={rows}
                rowKey={(e) => e.id}
                onRowClick={openDetail}
                pageSize={PAGE_SIZE}
                beforeRows={strips}
                emptyTitle={t("common.loading")}
                rangeLabel={(s, e, total) => t("table.range", { start: s, end: e, total })}
              />
            )}
          </div>

          {/* Phone: search + chips above a card list. */}
          <div className="space-y-3 md:hidden">
            <Input
              type="search"
              placeholder={t("borrower.catalog.searchPlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t("borrower.catalog.searchPlaceholder")}
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setFiltersOpen(true)}
              >
                <SlidersHorizontal size={15} strokeWidth={2} />
                {t("borrower.filters.button")}
                {selected.size > 0 ? ` (${selected.size})` : ""}
              </Button>
              <SortSelect value={sort} onChange={setSort} className="flex-1" />
            </div>

            {chips.length > 0 ? (
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {chips.map((c) => (
                  <Chip key={c.key} label={c.label} rounded onRemove={() => toggleFilter(c.key)} />
                ))}
              </div>
            ) : null}

            <div className="text-xs tabular-nums text-t3">
              {t("borrower.catalog.showing", { shown: rows.length, total: items.length })}
            </div>

            {showEmpty ? (
              <div className="rounded-lg border border-border bg-card shadow-sm">
                <EmptyState onClear={clearFilters} />
              </div>
            ) : (
              rows.map((e) => (
                <ItemCard
                  key={e.id}
                  item={e}
                  qty={qtyOf(e.id)}
                  capped={atCap(e)}
                  onOpen={() => openDetail(e)}
                  onAdd={() => addItem(e.id, e.availableUnits)}
                  onDecrease={() => decreaseItem(e)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="left" className="flex flex-col gap-0 p-0" aria-describedby={undefined}>
          <SheetHeader className="border-b border-border px-4 py-3.5">
            <SheetTitle>{t("borrower.filters.title")}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            <FacetFilters
              groups={groups}
              selected={selected}
              onToggle={toggleFilter}
              onClear={clearFilters}
              showHeader={false}
            />
          </div>
          <div className="flex items-center gap-2 border-t border-border bg-secondary px-4 py-3">
            <Button type="button" variant="outline" className="flex-1" onClick={clearFilters}>
              {t("borrower.filters.clear")}
            </Button>
            <Button type="button" className="flex-1" onClick={() => setFiltersOpen(false)}>
              {t("borrower.catalog.showing", { shown: rows.length, total: items.length })}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SortSelect({
  value,
  onChange,
  className,
}: {
  value: SortKey;
  onChange: (next: SortKey) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={(v) => onChange(v as SortKey)}>
      <SelectTrigger className={cn("w-44 shrink-0", className)} aria-label={t("borrower.catalog.sortLabel")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="avail">{t("borrower.catalog.sortAvail")}</SelectItem>
        <SelectItem value="name">{t("borrower.catalog.sortName")}</SelectItem>
        <SelectItem value="popular">{t("borrower.catalog.sortPopular")}</SelectItem>
      </SelectContent>
    </Select>
  );
}

function ChipsStrip({
  chips,
  shown,
  total,
  onRemove,
}: {
  chips: { key: string; label: string }[];
  shown: number;
  total: number;
  onRemove: (key: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-secondary px-3.5 py-2">
      {chips.length > 0 ? (
        <>
          <span className="mr-1 text-xs text-t3">{t("borrower.filters.active")}</span>
          {chips.map((c) => (
            <Chip key={c.key} label={c.label} onRemove={() => onRemove(c.key)} />
          ))}
        </>
      ) : null}
      <span className="ml-auto whitespace-nowrap text-xs tabular-nums text-t3">
        {t("borrower.catalog.showing", { shown, total })}
      </span>
    </div>
  );
}

function Chip({
  label,
  rounded = false,
  onRemove,
}: {
  label: string;
  rounded?: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border border-border bg-card px-2.5 py-1 text-xs font-medium text-t2",
        rounded ? "rounded-full" : "rounded",
      )}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${t("common.delete")} ${label}`}
        className="text-t4 transition-colors hover:text-foreground"
      >
        <X size={12} strokeWidth={2.5} />
      </button>
    </span>
  );
}

function LegendStrip() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-[var(--accent-soft)] px-3.5 py-2.5 text-xs text-t3">
      {TIERS.map((tier) => (
        <span key={tier} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <TierDot tier={tier} />
          {tier} {t(tierNoteKey(tier))}
        </span>
      ))}
    </div>
  );
}

function ItemCard({
  item,
  qty,
  capped,
  onOpen,
  onAdd,
  onDecrease,
}: {
  item: CatalogItem;
  qty: number;
  capped: boolean;
  onOpen: () => void;
  onAdd: () => void;
  onDecrease: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-border bg-card p-3.5 shadow-sm">
      <div className="flex items-start gap-3">
        <ImageThumb src={item.imageUrl} size={64} />
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-snug text-foreground">{item.name}</div>
          <div className="mt-1 font-mono text-[11px] text-t4">
            {item.code} ·{" "}
            {item.owner?.name ??
              (item.owner
                ? t(`borrower.catalog.owner${item.owner.type}`)
                : t("borrower.catalog.ownerUnknown"))}
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-t2">
          <TierDot tier={item.tier} />
          {t(tierNoteKey(item.tier))}
        </span>
        <AvailCount item={item} />
        {item.nextAvailableAt ? (
          <span className="font-mono text-t3">{fmtDateTime(item.nextAvailableAt)}</span>
        ) : null}
      </div>

      <div className="mt-3 flex gap-2">
        <Button type="button" variant="outline" className="h-10 flex-1" onClick={onOpen}>
          {t("borrower.catalog.detail")}
        </Button>
        <AddButton
          qty={qty}
          capped={capped}
          variant="default"
          className="h-10 flex-1"
          onAdd={onAdd}
          onDecrease={onDecrease}
        />
      </div>
    </div>
  );
}


function AvailCount({ item }: { item: CatalogItem }) {
  return (
    <span
      className={cn(
        "whitespace-nowrap font-mono text-xs tabular-nums",
        item.availableUnits === 0 ? "text-t4" : "text-foreground",
      )}
    >
      {item.availableUnits} / {item.totalUnits}
    </span>
  );
}

function EmptyState({ onClear }: { onClear: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
      <div className="text-sm font-semibold text-foreground">
        {t("borrower.catalog.emptyTitle")}
      </div>
      <div className="text-xs text-t3">{t("borrower.catalog.emptyDesc")}</div>
      <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onClear}>
        {t("borrower.filters.clearAll")}
      </Button>
    </div>
  );
}

/** Draft counter - the way through to the request page. */
function DraftPill({ count, onOpen }: { count: number; onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="inline-flex items-center gap-2 rounded-md border border-accent-border bg-[var(--accent-soft)] px-3 py-1.5 text-[13px] font-medium text-accent transition-colors hover:bg-accent hover:text-white"
    >
      <ShoppingCart size={15} strokeWidth={2} />
      {t("borrower.catalog.draftCount", { count })}
    </button>
  );
}

/** Photo placeholder - equipment images land with the upload feature. */
function facetOf(item: CatalogItem, group: GroupKey): string {
  if (group === "owner") return item.owner?.id ?? "unowned";
  if (group === "tier") return item.tier ?? "";
  return item.stockStatus;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
