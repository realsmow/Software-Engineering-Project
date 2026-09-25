/**
 * System status, mirroring backend/src/admin/admin.schema.ts.
 */

export type ServiceState = "operational" | "degraded" | "down";

export interface SystemStatus {
  checkedAt: string;
  uptimeSeconds: number;
  nodeVersion: string;
  database: {
    state: ServiceState;
    /** Null when the check failed outright. */
    latencyMs: number | null;
  };
  counts: {
    accounts: number;
    resources: number;
    activeLoans: number;
    pendingReservations: number;
  };
}

/**
 * `computeAvailability` and `rollupDailyStats` are not here: the backend
 * never implemented them (availability is computed live, report.summary
 * reads UsageLog on demand), so `admin.runCronJob` rejects both ids.
 */
export type CronJobId =
  | "markOverdue"
  | "markLost"
  | "expireDemerits"
  | "dueSoonReminder"
  | "openT3InspectionRounds"
  | "expireStaleRequests";

export interface CronJob {
  id: CronJobId;
  name: string;
  schedule: string;
  /**
   * False while the job has no implementation.
   *
   * The distinction matters on screen: an unimplemented job and one that has
   * simply never fired both show `lastRunAt: null`, and reading the first as
   * the second sends someone hunting a scheduler problem that does not exist.
   */
  implemented: boolean;
  lastRunAt: string | null;
  lastResult: "success" | "failed" | "pending" | null;
  durationMs: number | null;
}
