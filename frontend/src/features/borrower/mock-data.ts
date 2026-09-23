/**
 * Borrower view types, shared constants (tabs, steps, the room slot list that
 * mirrors backend/src/common/booking/room-slots.ts) and the CATALOG fixture the
 * tests build on. The pages read the real API; what fabricated data is left
 * here is test fixture only.
 */
import { DAMAGE_LEVELS, TIER_CONFIG } from "@/constants";
import type { DamageLevel, EquipmentType, Tier } from "@/types/domain";

/**
 * Catalog row = the domain EquipmentType plus the columns the catalog table
 * shows. `code` (asset tag) and `owner` are not on EquipmentType yet;
 * they live here as a view type so the shared domain contract stays untouched
 * until the backend schema is final.
 */
export interface CatalogItem extends Omit<EquipmentType, "tier"> {
  /**
   * The signed-in borrower may borrow this at all, by the rule loan.create
   * applies. False means every request for it would be refused NOT_ELIGIBLE.
   */
  eligible: boolean;
  /**
   * Null when the server cannot determine one: a type with no units yet, or
   * units sitting on a BorrowRule outside T0-T3. A tier decides who approves a
   * request, so it is carried as unknown rather than defaulted - guessing T0
   * would auto-approve something nobody has classified.
   */
  tier: Tier | null;
  /** Asset tag printed on the item, e.g. "EE-MM-001". */
  code: string;
  /** Stable ManagementGroup identity supplied by the catalogue backend. */
  owner: {
    id: string;
    name: string | null;
    type: "Faculty" | "Club";
  } | null;
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
    owner: {
      id: departmentId,
      name: catalogDeptName(departmentId),
      type: "Faculty",
    },
    categoryId,
    tier,
    creditWeight: TIER_CONFIG[tier].creditWeight,
    // T2 needs staff prep, T3 is slot-booked a day ahead; T0/T1 go out same day.
    prepDays: tier === "T2" || tier === "T3" ? 1 : 0,
    totalUnits,
    availableUnits,
    stockStatus: extra?.stockStatus ?? "ok",
    nextAvailableAt: extra?.nextAvailableAt,
    eligible: true,
  };
}

/* ==================== Equipment units (serials) ==================== */

export type UnitState = "free" | "fix" | "out";
export type UnitCondition = "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing";

export interface UnitRow {
  /** ResourceInfo key when this row came from the backend. */
  resourceKey?: number;
  /** Serial printed on the unit, e.g. "EE-OSC-014-01". */
  serial: string;
  state: UnitState;
  /** Latest condition recorded by staff; null when the unit has never been assessed. */
  condition: UnitCondition | null;
  /** Backend-computed return date plus this unit's preparation time. */
  nextAvailableAt?: string;
}



/* ==================== Bookable time slots (T3 rooms) ==================== */
/* Declared before ROOMS: `room()` reads TIME_SLOTS.length while the array
   is being built, and a `const` is not hoisted the way the function is. */

export interface TimeSlot {
  /** "07:00" - start of the 30-minute period, and the chip label. */
  start: string;
  /** "07:30" - end of the period. Stored so adjacency is a clock comparison. */
  end: string;
}

/**
 * 30-minute slots, 07:00–18:00. 12:00–13:00 is the lunch break and simply is
 * not on the list - which is why adjacency compares `end` to `start` rather
 * than array positions: 11:00 and 13:00 sit next to each other in this array
 * but are an hour apart on the clock, so a booking must not span them.
 */
export const TIME_SLOTS: TimeSlot[] = [
  { start: "07:00", end: "07:30" },
  { start: "07:30", end: "08:00" },
  { start: "08:00", end: "08:30" },
  { start: "08:30", end: "09:00" },
  { start: "09:00", end: "09:30" },
  { start: "09:30", end: "10:00" },
  { start: "10:00", end: "10:30" },
  { start: "10:30", end: "11:00" },
  { start: "11:00", end: "11:30" },
  { start: "11:30", end: "12:00" },
  { start: "13:00", end: "13:30" },
  { start: "13:30", end: "14:00" },
  { start: "14:00", end: "14:30" },
  { start: "14:30", end: "15:00" },
  { start: "15:00", end: "15:30" },
  { start: "15:30", end: "16:00" },
  { start: "16:00", end: "16:30" },
  { start: "16:30", end: "17:00" },
  { start: "17:00", end: "17:30" },
  { start: "17:30", end: "18:00" },
];



/* ==================== Bookable rooms & spaces (T3) ==================== */







/** Capacity buckets for the filter rail - derived from `capacity`, not stored. */
export type CapacityBand = "s" | "m" | "l";

export const CAPACITY_BANDS: CapacityBand[] = ["s", "m", "l"];

export function capacityBand(capacity: number): CapacityBand {
  if (capacity <= 20) return "s";
  if (capacity <= 50) return "m";
  return "l";
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
  /** Backend Reservations.ReservationKey; absent on session-only room bookings. */
  reservationKey?: number;
  /** Backend's authoritative answer for whether loan.cancel is still allowed. */
  cancellable?: boolean;
  /** Present after staff allocate the request; absent on local room bookings. */
  usageKey?: number | null;
  kind: RequestKind;
  tier: Tier;
  name: string;
  /** Unit serial, or the room code for a booking. */
  serial: string;
  status: MyRequestStatus;
  startDate: string;
  endDate: string;
  /** Requested counter times for equipment. Rooms use `slots` instead. */
  pickupTime?: string;
  returnTime?: string;
  /** Equipment on loan: when it is due back, and how far off that is. */
  dueAt?: string;
  daysLeft?: number;
  /** Online extensions already used on this request. */
  extensionsUsed?: number;
  /**
   * An extension the borrower has asked for but cannot grant themselves, and
   * who has to decide it. Absent when nothing is outstanding.
   */
  extensionPending?: "staff" | "supervisor";
  /** True once an appeal against `inspection` has gone to a supervisor. */
  appealSent?: boolean;
  inspection?: InspectionResult;
  /**
   * Room bookings only: the periods reserved, as indices into `TIME_SLOTS`.
   * Equipment is borrowed by the day and has no slots, hence optional.
   *
   * The set is fixed at booking time - a room is held for the hours picked and
   * nothing more, so there is no extension to widen it later.
   */
  slots?: number[];
}

/**
 * Credit lost to a damage verdict - item weight × damage weight, the same
 * formula the credit page and the appeal flow have to agree with.
 */
export function creditCutOf(tier: Tier, damage: DamageLevel): number {
  return TIER_CONFIG[tier].creditWeight * DAMAGE_LEVELS[damage].weight;
}

/**
 * Booking statuses that still hold the room.
 *
 * Sending the request is what reserves it - approval only decides whether the
 * hold turns into a visit. So a booking still awaiting staff counts exactly as
 * much as one already in use, and the hours are released only when it is
 * cancelled, rejected, or finished.
 */
export const ACTIVE_ROOM_STATUSES: readonly MyRequestStatus[] = ["pending", "ready", "inUse"];

export function activeRoomBookings(requests: readonly MyRequest[]): MyRequest[] {
  return requests.filter((r) => r.kind === "room" && ACTIVE_ROOM_STATUSES.includes(r.status));
}







