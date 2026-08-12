import type { BadgeTone } from "@/components/ui/badge";
import { ROUTES } from "@/constants";

export type NotificationKind = "request" | "due" | "approval" | "system" | "return";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  /** Message text — Thai, like other mock/DB content. */
  title: string;
  detail: string;
  /** ISO timestamp. */
  at: string;
  read: boolean;
  /**
   * Where clicking the notification takes the user. Omit for informational
   * items (e.g. a maintenance announcement) that have nowhere to drill into.
   */
  route?: string;
}

/** lucide icon name + badge tone per notification kind. */
export const NOTIFICATION_META: Record<NotificationKind, { icon: string; tone: BadgeTone }> = {
  request: { icon: "file", tone: "info" },
  due: { icon: "clock", tone: "warn" },
  approval: { icon: "check-circle", tone: "ok" },
  return: { icon: "package", tone: "neutral" },
  system: { icon: "server", tone: "hot" },
};

/** Seed notifications (newest first). Content in Thai to match the mock data. */
export const MOCK_NOTIFICATIONS: AppNotification[] = [
  {
    id: "n-01",
    kind: "approval",
    title: "คำขอยืมได้รับการอนุมัติ",
    detail: "Oscilloscope Tektronix TBS1102 · พร้อมรับที่เคาน์เตอร์ภาควิชา",
    at: "2026-08-07T08:42:00+07:00",
    read: false,
    route: ROUTES.MY_LOANS,
  },
  {
    id: "n-02",
    kind: "due",
    title: "ใกล้ครบกำหนดคืน",
    detail: "Arduino Starter Kit · ครบกำหนดคืนพรุ่งนี้ 16:30 น.",
    at: "2026-08-07T07:15:00+07:00",
    read: false,
    route: ROUTES.MY_LOANS,
  },
  {
    id: "n-03",
    kind: "request",
    title: "มีคำขอยืมใหม่รอตรวจสอบ",
    detail: "ณัฐวุฒิ ศรีสุวรรณ ขอยืม Multimeter Fluke 87V จำนวน 1 ชิ้น",
    at: "2026-08-06T16:20:00+07:00",
    read: false,
    route: ROUTES.CATALOG,
  },
  {
    id: "n-04",
    kind: "return",
    title: "บันทึกการคืนอุปกรณ์แล้ว",
    detail: "Soldering Station Hakko FX-888D · สภาพปกติ",
    at: "2026-08-06T11:05:00+07:00",
    read: true,
    route: ROUTES.MY_HISTORY,
  },
  {
    id: "n-05",
    kind: "system",
    title: "ปรับปรุงระบบตามกำหนด",
    detail: "ระบบจะปิดปรับปรุงวันอาทิตย์ที่ 10 ส.ค. เวลา 01:00–02:00 น.",
    at: "2026-08-05T18:00:00+07:00",
    read: true,
  },
];
