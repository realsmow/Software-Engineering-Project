import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";
import { th } from "date-fns/locale";

/**
 * className merger สำหรับ shadcn components + Tailwind
 * ใช้ทั่วทั้งแอป
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * แปลงวันที่เป็นข้อความไทย
 * เช่น "15 มี.ค. 2568 เวลา 14:30"
 */
export function formatThaiDate(date: string | Date, includeTime = true): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const buddhistYear = d.getFullYear() + 543;
  const dateStr = format(d, "d MMM", { locale: th });
  const timeStr = includeTime ? format(d, "HH:mm") : "";
  return includeTime
    ? `${dateStr} ${buddhistYear} เวลา ${timeStr}`
    : `${dateStr} ${buddhistYear}`;
}

/**
 * เวลาแบบสัมพัทธ์ เช่น "2 ชั่วโมงที่แล้ว", "อีก 3 วัน"
 */
export function formatRelativeThai(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatDistanceToNow(d, { locale: th, addSuffix: true });
}

/**
 * แปลงคะแนนเครดิตเป็นระดับ D0-D3
 */
export function getCreditBand(score: number): "D0" | "D1" | "D2" | "D3" {
  if (score >= 80) return "D0";
  if (score >= 50) return "D1";
  if (score >= 30) return "D2";
  return "D3";
}

/**
 * สีของ tier badge
 */
export function getTierColor(tier: "T0" | "T1" | "T2" | "T3"): string {
  const map = {
    T0: "bg-tier-t0/15 text-tier-t0 border-tier-t0/30",
    T1: "bg-tier-t1/15 text-tier-t1 border-tier-t1/30",
    T2: "bg-tier-t2/15 text-tier-t2 border-tier-t2/30",
    T3: "bg-tier-t3/15 text-tier-t3 border-tier-t3/30",
  };
  return map[tier];
}

/**
 * สีของ credit band
 */
export function getCreditBandColor(band: "D0" | "D1" | "D2" | "D3"): string {
  const map = {
    D0: "bg-credit-d0/15 text-credit-d0 border-credit-d0/30",
    D1: "bg-credit-d1/15 text-credit-d1 border-credit-d1/30",
    D2: "bg-credit-d2/15 text-credit-d2 border-credit-d2/30",
    D3: "bg-credit-d3/15 text-credit-d3 border-credit-d3/30",
  };
  return map[band];
}
