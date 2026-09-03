import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import type { NotificationType as DbNotificationType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma.service';
import { BusinessError } from '../common/errors/business-error';
import { daysBetween, toIso } from '../common/schemas/datetime.schema';
import { toPage, toSkipTake } from '../common/schemas/pagination.schema';
import type { PenaltyReason } from '../common/schemas/status.schema';
import {
  toWireType,
  type ListNotificationsInput,
  type NotificationOutput,
} from './notification.schema';

/**
 * How far ahead "ใกล้ครบกำหนดคืน" looks.
 *
 * Two days rather than one: a loan due at 17:00 tomorrow, warned about at
 * 17:00 today, gives a borrower who has already left campus no working day to
 * act on it.
 */
const DUE_SOON_DAYS = 2;

/** Routes the bell opens. Must match ROUTES in frontend/src/constants. */
const ROUTE_MY_LOANS = '/my/loans';
const ROUTE_PICKUP = '/pickup';
const ROUTE_PROFILE = '/profile';

/**
 * The item as the borrower knows it — its name, not its key.
 *
 * Same nesting every caller already selects (see approval.service.ts), kept
 * here so the emitters can be handed a resource row straight from a caller's
 * transaction instead of re-querying it.
 */
export interface NotifiableResource {
  Item?: { Item: { ItemName: string | null } } | null;
  Room?: { RoomName: string | null } | null;
}

/**
 * Both name columns are nullable in the schema, and a notification is the
 * wrong place to discover that: "· ครบกำหนดคืน" with a blank subject tells the
 * borrower nothing. The generic noun is a worse message but still a message.
 */
export function resourceName(resource: NotifiableResource): string {
  return resource.Item?.Item.ItemName ?? resource.Room?.RoomName ?? 'อุปกรณ์';
}

/**
 * Thai wording for a penalty reason.
 *
 * Notifications are the one place the backend does own user-facing text —
 * unlike errors (see business-error.ts), the contract stores a rendered
 * `title` and `body`, because that is what the frontend's `Notification` type
 * declares. Thai to match the rest of the seeded content.
 */
const PENALTY_REASON_TH: Record<PenaltyReason, string> = {
  ReturnLate: 'คืนล่าช้า',
  DidntReturn: 'ไม่นำอุปกรณ์มาคืน',
  DamagedItem: 'อุปกรณ์ชำรุด',
  BrokenItem: 'อุปกรณ์เสียหาย',
  LostItem: 'อุปกรณ์สูญหาย',
};

/** A moment, as a Thai reader expects to see it. Bangkok time, never UTC. */
function thaiDateTime(at: Date): string {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(at);
}

function thaiDate(at: Date): string {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeZone: 'Asia/Bangkok',
  }).format(at);
}

/**
 * In-app notifications (CONTRACT.md `notification.*`).
 *
 * Two halves that never call each other:
 *
 *  - **Read**, for the bell: `list`, `unreadCount`, `markRead`, `markAllRead`.
 *    Every one of them is scoped to the caller's own AccountKey, taken from
 *    ctx and never from an input.
 *  - **Write**, for the other domains: one method per event worth telling a
 *    borrower about. Each takes the caller's `tx`, so a notification cannot
 *    outlive the decision that caused it — a rejection e-mail for a rejection
 *    that rolled back is worse than no notification at all.
 *
 * Every write is deduplicated on `(AccountKey, NotificationType, DedupeKey)`.
 * That is what makes the due-date reminders safe to re-run: the sweep below is
 * driven by the borrower's own polling rather than a scheduler, so it runs
 * every 60 seconds per open session and must converge on one row per loan.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // Read — the bell
  // =========================================================================

  /**
   * The caller's notifications, newest first.
   *
   * Refreshes their due-date reminders first. See `syncDueReminders` for why
   * a list query writes rows.
   */
  async list(accountKey: number, input: ListNotificationsInput) {
    await this.syncDueReminders(accountKey);

    const where: Prisma.NotificationWhereInput = {
      AccountKey: accountKey,
      ...(input.unreadOnly ? { ReadAt: null } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { CreatedAt: 'desc' },
        ...toSkipTake(input),
      }),
      this.prisma.notification.count({ where }),
    ]);

    return toPage(
      rows.map((row) => this.toOutput(row)),
      total,
      input,
    );
  }

  /** The badge number. Also refreshes reminders, since it is polled too. */
  async unreadCount(accountKey: number) {
    await this.syncDueReminders(accountKey);
    const unread = await this.prisma.notification.count({
      where: { AccountKey: accountKey, ReadAt: null },
    });
    return { unread };
  }

  /**
   * Marks one notification read.
   *
   * `updateMany` filtered by both keys rather than `update` by id: it makes
   * "not yours" and "does not exist" the same outcome, so nobody can probe
   * which notification ids exist by watching the error change.
   */
  async markRead(accountKey: number, id: string) {
    const key = Number(id);
    if (!Number.isInteger(key)) {
      throw new BusinessError('NOTIFICATION_NOT_FOUND', { id });
    }

    const { count } = await this.prisma.notification.updateMany({
      where: { NotificationKey: key, AccountKey: accountKey, ReadAt: null },
      data: { ReadAt: new Date() },
    });

    if (count === 0) {
      // Already read is not an error — the dropdown marks on click, and a
      // double click must not raise anything.
      const exists = await this.prisma.notification.count({
        where: { NotificationKey: key, AccountKey: accountKey },
      });
      if (exists === 0) {
        throw new BusinessError('NOTIFICATION_NOT_FOUND', { id });
      }
    }

    return { ok: true } as const;
  }

  /** "อ่านทั้งหมด". Touches only the unread ones, so read times stay honest. */
  async markAllRead(accountKey: number) {
    await this.prisma.notification.updateMany({
      where: { AccountKey: accountKey, ReadAt: null },
      data: { ReadAt: new Date() },
    });
    return { ok: true } as const;
  }

  // =========================================================================
  // Write — one method per event
  // =========================================================================

  /**
   * "คำขอยืมได้รับการอนุมัติ" — the request cleared the desk.
   *
   * `collectBy` is the ReservationExpiration the approval sets: an approved
   * request that is not collected in time is cancelled (§5.9), so the deadline
   * belongs in the message rather than in a second notification later.
   */
  requestApproved(
    tx: Prisma.TransactionClient,
    params: {
      accountKey: number;
      reservationKey: number;
      itemName: string;
      collectBy: Date;
    },
  ) {
    return this.emit(tx, {
      accountKey: params.accountKey,
      type: 'RequestApproved',
      title: 'คำขอยืมได้รับการอนุมัติ',
      body: `${params.itemName} · กรุณามารับภายใน ${thaiDateTime(params.collectBy)}`,
      linkTo: ROUTE_PICKUP,
      dedupeKey: reservationKeyOf(params.reservationKey),
    });
  }

  /**
   * "คำขอยืมไม่ได้รับอนุมัติ" — refused, or cancelled by someone else's approval.
   *
   * `reason` carries the decider's note when there is one. A rejection with no
   * stated reason is the common case and must still send.
   */
  requestRejected(
    tx: Prisma.TransactionClient,
    params: {
      accountKey: number;
      reservationKey: number;
      itemName: string;
      reason?: string | null;
    },
  ) {
    return this.emit(tx, {
      accountKey: params.accountKey,
      type: 'RequestRejected',
      title: 'คำขอยืมไม่ได้รับอนุมัติ',
      body: params.reason
        ? `${params.itemName} · ${params.reason}`
        : `${params.itemName} · คำขอนี้ถูกปฏิเสธ`,
      linkTo: ROUTE_MY_LOANS,
      dedupeKey: reservationKeyOf(params.reservationKey),
    });
  }

  /**
   * "อุปกรณ์พร้อมให้รับแล้ว" — staff have set a unit aside on the counter.
   *
   * Distinct from `requestApproved`: approval says the request is allowed,
   * this says a physical unit is now waiting with the borrower's name on it.
   */
  pickupReady(
    tx: Prisma.TransactionClient,
    params: {
      accountKey: number;
      usageKey: number;
      itemName: string;
      collectFrom: Date;
    },
  ) {
    return this.emit(tx, {
      accountKey: params.accountKey,
      type: 'PickupReminder',
      title: 'อุปกรณ์พร้อมให้รับแล้ว',
      body: `${params.itemName} · รับได้ที่เคาน์เตอร์ภาควิชา ตั้งแต่ ${thaiDateTime(params.collectFrom)}`,
      linkTo: ROUTE_PICKUP,
      dedupeKey: usageKeyOf(params.usageKey),
    });
  }

  /**
   * "เครดิตของคุณถูกหัก" — the caution the borrower must actually see.
   *
   * Keyed on the penalty, so the row survives re-reads and cannot double up if
   * a caller retries. `newScore` is included because the number that decides
   * how long they may borrow for is the one they will ask about.
   */
  creditDeducted(
    tx: Prisma.TransactionClient,
    params: {
      accountKey: number;
      penaltyKey: number;
      amount: number;
      reason: PenaltyReason;
      newScore: number;
      expiresAt: Date;
      /** Which item it was about — omitted when the penalty is not item-specific. */
      itemName?: string;
    },
  ) {
    const why = PENALTY_REASON_TH[params.reason];
    const about = params.itemName ? `${why} (${params.itemName})` : why;
    return this.emit(tx, {
      accountKey: params.accountKey,
      type: 'CreditDeducted',
      title: `ถูกหักเครดิต ${params.amount} คะแนน`,
      body:
        `สาเหตุ: ${about} · เครดิตคงเหลือ ${params.newScore} คะแนน` +
        ` · บทลงโทษมีผลถึง ${thaiDate(params.expiresAt)}`,
      linkTo: ROUTE_PROFILE,
      dedupeKey: `penalty:${params.penaltyKey}`,
    });
  }

  // =========================================================================
  // The due-date sweep
  // =========================================================================

  /**
   * Brings "ใกล้ครบกำหนดคืน" and "เกินกำหนดคืน" up to date for one borrower.
   *
   * **Why a list query writes rows.** The contract files these as backend cron
   * jobs (`dueSoonReminder`, `markOverdue`), and there is no scheduler in this
   * service — `admin.runCronJob` is still NOT_IMPLEMENTED and adding
   * `@nestjs/schedule` would put background writes into every test run and
   * every developer's machine. Driving it from the borrower's own 60-second
   * poll gets the reminder in front of the only person it is for, at the only
   * moment it matters, with no new moving parts. The cost is that a borrower
   * who never opens the app is never reminded — which is exactly what a real
   * scheduler would fix, and why this stays idempotent so one can be dropped
   * in front of it later without changing anything here.
   *
   * Failures are logged and swallowed. A reminder that cannot be written is
   * not a reason for the bell to return an error.
   */
  async syncDueReminders(accountKey: number): Promise<void> {
    try {
      const now = new Date();
      const horizon = new Date(now.getTime() + DUE_SOON_DAYS * 86_400_000);

      const open = await this.prisma.usageLog.findMany({
        where: {
          AccountKey: accountKey,
          // Only what is actually in the borrower's hands. `Prepared` has not
          // been collected yet and `Returned` is already back on the shelf.
          CurrentStatus: 'Lended',
          DueTime: { lt: horizon },
        },
        select: {
          UsageKey: true,
          DueTime: true,
          Resource: {
            select: {
              Item: { select: { Item: { select: { ItemName: true } } } },
              Room: { select: { RoomName: true } },
            },
          },
        },
      });

      for (const loan of open) {
        const name = resourceName(loan.Resource);
        const overdue = loan.DueTime < now;

        if (overdue) {
          const days = daysBetween(loan.DueTime, now);
          await this.emit(this.prisma, {
            accountKey,
            type: 'Overdue',
            title: 'เกินกำหนดคืนแล้ว',
            body: `${name} · เกินกำหนด ${days} วัน กรุณานำมาคืนโดยเร็วที่สุด`,
            linkTo: ROUTE_MY_LOANS,
            dedupeKey: usageKeyOf(loan.UsageKey),
          });
          continue;
        }

        await this.emit(this.prisma, {
          accountKey,
          type: 'DueSoon',
          title: 'ใกล้ครบกำหนดคืน',
          body: `${name} · ครบกำหนดคืน ${thaiDateTime(loan.DueTime)}`,
          linkTo: ROUTE_MY_LOANS,
          dedupeKey: usageKeyOf(loan.UsageKey),
        });
      }
    } catch (error) {
      this.logger.warn(
        `Could not refresh due reminders for account ${accountKey}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // =========================================================================
  // Internals
  // =========================================================================

  /**
   * Writes one notification, at most once per `dedupeKey`.
   *
   * `upsert` rather than "look then insert": the sweep runs on every poll, and
   * two tabs polling together would both find nothing and both insert. The
   * update half deliberately writes nothing — an existing reminder keeps its
   * original wording and, more importantly, its original `ReadAt`, so a
   * notification the borrower has already dismissed does not come back unread
   * a minute later.
   *
   * A null `dedupeKey` means "this may repeat" and skips the upsert entirely,
   * because a unique index cannot match on NULL.
   */
  private async emit(
    tx: Prisma.TransactionClient,
    params: {
      accountKey: number;
      type: DbNotificationType;
      title: string;
      body: string;
      linkTo?: string | null;
      dedupeKey?: string | null;
    },
  ): Promise<void> {
    const data = {
      AccountKey: params.accountKey,
      NotificationType: params.type,
      Title: params.title,
      Body: params.body,
      LinkTo: params.linkTo ?? null,
      DedupeKey: params.dedupeKey ?? null,
    };

    if (params.dedupeKey === null || params.dedupeKey === undefined) {
      await tx.notification.create({ data });
      return;
    }

    await tx.notification.upsert({
      where: {
        AccountKey_NotificationType_DedupeKey: {
          AccountKey: params.accountKey,
          NotificationType: params.type,
          DedupeKey: params.dedupeKey,
        },
      },
      create: data,
      update: {},
    });
  }

  private toOutput(row: {
    NotificationKey: number;
    AccountKey: number;
    NotificationType: DbNotificationType;
    Title: string;
    Body: string;
    LinkTo: string | null;
    CreatedAt: Date;
    ReadAt: Date | null;
  }): NotificationOutput {
    return {
      id: String(row.NotificationKey),
      userId: String(row.AccountKey),
      type: toWireType(row.NotificationType),
      title: row.Title,
      body: row.Body,
      createdAt: toIso(row.CreatedAt),
      // Omitted, not null: the frontend declares both of these optional.
      ...(row.ReadAt ? { readAt: toIso(row.ReadAt) } : {}),
      ...(row.LinkTo ? { linkTo: row.LinkTo } : {}),
    };
  }
}

/** Dedupe keys are namespaced so two domains cannot collide on a bare number. */
function usageKeyOf(usageKey: number): string {
  return `usage:${usageKey}`;
}

function reservationKeyOf(reservationKey: number): string {
  return `reservation:${reservationKey}`;
}
