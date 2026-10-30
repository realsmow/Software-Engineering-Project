import { z } from 'zod';
import { resourceTier } from '../common/schemas/status.schema';
import { isoDateTime } from '../common/schemas/datetime.schema';

/**
 * Lending activity, aggregated (SRS: consolidated reports).
 *
 * Everything here is computed from rows that already exist - UsageLog for what
 * was borrowed, ResourceInfo for who owns it, ItemInfo for what it is. No
 * table was added and nothing is stored: a stored total is a total that can
 * disagree with the rows underneath it.
 */

export const departmentReport = z.object({
  manageGroupKey: z.number().int(),
  name: z.string().nullable(),
  /** Loans ever recorded against this department's units. */
  loans: z.number().int().min(0),
  /** Out with a borrower and past due, right now. */
  overdue: z.number().int().min(0),
  /** Units currently lent as a percentage of units held. 0 when it owns none. */
  utilization: z.number().int().min(0).max(100),
  unitsHeld: z.number().int().min(0),
  unitsOut: z.number().int().min(0),
});

export const topEquipment = z.object({
  itemKey: z.number().int(),
  name: z.string().nullable(),
  /** Null when the type's units sit on a rule outside T0-T3. */
  tier: resourceTier.nullable(),
  /** Times borrowed. */
  count: z.number().int().min(0),
});

export const reportSummaryOutput = z.object({
  generatedAt: isoDateTime,
  /**
   * True when the caller sees the whole institution rather than their own
   * departments. The page says which, so a staff member does not read a
   * departmental figure as a university-wide one.
   */
  unscoped: z.boolean(),
  totals: z.object({
    loans: z.number().int().min(0),
    overdue: z.number().int().min(0),
    unitsHeld: z.number().int().min(0),
    unitsOut: z.number().int().min(0),
  }),
  departments: z.array(departmentReport),
  topEquipment: z.array(topEquipment),
  /** FR-ADM-06: return inspections in the last 30 days, by condition found. */
  damage: z.array(
    z.object({
      condition: z.enum([
        'Normal',
        'MinorDamage',
        'MajorDamage',
        'Broken',
        'Missing',
      ]),
      count: z.number().int().min(0),
    }),
  ),
  /**
   * Units handed over and returned per Bangkok day, oldest first, for the
   * last 30 days including today.
   */
  daily: z.array(
    z.object({
      day: z.string(),
      borrowed: z.number().int().min(0),
      returned: z.number().int().min(0),
    }),
  ),
  /** FR-ADM-06: approved room bookings as a share of working hours, last 30 days. */
  roomUtilization: z.object({
    rooms: z.number().int().min(0),
    bookedHours: z.number().min(0),
    openHours: z.number().min(0),
    percent: z.number().int().min(0).max(100),
  }),
});

export const reportSummaryInput = z.object({
  /** How many equipment types to rank. */
  topLimit: z.number().int().min(1).max(50).default(10),
});
export type ReportSummaryInput = z.infer<typeof reportSummaryInput>;

export const reportRecordsInput = z.object({
  /** Requests whose start falls in the last N days. */
  days: z.number().int().min(1).max(365).default(90),
});
export type ReportRecordsInput = z.infer<typeof reportRecordsInput>;

/** One row per request, with its loan if it became one. For the CSV export. */
const requestRecord = z.object({
  reservationKey: z.number().int(),
  requestedAt: isoDateTime,
  borrowerId: z.string(),
  borrowerName: z.string(),
  resource: z.string(),
  tag: z.string(),
  type: z.enum(['Item', 'Room']),
  department: z.string().nullable(),
  start: isoDateTime,
  end: isoDateTime,
  reason: z.string().nullable(),
  approval: z.string(),
  decidedBy: z.string().nullable(),
  decisionNote: z.string().nullable(),
  loanStatus: z.string().nullable(),
  checkout: isoDateTime.nullable(),
  due: isoDateTime.nullable(),
  checkin: isoDateTime.nullable(),
  returnCondition: z.string().nullable(),
  penaltyPoints: z.number().int(),
  penaltyReasons: z.string(),
});

/** One row per unit or room on the shelf. */
const unitRecord = z.object({
  tag: z.string(),
  name: z.string(),
  type: z.enum(['Item', 'Room']),
  department: z.string().nullable(),
  tier: z.string(),
  status: z.string(),
  condition: z.string().nullable(),
  allowBorrow: z.boolean(),
  timesBorrowed: z.number().int(),
});

export const reportRecordsOutput = z.object({
  generatedAt: isoDateTime,
  unscoped: z.boolean(),
  requests: z.array(requestRecord),
  units: z.array(unitRecord),
});
