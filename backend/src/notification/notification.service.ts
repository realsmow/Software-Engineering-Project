import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mailSettings } from '../common/mail/mailer';
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
/** Where a supervisor decides a retirement request (approval.retirementQueue). */
const ROUTE_SUPERVISOR_APPROVALS = '/supervisor/approvals';
/** Where a supervisor decides an appeal (appeal.listQueue). */
const ROUTE_SUPERVISOR_APPEALS = '/supervisor/appeals';
/** Where staff manage the catalogue, including their own retirement requests. */
const ROUTE_STAFF_INVENTORY = '/staff/inventory';
const ROUTE_STAFF_QUEUE = '/staff';
const ROUTE_STAFF_ROOM_CHECKS = '/staff/repairs';

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

  constructor(
    private readonly prisma: PrismaService,
    // Optional so unit tests can build the service with Prisma alone.
    @Optional() private readonly config?: ConfigService,
  ) {}

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
   * "คำขอต่ออายุได้รับการอนุมัติ" — the loan now runs to a later date.
   *
   * Sent for the extensions a person granted *and* for the ones the system
   * granted on the spot (§5.4's online renewal): the borrower asked from a
   * screen that may already be closed, and the new due date is the thing they
   * will be penalised against.
   *
   * Rides on `RequestApproved` rather than a type of its own — the enum mirrors
   * the frontend's `NotificationType` union, and adding a value there is a
   * frontend change. `dedupeKey` is namespaced to the extension, so an
   * extension notice can never overwrite the notice for the request it grew
   * out of.
   */
  extensionApproved(
    tx: Prisma.TransactionClient,
    params: {
      accountKey: number;
      extensionKey: number;
      itemName: string;
      dueAt: Date;
      /** Nobody signed it — worth saying, so nobody waits for a reply. */
      automatic: boolean;
    },
  ) {
    return this.emit(tx, {
      accountKey: params.accountKey,
      type: 'RequestApproved',
      title: params.automatic
        ? 'ต่ออายุการยืมเรียบร้อยแล้ว'
        : 'คำขอต่ออายุได้รับการอนุมัติ',
      body: `${params.itemName} · กำหนดคืนใหม่ ${thaiDateTime(params.dueAt)}`,
      linkTo: ROUTE_MY_LOANS,
      dedupeKey: extensionKeyOf(params.extensionKey),
    });
  }

  /**
   * "คำขอต่ออายุไม่ได้รับอนุมัติ" — the original due date still stands.
   *
   * The due date is repeated in the body on purpose. A borrower who asked for
   * more time and hears only "no" has to work out for themselves what they are
   * now late against.
   */
  extensionRejected(
    tx: Prisma.TransactionClient,
    params: {
      accountKey: number;
      extensionKey: number;
      itemName: string;
      dueAt: Date;
      reason?: string | null;
    },
  ) {
    const why = params.reason ? ` · ${params.reason}` : '';
    return this.emit(tx, {
      accountKey: params.accountKey,
      type: 'RequestRejected',
      title: 'คำขอต่ออายุไม่ได้รับอนุมัติ',
      body: `${params.itemName} · กำหนดคืนเดิม ${thaiDateTime(params.dueAt)}${why}`,
      linkTo: ROUTE_MY_LOANS,
      dedupeKey: extensionKeyOf(params.extensionKey),
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

  /**
   * "ผลการอุทธรณ์: ได้รับการอนุมัติ" — the penalty has been lifted (§5.8).
   *
   * The restored figure is the body's whole point. An appeal that reduced the
   * penalty rather than cancelling it gives back the difference, and a
   * borrower told only "อนุมัติแล้ว" would expect the full amount back and
   * find a smaller number on their profile.
   */
  appealApproved(
    tx: Prisma.TransactionClient,
    params: {
      accountKey: number;
      appealKey: number;
      creditRestored: number;
      /** Omitted when the penalty was not about a particular item (a ban). */
      itemName?: string;
      note?: string | null;
    },
  ) {
    const about = params.itemName ? `${params.itemName} · ` : '';
    return this.emit(tx, {
      accountKey: params.accountKey,
      type: 'AppealResult',
      title: 'คำขออุทธรณ์ได้รับการอนุมัติ',
      body:
        `${about}คืนเครดิต ${params.creditRestored} คะแนน` +
        (params.note ? ` · ${params.note}` : ''),
      linkTo: ROUTE_PROFILE,
      dedupeKey: appealKeyOf(params.appealKey),
    });
  }

  /**
   * "ผลการอุทธรณ์: ไม่ได้รับการอนุมัติ" — the penalty stands.
   *
   * Shares `AppealResult` and the same dedupe key as the approval above, which
   * is what makes the pair safe: one appeal produces one notification, whatever
   * the answer turned out to be.
   */
  appealRejected(
    tx: Prisma.TransactionClient,
    params: {
      accountKey: number;
      appealKey: number;
      itemName?: string;
      reason?: string | null;
    },
  ) {
    const about = params.itemName ? `${params.itemName} · ` : '';
    return this.emit(tx, {
      accountKey: params.accountKey,
      type: 'AppealResult',
      title: 'คำขออุทธรณ์ไม่ได้รับการอนุมัติ',
      body: params.reason
        ? `${about}${params.reason}`
        : `${about}บทลงโทษเดิมยังมีผลอยู่`,
      linkTo: ROUTE_PROFILE,
      dedupeKey: appealKeyOf(params.appealKey),
    });
  }

  /**
   * "มีคำขอเลิกใช้งานอุปกรณ์รอการอนุมัติ" — FR-EQP-08, sent to one supervisor.
   *
   * Called once per supervisor with authority over the resource's department
   * (see `ItemManagementService.requestRetirement`), so `dedupeKey` is not
   * namespaced per recipient: the upsert's unique index already includes
   * `AccountKey`, and two supervisors of the same department must each get
   * their own row for the same request.
   */
  retirementRequested(
    tx: Prisma.TransactionClient,
    params: {
      accountKey: number;
      requestKey: number;
      resourceName: string;
      requestedBy: string;
      reason: string;
    },
  ) {
    return this.emit(tx, {
      accountKey: params.accountKey,
      type: 'RetirementRequested',
      title: 'มีคำขอเลิกใช้งานอุปกรณ์รอการอนุมัติ',
      body: `${params.resourceName} · ขอโดย ${params.requestedBy} · เหตุผล: ${params.reason}`,
      linkTo: ROUTE_SUPERVISOR_APPROVALS,
      dedupeKey: retirementRequestKeyOf(params.requestKey),
    });
  }

  /**
   * "คำขอเลิกใช้งานอุปกรณ์ได้รับการพิจารณาแล้ว" — FR-EQP-08, back to the staff
   * member who filed it. One request has one decision, so this shares its
   * dedupe key with nothing else and cannot double up on a retry.
   */
  retirementDecided(
    tx: Prisma.TransactionClient,
    params: {
      accountKey: number;
      requestKey: number;
      resourceName: string;
      decision: 'approve' | 'reject';
      note?: string | null;
    },
  ) {
    const approved = params.decision === 'approve';
    return this.emit(tx, {
      accountKey: params.accountKey,
      type: 'RetirementDecided',
      title: approved
        ? 'คำขอเลิกใช้งานอุปกรณ์ได้รับการอนุมัติ'
        : 'คำขอเลิกใช้งานอุปกรณ์ไม่ได้รับการอนุมัติ',
      body: `${params.resourceName}` + (params.note ? ` · ${params.note}` : ''),
      linkTo: ROUTE_STAFF_INVENTORY,
      dedupeKey: retirementRequestKeyOf(params.requestKey),
    });
  }

  /**
   * "มีคำขอยืมรอการอนุมัติ" — FR-NTF-04, a T2 request or a T1 request from a
   * D2/D3 borrower landed on a supervisor's desk instead of clearing on its
   * own. Sent to one supervisor at a time, same pattern as
   * `retirementRequested`: call once per supervisor with authority over the
   * resource's department.
   */
  requestNeedsSupervisor(
    tx: Prisma.TransactionClient,
    params: {
      accountKey: number;
      reservationKey: number;
      itemName: string;
    },
  ) {
    return this.emit(tx, {
      accountKey: params.accountKey,
      type: 'SupervisorApprovalNeeded',
      title: 'มีคำขอยืมรอการอนุมัติ',
      body: `${params.itemName} · รอการอนุมัติ`,
      linkTo: ROUTE_SUPERVISOR_APPROVALS,
      dedupeKey: reservationKeyOf(params.reservationKey),
    });
  }

  /**
   * "มีคำขอต่ออายุรอการอนุมัติ" — FR-NTF-04, the extension counterpart of
   * `requestNeedsSupervisor`. Shares `SupervisorApprovalNeeded` rather than a
   * type of its own, the same way `extensionApproved` shares `RequestApproved`
   * — the desk is one pile, whichever domain the row came from.
   */
  extensionNeedsSupervisor(
    tx: Prisma.TransactionClient,
    params: {
      accountKey: number;
      extensionKey: number;
      itemName: string;
    },
  ) {
    return this.emit(tx, {
      accountKey: params.accountKey,
      type: 'SupervisorApprovalNeeded',
      title: 'มีคำขอต่ออายุรอการอนุมัติ',
      body: `${params.itemName} · รอการอนุมัติ`,
      linkTo: ROUTE_SUPERVISOR_APPROVALS,
      dedupeKey: extensionKeyOf(params.extensionKey),
    });
  }

  /**
   * FR-NTF-03: a counter task for every staff member over the department.
   * One entry per task per person; the dedupe key names the task.
   */
  private async staffTask(
    tx: Prisma.TransactionClient,
    manageGroupKey: number,
    note: { title: string; body: string; linkTo: string; dedupeKey: string },
  ): Promise<void> {
    const staff = await supervisorsForGroup(tx, manageGroupKey, 'Staff');
    await Promise.all(
      staff.map((s) =>
        this.emit(tx, { accountKey: s.AccountKey, type: 'StaffTask', ...note }),
      ),
    );
  }

  /** An approved request is waiting to be set aside at the counter. */
  itemToPrepare(
    tx: Prisma.TransactionClient,
    params: {
      manageGroupKey: number;
      reservationKey: number;
      itemName: string;
    },
  ) {
    return this.staffTask(tx, params.manageGroupKey, {
      title: 'มีรายการต้องเตรียม',
      body: `${params.itemName} · อนุมัติแล้ว รอเตรียมของ`,
      linkTo: ROUTE_STAFF_QUEUE,
      dedupeKey: reservationKeyOf(params.reservationKey),
    });
  }

  /** A loan is due back within a day, or already late. */
  returnToReceive(
    tx: Prisma.TransactionClient,
    params: {
      manageGroupKey: number;
      usageKey: number;
      itemName: string;
      due: Date;
    },
  ) {
    return this.staffTask(tx, params.manageGroupKey, {
      title: 'มีรายการรอรับคืน',
      body: `${params.itemName} · ครบกำหนดคืน ${thaiDateTime(params.due)}`,
      linkTo: ROUTE_STAFF_QUEUE,
      dedupeKey: usageKeyOf(params.usageKey),
    });
  }

  /** A T3 room check round was opened. */
  roomToCheck(
    tx: Prisma.TransactionClient,
    params: {
      manageGroupKey: number;
      resourceKey: number;
      roomName: string;
      dueAt: Date;
    },
  ) {
    return this.staffTask(tx, params.manageGroupKey, {
      title: 'มีห้องต้องตรวจสภาพ',
      body: `${params.roomName} · ตรวจภายใน ${thaiDateTime(params.dueAt)}`,
      linkTo: ROUTE_STAFF_ROOM_CHECKS,
      // One per round: a room gets a new round at most once a month.
      dedupeKey: `roomcheck:${params.resourceKey}:${params.dueAt.toISOString().slice(0, 10)}`,
    });
  }

  /**
   * "มีคำขออุทธรณ์รอการพิจารณา" — FR-NTF-04, an appeal was just filed.
   *
   * Namespaced with the same `appealKeyOf` key as `appealApproved` and
   * `appealRejected`, which is safe: those go to the borrower who filed it,
   * this goes to a supervisor, and the unique index is per `AccountKey` as
   * well as per type.
   */
  appealFiled(
    tx: Prisma.TransactionClient,
    params: {
      accountKey: number;
      appealKey: number;
      reason: string;
    },
  ) {
    return this.emit(tx, {
      accountKey: params.accountKey,
      type: 'AppealFiled',
      title: 'มีคำขออุทธรณ์รอการพิจารณา',
      body: `เหตุผล: ${params.reason}`,
      linkTo: ROUTE_SUPERVISOR_APPEALS,
      dedupeKey: appealKeyOf(params.appealKey),
    });
  }

  // =========================================================================
  // The due-date sweep
  // =========================================================================

  /**
   * Brings "ใกล้ครบกำหนดคืน" and "เกินกำหนดคืน" up to date for one borrower.
   *
   * **Why a list query writes rows.** `dueSoonReminder` does run on a schedule
   * now (CronScheduler, 08:00), but it only reaches accounts that already hold
   * something: a borrower who opens the app between runs would otherwise see
   * yesterday's picture. Driving it from the borrower's own 60-second poll as
   * well gets the reminder in front of the only person it is for, at the
   * moment it matters. The two are idempotent against each other, so the
   * overlap costs nothing. The remaining gap is a borrower who never opens the
   * app and is reminded only by the job, which is exactly what a real
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

        // FR-NTF-02 emails a reminder once; the dedupe key says whether this
        // loan already had one.
        const already = await this.prisma.notification.findFirst({
          where: {
            AccountKey: accountKey,
            DedupeKey: usageKeyOf(loan.UsageKey),
            NotificationType: 'DueSoon',
          },
          select: { NotificationKey: true },
        });
        if (!already) void this.mailDueSoon(accountKey, name, loan.DueTime);

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

  /**
   * FR-NTF-02: the due-soon reminder also goes out by email, once per loan.
   * A mail failure is logged and never reaches the caller.
   */
  private async mailDueSoon(
    accountKey: number,
    name: string,
    due: Date,
  ): Promise<void> {
    if (!this.config) return;
    try {
      const account = await this.prisma.accountInfo.findUnique({
        where: { AccountKey: accountKey },
        select: { Email: true },
      });
      if (!account) return;
      const { mailer, from, appUrl } = mailSettings(this.config);
      await mailer.sendMail({
        from,
        to: account.Email,
        subject: 'ULMs: ใกล้ครบกำหนดคืน',
        text: `${name} ครบกำหนดคืน ${thaiDateTime(due)}\n\n${appUrl}${ROUTE_MY_LOANS}`,
      });
    } catch (error) {
      this.logger.warn(
        `Could not email due reminder to account ${accountKey}: ${
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

function extensionKeyOf(extensionKey: number): string {
  return `extension:${extensionKey}`;
}

function appealKeyOf(appealKey: number): string {
  return `appeal:${appealKey}`;
}

function retirementRequestKeyOf(requestKey: number): string {
  return `retirement:${requestKey}`;
}

/**
 * Supervisors with authority over one department (FR-NTF-04, FR-EQP-08).
 *
 * Same lookup `ItemManagementService.requestRetirement` uses for retirement
 * requests: role Supervisor, holding an Authority row for `manageGroupKey`.
 * Kept here, exported, so loan and appeal callers do not each grow their own
 * copy of it.
 */
export async function supervisorsForGroup(
  tx: Prisma.TransactionClient,
  manageGroupKey: number,
  role: 'Supervisor' | 'Staff' = 'Supervisor',
): Promise<{ AccountKey: number }[]> {
  return tx.accountInfo.findMany({
    where: {
      Role: { RoleName: role },
      Authorities: { some: { ManageGroupKey: manageGroupKey } },
    },
    select: { AccountKey: true },
  });
}

/**
 * Every supervisor, department unscoped.
 *
 * For an appeal against an administrative penalty (no UsageLog, so no
 * ResourceInfo.ManagedBy to key off): `appeal.listQueue` shows those to every
 * supervisor rather than filtering by department, and the notification has to
 * reach the same audience the queue does.
 */
export async function allSupervisors(
  tx: Prisma.TransactionClient,
): Promise<{ AccountKey: number }[]> {
  return tx.accountInfo.findMany({
    where: { Role: { RoleName: 'Supervisor' } },
    select: { AccountKey: true },
  });
}
