import { useState, type ChangeEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { TierDot } from "@/components/shared/tier-badge";
import { ImageThumb } from "@/components/shared/image-thumb";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { extractErrorCode, getErrorMessage } from "@/lib/error-messages";
import { uploadAcceptAttr, validateUploadFile } from "@/lib/upload-validation";
import { fmtDateTime } from "@/features/borrower/format";
import type { ConditionType } from "@/features/staff/queue/queue.types";
import type { Tier } from "@/types/domain";
import {
  useCreateItemType,
  useCreateItemUnits,
  useCreateRoom,
  useDeleteItemType,
  useDeleteRoom,
  useDeleteUnit,
  useManagedItem,
  useManagedItems,
  useManagedRooms,
  useManagementGroupOptions,
  useRequestRetirement,
  useSetUnitCondition,
  useSetUnitLendable,
  useTierOptions,
  useUpdateItemType,
  useUpdateRoom,
  useUpdateUnit,
} from "./use-inventory";
import { useUploadImage } from "./use-item-image";
import { canSubmitSerial, unitSerialRules } from "./unit-serial-rules";
import { suggestTierFromPrice } from "./inventory.types";
import type { ManagedItemDetail, ManagedItemType, ManagedRoom, ManagedUnit } from "./inventory.types";

/**
 * Department inventory (SRS FR-EQP-01..05, FR-EQP-08).
 *
 * Not the borrower catalogue with extra buttons. This lists what the
 * department owns, including everything a borrower can never see - units out
 * on loan, withdrawn for maintenance, or recorded missing - because the
 * question here is "where is all of it", not "what can I take today".
 */
export default function StaffInventoryPage() {
  const { t } = useTranslation();
  const { data: items, isLoading } = useManagedItems();
  const [openKey, setOpenKey] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [creatingType, setCreatingType] = useState(false);
  // A type with zero units is invisible in the list below (see
  // `NewTypeDialog`'s comment), so "add units now" is handed a dialog for it
  // directly rather than relying on the caller to find it in the list.
  const [addUnitsForType, setAddUnitsForType] = useState<ManagedItemDetail | null>(null);

  const needle = q.trim().toLowerCase();
  const rows = (items ?? []).filter(
    (i) => needle === "" || (i.name ?? "").toLowerCase().includes(needle),
  );

  const totals = (items ?? []).reduce(
    (acc, i) => ({
      types: acc.types + 1,
      units: acc.units + i.totalUnits,
      available: acc.available + i.availableUnits,
    }),
    { types: 0, units: 0, available: 0 },
  );

  return (
    <div>
      <PageHeader
        title={t("nav.inventory")}
        subtitle={t("staff.inventory.subtitle")}
        actions={
          <Button type="button" size="sm" onClick={() => setCreatingType(true)}>
            <Plus size={14} strokeWidth={2} />
            {t("staff.inventory.newType")}
          </Button>
        }
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <Tile label={t("staff.inventory.tileTypes")} value={totals.types} />
        <Tile label={t("staff.inventory.tileUnits")} value={totals.units} />
        <Tile label={t("staff.inventory.tileAvailable")} value={totals.available} />
      </div>

      <Input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("staff.inventory.searchPlaceholder")}
        className="mb-3 max-w-sm"
      />

      {isLoading ? (
        <div className="py-16 text-center text-sm text-t3">{t("common.loading")}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-4 py-10 text-center">
          <div className="text-sm font-semibold text-foreground">
            {t("staff.inventory.emptyTitle")}
          </div>
          <p className="mt-1 text-xs text-t3">{t("staff.inventory.emptyDesc")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((item) => (
            <TypeCard
              key={item.id}
              item={item}
              open={openKey === item.id}
              onToggle={() => setOpenKey(openKey === item.id ? null : item.id)}
            />
          ))}
        </div>
      )}

      <RoomsSection />

      {creatingType ? (
        <NewTypeDialog
          onClose={() => setCreatingType(false)}
          onDoneAddUnits={(created) => {
            setCreatingType(false);
            setAddUnitsForType(created);
          }}
        />
      ) : null}
      {addUnitsForType ? (
        <AddUnitsDialog item={addUnitsForType} onClose={() => setAddUnitsForType(null)} />
      ) : null}
    </div>
  );
}

/** Label + control, reused across every dialog on this page. */
function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>
        {label}
        {required ? <span className="text-[var(--s-alert-t)]"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}

// ── minutes-past-midnight helpers, FR-EQP-04 ────────────────────────────────

/** Every 30-minute mark from 00:00 to 24:00, for the room-hours selects. */
const CLOCK_OPTIONS = Array.from({ length: 49 }, (_, i) => i * 30);

function clockLabel(minutes: number): string {
  if (minutes >= 1440) return "24:00";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function ClockSelect({
  value,
  onChange,
  options = CLOCK_OPTIONS,
}: {
  value: number;
  onChange: (minutes: number) => void;
  options?: number[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {options.map((m) => (
        <option key={m} value={m}>
          {clockLabel(m)}
        </option>
      ))}
    </select>
  );
}

// ── Equipment types ──────────────────────────────────────────────────────

function TypeCard({
  item,
  open,
  onToggle,
}: {
  item: ManagedItemType;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors hover:bg-muted"
      >
        <div className="flex min-w-0 items-center gap-3">
          <ImageThumb src={item.imageUrl} size={40} />
          <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{item.name ?? "-"}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-t4">
            {/* Usually one tier. Two means two units of the same type sit on
                different BorrowRules, which is worth seeing, not hiding. */}
            {item.tiers.length === 0 ? (
              <span>{t("borrower.catalog.tierUnknown")}</span>
            ) : (
              item.tiers.map((tier) => (
                <span key={tier} className="inline-flex items-center gap-1">
                  <TierDot tier={tier} />
                  {tier}
                </span>
              ))
            )}
            <span>· {t("staff.inventory.weight", { weight: item.creditWeight })}</span>
          </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-sm tabular-nums text-foreground">
            {item.availableUnits} / {item.totalUnits}
          </span>
          <span className="text-xs font-medium text-accent">
            {open ? t("staff.inspection.close") : t("staff.inventory.openUnits")}
          </span>
        </div>
      </button>

      {open ? <TypeDetail item={item} /> : null}
    </section>
  );
}

function TypeDetail({ item }: { item: ManagedItemType }) {
  const { t } = useTranslation();
  const [addingUnits, setAddingUnits] = useState(false);

  return (
    <>
      <PhotoRow item={item} />
      <TypeEditPanel item={item} />
      <div className="flex items-center justify-between border-t border-border px-3.5 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.03em] text-t3">
          {t("staff.inventory.unitsHeading")}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={() => setAddingUnits(true)}>
          <Plus size={14} strokeWidth={2} />
          {t("staff.inventory.addUnits")}
        </Button>
      </div>
      <Units itemKey={item.id} />
      {addingUnits ? <AddUnitsDialog item={item} onClose={() => setAddingUnits(false)} /> : null}
    </>
  );
}

/**
 * Attach a picture to a catalogue type.
 *
 * The file is validated here before a ticket is asked for, so an oversized or
 * wrong-type file never costs a round trip. The ticket is requested at submit
 * time because it expires in ten minutes.
 */
function PhotoRow({ item }: { item: ManagedItemType }) {
  const { t } = useTranslation();
  const upload = useUploadImage();
  const updateType = useUpdateItemType();
  const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const busy = upload.isPending || updateType.isPending;

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Let the same file be chosen again after a failure.
    event.target.value = "";
    if (!file) return;

    const check = validateUploadFile(file);
    if (!check.ok) {
      setNote({ tone: "bad", text: getErrorMessage({ businessCode: check.code }) });
      return;
    }

    setNote(null);
    try {
      const ticket = await upload.mutateAsync({ file, purpose: "itemType" });
      await updateType.mutateAsync({ itemKey: item.id, imageUrl: ticket.imageUrl });
      setNote({ tone: "ok", text: t("staff.inventory.photoSaved") });
    } catch (error) {
      setNote({ tone: "bad", text: getErrorMessage(error) });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border px-3.5 py-3">
      <ImageThumb src={item.imageUrl} alt={item.name ?? ""} size={56} />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-foreground">{t("staff.inventory.photo")}</div>
        <div className="mt-0.5 text-[11px] text-t4">
          {busy
            ? t("staff.inventory.photoUploading")
            : item.imageUrl
              ? t("staff.inventory.photoHint")
              : `${t("staff.inventory.noPhoto")} · ${t("staff.inventory.photoHint")}`}
        </div>
        {note ? (
          <div
            className={`mt-1 text-[11px] ${note.tone === "ok" ? "text-[var(--s-ok-t)]" : "text-[var(--s-warn-t)]"}`}
          >
            {note.text}
          </div>
        ) : null}
      </div>
      <label className="shrink-0">
        <span className="sr-only">{t("staff.inventory.choosePhoto")}</span>
        <input
          type="file"
          accept={uploadAcceptAttr()}
          disabled={busy}
          onChange={pick}
          className="block w-44 text-[11px] text-t3 file:mr-2 file:rounded file:border file:border-border file:bg-secondary file:px-2 file:py-1 file:text-[11px] file:text-foreground"
        />
      </label>
    </div>
  );
}

/**
 * Read-only summary of a type's price/credit weight, with an `Edit` toggle.
 *
 * Kept as a summary rather than an always-open form: most rows are opened
 * just to look at units, and a dozen input boxes for that is worse than one
 * line of text and a button.
 */
function TypeEditPanel({ item }: { item: ManagedItemType }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);

  return (
    <div className="border-t border-border px-3.5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-t3">
          {t("staff.inventory.fieldCreditWeight")}: {item.creditWeight}
          {" · "}
          {t("staff.inventory.fieldPrice")}: {item.price !== null ? `${item.price} ฿` : "-"}
          {item.suggestedTier ? ` · ${t("staff.inventory.suggestedTierLabel")}: ${item.suggestedTier}` : ""}
        </span>
        {!editing ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
            {t("staff.inventory.edit")}
          </Button>
        ) : null}
      </div>
      {editing ? <TypeEditForm item={item} onClose={() => setEditing(false)} /> : null}
    </div>
  );
}

function TypeEditForm({ item, onClose }: { item: ManagedItemType; onClose: () => void }) {
  const { t } = useTranslation();
  const update = useUpdateItemType();
  const del = useDeleteItemType();
  const [name, setName] = useState(item.name ?? "");
  const [description, setDescription] = useState(item.description ?? "");
  const [creditWeight, setCreditWeight] = useState(item.creditWeight);
  const [price, setPrice] = useState(item.price !== null ? String(item.price) : "");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    try {
      await update.mutateAsync({
        itemKey: item.id,
        name: name.trim() || undefined,
        description: description.trim(),
        creditWeight,
        price: price.trim() === "" ? null : Number(price),
      });
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  async function remove() {
    if (!window.confirm(t("staff.inventory.deleteTypeConfirm", { name: item.name ?? "" }))) return;
    setError(null);
    try {
      await del.mutateAsync({ itemKey: item.id });
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("staff.inventory.fieldName")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
        </Field>
        <Field label={t("staff.inventory.fieldCreditWeight")}>
          <Input
            type="number"
            min={0}
            max={1000}
            value={creditWeight}
            onChange={(e) => setCreditWeight(Number(e.target.value))}
          />
        </Field>
        <Field label={t("staff.inventory.fieldDescription")}>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </Field>
        <Field label={t("staff.inventory.fieldPrice")}>
          <Input
            type="number"
            min={0}
            max={10_000_000}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={t("staff.inventory.pricePlaceholder")}
          />
        </Field>
      </div>
      {error ? <p className="text-[13px] text-[var(--s-warn-t)]">{error}</p> : null}
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="destructive" size="sm" disabled={del.isPending} onClick={() => void remove()}>
          {t("staff.inventory.deleteType")}
        </Button>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="button" size="sm" disabled={update.isPending} onClick={() => void save()}>
            {t("common.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** "New equipment type" (FR-EQP-01): create, then optionally attach a photo. */
function NewTypeDialog({
  onClose,
  onDoneAddUnits,
}: {
  onClose: () => void;
  /**
   * A fresh type has no units, and `listManaged` only shows types with at
   * least one unit in scope (item.management.service.ts: "a type is 'mine'
   * when at least one of its units is"). Without this, a type created here
   * would never appear in the list for staff to open and add units to.
   */
  onDoneAddUnits: (created: ManagedItemDetail) => void;
}) {
  const { t } = useTranslation();
  const createType = useCreateItemType();
  const upload = useUploadImage();
  const updateType = useUpdateItemType();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creditWeight, setCreditWeight] = useState(0);
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ManagedItemDetail | null>(null);
  const [photoNote, setPhotoNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const priceValue = price.trim() === "" ? undefined : Number(price);
  const suggested = suggestTierFromPrice(priceValue ?? null);

  async function submit() {
    if (!name.trim()) return;
    setError(null);
    try {
      const result = await createType.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        creditWeight,
        price: priceValue,
      });
      setCreated(result);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  async function pickPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !created) return;

    const check = validateUploadFile(file);
    if (!check.ok) {
      setPhotoNote({ tone: "bad", text: getErrorMessage({ businessCode: check.code }) });
      return;
    }
    try {
      const ticket = await upload.mutateAsync({ file, purpose: "itemType" });
      await updateType.mutateAsync({ itemKey: created.id, imageUrl: ticket.imageUrl });
      setPhotoNote({ tone: "ok", text: t("staff.inventory.photoSaved") });
    } catch (e) {
      setPhotoNote({ tone: "bad", text: getErrorMessage(e) });
    }
  }

  if (created) {
    return (
      <Modal
        open
        onClose={onClose}
        title={t("staff.inventory.newTypeCreatedTitle")}
        footer={
          <>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.close")}
            </Button>
            <Button type="button" onClick={() => onDoneAddUnits(created)}>
              {t("staff.inventory.addUnitsNow")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-foreground">
            {t("staff.inventory.newTypeCreatedDesc", { name: created.name ?? "" })}
          </p>
          <p className="text-xs text-t3">{t("staff.inventory.newTypeNoUnitsHint")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <ImageThumb src={created.imageUrl} size={56} />
            <label className="shrink-0">
              <span className="sr-only">{t("staff.inventory.choosePhoto")}</span>
              <input
                type="file"
                accept={uploadAcceptAttr()}
                disabled={upload.isPending || updateType.isPending}
                onChange={pickPhoto}
                className="block w-48 text-[11px] text-t3 file:mr-2 file:rounded file:border file:border-border file:bg-secondary file:px-2 file:py-1 file:text-[11px] file:text-foreground"
              />
            </label>
          </div>
          {photoNote ? (
            <p className={photoNote.tone === "ok" ? "text-[11px] text-[var(--s-ok-t)]" : "text-[11px] text-[var(--s-warn-t)]"}>
              {photoNote.text}
            </p>
          ) : null}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t("staff.inventory.newTypeTitle")}
      subtitle={t("staff.inventory.newTypeSub")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="button" disabled={!name.trim() || createType.isPending} onClick={() => void submit()}>
            {t("staff.inventory.create")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t("staff.inventory.fieldName")} required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("staff.inventory.namePlaceholder")}
            maxLength={200}
          />
        </Field>
        <Field label={t("staff.inventory.fieldDescription")}>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("staff.inventory.fieldCreditWeight")}>
            <Input
              type="number"
              min={0}
              max={1000}
              value={creditWeight}
              onChange={(e) => setCreditWeight(Number(e.target.value))}
            />
          </Field>
          <Field label={t("staff.inventory.fieldPrice")}>
            <Input
              type="number"
              min={0}
              max={10_000_000}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={t("staff.inventory.pricePlaceholder")}
            />
          </Field>
        </div>
        {suggested ? (
          <p className="text-xs text-t3">{t("staff.inventory.priceHint", { tier: suggested })}</p>
        ) : null}
        {error ? <p className="text-[13px] text-[var(--s-warn-t)]">{error}</p> : null}
      </div>
    </Modal>
  );
}

// ── Units ────────────────────────────────────────────────────────────────

function Units({ itemKey }: { itemKey: number }) {
  const { t } = useTranslation();
  const { data: detail, isLoading } = useManagedItem(itemKey);

  if (isLoading) {
    return (
      <div className="border-t border-border px-3.5 py-6 text-center text-sm text-t3">
        {t("common.loading")}
      </div>
    );
  }
  if (!detail || detail.units.length === 0) {
    return (
      <div className="border-t border-border px-3.5 py-4 text-xs text-t3">
        {t("staff.inventory.noUnits")}
      </div>
    );
  }

  return (
    <div className="border-t border-border overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-[13px]">
        <thead>
          <tr className="bg-secondary">
            <Th>{t("staff.inventory.colSerial")}</Th>
            <Th>{t("common.status")}</Th>
            <Th>{t("staff.inventory.colCondition")}</Th>
            <Th className="text-right">{t("staff.inventory.colActions")}</Th>
          </tr>
        </thead>
        <tbody>
          {detail.units.map((u) => (
            <UnitRow key={u.resourceKey} unit={u} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

type UnitRowMode = "withdraw" | "edit" | "condition" | "retire" | null;

function UnitRow({ unit }: { unit: ManagedUnit }) {
  const { t } = useTranslation();
  const setLendable = useSetUnitLendable();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<UnitRowMode>(null);

  const busy = setLendable.isPending;
  // A unit in someone's hands cannot be withdrawn; the server refuses it too.
  const outOnLoan = unit.status === "Lended";

  async function toggle() {
    setError(null);
    try {
      await setLendable.mutateAsync({
        resourceKey: unit.resourceKey,
        lendable: !unit.lendable,
        reason: note.trim() || undefined,
      });
      setMode(null);
      setNote("");
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-3.5 py-2 font-mono text-xs text-foreground">
        {unit.serialNo}
        {unit.currentDueAt ? (
          <div className="mt-0.5 text-[11px] font-normal text-t4">
            {t("staff.inventory.dueBack", { when: fmtDateTime(unit.currentDueAt ?? undefined) })}
          </div>
        ) : null}
      </td>
      <td className="px-3.5 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={statusTone(unit)}>{t(`staff.inventory.status${unit.status}`)}</Badge>
          {!unit.lendable ? (
            <Badge tone="warn">{t("staff.inventory.withdrawn")}</Badge>
          ) : null}
        </div>
      </td>
      <td className="px-3.5 py-2 text-t2">
        {unit.condition ? t(`staff.inspection.cond${unit.condition}`) : "-"}
        {unit.conditionNote ? (
          <div className="mt-0.5 max-w-[18rem] truncate text-[11px] text-t3" title={unit.conditionNote}>
            {unit.conditionNote}
          </div>
        ) : null}
      </td>
      <td className="px-3.5 py-2 text-right">
        {mode === "withdraw" ? (
          <div className="flex items-center justify-end gap-2">
            <Input
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("staff.inventory.reasonPlaceholder")}
              className="h-8 w-48"
            />
            <Button type="button" size="sm" disabled={busy} onClick={() => void toggle()}>
              {t("staff.inventory.confirm")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setMode(null)}>
              {t("common.cancel")}
            </Button>
          </div>
        ) : mode === "edit" ? (
          <UnitEditForm unit={unit} onClose={() => setMode(null)} />
        ) : mode === "condition" ? (
          <UnitConditionForm unit={unit} onClose={() => setMode(null)} />
        ) : mode === "retire" ? (
          <UnitRetireForm unit={unit} onClose={() => setMode(null)} />
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={() => setMode("edit")}>
              {t("staff.inventory.edit")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setMode("condition")}>
              {t("staff.inventory.setCondition")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || outOnLoan}
              title={outOnLoan ? t("staff.inventory.outOnLoanHint") : undefined}
              onClick={() => setMode("withdraw")}
            >
              {unit.lendable ? t("staff.inventory.withdraw") : t("staff.inventory.restore")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setMode("retire")}>
              {t("staff.inventory.retireUnit")}
            </Button>
            <DeleteUnitButton unit={unit} onRequestRetirement={() => setMode("retire")} />
          </div>
        )}
        {error ? (
          <div className="mt-1 text-[11px] text-[var(--s-warn-t)]">{error}</div>
        ) : null}
      </td>
    </tr>
  );
}

function DeleteUnitButton({
  unit,
  onRequestRetirement,
}: {
  unit: ManagedUnit;
  onRequestRetirement: () => void;
}) {
  const { t } = useTranslation();
  const del = useDeleteUnit();
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  async function handleDelete() {
    if (!window.confirm(t("staff.inventory.deleteUnitConfirm", { serial: unit.serialNo }))) return;
    setError(null);
    setBlocked(false);
    try {
      await del.mutateAsync({ resourceKey: unit.resourceKey });
    } catch (e) {
      setError(getErrorMessage(e));
      setBlocked(extractErrorCode(e) === "HAS_HISTORY");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" disabled={del.isPending} onClick={() => void handleDelete()}>
        {t("common.delete")}
      </Button>
      {error ? (
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--s-warn-t)]">
          <span>{error}</span>
          {blocked ? (
            <button type="button" className="underline" onClick={onRequestRetirement}>
              {t("staff.inventory.retireUnit")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function UnitEditForm({ unit, onClose }: { unit: ManagedUnit; onClose: () => void }) {
  const { t } = useTranslation();
  const update = useUpdateUnit();
  const [serialNo, setSerialNo] = useState(unit.serialNo);
  const [tier, setTier] = useState<Tier | "">(unit.tier ?? "");
  const [prepDays, setPrepDays] = useState(unit.prepDays);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    try {
      await update.mutateAsync({
        resourceKey: unit.resourceKey,
        serialNo: serialNo.trim() || undefined,
        tier: tier === "" ? undefined : tier,
        prepDays,
      });
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <Input
          value={serialNo}
          onChange={(e) => setSerialNo(e.target.value)}
          className="h-8 w-32"
          placeholder={t("staff.inventory.colSerial")}
        />
        <select
          value={tier}
          onChange={(e) => setTier(e.target.value as Tier)}
          className="h-8 rounded border border-border bg-transparent px-1.5 text-xs text-foreground"
          aria-label={t("staff.inventory.fieldTier")}
        >
          <option value="">-</option>
          <option value="T0">T0</option>
          <option value="T1">T1</option>
          <option value="T2">T2</option>
        </select>
        <Input
          type="number"
          min={0}
          max={30}
          value={prepDays}
          onChange={(e) => setPrepDays(Number(e.target.value))}
          className="h-8 w-16"
          aria-label={t("staff.inventory.fieldPrepDays")}
        />
        <Button type="button" size="sm" disabled={update.isPending} onClick={() => void save()}>
          {t("common.save")}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {t("common.cancel")}
        </Button>
      </div>
      {error ? <span className="text-[11px] text-[var(--s-warn-t)]">{error}</span> : null}
    </div>
  );
}

const CONDITIONS: ConditionType[] = ["Normal", "MinorDamage", "MajorDamage", "Broken", "Missing"];

function UnitConditionForm({ unit, onClose }: { unit: ManagedUnit; onClose: () => void }) {
  const { t } = useTranslation();
  const setCondition = useSetUnitCondition();
  const [condition, setConditionValue] = useState<ConditionType>(unit.condition ?? "Normal");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    try {
      await setCondition.mutateAsync({
        resourceKey: unit.resourceKey,
        condition,
        note: note.trim() || undefined,
      });
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <select
          value={condition}
          onChange={(e) => setConditionValue(e.target.value as ConditionType)}
          className="h-8 rounded border border-border bg-transparent px-1.5 text-xs text-foreground"
          aria-label={t("staff.inventory.setCondition")}
        >
          {CONDITIONS.map((c) => (
            <option key={c} value={c}>
              {t(`staff.inspection.cond${c}`)}
            </option>
          ))}
        </select>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("staff.inventory.conditionNotePlaceholder")}
          className="h-8 w-40"
        />
        <Button type="button" size="sm" disabled={setCondition.isPending} onClick={() => void save()}>
          {t("common.save")}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {t("common.cancel")}
        </Button>
      </div>
      {error ? <span className="text-[11px] text-[var(--s-warn-t)]">{error}</span> : null}
    </div>
  );
}

function UnitRetireForm({ unit, onClose }: { unit: ManagedUnit; onClose: () => void }) {
  const { t } = useTranslation();
  const retire = useRequestRetirement();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function send() {
    const why = reason.trim();
    if (!why) return;
    setError(null);
    try {
      await retire.mutateAsync({ resourceKey: unit.resourceKey, reason: why });
      setSent(true);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  if (sent) {
    return (
      <div className="flex items-center justify-end gap-2">
        <span className="text-[11px] text-[var(--s-ok-t)]">{t("staff.inventory.retireSent")}</span>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {t("common.close")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <Input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("staff.inventory.retireReasonPlaceholder")}
          className="h-8 w-48"
        />
        <Button type="button" size="sm" disabled={retire.isPending || !reason.trim()} onClick={() => void send()}>
          {t("staff.inventory.retireSubmit")}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {t("common.cancel")}
        </Button>
      </div>
      {error ? <span className="text-[11px] text-[var(--s-warn-t)]">{error}</span> : null}
    </div>
  );
}

/** "Add units" (FR-EQP-02): field rules from the teammate's draft (commit 14ae029). */
function AddUnitsDialog({ item, onClose }: { item: ManagedItemType; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: groups } = useManagementGroupOptions();
  const { data: tierOptions } = useTierOptions();
  const createUnits = useCreateItemUnits();

  const [manageGroupKey, setManageGroupKey] = useState<number | null>(null);
  const [tier, setTier] = useState<Tier | "">("");
  const [serialNo, setSerialNo] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [prepDays, setPrepDays] = useState(0);
  const [lendable, setLendable] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Rooms are T3 and registered separately (`RoomDialog`), so only T0-T2
  // belong on this picker. Deduplicated in case more than one BorrowRule maps
  // to the same tier.
  const tiers = (tierOptions ?? [])
    .filter((o) => o.tier !== "T3")
    .filter((o, i, arr) => arr.findIndex((x) => x.tier === o.tier) === i);

  const rules = unitSerialRules(tier);
  const isT2 = rules.quantityLocked;
  const canSubmit = manageGroupKey !== null && tier !== "" && canSubmitSerial(rules, serialNo);

  function changeTier(next: Tier) {
    setTier(next);
    // A serial typed for one tier means nothing under another.
    setSerialNo("");
    if (next === "T2") setQuantity(1);
  }

  async function submit() {
    if (manageGroupKey === null || tier === "" || !canSubmitSerial(rules, serialNo)) return;
    setError(null);
    try {
      await createUnits.mutateAsync({
        itemKey: item.id,
        manageGroupKey,
        tier,
        serialNo: serialNo.trim() || undefined,
        prepDays,
        lendable,
        quantity: isT2 ? 1 : quantity,
      });
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t("staff.inventory.addUnitsTitle", { name: item.name ?? "" })}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="button" disabled={!canSubmit || createUnits.isPending} onClick={() => void submit()}>
            {t("staff.inventory.addUnitsSubmit")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t("staff.inventory.fieldDepartment")} required>
          <Select
            value={manageGroupKey !== null ? String(manageGroupKey) : ""}
            onValueChange={(v) => setManageGroupKey(Number(v))}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("staff.inventory.selectPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {(groups ?? []).map((g) => (
                <SelectItem key={g.id} value={String(g.id)}>
                  {g.name ?? `#${g.id}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={t("staff.inventory.fieldTier")} required>
          <Select value={tier} onValueChange={(v) => changeTier(v as Tier)}>
            <SelectTrigger>
              <SelectValue placeholder={t("staff.inventory.selectPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {tiers.map((o) => (
                <SelectItem key={o.tier} value={o.tier}>
                  {o.tier}
                  {o.name ? ` · ${o.name}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={t("staff.inventory.fieldSerial")} required={rules.serialRequired}>
          <Input
            value={serialNo}
            onChange={(e) => setSerialNo(e.target.value)}
            disabled={rules.serialDisabled}
            maxLength={100}
            placeholder={
              tier === ""
                ? ""
                : isT2
                  ? t("staff.inventory.serialRequiredPlaceholder")
                  : t("staff.inventory.serialAutoPlaceholder")
            }
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("staff.inventory.fieldQuantity")}>
            <Input
              type="number"
              min={1}
              max={200}
              value={isT2 ? 1 : quantity}
              disabled={isT2}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </Field>
          <Field label={t("staff.inventory.fieldPrepDays")}>
            <Input
              type="number"
              min={0}
              max={30}
              value={prepDays}
              onChange={(e) => setPrepDays(Number(e.target.value))}
            />
          </Field>
        </div>
        {isT2 ? <p className="text-xs text-t3">{t("staff.inventory.quantityLockedHint")}</p> : null}

        <ToggleSwitch checked={lendable} onChange={setLendable} label={t("staff.inventory.fieldLendable")} />

        {error ? <p className="text-[13px] text-[var(--s-warn-t)]">{error}</p> : null}
      </div>
    </Modal>
  );
}

// ── Rooms (T3) ───────────────────────────────────────────────────────────

function RoomsSection() {
  const { t } = useTranslation();
  const { data: rooms, isLoading } = useManagedRooms();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ManagedRoom | null>(null);

  const needle = q.trim().toLowerCase();
  const rows = (rooms ?? []).filter((r) => needle === "" || (r.name ?? "").toLowerCase().includes(needle));

  return (
    <section className="mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("staff.inventory.roomsTitle")}</h2>
          <p className="text-xs text-t3">{t("staff.inventory.roomsSubtitle")}</p>
        </div>
        <Button type="button" size="sm" onClick={() => setCreating(true)}>
          <Plus size={14} strokeWidth={2} />
          {t("staff.inventory.newRoom")}
        </Button>
      </div>

      <Input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("staff.inventory.searchRoomsPlaceholder")}
        className="mb-3 max-w-sm"
      />

      {isLoading ? (
        <div className="py-10 text-center text-sm text-t3">{t("common.loading")}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-t3">
          {t("staff.inventory.noRooms")}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full min-w-[40rem] border-collapse text-[13px]">
            <thead>
              <tr className="bg-secondary">
                <Th>{t("staff.inventory.colRoom")}</Th>
                <Th>{t("staff.inventory.colHours")}</Th>
                <Th>{t("staff.inventory.fieldCapacity")}</Th>
                <Th className="text-right">{t("staff.inventory.colActions")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <RoomRow key={r.resourceKey} room={r} onEdit={() => setEditing(r)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating ? <RoomDialog mode="create" onClose={() => setCreating(false)} /> : null}
      {editing ? <RoomDialog mode="edit" room={editing} onClose={() => setEditing(null)} /> : null}
    </section>
  );
}

function RoomRow({ room, onEdit }: { room: ManagedRoom; onEdit: () => void }) {
  const { t } = useTranslation();
  const del = useDeleteRoom();
  const retire = useRequestRetirement();
  const [mode, setMode] = useState<"retire" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  async function handleDelete() {
    if (!window.confirm(t("staff.inventory.deleteRoomConfirm", { name: room.name ?? "" }))) return;
    setError(null);
    setBlocked(false);
    try {
      await del.mutateAsync({ resourceKey: room.resourceKey });
    } catch (e) {
      setError(getErrorMessage(e));
      setBlocked(extractErrorCode(e) === "HAS_HISTORY");
    }
  }

  async function sendRetirement() {
    const why = reason.trim();
    if (!why) return;
    setError(null);
    try {
      await retire.mutateAsync({ resourceKey: room.resourceKey, reason: why });
      setMode(null);
      setReason("");
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-3.5 py-2">
        <div className="text-foreground">{room.name ?? "-"}</div>
        <div className="mt-0.5 text-[11px] text-t4">{room.location ?? "-"}</div>
      </td>
      <td className="px-3.5 py-2 font-mono text-xs text-t2">
        {clockLabel(room.openMinutes)}-{clockLabel(room.closeMinutes)}
        {room.breakStartMinutes !== null ? (
          <div className="text-t4">
            {t("staff.inventory.breakLabel", {
              start: clockLabel(room.breakStartMinutes),
              end: clockLabel(room.breakEndMinutes ?? room.breakStartMinutes),
            })}
          </div>
        ) : null}
      </td>
      <td className="px-3.5 py-2 text-t2">{room.capacity ?? "-"}</td>
      <td className="px-3.5 py-2 text-right">
        {mode === "retire" ? (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Input
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("staff.inventory.retireReasonPlaceholder")}
              className="h-8 w-48"
            />
            <Button type="button" size="sm" disabled={retire.isPending || !reason.trim()} onClick={() => void sendRetirement()}>
              {t("staff.inventory.retireSubmit")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setMode(null)}>
              {t("common.cancel")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Badge tone={room.lendable ? "ok" : "neutral"}>
              {room.lendable ? t("staff.inventory.roomLendable") : t("staff.inventory.withdrawn")}
            </Badge>
            <Button type="button" variant="outline" size="sm" onClick={onEdit}>
              {t("staff.inventory.edit")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setMode("retire")}>
              {t("staff.inventory.retireUnit")}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={del.isPending} onClick={() => void handleDelete()}>
              {t("common.delete")}
            </Button>
          </div>
        )}
        {error ? (
          <div className="mt-1 flex items-center justify-end gap-1.5 text-[11px] text-[var(--s-warn-t)]">
            <span>{error}</span>
            {blocked && mode === null ? (
              <button type="button" className="underline" onClick={() => setMode("retire")}>
                {t("staff.inventory.retireUnit")}
              </button>
            ) : null}
          </div>
        ) : null}
      </td>
    </tr>
  );
}

/** "New room" / edit room (FR-EQP-04). Rooms are automatically T3. */
function RoomDialog({
  mode,
  room,
  onClose,
}: {
  mode: "create" | "edit";
  room?: ManagedRoom;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data: groups } = useManagementGroupOptions();
  const createRoom = useCreateRoom();
  const updateRoom = useUpdateRoom();

  const [manageGroupKey, setManageGroupKey] = useState<number | null>(room?.managementGroup.id ?? null);
  const [name, setName] = useState(room?.name ?? "");
  const [location, setLocation] = useState(room?.location ?? "");
  const [description, setDescription] = useState(room?.description ?? "");
  const [capacity, setCapacity] = useState(room && room.capacity !== null ? String(room.capacity) : "");
  const [creditWeight, setCreditWeight] = useState(room?.creditWeight ?? 0);
  const [lendable, setLendable] = useState(room?.lendable ?? true);
  const [openMinutes, setOpenMinutes] = useState(room?.openMinutes ?? 420);
  const [closeMinutes, setCloseMinutes] = useState(room?.closeMinutes ?? 1080);
  const [hasBreak, setHasBreak] = useState(room ? room.breakStartMinutes !== null : true);
  const [breakStart, setBreakStart] = useState(room?.breakStartMinutes ?? 720);
  const [breakEnd, setBreakEnd] = useState(room?.breakEndMinutes ?? 780);
  const [error, setError] = useState<string | null>(null);

  const busy = createRoom.isPending || updateRoom.isPending;
  const canSubmit = name.trim() !== "" && (mode === "edit" || manageGroupKey !== null);

  async function submit() {
    setError(null);
    const hours = {
      openMinutes,
      closeMinutes,
      breakStartMinutes: hasBreak ? breakStart : null,
      breakEndMinutes: hasBreak ? breakEnd : null,
    };
    try {
      if (mode === "create") {
        if (manageGroupKey === null) return;
        await createRoom.mutateAsync({
          manageGroupKey,
          name: name.trim(),
          description: description.trim() || undefined,
          location: location.trim() || undefined,
          creditWeight,
          capacity: capacity.trim() === "" ? undefined : Number(capacity),
          lendable,
          ...hours,
        });
      } else if (room) {
        await updateRoom.mutateAsync({
          resourceKey: room.resourceKey,
          name: name.trim() || undefined,
          description: description.trim(),
          location: location.trim(),
          creditWeight,
          capacity: capacity.trim() === "" ? null : Number(capacity),
          ...hours,
        });
      }
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t(mode === "create" ? "staff.inventory.newRoomTitle" : "staff.inventory.editRoomTitle")}
      subtitle={mode === "create" ? t("staff.inventory.roomAutoTierNote") : undefined}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="button" disabled={!canSubmit || busy} onClick={() => void submit()}>
            {mode === "create" ? t("staff.inventory.create") : t("common.save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mode === "create" ? (
          <Field label={t("staff.inventory.fieldDepartment")} required>
            <Select
              value={manageGroupKey !== null ? String(manageGroupKey) : ""}
              onValueChange={(v) => setManageGroupKey(Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("staff.inventory.selectPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {(groups ?? []).map((g) => (
                  <SelectItem key={g.id} value={String(g.id)}>
                    {g.name ?? `#${g.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}

        <Field label={t("staff.inventory.fieldRoomName")} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("staff.inventory.fieldLocation")}>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} />
          </Field>
          <Field label={t("staff.inventory.fieldCapacity")}>
            <Input
              type="number"
              min={1}
              max={10000}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder={t("staff.inventory.capacityPlaceholder")}
            />
          </Field>
        </div>

        <Field label={t("staff.inventory.fieldDescription")}>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </Field>

        <Field label={t("staff.inventory.fieldCreditWeight")}>
          <Input
            type="number"
            min={0}
            max={1000}
            value={creditWeight}
            onChange={(e) => setCreditWeight(Number(e.target.value))}
            className="max-w-[8rem]"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("staff.inventory.fieldOpenTime")}>
            <ClockSelect value={openMinutes} onChange={setOpenMinutes} options={CLOCK_OPTIONS.filter((m) => m < 1440)} />
          </Field>
          <Field label={t("staff.inventory.fieldCloseTime")}>
            <ClockSelect value={closeMinutes} onChange={setCloseMinutes} options={CLOCK_OPTIONS.filter((m) => m > 0)} />
          </Field>
        </div>

        <ToggleSwitch checked={hasBreak} onChange={setHasBreak} label={t("staff.inventory.fieldBreak")} />
        {hasBreak ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("staff.inventory.breakStartLabel")}>
              <ClockSelect value={breakStart} onChange={setBreakStart} />
            </Field>
            <Field label={t("staff.inventory.breakEndLabel")}>
              <ClockSelect value={breakEnd} onChange={setBreakEnd} />
            </Field>
          </div>
        ) : null}

        {mode === "create" ? (
          <ToggleSwitch checked={lendable} onChange={setLendable} label={t("staff.inventory.fieldLendable")} />
        ) : null}

        {error ? <p className="text-[13px] text-[var(--s-warn-t)]">{error}</p> : null}
      </div>
    </Modal>
  );
}

// ── Shared bits ────────────────────────────────────────────────────────────

function statusTone(unit: ManagedUnit): BadgeTone {
  if (unit.status === "Missing") return "warn";
  if (unit.status === "Lended") return "info";
  if (unit.status === "Retired") return "neutral";
  return unit.lendable ? "ok" : "neutral";
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="text-xs text-t3">{label}</div>
      <div className="mt-0.5 font-mono text-xl font-semibold tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={[
        "border-b border-border px-3.5 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.03em] text-t3",
        className ?? "",
      ].join(" ")}
    >
      {children}
    </th>
  );
}
