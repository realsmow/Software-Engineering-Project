/**
 * Mock data for the borrower feature pages. No backend is wired yet, so these
 * stand in for the eventual API responses. Content stays Thai (DB content is
 * Thai-only per the i18n decision); enum-ish values use codes that the UI maps
 * to translation keys.
 *
 * ⚠️ Replace with real endpoints when the equipment API lands.
 */
import { DAMAGE_LEVELS, TIER_CONFIG } from "@/constants";
import type { DamageLevel, EquipmentType, Tier } from "@/types/domain";

/**
 * Catalog row = the domain EquipmentType plus the columns the catalog table
 * shows. `code` (asset tag) and `departmentId` are not on EquipmentType yet;
 * they live here as a view type so the shared domain contract stays untouched
 * until the backend schema is final.
 */
export interface CatalogItem extends EquipmentType {
  /** Asset tag printed on the item, e.g. "EE-MM-001". */
  code: string;
  departmentId: string;
  stockStatus: StockStatus;
  /**
   * Free-text blurb shown on the detail page: what it is, key specs, and any
   * handling note. Thai-only like `name` - this is DB content, not UI copy.
   * Optional so an item added without one simply hides the section.
   */
  description?: string;
}

/** Stock state shown in the filter rail - availability is a separate number. */
export type StockStatus = "ok" | "queue" | "maintenance";

export const STOCK_STATUSES: StockStatus[] = ["ok", "queue", "maintenance"];

export interface EquipmentCategory {
  id: string;
  /** i18n key suffix under borrower.catalog (catInstrument, catTool, ...). */
  labelKey: string;
}

export const EQUIPMENT_CATEGORIES: EquipmentCategory[] = [
  { id: "instrument", labelKey: "catInstrument" },
  { id: "tool", labelKey: "catTool" },
  { id: "board", labelKey: "catBoard" },
];

export interface CatalogDepartment {
  id: string;
  name: string;
}

/**
 * Departments that own catalog items. Short names on purpose - this renders in
 * a narrow table column.
 *
 * TODO: `features/admin/mock-data.ts` keeps its own (longer) department list.
 * Both should collapse into one master-data source under `src/mocks/` once the
 * departments endpoint exists; importing across features would couple two
 * owners' folders for no gain.
 */
export const CATALOG_DEPARTMENTS: CatalogDepartment[] = [
  { id: "ee", name: "ไฟฟ้า" },
  { id: "me", name: "เครื่องกล" },
  { id: "cpe", name: "คอมพิวเตอร์" },
  { id: "ie", name: "อุตสาหการ" },
  { id: "mt", name: "วัสดุ" },
  { id: "env", name: "สิ่งแวดล้อม" },
];

export function catalogDeptName(id: string): string {
  return CATALOG_DEPARTMENTS.find((d) => d.id === id)?.name ?? id;
}

export const CATALOG_ITEMS: CatalogItem[] = [
  item(
    "EE-MM-001",
    "มัลติมิเตอร์ Fluke 87V",
    "ee",
    "instrument",
    "T1",
    14,
    18,
    "มัลติมิเตอร์ดิจิทัลความแม่นยำสูง วัดแรงดัน กระแส ความต้านทาน ความถี่ และอุณหภูมิ รองรับทั้งงานวัดวงจรในห้องปฏิบัติการและงานภาคสนาม ชุดยืมประกอบด้วยตัวเครื่อง สายวัด และโพรบวัดอุณหภูมิ",
  ),
  item(
    "EE-OSC-014",
    "ออสซิลโลสโคป Keysight DSOX1204G",
    "ee",
    "instrument",
    "T2",
    2,
    6,
    "ออสซิลโลสโคป 4 ช่องสัญญาณ แบนด์วิดท์ 100 MHz พร้อมเครื่องกำเนิดสัญญาณในตัว ใช้ในวิชาปฏิบัติการวงจรอิเล็กทรอนิกส์และงานวิจัย อนุญาตให้ใช้ภายในอาคารปฏิบัติการเท่านั้น",
    { stockStatus: "queue", nextAvailableAt: "2026-08-12T13:00:00+07:00" },
  ),
  item(
    "EE-FG-003",
    "เครื่องกำเนิดสัญญาณ Rigol DG1032",
    "ee",
    "instrument",
    "T2",
    4,
    4,
    "เครื่องกำเนิดสัญญาณ 2 ช่อง ความถี่สูงสุด 30 MHz สร้างสัญญาณไซน์ สี่เหลี่ยม ฟันเลื่อย และสัญญาณกำหนดเองได้ ใช้คู่กับออสซิลโลสโคปในการทดสอบและปรับจูนวงจร",
  ),
  item(
    "ME-SOL-021",
    "ชุดบัดกรีควบคุมอุณหภูมิ",
    "me",
    "tool",
    "T0",
    9,
    12,
    "ชุดหัวแร้งควบคุมอุณหภูมิ 200–450 องศาเซลเซียส พร้อมขาตั้ง ฟองน้ำทำความสะอาด ตะกั่วบัดกรี และที่ดูดตะกั่ว เหมาะกับงานประกอบและซ่อมวงจรบนแผ่นปริ๊นต์",
  ),
  item(
    "ME-THM-002",
    "กล้องถ่ายภาพความร้อน FLIR E6",
    "me",
    "instrument",
    "T2",
    0,
    2,
    "กล้องถ่ายภาพความร้อนความละเอียด 240×180 พิกเซล ช่วงวัด −20 ถึง 250 องศาเซลเซียส ใช้ตรวจหาจุดร้อนในระบบไฟฟ้าและงานตรวจสอบเครื่องจักร ต้องคืนพร้อมกล่อง แบตเตอรี่สำรอง และสายชาร์จ",
    { stockStatus: "queue", nextAvailableAt: "2026-08-14T09:00:00+07:00" },
  ),
  item(
    "ME-CAL-045",
    "เวอร์เนียคาลิปเปอร์ดิจิทัล",
    "me",
    "tool",
    "T0",
    22,
    30,
    "เวอร์เนียคาลิปเปอร์ดิจิทัล ช่วงวัด 0–150 มิลลิเมตร ความละเอียด 0.01 มิลลิเมตร สลับหน่วยมิลลิเมตรและนิ้วได้ ใช้วัดขนาดชิ้นงานในงานเขียนแบบ งานกลึง และงานตรวจสอบคุณภาพ",
  ),
  item(
    "CPE-FPGA-008",
    "บอร์ดพัฒนา FPGA DE10-Lite",
    "cpe",
    "board",
    "T1",
    6,
    10,
    "บอร์ดพัฒนา FPGA ตระกูล MAX 10 มีสวิตช์ ไฟ LED และจอ 7-segment ในตัว ใช้ในวิชาออกแบบวงจรดิจิทัลและระบบฝังตัว ชุดยืมมาพร้อมสาย USB Blaster สำหรับโปรแกรมบอร์ด",
  ),
  item(
    "CPE-SRV-012",
    "ชุดเซอร์โวมอเตอร์ + ไดรเวอร์",
    "cpe",
    "board",
    "T1",
    3,
    8,
    "ชุดเซอร์โวมอเตอร์พร้อมไดรเวอร์และแหล่งจ่ายไฟ ใช้ทดลองระบบควบคุมตำแหน่งและงานหุ่นยนต์ ควรตรวจสอบแรงดันจ่ายให้ตรงกับสเปกก่อนเปิดใช้งานทุกครั้ง",
  ),
  item(
    "IE-3DP-001",
    "เครื่องพิมพ์สามมิติ Prusa MK4",
    "ie",
    "tool",
    "T3",
    1,
    3,
    "เครื่องพิมพ์สามมิติระบบ FDM พื้นที่พิมพ์ 250×210×220 มิลลิเมตร รองรับเส้นพลาสติก PLA PETG และ ASA ต้องจองช่วงเวลาใช้งานล่วงหน้าและใช้งานที่ห้องปฏิบัติการเท่านั้น ผู้ใช้เตรียมเส้นพลาสติกมาเอง",
    { stockStatus: "maintenance", nextAvailableAt: "2026-08-13T10:00:00+07:00" },
  ),
  item(
    "MT-TEN-004",
    "ชุดทดสอบแรงดึงวัสดุ",
    "mt",
    "tool",
    "T3",
    0,
    1,
    "เครื่องทดสอบแรงดึงขนาดตั้งโต๊ะ แรงสูงสุด 5 กิโลนิวตัน พร้อมชุดจับยึดชิ้นงานและซอฟต์แวร์บันทึกกราฟความเค้น–ความเครียด ใช้ทดสอบสมบัติเชิงกลของวัสดุ ต้องมีเจ้าหน้าที่ควบคุมตลอดการใช้งาน",
    { stockStatus: "maintenance", nextAvailableAt: "2026-08-19T09:00:00+07:00" },
  ),
  item(
    "EN-SLM-006",
    "เครื่องวัดระดับเสียง Class 1",
    "env",
    "instrument",
    "T1",
    5,
    5,
    "เครื่องวัดระดับเสียงมาตรฐาน Class 1 ช่วงวัด 30–130 เดซิเบล บันทึกข้อมูลลงหน่วยความจำในตัวได้ ใช้ในงานสำรวจมลพิษทางเสียงและงานเก็บข้อมูลภาคสนาม",
  ),
  item(
    "EE-PRB-002",
    "โพรบวัดสัญญาณ 10×",
    "ee",
    "instrument",
    "T1",
    2,
    12,
    "โพรบวัดสัญญาณสำหรับออสซิลโลสโคป เลือกอัตราทอน 1× และ 10× ได้ รองรับแบนด์วิดท์ถึง 100 MHz ชุดยืมมาพร้อมอะแดปเตอร์หัววัดและคลิปกราวด์",
  ),
  item(
    "EE-JMP-011",
    "สายจัมเปอร์ชุดใหญ่",
    "ee",
    "tool",
    "T0",
    20,
    40,
    "ชุดสายจัมเปอร์ 120 เส้น มีทั้งแบบผู้–ผู้ ผู้–เมีย และเมีย–เมีย ความยาว 10 และ 20 เซนติเมตร ใช้ต่อวงจรทดลองบนเบรดบอร์ด",
  ),
];

/**
 * Row builder - keeps the table above readable and derives everything that is
 * a function of the tier (credit weight, prep days) instead of repeating it.
 */
function item(
  code: string,
  name: string,
  departmentId: string,
  categoryId: string,
  tier: Tier,
  availableUnits: number,
  totalUnits: number,
  description: string,
  extra?: { stockStatus?: StockStatus; nextAvailableAt?: string },
): CatalogItem {
  return {
    id: `eq-${code.toLowerCase()}`,
    code,
    name,
    description,
    departmentId,
    categoryId,
    tier,
    creditWeight: TIER_CONFIG[tier].creditWeight,
    // T2 needs staff prep, T3 is slot-booked a day ahead; T0/T1 go out same day.
    prepDays: tier === "T2" || tier === "T3" ? 1 : 0,
    totalUnits,
    availableUnits,
    stockStatus: extra?.stockStatus ?? "ok",
    nextAvailableAt: extra?.nextAvailableAt,
  };
}

/* ==================== Equipment units (serials) ==================== */

export type UnitState = "free" | "fix" | "out";

export interface UnitRow {
  /** Serial printed on the unit, e.g. "EE-OSC-014-01". */
  serial: string;
  state: UnitState;
}

/** The unit list is a sample, not every serial in a 40-unit pool. */
const MAX_UNIT_ROWS = 6;

/**
 * Sample serials whose states add up to the item's real stock split - a 4/4
 * item must not list rows marked "on loan".
 *
 * Shared so the detail page's units table and the request page's T2 serial
 * picker show the same units for the same item.
 *
 * TODO: replace with GET /equipment-types/:id/units.
 */
export function unitsOf(item: CatalogItem): UnitRow[] {
  const rows = Math.max(2, Math.min(MAX_UNIT_ROWS, item.totalUnits));
  const free = item.totalUnits
    ? Math.round((item.availableUnits / item.totalUnits) * rows)
    : 0;
  const fix = item.stockStatus === "maintenance" ? Math.max(1, rows - free) : 0;

  return Array.from({ length: rows }, (_, i) => ({
    serial: `${item.code}-${String(i + 1).padStart(2, "0")}`,
    state: i < free ? "free" : i < free + fix ? "fix" : "out",
  }));
}

/* ==================== Bookable time slots (T3 rooms) ==================== */
/* Declared before ROOMS: `room()` reads TIME_SLOTS.length while the array
   is being built, and a `const` is not hoisted the way the function is. */

export interface TimeSlot {
  /** "09:00" - start of the hour, and the chip label. */
  start: string;
  /** "10:00" - end of the hour. Stored so adjacency is a clock comparison. */
  end: string;
}

/**
 * One-hour slots, 09:00–18:00. 12:00–13:00 is the lunch break and simply is
 * not on the list - which is why adjacency compares `end` to `start` rather
 * than array positions: 11:00 and 13:00 sit next to each other in this array
 * but are an hour apart on the clock, so a booking must not span them.
 */
export const TIME_SLOTS: TimeSlot[] = [
  { start: "09:00", end: "10:00" },
  { start: "10:00", end: "11:00" },
  { start: "11:00", end: "12:00" },
  { start: "13:00", end: "14:00" },
  { start: "14:00", end: "15:00" },
  { start: "15:00", end: "16:00" },
  { start: "16:00", end: "17:00" },
  { start: "17:00", end: "18:00" },
];

/** True when slot `a` ends exactly as slot `b` starts (in either order). */
export function slotsAdjacent(a: number, b: number): boolean {
  const x = TIME_SLOTS[a];
  const y = TIME_SLOTS[b];
  if (!x || !y) return false;
  return x.end === y.start || y.end === x.start;
}

/**
 * Which slot indices are already taken for a room today.
 *
 * Derived from the room's own `freeSlots` so the booking grid always agrees
 * with the "ช่วงเวลาว่างวันนี้ 3 / 8" the room list shows. The spread is
 * deterministic (every other slot, wrapping) rather than random so the grid
 * doesn't reshuffle between renders.
 *
 * TODO: replace with GET /facilities/:id/slots?date=...
 */
export function bookedSlotsOf(room: Room): Set<number> {
  const taken = new Set<number>();
  const count = Math.max(0, room.totalSlots - room.freeSlots);
  for (let step = 0, i = 0; taken.size < count && step < TIME_SLOTS.length * 2; step++) {
    taken.add(i);
    i = (i + 2) % TIME_SLOTS.length;
    // Second pass picks up the slots the stride skipped.
    if (taken.has(i) && taken.size < count) i = (i + 1) % TIME_SLOTS.length;
  }
  return taken;
}

/* ==================== Bookable rooms & spaces (T3) ==================== */

/**
 * Room booking is a separate flow from equipment lending: rooms are booked by
 * time slot rather than allocated as units, so they get their own view type
 * instead of being squeezed into CatalogItem.
 */
export type RoomType = "lab" | "meet" | "lect" | "shop";

export interface RoomTypeDef {
  id: RoomType;
  /** i18n key suffix under borrower.rooms (typeLab, typeMeet, ...). */
  labelKey: string;
}

export const ROOM_TYPES: RoomTypeDef[] = [
  { id: "lab", labelKey: "typeLab" },
  { id: "meet", labelKey: "typeMeet" },
  { id: "lect", labelKey: "typeLect" },
  { id: "shop", labelKey: "typeShop" },
];

export interface Building {
  id: string;
  name: string;
}

export const BUILDINGS: Building[] = [
  { id: "b2", name: "อาคาร 2" },
  { id: "b4", name: "อาคาร 4" },
  { id: "b9", name: "อาคาร 9" },
];

export function buildingName(id: string): string {
  return BUILDINGS.find((b) => b.id === id)?.name ?? id;
}

/** Capacity buckets for the filter rail - derived from `capacity`, not stored. */
export type CapacityBand = "s" | "m" | "l";

export const CAPACITY_BANDS: CapacityBand[] = ["s", "m", "l"];

export function capacityBand(capacity: number): CapacityBand {
  if (capacity <= 20) return "s";
  if (capacity <= 50) return "m";
  return "l";
}

export interface Room {
  id: string;
  /** Room code on the door plate, e.g. "FAC-CAD2". */
  code: string;
  name: string;
  buildingId: string;
  type: RoomType;
  /** Seats. */
  capacity: number;
  /** Bookable one-hour slots still open today, out of `totalSlots`. */
  freeSlots: number;
  totalSlots: number;
}

export const ROOMS: Room[] = [
  room("FAC-CAD2", "ห้องปฏิบัติการ CAD 2", "b9", "lab", 40, 3),
  room("FAC-COM1", "ห้องปฏิบัติการคอมพิวเตอร์ 1", "b9", "lab", 50, 5),
  room("FAC-MTG-EE", "ห้องประชุมภาควิชาไฟฟ้า", "b4", "meet", 12, 6),
  room("FAC-MTG-L3", "ห้องประชุมใหญ่ ชั้น 3", "b9", "meet", 30, 2),
  room("FAC-LEC-201", "ห้องบรรยาย 9-201", "b9", "lect", 120, 4),
  room("FAC-LEC-105", "ห้องบรรยาย 4-105", "b4", "lect", 80, 0),
  room("FAC-WS-ME", "โรงประลองเครื่องกล", "b2", "shop", 24, 3),
  room("FAC-STU-1", "ห้องสตูดิโอออกแบบ", "b9", "shop", 20, 7),
];

function room(
  code: string,
  name: string,
  buildingId: string,
  type: RoomType,
  capacity: number,
  freeSlots: number,
): Room {
  return {
    id: `room-${code.toLowerCase()}`,
    code,
    name,
    buildingId,
    type,
    capacity,
    freeSlots,
    totalSlots: TIME_SLOTS.length,
  };
}

/* ==================== My requests (borrow + booking history) ==================== */

/**
 * Requests are atomic: one physical item is one request, with its own number
 * and its own approval - matching `Reservations` in the backend schema, where
 * every row carries a `ReservationKey` and an `ApproveStatus` of its own and
 * nothing groups them into a parent document.
 *
 * So submitting a basket of five items produces five independent requests that
 * move at their own speed: a T2 item can sit waiting for a supervisor while the
 * T0 item sent alongside it is already collected.
 */
export type RequestKind = "equipment" | "room";

export type MyRequestStatus =
  | "pending"
  | "approved"
  | "preparing"
  | "ready"
  | "inUse"
  | "returned"
  | "inspecting"
  | "done"
  | "rejected"
  | "cancelled";

/**
 * Progress steps shown under each card. Equipment runs the full handling
 * chain; a room is checked in and out with photos instead of being issued and
 * inspected, so it gets its own shorter track.
 *
 * Returning and inspecting are one step, not two: the borrower hands the item
 * back at the counter and staff photograph it and check its condition right
 * there, in the same visit. Splitting them would imply the borrower has a
 * second thing to do after returning, which they do not - so the `returned`
 * and `inspecting` statuses both sit on that final step.
 */
export const EQUIPMENT_STEPS = [
  "stepSubmit",
  "stepApprove",
  "stepPrepare",
  "stepPickup",
  "stepUse",
  "stepReturnInspect",
] as const;

export const ROOM_STEPS = [
  "stepSubmit",
  "stepConfirm",
  "stepPhotoBefore",
  "stepRoomUse",
  "stepPhotoAfter",
] as const;

export function stepsOf(kind: RequestKind): readonly string[] {
  return kind === "room" ? ROOM_STEPS : EQUIPMENT_STEPS;
}

/**
 * How far along the track each status sits - the index of the step currently
 * in play. Terminal failures stay where they stopped rather than pretending to
 * have advanced.
 *
 * Because the highlighted step is the one *being worked on*, its label has to
 * name a stage, not an outcome: "Approval", never "Approved". A past-tense
 * label lands a bold green "Approved" right beside the "Awaiting approval"
 * badge and reads as the opposite of the truth.
 */
const EQUIPMENT_STEP_AT: Record<MyRequestStatus, number> = {
  pending: 1,
  approved: 2,
  preparing: 2,
  ready: 3,
  inUse: 4,
  // Both sit on the last step: returning and inspecting are one counter visit,
  // not two (see EQUIPMENT_STEPS).
  returned: 5,
  inspecting: 5,
  done: EQUIPMENT_STEPS.length,
  rejected: 1,
  cancelled: 0,
};

const ROOM_STEP_AT: Record<MyRequestStatus, number> = {
  pending: 1,
  approved: 1,
  preparing: 1,
  ready: 2,
  inUse: 3,
  returned: 4,
  inspecting: 4,
  done: ROOM_STEPS.length,
  rejected: 1,
  cancelled: 0,
};

export function stepAt(status: MyRequestStatus, kind: RequestKind): number {
  return kind === "room" ? ROOM_STEP_AT[status] : EQUIPMENT_STEP_AT[status];
}

export type RequestTab = "active" | "using" | "history";

export const REQUEST_TABS: RequestTab[] = ["active", "using", "history"];

export const STATUS_TAB: Record<MyRequestStatus, RequestTab> = {
  pending: "active",
  approved: "active",
  preparing: "active",
  ready: "active",
  inUse: "using",
  returned: "history",
  inspecting: "history",
  done: "history",
  rejected: "history",
  cancelled: "history",
};

/** Staff verdict on a returned item, and the appeal window it opens. */
export interface InspectionResult {
  damage: DamageLevel;
  inspectedAt: string;
  inspectedBy: string;
  /** Empty for B0 - nothing to explain when nothing was wrong. */
  reason?: string;
  /** Days left to appeal; 0 once the window has closed. */
  appealDaysLeft: number;
}

export interface MyRequest {
  /** The reservation number, e.g. "REQ-2569-00431". One per item - see above. */
  id: string;
  kind: RequestKind;
  tier: Tier;
  name: string;
  /** Unit serial, or the room code for a booking. */
  serial: string;
  status: MyRequestStatus;
  startDate: string;
  endDate: string;
  /** Equipment on loan: when it is due back, and how far off that is. */
  dueAt?: string;
  daysLeft?: number;
  /** Online extensions already used on this request. */
  extensionsUsed?: number;
  inspection?: InspectionResult;
}

/**
 * Credit lost to a damage verdict - item weight × damage weight, the same
 * formula the credit page and the appeal flow have to agree with.
 */
export function creditCutOf(tier: Tier, damage: DamageLevel): number {
  return TIER_CONFIG[tier].creditWeight * DAMAGE_LEVELS[damage].weight;
}

export const MY_REQUESTS: MyRequest[] = [
  // Three items sent together, three numbers, three different speeds.
  request("REQ-2569-00431", "T2", "ออสซิลโลสโคป Keysight DSOX1204G", "EE-OSC-014-01", "pending",
    "2026-08-12", "2026-08-16"),
  request("REQ-2569-00432", "T1", "โพรบวัดสัญญาณ 10×", "EE-PRB-002-04", "preparing",
    "2026-08-12", "2026-08-16"),
  request("REQ-2569-00433", "T0", "สายจัมเปอร์ชุดใหญ่", "-", "ready",
    "2026-08-12", "2026-08-16"),

  request("REQ-2569-00429", "T0", "ชุดบัดกรีควบคุมอุณหภูมิ", "ME-SOL-021-03", "ready",
    "2026-08-11", "2026-08-18"),

  booking("BKG-2569-00028", "ห้องปฏิบัติการ CAD 2", "FAC-CAD2", "ready", "2026-08-12"),

  onLoan("REQ-2569-00419", "T1", "มัลติมิเตอร์ Fluke 87V", "EE-MM-001-14",
    "2026-08-04", "2026-08-16", 4, 0),
  onLoan("REQ-2569-00415", "T1", "บอร์ดพัฒนา FPGA DE10-Lite", "CPE-FPGA-008-02",
    "2026-07-27", "2026-08-29", 17, 1),
  onLoan("REQ-2569-00423", "T2", "ออสซิลโลสโคป Keysight DSOX1204G", "EE-OSC-014-03",
    "2026-08-08", "2026-08-15", 1, 0),

  request("REQ-2569-00408", "T2", "กล้องถ่ายภาพความร้อน FLIR E6", "ME-THM-002-01", "inspecting",
    "2026-07-21", "2026-07-27"),

  inspected("REQ-2569-00396", "T1", "มัลติมิเตอร์ Fluke 87V", "EE-MM-001-21",
    "2026-07-12", "2026-07-18",
    { damage: "B1", inspectedAt: "2026-07-19", inspectedBy: "พี่แนน ใจดี", appealDaysLeft: 4,
      reason: "พบรอยขีดข่วนบนหน้าปัดและสายวัดหุ้มฉนวนถลอก" }),
  inspected("REQ-2569-00393", "T2", "กล้องถ่ายภาพความร้อน FLIR E6", "ME-THM-002-02",
    "2026-07-03", "2026-07-10",
    { damage: "B2", inspectedAt: "2026-07-12", inspectedBy: "พี่โอ๊ต", appealDaysLeft: 1,
      reason: "เลนส์มีฝ้าและปุ่มปรับโฟกัสฝืด ต้องส่งซ่อม" }),
  inspected("REQ-2569-00402", "T0", "เวอร์เนียคาลิปเปอร์ดิจิทัล", "ME-CAL-045-07",
    "2026-07-19", "2026-07-26",
    { damage: "B0", inspectedAt: "2026-07-27", inspectedBy: "พี่แนน ใจดี", appealDaysLeft: 0 }),

  request("REQ-2569-00397", "T2", "เครื่องกำเนิดสัญญาณ Rigol DG1032", "-", "rejected",
    "2026-07-15", "2026-07-19"),
];

function request(
  id: string,
  tier: Tier,
  name: string,
  serial: string,
  status: MyRequestStatus,
  startDate: string,
  endDate: string,
): MyRequest {
  return {
    id,
    kind: "equipment",
    tier,
    name,
    serial,
    status,
    startDate,
    endDate,
  };
}

/** Equipment currently out - carries the due date and extension counter. */
function onLoan(
  id: string,
  tier: Tier,
  name: string,
  serial: string,
  startDate: string,
  dueAt: string,
  daysLeft: number,
  extensionsUsed: number,
): MyRequest {
  return {
    ...request(id, tier, name, serial, "inUse", startDate, dueAt),
    dueAt,
    daysLeft,
    extensionsUsed,
  };
}

/** Returned and already judged - the request the appeal flow reads. */
function inspected(
  id: string,
  tier: Tier,
  name: string,
  serial: string,
  startDate: string,
  endDate: string,
  inspection: InspectionResult,
): MyRequest {
  return {
    ...request(id, tier, name, serial, "done", startDate, endDate),
    inspection,
  };
}

/** A room booking - same shape, its own reservation number. */
function booking(
  id: string,
  name: string,
  roomCode: string,
  status: MyRequestStatus,
  date: string,
): MyRequest {
  return {
    id,
    kind: "room",
    tier: "T3",
    name,
    serial: roomCode,
    status,
    startDate: date,
    endDate: date,
  };
}
