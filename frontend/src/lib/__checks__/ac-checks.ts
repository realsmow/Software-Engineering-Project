/**
 * Standalone assertions for the tester's frontend-facing AC (§2.4–2.7 + ว-06/08).
 * Not part of the app bundle - run via esbuild+node to verify the helper logic.
 */
import {
  validateLoanPeriod,
  returnLatePenaltyDays,
  activeT3SlotCount,
  canBookAnotherT3Slot,
  filterBorrowableItems,
  maxReturnDateBeforeReservation,
} from "@/lib/business-rules";
import { isIsoDate, isIsoDateTime } from "@/lib/validation";
import { getErrorMessage, extractErrorCode, getErrorPayload } from "@/lib/error-messages";
import { validateUploadFile } from "@/lib/upload-validation";

let passed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean) {
  if (cond) passed++;
  else failures.push(name);
}
function eq<T>(name: string, got: T, want: T) {
  check(`${name} (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`, got === want);
}

// ── §2.5 Return cutoff 17:00 ────────────────────────────────────────────────
eq("2.5 check-in 17:00 exactly → 0 late", returnLatePenaltyDays("2026-08-11", "2026-08-11T17:00:00.000Z"), 0);
eq("2.5 check-in 17:01 → 1 late", returnLatePenaltyDays("2026-08-11", "2026-08-11T17:01:00.000Z"), 1);
eq("2.5 check-in before cutoff → 0", returnLatePenaltyDays("2026-08-11", "2026-08-11T09:00:00.000Z"), 0);
eq("2.5 next day 17:00 → 1", returnLatePenaltyDays("2026-08-11", "2026-08-12T17:00:00.000Z"), 1);
eq("2.5 next day 17:00:01 → 2", returnLatePenaltyDays("2026-08-11", "2026-08-12T17:00:01.000Z"), 2);

// ── §2.6 T3 concurrent slots (max 2, cancelled/expired not counted) ─────────
const res = [
  { approveStatus: "approved" },
  { approveStatus: "pending" },
  { approveStatus: "cancelled" },
  { approveStatus: "expired" },
];
eq("2.6 active slot count = 2", activeT3SlotCount(res), 2);
eq("2.6 cannot book 3rd", canBookAnotherT3Slot(res), false);
eq("2.6 after cancelling one, count = 1", activeT3SlotCount([{ approveStatus: "approved" }, { approveStatus: "cancelled" }]), 1);
eq("2.6 can book when only 1 active", canBookAnotherT3Slot([{ approveStatus: "approved" }, { approveStatus: "cancelled" }]), true);

// ── §2.4 G2 loan-period ceiling ─────────────────────────────────────────────
// Next reservation starts 2026-09-01, buffer 2 days → max return 2026-08-30.
eq("2.4 G2 max return date", maxReturnDateBeforeReservation("2026-09-01T00:00:00.000Z", 2), "2026-08-30");
const g2 = validateLoanPeriod({
  startDate: "2026-08-20",
  endDate: "2026-08-31", // past the G2 ceiling
  creditBand: "D0",
  nextReservationStart: "2026-09-01T00:00:00.000Z",
  bufferDays: 2,
});
eq("2.4 G2 rejects over-ceiling", g2.ok, false);
eq("2.4 G2 reason", g2.reason, "G2_RESERVATION");
eq("2.4 G2 surfaces real max return", g2.maxReturnDate, "2026-08-30");
// Credit ceiling: D3 band caps at 5 days.
const credit = validateLoanPeriod({ startDate: "2026-08-20", endDate: "2026-08-28", creditBand: "D3" });
eq("2.4 credit ceiling rejects", credit.ok, false);
eq("2.4 credit reason", credit.reason, "CREDIT_LIMIT");
eq("2.4 credit maxDays = 5", credit.maxDays, 5);
const okPeriod = validateLoanPeriod({ startDate: "2026-08-20", endDate: "2026-08-24", creditBand: "D0" });
eq("2.4 in-bounds period ok", okPeriod.ok, true);

// ── §2.7 AllowBorrow filtering ──────────────────────────────────────────────
const items = [
  { id: "a", allowBorrow: true },
  { id: "b", allowBorrow: false },
  { id: "c" }, // undefined → treated borrowable
];
eq("2.7 filters out AllowBorrow=false", filterBorrowableItems(items).length, 2);
check("2.7 keeps allowed item", filterBorrowableItems(items).some((i) => i.id === "a"));
check("2.7 drops decommissioned item", !filterBorrowableItems(items).some((i) => i.id === "b"));

// ── ว-08 ISO date/datetime validation ───────────────────────────────────────
check("ว-08 valid iso date", isIsoDate("2026-08-11"));
check("ว-08 rejects bad month", !isIsoDate("2026-13-01"));
check("ว-08 rejects datetime as date", !isIsoDate("2026-08-11T00:00:00Z"));
check("ว-08 valid iso datetime UTC", isIsoDateTime("2026-08-11T09:30:00.000Z"));
check("ว-08 rejects offset (non-UTC)", !isIsoDateTime("2026-08-11T09:30:00+07:00"));
check("ว-08 rejects missing Z", !isIsoDateTime("2026-08-11T09:30:00"));

// ── ว-06 error-code → Thai message (tRPC-aware) ─────────────────────────────
eq("2.1 ITEM_UNAVAILABLE message", getErrorMessage({ data: { code: "ITEM_UNAVAILABLE" } }), "อุปกรณ์ชิ้นนี้ถูกยืมไปแล้ว กรุณาเลือกใหม่");
eq("2.1 SLOT_TAKEN message", getErrorMessage({ data: { code: "SLOT_TAKEN" } }), "ช่วงเวลานี้ไม่ว่างแล้ว");
eq("2.2 ALREADY_DECIDED code extracted", extractErrorCode({ data: { code: "ALREADY_DECIDED" } }), "ALREADY_DECIDED");
eq("2.3 PICKUP_EXPIRED message", getErrorMessage({ data: { code: "PICKUP_EXPIRED" } }), "หมดเวลารับของแล้ว คำขอถูกยกเลิก");
const payload = getErrorPayload({ data: { code: "ITEM_UNAVAILABLE", payload: { itemId: "x1", nextAvailableAt: "2026-08-12T10:00:00.000Z" } } });
eq("2.1 payload itemId surfaced", payload?.itemId as string, "x1");

// ── §4 File-upload validation (size + type agreement) ───────────────────────
const okImg = { name: "receipt.png", type: "image/png", size: 2 * 1024 * 1024 };
eq("4 valid png accepted", validateUploadFile(okImg).ok, true);
eq("4 oversized rejected", validateUploadFile({ ...okImg, size: 6 * 1024 * 1024 }).ok, false);
eq(
  "4 oversized → FILE_TOO_LARGE",
  (validateUploadFile({ ...okImg, size: 6 * 1024 * 1024 }) as { code?: string }).code,
  "FILE_TOO_LARGE",
);
eq("4 wrong mime rejected", validateUploadFile({ name: "a.png", type: "application/x-msdownload", size: 10 }).ok, false);
eq("4 wrong ext rejected (renamed exe)", validateUploadFile({ name: "virus.exe", type: "image/png", size: 10 }).ok, false);
eq(
  "4 wrong type → INVALID_FILE_TYPE",
  (validateUploadFile({ name: "virus.exe", type: "image/png", size: 10 }) as { code?: string }).code,
  "INVALID_FILE_TYPE",
);
eq("4 empty file rejected", validateUploadFile({ ...okImg, size: 0 }).ok, false);

// ── Report ──────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`❌ ${failures.length} FAILED:\n - ${failures.join("\n - ")}`);
  process.exit(1);
}
console.log(`✅ all ${passed} AC checks passed`);
