import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * className merger สำหรับ shadcn components + Tailwind
 * ใช้ทั่วทั้งแอป
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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

/**
 * Capitalises the first letter.
 *
 * Used to turn a server enum value into an i18n key suffix
 * (`operational` -> `admin.status.stateOperational`). It was copy-pasted into
 * seven files before it lived here.
 */
export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
