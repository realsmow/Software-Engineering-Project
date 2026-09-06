import type { Tier } from "@/types/domain";

/** Mirrors backend/src/report/report.schema.ts. */

export interface DepartmentReport {
  manageGroupKey: number;
  name: string | null;
  loans: number;
  overdue: number;
  /** Units currently lent as a percentage of units held. */
  utilization: number;
  unitsHeld: number;
  unitsOut: number;
}

export interface TopEquipmentRow {
  itemKey: number;
  name: string | null;
  tier: Tier | null;
  count: number;
}

export interface ReportSummary {
  generatedAt: string;
  /**
   * True when these figures cover the whole institution.
   *
   * Shown on the page: a department head reading their own totals must not
   * take them for university-wide ones.
   */
  unscoped: boolean;
  totals: { loans: number; overdue: number; unitsHeld: number; unitsOut: number };
  departments: DepartmentReport[];
  topEquipment: TopEquipmentRow[];
}
