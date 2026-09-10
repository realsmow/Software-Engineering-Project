import type { AppealRow } from "./appeal.types";

/**
 * TEMPORARY fixtures for the appeal desk.
 *
 * DELETE THIS FILE when `appeal.*` lands on the backend. Nothing else should
 * import it: the page reads the hook, and the hook is the one place that
 * points at this instead of tRPC.
 *
 * The rows are deliberately awkward rather than tidy, because a desk that has
 * only ever been tested against agreeable data is a desk nobody has tested:
 * one appeal has no photos at all, one disputes a grade staff already noted a
 * doubt about, and one is a B3 write-off worth the most credit.
 */
export const MOCK_APPEALS: AppealRow[] = [
  {
    appealKey: 9001,
    status: "Pending",
    filedAt: "2026-09-01T09:20:00+07:00",
    borrower: {
      accountKey: 3,
      studentId: "6410501234",
      firstName: "ณัฐวุฒิ",
      lastName: "ศรีสุวรรณ",
      creditScore: 74,
    },
    itemName: "ออสซิลโลสโคป 100MHz",
    serialNo: "EE-OSC-001",
    gradedLevel: "B2",
    creditDeducted: 9,
    staffNote: "หัววัดหักหนึ่งข้าง ตอนรับคืนไม่ได้ตรวจกล่องอุปกรณ์เสริม",
    gradedBy: "สมชาย พร้อมเจริญ",
    gradedAt: "2026-08-30T16:05:00+07:00",
    appealReason:
      "หัววัดชำรุดตั้งแต่ตอนรับของแล้ว มีรูปถ่ายตอนรับยืนยัน ขอให้ทบทวนระดับความเสียหาย",
    photos: [
      { when: "before", url: "/media/demo/osc-before.jpg" },
      { when: "after", url: "/media/demo/osc-after.jpg" },
    ],
  },
  {
    appealKey: 9002,
    status: "Pending",
    filedAt: "2026-09-02T13:45:00+07:00",
    borrower: {
      accountKey: 12,
      studentId: "6410509876",
      firstName: "ปิยะดา",
      lastName: "วงศ์อารีย์",
      creditScore: 58,
    },
    itemName: "กล้องถ่ายภาพ DSLR",
    serialNo: "MM-CAM-002",
    gradedLevel: "B3",
    creditDeducted: 15,
    staffNote: "เลนส์มีรอยลึก ประเมินว่าใช้งานต่อไม่ได้",
    gradedBy: "สมชาย พร้อมเจริญ",
    gradedAt: "2026-08-31T10:30:00+07:00",
    appealReason: "รอยเกิดจากขาตั้งของภาควิชาล้มระหว่างใช้งานในห้องปฏิบัติการ",
    // No photos: the borrower filed in a hurry. The screen has to cope.
    photos: [],
  },
  {
    appealKey: 9003,
    status: "Pending",
    filedAt: "2026-09-03T08:10:00+07:00",
    borrower: {
      accountKey: 21,
      studentId: "6410502222",
      firstName: "ธนกฤต",
      lastName: "อินทรสุวรรณ",
      creditScore: 88,
    },
    itemName: "เวอร์เนียคาลิปเปอร์ดิจิทัล",
    serialNo: "ME-CAL-003",
    gradedLevel: "B1",
    creditDeducted: 1,
    staffNote: "จอแสดงผลมีรอยขีดข่วนเล็กน้อย ไม่แน่ใจว่าเกิดก่อนหรือหลัง",
    gradedBy: "สมชาย พร้อมเจริญ",
    gradedAt: "2026-09-02T15:50:00+07:00",
    appealReason: "เป็นรอยเดิมจากการใช้งานปกติ ไม่ได้ทำเพิ่ม",
    photos: [{ when: "after", url: "/media/demo/cal-after.jpg" }],
  },
];
