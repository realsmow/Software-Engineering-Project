import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Building2, SlidersHorizontal, TriangleAlert, X } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DataTable, type Column } from "@/components/ui/data-table";
import { BUSINESS, ROUTES } from "@/constants";
import { cn } from "@/lib/utils";
import {
  BUILDINGS,
  CAPACITY_BANDS,
  ROOM_TYPES,
  activeRoomBookings,
  buildingName,
  capacityBand,
  takenSlotsOf,
  type MyRequest,
  type Room,
} from "../mock-data";
import { FacetFilters, type FilterGroup } from "../facet-filters";
import { useMyRequests } from "../loans/use-my-requests";
import { useRooms } from "./use-rooms";

/** Facet groups, in rail order. Keys namespace the option keys ("type:lab"). */
const GROUP_KEYS = ["type", "bld", "cap"] as const;
type GroupKey = (typeof GROUP_KEYS)[number];

/** Matches the equipment catalog so both browse pages page identically. */
const PAGE_SIZE = 8;

/**
 * Room list — the borrower's entry point for booking labs, meeting rooms, and
 * shared spaces. Layout mirrors the equipment catalog (filter rail beside one
 * card that stacks toolbar → chips → note → table) because the mockup treats
 * them as the same kind of browse screen; only the columns and facets differ.
 *
 * Rooms are booked by time slot rather than allocated as units, so there is no
 * sort control here — free-today rooms always float to the top.
 */
export default function RoomListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: rooms = [], isLoading } = useRooms();
  const { requests } = useMyRequests();

  /**
   * Hours left today, counted against live bookings rather than read off the
   * seeded `freeSlots`. Sending a request holds the room immediately, so the
   * count has to drop the moment a booking is made — otherwise the list keeps
   * advertising hours the booking page will refuse.
   */
  const freeOf = useMemo(() => {
    const byRoom = new Map(
      rooms.map((r) => [r.id, r.totalSlots - takenSlotsOf(r, requests).size] as const),
    );
    return (room: Room) => byRoom.get(room.id) ?? room.freeSlots;
  }, [rooms, requests]);

  /**
   * The booking already holding a room, once the borrower is at their limit.
   * While it stands every "book this room" button is closed — a held room is
   * one nobody else can take, so sitting on several is not on offer.
   */
  const held = activeRoomBookings(requests);
  const heldBooking =
    held.length >= BUSINESS.MAX_T3_ACTIVE_BOOKINGS ? held[0] : null;

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);

  const groups = useMemo<FilterGroup[]>(() => {
    const countBy = (group: GroupKey, id: string) =>
      rooms.filter((r) => facetOf(r, group) === id).length;

    return [
      {
        key: "type",
        label: t("borrower.rooms.fType"),
        options: ROOM_TYPES.map((rt) => ({
          key: `type:${rt.id}`,
          label: t(`borrower.rooms.${rt.labelKey}`),
          count: countBy("type", rt.id),
        })),
      },
      {
        key: "bld",
        label: t("borrower.rooms.fBuilding"),
        options: BUILDINGS.map((b) => ({
          key: `bld:${b.id}`,
          label: b.name,
          count: countBy("bld", b.id),
        })),
      },
      {
        key: "cap",
        label: t("borrower.rooms.fCapacity"),
        options: CAPACITY_BANDS.map((band) => ({
          key: `cap:${band}`,
          label: t(`borrower.rooms.cap${band.toUpperCase()}`),
          count: countBy("cap", band),
        })),
      },
    ];
  }, [rooms, t]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Selections are OR-ed inside a group and AND-ed across groups.
    const picked = GROUP_KEYS.map((g) => ({
      group: g,
      keys: [...selected].filter((k) => k.startsWith(`${g}:`)),
    })).filter((p) => p.keys.length > 0);

    const matched = rooms.filter((r) => {
      if (q && !`${r.name} ${r.code}`.toLowerCase().includes(q)) return false;
      return picked.every((p) => p.keys.includes(`${p.group}:${facetOf(r, p.group)}`));
    });

    // Bookable rooms first, then the ones with the most slots left today.
    return [...matched].sort(
      (a, b) =>
        Number(freeOf(b) > 0) - Number(freeOf(a) > 0) || freeOf(b) - freeOf(a),
    );
  }, [rooms, query, selected, freeOf]);

  const chips = useMemo(
    () =>
      groups
        .flatMap((g) => g.options)
        .filter((o) => selected.has(o.key))
        .map((o) => ({ key: o.key, label: o.chipLabel ?? o.label })),
    [groups, selected],
  );

  const openBooking = (room: Room) => navigate(ROUTES.ROOM_BOOKING.replace(":id", room.id));

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

  const columns: Column<Room>[] = [
    {
      key: "room",
      header: t("borrower.rooms.colRoom"),
      render: (r) => (
        <div className="flex items-center gap-3">
          <Thumb />
          <div className="min-w-0">
            <div className="font-medium text-foreground">{r.name}</div>
            <div className="mt-0.5 font-mono text-[11px] text-t4">{r.code}</div>
          </div>
        </div>
      ),
    },
    {
      key: "bld",
      header: t("borrower.rooms.colBuilding"),
      className: "whitespace-nowrap",
      render: (r) => <span className="text-t2">{buildingName(r.buildingId)}</span>,
    },
    {
      key: "type",
      header: t("borrower.rooms.colType"),
      className: "whitespace-nowrap",
      render: (r) => <span className="text-t2">{t(roomTypeKey(r))}</span>,
    },
    {
      key: "cap",
      header: t("borrower.rooms.colCap"),
      align: "right",
      className: "whitespace-nowrap",
      render: (r) => <span className="font-mono text-xs text-t2">{r.capacity}</span>,
    },
    {
      key: "slots",
      header: t("borrower.rooms.colSlotFree"),
      align: "right",
      className: "whitespace-nowrap",
      render: (r) => <SlotCount room={r} free={freeOf(r)} />,
    },
    {
      key: "book",
      header: "",
      align: "right",
      render: (r) => (
        <BookButton
          free={freeOf(r)}
          held={heldBooking !== null}
          size="sm"
          onBook={() => openBooking(r)}
        />
      ),
    },
  ];

  /** Toolbar → chips → booking note, stacked inside the table card (desktop). */
  const strips = (
    <>
      <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-2.5">
        <Input
          type="search"
          className="min-w-0 flex-1"
          placeholder={t("borrower.rooms.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t("borrower.rooms.searchPlaceholder")}
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
      </div>
      <ChipsStrip
        chips={chips}
        shown={list.length}
        total={rooms.length}
        onRemove={toggleFilter}
      />
      <NoteStrip />
      {heldBooking ? (
        <HeldStrip booking={heldBooking} onOpen={() => navigate(ROUTES.ROOM_USE)} />
      ) : null}
    </>
  );

  const showEmpty = !isLoading && list.length === 0;

  return (
    <div>
      <PageHeader
        title={t("nav.rooms")}
        subtitle={t("borrower.rooms.subtitle")}
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
                // over — DataTable owns its page state and has no reset prop.
                key={`${query}|${[...selected].sort().join(",")}`}
                columns={columns}
                rows={list}
                rowKey={(r) => r.id}
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
              placeholder={t("borrower.rooms.searchPlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t("borrower.rooms.searchPlaceholder")}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setFiltersOpen(true)}
            >
              <SlidersHorizontal size={15} strokeWidth={2} />
              {t("borrower.filters.button")}
              {selected.size > 0 ? ` (${selected.size})` : ""}
            </Button>

            {chips.length > 0 ? (
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {chips.map((c) => (
                  <Chip key={c.key} label={c.label} rounded onRemove={() => toggleFilter(c.key)} />
                ))}
              </div>
            ) : null}

            <p className="px-0.5 text-xs leading-relaxed text-t3">{t("borrower.rooms.note")}</p>

            {heldBooking ? (
              <div className="overflow-hidden rounded-lg border border-border">
                <HeldStrip booking={heldBooking} onOpen={() => navigate(ROUTES.ROOM_USE)} />
              </div>
            ) : null}

            <div className="text-xs tabular-nums text-t3">
              {t("borrower.rooms.showing", { shown: list.length, total: rooms.length })}
            </div>

            {showEmpty ? (
              <div className="rounded-lg border border-border bg-card shadow-sm">
                <EmptyState onClear={clearFilters} />
              </div>
            ) : (
              list.map((r) => (
                <RoomCard
                  key={r.id}
                  room={r}
                  free={freeOf(r)}
                  held={heldBooking !== null}
                  onBook={() => openBooking(r)}
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
              {t("borrower.rooms.showing", { shown: list.length, total: rooms.length })}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
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
        {t("borrower.rooms.showing", { shown, total })}
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

/** Reminder that rooms and equipment are two separate requests. */
function NoteStrip() {
  const { t } = useTranslation();
  return (
    <div className="border-b border-border bg-[var(--accent-soft)] px-3.5 py-2.5 text-xs leading-relaxed text-t3">
      {t("borrower.rooms.note")}
    </div>
  );
}

/**
 * Why every button is closed. Without this the list looks broken rather than
 * governed, so it names the booking in the way and where to deal with it.
 */
function HeldStrip({ booking, onOpen }: { booking: MyRequest; onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-[var(--s-warn-bg)] px-3.5 py-2.5 text-xs leading-relaxed text-[var(--s-warn-t)]">
      <span className="inline-flex items-start gap-2">
        <TriangleAlert size={13} strokeWidth={2.4} className="mt-0.5 shrink-0" />
        {t("borrower.rooms.heldNote", { name: booking.name })}
      </span>
      <Button type="button" variant="outline" size="sm" onClick={onOpen}>
        {t("borrower.rooms.heldAction")}
      </Button>
    </div>
  );
}

function RoomCard({
  room,
  free,
  held,
  onBook,
}: {
  room: Room;
  free: number;
  held: boolean;
  onBook: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-border bg-card p-3.5 shadow-sm">
      <div className="flex items-start gap-3">
        <Thumb size={64} />
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-snug text-foreground">{room.name}</div>
          <div className="mt-1 font-mono text-[11px] text-t4">
            {room.code} · {buildingName(room.buildingId)}
          </div>
          <div className="mt-1 text-xs text-t3">
            {t(roomTypeKey(room))} · {t("borrower.rooms.seats", { count: room.capacity })}
          </div>
        </div>
      </div>

      <div className="mt-2.5 text-xs">
        <SlotCount room={room} free={free} />
      </div>

      <BookButton free={free} held={held} className="mt-3 h-11 w-full" onBook={onBook} />
    </div>
  );
}

function BookButton({
  free,
  held,
  size,
  className,
  onBook,
}: {
  /** Hours still open today. */
  free: number;
  /** True when another booking already holds this borrower's one slot. */
  held: boolean;
  size?: "sm";
  className?: string;
  onBook: () => void;
}) {
  const { t } = useTranslation();
  const full = free === 0;
  // "Fully booked" is about the room; the hold is about the borrower. Saying
  // the wrong one sends them looking for a different room that is just as shut.
  const label = full
    ? t("borrower.rooms.full")
    : held
      ? t("borrower.rooms.held")
      : t("borrower.rooms.book");
  return (
    <Button
      type="button"
      size={size}
      variant={size === "sm" ? "outline" : "default"}
      className={className}
      disabled={full || held}
      onClick={onBook}
    >
      {label}
    </Button>
  );
}

/** Free slots today, dimmed once the room is fully booked. */
function SlotCount({ room, free }: { room: Room; free: number }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "whitespace-nowrap font-mono text-xs tabular-nums",
        free === 0 ? "text-t4" : "text-foreground",
      )}
    >
      {t("borrower.rooms.slots", { free, total: room.totalSlots })}
    </span>
  );
}

function EmptyState({ onClear }: { onClear: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
      <div className="text-sm font-semibold text-foreground">
        {t("borrower.rooms.emptyTitle")}
      </div>
      <div className="text-xs text-t3">{t("borrower.rooms.emptyDesc")}</div>
      <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onClear}>
        {t("borrower.filters.clearAll")}
      </Button>
    </div>
  );
}

/** Photo placeholder — room images land with the upload feature. */
function Thumb({ size = 44 }: { size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded border border-border bg-surface-inset text-t4"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Building2 size={size < 56 ? 18 : 24} strokeWidth={1.6} />
    </div>
  );
}

function roomTypeKey(room: Room): string {
  const def = ROOM_TYPES.find((rt) => rt.id === room.type);
  return `borrower.rooms.${def?.labelKey ?? "typeLab"}`;
}

function facetOf(room: Room, group: GroupKey): string {
  if (group === "type") return room.type;
  if (group === "bld") return room.buildingId;
  return capacityBand(room.capacity);
}
