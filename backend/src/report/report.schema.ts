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
});

export const reportSummaryInput = z.object({
  /** How many equipment types to rank. */
  topLimit: z.number().int().min(1).max(50).default(10),
});
export type ReportSummaryInput = z.infer<typeof reportSummaryInput>;
