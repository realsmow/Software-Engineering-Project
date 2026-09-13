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
import { localInstant, toLocalDayKey } from "@/lib/datetime";
import { BUSINESS } from "@/constants";
import { getErrorMessage, extractErrorCode, getErrorPayload } from "@/lib/error-messages";
import { validateUploadFile } from "@/lib/upload-validation";
import { fetchAllPages } from "@/lib/paging";

let passed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean) {
  if (cond) passed++;
  else failures.push(name);
}
function eq<T>(name: string, got: T, want: T) {
  check(`${name} (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`, got === want);
}

// ── §2.5 Return cutoff 17:00 Bangkok ────────────────────────────────────────
// The cutoff is 17:00 *at the counter*, which is 10:00Z - the same instant the
// backend writes into UsageLog.DueTime (DUE_TIME_OF_DAY_UTC). These cases used
// to be written with 17:00Z, i.e. midnight in Bangkok, so they asserted that a
// borrower had seven hours longer than the server was going to give them.
eq("2.5 check-in 17:00 Bangkok exactly → 0 late", returnLatePenaltyDays("2026-08-11", "2026-08-11T10:00:00.000Z"), 0);
eq("2.5 check-in 17:01 Bangkok → 1 late", returnLatePenaltyDays("2026-08-11", "2026-08-11T10:01:00.000Z"), 1);
eq("2.5 check-in 16:00 Bangkok → 0", returnLatePenaltyDays("2026-08-11", "2026-08-11T09:00:00.000Z"), 0);
eq("2.5 next day 17:00 Bangkok → 1", returnLatePenaltyDays("2026-08-11", "2026-08-12T10:00:00.000Z"), 1);
eq("2.5 next day 17:00:01 Bangkok → 2", returnLatePenaltyDays("2026-08-11", "2026-08-12T10:00:01.000Z"), 2);
// The regression itself: 22:00 Bangkok on the due day is late, not on time.
// Read as UTC it was 15:00, comfortably "before 17:00", and the screen said so
// while the server docked a day's credit.
eq("2.5 22:00 Bangkok on the due day is 1 late", returnLatePenaltyDays("2026-08-11", "2026-08-11T15:00:00.000Z"), 1);

// ── ว-08 the client deadline is the instant the server stores ───────────────
// One assertion tying the two halves together. DUE_TIME_OF_DAY_UTC is derived
// in backend/src/common/schemas/datetime.schema.ts from the same 17:00.
eq(
  "ว-08 cutoff instant matches the server's DueTime",
  localInstant("2026-08-11", BUSINESS.RETURN_CUTOFF_HOUR).toISOString(),
  "2026-08-11T10:00:00.000Z",
);
eq("ว-08 a picked day is midnight in Bangkok, not UTC", localInstant("2026-08-11").toISOString(), "2026-08-10T17:00:00.000Z");
// The classic `<input type="date">` trap, stated as a check so it stays fixed.
check("ว-08 naive parse of a picked day is NOT the counter's midnight", new Date("2026-08-11").toISOString() !== localInstant("2026-08-11").toISOString());
eq("ว-08 an evening instant keeps the Bangkok day", toLocalDayKey("2026-08-11T17:30:00.000Z"), "2026-08-12");

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

// ── fetchAllPages ───────────────────────────────────────────────────────────
// Pagination that silently drops the last page is invisible in the UI: the
// list just looks shorter. These pin the boundaries.

/** Fake server holding `total` rows, recording which pages were asked for. */
function pager(total: number) {
  const seen: number[] = [];
  const fetchPage = (page: number, pageSize: number) => {
    seen.push(page);
    const start = (page - 1) * pageSize;
    return Promise.resolve({
      items: Array.from({ length: Math.max(0, Math.min(pageSize, total - start)) }, (_, i) => start + i),
      total,
    });
  };
  return { fetchPage, seen };
}

const pagingChecks: Array<[string, () => Promise<boolean>]> = [
  ["paging: exact multiple of pageSize keeps every row", async () => {
    const p = pager(200);
    const rows = await fetchAllPages(p.fetchPage, { pageSize: 100 });
    return rows.length === 200 && rows[199] === 199;
  }],
  ["paging: partial last page keeps every row", async () => {
    const p = pager(250);
    const rows = await fetchAllPages(p.fetchPage, { pageSize: 100 });
    return rows.length === 250 && rows[249] === 249;
  }],
  ["paging: single short page makes exactly one request", async () => {
    const p = pager(7);
    const rows = await fetchAllPages(p.fetchPage, { pageSize: 100 });
    return rows.length === 7 && p.seen.length === 1;
  }],
  ["paging: empty result makes exactly one request", async () => {
    const p = pager(0);
    const rows = await fetchAllPages(p.fetchPage, { pageSize: 100 });
    return rows.length === 0 && p.seen.length === 1;
  }],
  ["paging: maxItems caps rows and pages fetched", async () => {
    const p = pager(10_000);
    const rows = await fetchAllPages(p.fetchPage, { pageSize: 100, maxItems: 500 });
    return rows.length === 500 && p.seen.length === 5;
  }],
  ["paging: pages after the first are requested together", async () => {
    const p = pager(500);
    await fetchAllPages(p.fetchPage, { pageSize: 100 });
    // Page 1 resolves before the rest are issued; 2-5 go out as one batch.
    return p.seen[0] === 1 && p.seen.slice(1).sort().join(",") === "2,3,4,5";
  }],
];

for (const [name, run] of pagingChecks) {
  eq(name, await run(), true);
}

// ── Report ──────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`❌ ${failures.length} FAILED:\n - ${failures.join("\n - ")}`);
  process.exit(1);
}
console.log(`✅ all ${passed} AC checks passed`);
