/**
 * Mock data for the borrower feature pages. No backend is wired yet, so these
 * stand in for the eventual API responses. Content stays Thai (DB content is
 * Thai-only per the i18n decision); enum-ish values use codes that the UI maps
 * to translation keys.
 *
 * ⚠️ Replace with real endpoints when the equipment API lands.
 */
import { TIER_CONFIG } from "@/constants";
import type { EquipmentType, Tier } from "@/types/domain";

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
   * handling note. Thai-only like `name` — this is DB content, not UI copy.
   * Optional so an item added without one simply hides the section.
   */
  description?: string;
}

/** Stock state shown in the filter rail — availability is a separate number. */
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
 * Departments that own catalog items. Short names on purpose — this renders in
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
 * Row builder — keeps the table above readable and derives everything that is
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
