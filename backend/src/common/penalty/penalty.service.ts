import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma.service';
import { addDays, daysBetween } from '../schemas/datetime.schema';
import {
  DAMAGE_CREDIT_WEIGHT,
  type DamageLevel,
  type PenaltyReason,
} from '../schemas/status.schema';
import {
  LATE_BEFORE_EXTENSION,
  OPEN_LATE_PENALTY,
} from '../schemas/penalty.schema';
import { recomputeCredit } from '../credit/recompute-credit';

// Re-exported because the two live beside `activePenaltyWhere` now (#199) and
// the callers that reach for them think of them as this service's vocabulary.
export { LATE_BEFORE_EXTENSION, OPEN_LATE_PENALTY };

/** What a penalty will cost, worked out before anything is written. */
export interface PenaltyQuote {
  reason: PenaltyReason;
  /** Credit points to deduct. Zero means "no penalty row is written at all". */
  amount: number;
  /** How long the deduction stays in force, in days. */
  lengthDays: number;
  /** Which of the two sources decided the numbers — carried into the audit note. */
  source: 'PenaltyRule' | 'proposal-formula';
}

/**
 * Credit penalties (proposal §5.7).
 *
 * Shared by the handover desk (late returns, losses) and the inspection desk
 * (damage), because both end at the same two writes — a PenaltyInfo row and a
 * lower AccountInfo.UserCredit — and two copies of that would drift.
 *
 * Two sources of numbers, in this order:
 *
 *  1. A PenaltyRule row for the item's BorrowRule and this reason. That table
 *     is what `admin.updateLendingSettings` edits, so a department that has
 *     tuned its rules must see those numbers used.
 *  2. Otherwise the formulas from the proposal, which are stated in terms of
 *     the item's credit weight rather than a flat figure.
 *
 * Restoring credit when a penalty expires is not done here — that is the daily
 * "หมดอายุบทลงโทษ" job, which is somebody else's slice. This service only sets
 * ExpirationTime so that job has something to find.
 */
@Injectable()
export class PenaltyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cost of damage found at inspection.
   *
   * discredit = item credit weight x damage weight (0 / 1 / 3 / 5), and the
   * deduction lasts twice as many days as it cost points. B0 is fair wear and
   * costs nothing, so it returns a zero quote rather than a free penalty row.
   */
  async quoteDamage(
    borrowRuleKey: number,
    creditWeight: number,
    level: DamageLevel,
  ): Promise<PenaltyQuote> {
    const reason: PenaltyReason = level === 'B3' ? 'BrokenItem' : 'DamagedItem';

    if (level === 'B0') {
      return { reason, amount: 0, lengthDays: 0, source: 'proposal-formula' };
    }

    const rule = await this.findRule(borrowRuleKey, reason);
    if (rule) {
      return {
        reason,
        amount: rule.PenaltyAmount,
        lengthDays: rule.PenaltyLength,
        source: 'PenaltyRule',
      };
    }

    const amount = Math.round(creditWeight * DAMAGE_CREDIT_WEIGHT[level]);
    return {
      reason,
      amount,
      lengthDays: amount * 2,
      source: 'proposal-formula',
    };
  }

  /**
   * Cost of returning late.
   *
   * (credit weight / 7) per overdue day, per the proposal. The deduction bites
   * from the first late day, but its clock only starts once the thing is back
   * — which is why the caller passes the return moment and not "now".
   */
  async quoteLate(
    borrowRuleKey: number,
    creditWeight: number,
    overdueDays: number,
  ): Promise<PenaltyQuote> {
    const reason: PenaltyReason = 'ReturnLate';

    if (overdueDays <= 0) {
      return { reason, amount: 0, lengthDays: 0, source: 'proposal-formula' };
    }

    const rule = await this.findRule(borrowRuleKey, reason);
    if (rule) {
      return {
        reason,
        amount: rule.PenaltyAmount * overdueDays,
        lengthDays: rule.PenaltyLength,
        source: 'PenaltyRule',
      };
    }

    const amount = Math.ceil((creditWeight / 7) * overdueDays);
    return {
      reason,
      amount,
      lengthDays: amount * 2,
      source: 'proposal-formula',
    };
  }

  /**
   * Cost of never getting the thing back.
   *
   * The proposal charges the late penalty for the days elapsed *plus* a full
   * B3 write-off. If the item later turns up, the loss half is reversed and
   * the real damage grade charged instead — the caller does that by voiding
   * this row and quoting again.
   */
  async quoteLost(
    borrowRuleKey: number,
    creditWeight: number,
    overdueDays: number,
  ): Promise<PenaltyQuote> {
    const reason: PenaltyReason = 'LostItem';

    const rule = await this.findRule(borrowRuleKey, reason);
    if (rule) {
      return {
        reason,
        amount: rule.PenaltyAmount,
        lengthDays: rule.PenaltyLength,
        source: 'PenaltyRule',
      };
    }

    const late = Math.ceil((creditWeight / 7) * Math.max(overdueDays, 0));
    const writeOff = Math.round(creditWeight * DAMAGE_CREDIT_WEIGHT.B3);
    const amount = late + writeOff;

    return {
      reason,
      amount,
      lengthDays: amount * 2,
      source: 'proposal-formula',
    };
  }

  /**
   * Writes the penalty and docks the credit, inside the caller's transaction.
   *
   * Takes `tx` rather than using the injected client on purpose: a penalty that
   * lands without the inspection that justified it, or an inspection recorded
   * without its penalty, are both worse than the whole operation failing.
   *
   * A zero-amount quote writes nothing. There is no such thing as a penalty of
   * no consequence, and a row of them would make every credit history unreadable.
   */
  async apply(
    tx: Prisma.TransactionClient,
    quote: PenaltyQuote,
    params: {
      accountKey: number;
      usageKey: number | null;
      /** When the deduction's clock starts — the return, or the report of a loss. */
      effectiveFrom: Date;
      note?: string;
    },
  ): Promise<number | null> {
    if (quote.amount <= 0) return null;

    const penalty = await tx.penaltyInfo.create({
      data: {
        AccountKey: params.accountKey,
        UsageKey: params.usageKey,
        Reason: params.note ? `${quote.reason}: ${params.note}` : quote.reason,
        CreditDeducted: quote.amount,
        ActionTime: params.effectiveFrom,
        ExpirationTime: addDays(params.effectiveFrom, quote.lengthDays),
        Appealed: false,
        InEffect: true,
      },
      select: { PenaltyKey: true },
    });

    await recomputeCredit(tx, params.accountKey);

    return penalty.PenaltyKey;
  }

  /**
   * Brings a loan's open late penalty up to the real number of late days.
   *
   * The overnight job charges the first late day only, so the return (#195)
   * or an extension granted after the due time (#192) settles the full
   * figure here. The existing row is raised, never lowered, so nothing is
   * charged twice, and its clock restarts at `until` (#196). A row an appeal
   * already lifted is left alone. `close` marks the row as settled before an
   * extension, so it stops being the open one.
   *
   * The note is rewritten with the settled day count as well as the amount
   * (#201). The job's own note says how many days it saw the night it first
   * noticed - "overdue 1d (scheduled)" - and leaving that beside a figure
   * raised to five days reads as the final count rather than the first
   * sighting. Reason is the only sentence the borrower's credit list and the
   * return receipt have, so it has to agree with the number next to it.
   */
  async settleLate(
    tx: Prisma.TransactionClient,
    params: {
      accountKey: number;
      usageKey: number;
      borrowRuleKey: number;
      creditWeight: number;
      dueTime: Date;
      until: Date;
      close?: boolean;
    },
  ): Promise<{
    penaltyKey: number | null;
    quote: PenaltyQuote;
    raised: boolean;
  }> {
    const days = this.overdueDays(params.dueTime, params.until);
    const quote = await this.quoteLate(
      params.borrowRuleKey,
      params.creditWeight,
      days,
    );
    // Zero days means an extension moved the due date past `until`: there is
    // nothing to restate, so whatever the row already says is left alone.
    const settled = days > 0 ? `overdue ${days}d` : null;
    const note = params.close
      ? [settled, LATE_BEFORE_EXTENSION].filter(Boolean).join('; ')
      : (settled ?? undefined);
    const open = await tx.penaltyInfo.findFirst({
      where: { UsageKey: params.usageKey, ...OPEN_LATE_PENALTY },
      select: {
        PenaltyKey: true,
        CreditDeducted: true,
        InEffect: true,
        Reason: true,
      },
    });

    if (!open) {
      const penaltyKey = await this.apply(tx, quote, {
        accountKey: params.accountKey,
        usageKey: params.usageKey,
        effectiveFrom: params.until,
        note,
      });
      return { penaltyKey, quote, raised: penaltyKey !== null };
    }
    if (!open.InEffect) {
      return { penaltyKey: open.PenaltyKey, quote, raised: false };
    }

    const before = open.CreditDeducted ?? 0;
    const amount = Math.max(before, quote.amount);
    await tx.penaltyInfo.update({
      where: { PenaltyKey: open.PenaltyKey },
      data: {
        CreditDeducted: amount,
        ActionTime: params.until,
        ExpirationTime: addDays(params.until, quote.lengthDays),
        // Rewritten rather than appended: two day counts in one sentence is
        // worse than the stale one it replaces. `quote.reason` is the prefix
        // OPEN_LATE_PENALTY matches on, and the close note is what takes the
        // row out of that set.
        ...(note
          ? { Reason: `${quote.reason}: ${note}` }
          : params.close
            ? { Reason: `${open.Reason}; ${LATE_BEFORE_EXTENSION}` }
            : {}),
      },
    });
    await recomputeCredit(tx, params.accountKey);
    return {
      penaltyKey: open.PenaltyKey,
      quote: { ...quote, amount },
      raised: amount > before,
    };
  }

  /** Days a loan ran past its due time, rounded up. Zero when returned on time. */
  overdueDays(dueTime: Date, returnedAt: Date): number {
    return daysBetween(dueTime, returnedAt);
  }

  private findRule(borrowRuleKey: number, reason: PenaltyReason) {
    return this.prisma.penaltyRule.findUnique({
      where: {
        BorrowRuleKey_PenaltyReason: {
          BorrowRuleKey: borrowRuleKey,
          PenaltyReason: reason,
        },
      },
      select: { PenaltyAmount: true, PenaltyLength: true },
    });
  }
}
