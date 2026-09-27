import { TIER_CONFIG } from "../../src/constants";
import type { Tier } from "../../src/types/domain";
import { toCatalogItem } from "../../src/features/borrower/catalog/item.adapter";
import { itemResponse } from "./api-responses";
import { itemTypeSummary } from "../../../backend/src/item/item.schema";

const DEPARTMENTS = [
  { id: 1, code: "ee", name: "ไฟฟ้า" },
  { id: 2, code: "me", name: "เครื่องกล" },
  { id: 3, code: "cpe", name: "คอมพิวเตอร์" },
  { id: 4, code: "ie", name: "อุตสาหการ" },
  { id: 5, code: "mt", name: "วัสดุ" },
  { id: 6, code: "env", name: "สิ่งแวดล้อม" },
];

// Fixture IDs are ItemInfo keys, not asset tags. Categories are absent from
// ItemInfo, and the real frontend adapter leaves that facet empty.
function item(
  id: number,
  name: string,
  departmentCode: string,
  tier: Tier,
  availableUnits: number,
  totalUnits: number,
  description: string,
  extra?: { maintenance?: boolean; nextAvailableAt?: string }
) {
  const department = DEPARTMENTS.find((entry) => entry.code === departmentCode);
  if (!department) throw new Error(`Unknown fixture department: ${departmentCode}`);
  if (
    availableUnits > totalUnits ||
    (availableUnits > 0 && (extra?.maintenance || extra?.nextAvailableAt))
  ) {
    throw new Error(`Inconsistent fixture availability for item ${id}`);
  }
  const stockStatus = extra?.maintenance
    ? "maintenance"
    : availableUnits > 0
      ? "ok"
      : "queue";
  return itemResponse({
    id,
    name,
    description,
    tier,
    creditWeight: TIER_CONFIG[tier].creditWeight,
    // Chosen BufferTime values for these synthetic units; T3 is same-day.
    prepDays: tier === "T2" ? 1 : 0,
    totalUnits,
    availableUnits,
    stockStatus,
    allowBorrow: stockStatus !== "maintenance",
    eligible: true,
    nextAvailableAt:
      stockStatus === "queue" && extra?.nextAvailableAt
        ? new Date(extra.nextAvailableAt).toISOString()
        : null,
    owner: { id: department.id, name: department.name, type: "Faculty" },
  });
}

export const CATALOG_ITEM_RESPONSES = [
  item(
    1,
    "มัลติมิเตอร์ Fluke 87V",
    "ee",
    "T1",
    14,
    18,
    "มัลติมิเตอร์ดิจิทัลความแม่นยำสูง วัดแรงดัน กระแส ความต้านทาน ความถี่ และอุณหภูมิ รองรับทั้งงานวัดวงจรในห้องปฏิบัติการและงานภาคสนาม ชุดยืมประกอบด้วยตัวเครื่อง สายวัด และโพรบวัดอุณหภูมิ"
  ),
  item(
    2,
    "ออสซิลโลสโคป Keysight DSOX1204G",
    "ee",
    "T2",
    2,
    6,
    "ออสซิลโลสโคป 4 ช่องสัญญาณ แบนด์วิดท์ 100 MHz พร้อมเครื่องกำเนิดสัญญาณในตัว ใช้ในวิชาปฏิบัติการวงจรอิเล็กทรอนิกส์และงานวิจัย อนุญาตให้ใช้ภายในอาคารปฏิบัติการเท่านั้น"
  ),
  item(
    3,
    "เครื่องกำเนิดสัญญาณ Rigol DG1032",
    "ee",
    "T2",
    4,
    4,
    "เครื่องกำเนิดสัญญาณ 2 ช่อง ความถี่สูงสุด 30 MHz สร้างสัญญาณไซน์ สี่เหลี่ยม ฟันเลื่อย และสัญญาณกำหนดเองได้ ใช้คู่กับออสซิลโลสโคปในการทดสอบและปรับจูนวงจร"
  ),
  item(
    4,
    "ชุดบัดกรีควบคุมอุณหภูมิ",
    "me",
    "T0",
    9,
    12,
    "ชุดหัวแร้งควบคุมอุณหภูมิ 200–450 องศาเซลเซียส พร้อมขาตั้ง ฟองน้ำทำความสะอาด ตะกั่วบัดกรี และที่ดูดตะกั่ว เหมาะกับงานประกอบและซ่อมวงจรบนแผ่นปริ๊นต์"
  ),
  item(
    5,
    "กล้องถ่ายภาพความร้อน FLIR E6",
    "me",
    "T2",
    0,
    2,
    "กล้องถ่ายภาพความร้อนความละเอียด 240×180 พิกเซล ช่วงวัด −20 ถึง 250 องศาเซลเซียส ใช้ตรวจหาจุดร้อนในระบบไฟฟ้าและงานตรวจสอบเครื่องจักร ต้องคืนพร้อมกล่อง แบตเตอรี่สำรอง และสายชาร์จ",
    { nextAvailableAt: "2026-08-14T09:00:00+07:00" }
  ),
  item(
    6,
    "เวอร์เนียคาลิปเปอร์ดิจิทัล",
    "me",
    "T0",
    22,
    30,
    "เวอร์เนียคาลิปเปอร์ดิจิทัล ช่วงวัด 0–150 มิลลิเมตร ความละเอียด 0.01 มิลลิเมตร สลับหน่วยมิลลิเมตรและนิ้วได้ ใช้วัดขนาดชิ้นงานในงานเขียนแบบ งานกลึง และงานตรวจสอบคุณภาพ"
  ),
  item(
    7,
    "บอร์ดพัฒนา FPGA DE10-Lite",
    "cpe",
    "T1",
    6,
    10,
    "บอร์ดพัฒนา FPGA ตระกูล MAX 10 มีสวิตช์ ไฟ LED และจอ 7-segment ในตัว ใช้ในวิชาออกแบบวงจรดิจิทัลและระบบฝังตัว ชุดยืมมาพร้อมสาย USB Blaster สำหรับโปรแกรมบอร์ด"
  ),
  item(
    8,
    "ชุดเซอร์โวมอเตอร์ + ไดรเวอร์",
    "cpe",
    "T1",
    3,
    8,
    "ชุดเซอร์โวมอเตอร์พร้อมไดรเวอร์และแหล่งจ่ายไฟ ใช้ทดลองระบบควบคุมตำแหน่งและงานหุ่นยนต์ ควรตรวจสอบแรงดันจ่ายให้ตรงกับสเปกก่อนเปิดใช้งานทุกครั้ง"
  ),
  item(
    9,
    "เครื่องพิมพ์สามมิติ Prusa MK4",
    "ie",
    "T3",
    0,
    3,
    "เครื่องพิมพ์สามมิติระบบ FDM พื้นที่พิมพ์ 250×210×220 มิลลิเมตร รองรับเส้นพลาสติก PLA PETG และ ASA ต้องจองช่วงเวลาใช้งานล่วงหน้าและใช้งานที่ห้องปฏิบัติการเท่านั้น ผู้ใช้เตรียมเส้นพลาสติกมาเอง",
    { maintenance: true }
  ),
  item(
    10,
    "ชุดทดสอบแรงดึงวัสดุ",
    "mt",
    "T3",
    0,
    1,
    "เครื่องทดสอบแรงดึงขนาดตั้งโต๊ะ แรงสูงสุด 5 กิโลนิวตัน พร้อมชุดจับยึดชิ้นงานและซอฟต์แวร์บันทึกกราฟความเค้น–ความเครียด ใช้ทดสอบสมบัติเชิงกลของวัสดุ ต้องมีเจ้าหน้าที่ควบคุมตลอดการใช้งาน",
    { maintenance: true }
  ),
  item(
    11,
    "เครื่องวัดระดับเสียง Class 1",
    "env",
    "T1",
    5,
    5,
    "เครื่องวัดระดับเสียงมาตรฐาน Class 1 ช่วงวัด 30–130 เดซิเบล บันทึกข้อมูลลงหน่วยความจำในตัวได้ ใช้ในงานสำรวจมลพิษทางเสียงและงานเก็บข้อมูลภาคสนาม"
  ),
  item(
    12,
    "โพรบวัดสัญญาณ 10×",
    "ee",
    "T1",
    2,
    12,
    "โพรบวัดสัญญาณสำหรับออสซิลโลสโคป เลือกอัตราทอน 1× และ 10× ได้ รองรับแบนด์วิดท์ถึง 100 MHz ชุดยืมมาพร้อมอะแดปเตอร์หัววัดและคลิปกราวด์"
  ),
  item(
    13,
    "สายจัมเปอร์ชุดใหญ่",
    "ee",
    "T0",
    20,
    40,
    "ชุดสายจัมเปอร์ 120 เส้น มีทั้งแบบผู้–ผู้ ผู้–เมีย และเมีย–เมีย ความยาว 10 และ 20 เซนติเมตร ใช้ต่อวงจรทดลองบนเบรดบอร์ด"
  ),
];

export const CATALOG_ITEMS = CATALOG_ITEM_RESPONSES.map(toCatalogItem);

// Staff and borrower lists describe the same equipment types, but expose
// different contracts. Price is unknown in these records, so it stays null.
export const MANAGED_ITEM_RESPONSES = CATALOG_ITEM_RESPONSES.map((item) =>
  itemTypeSummary.strict().parse({
    id: item.id,
    name: item.name,
    description: item.description,
    imageUrl: item.imageUrl,
    creditWeight: item.creditWeight,
    tiers: item.tier === null ? [] : [item.tier],
    totalUnits: item.totalUnits,
    availableUnits: item.availableUnits,
    price: null,
    suggestedTier: null,
  })
);
