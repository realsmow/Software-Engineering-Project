import { Ctx, Input, Query, Router, UseMiddlewares } from 'nestjs-trpc';
import { StaffMiddleware } from '../trpc/auth.middleware';
import type { TrpcContext } from '../trpc/context';
import {
  reportSummaryInput,
  reportSummaryOutput,
  type ReportSummaryInput,
} from './report.schema';
import { ReportService } from './report.service';

/**
 * Consolidated reporting.
 *
 * One procedure, not a reporting framework. The page needs department totals
 * and a most-borrowed list; anything more is speculation about questions
 * nobody has asked yet.
 *
 * StaffMiddleware rather than admin: a department head reporting on their own
 * equipment is the ordinary case (SRS FR-AUTH-05), and the scope is applied
 * per row from the Authority table. An admin gets the whole institution and
 * the output says so, so a scoped figure is never mistaken for a global one.
 */
@Router({ alias: 'report' })
@UseMiddlewares(StaffMiddleware)
export class ReportRouter {
  constructor(private readonly reports: ReportService) {}

  @Query({ input: reportSummaryInput, output: reportSummaryOutput })
  summary(@Input() input: ReportSummaryInput, @Ctx() ctx: TrpcContext) {
    return this.reports.summary(ctx.user!, input);
  }
}
