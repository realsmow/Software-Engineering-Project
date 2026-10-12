import type { Prisma } from '../../generated/prisma/client';
import { BusinessError } from '../errors/business-error';
import { addDays } from '../schemas/datetime.schema';
import type { ResourceStatus } from '../schemas/status.schema';
import { UNAVAILABLE_USAGE_STATES } from '../usage/usage-states';

/**
 * Which reservation states still hold a unit.
 *
 * `Rejected` and `Canceled` are gone; the other two are not. A `Pending`
 * request counts because two people may not queue for the same unit over the
 * same hours — whoever is approved second would find it already promised.
 */
export const HOLDING_APPROVE_STATES = ['Pending', 'Approved'] as const;

/**
 * A reservation that still holds its window.
 *
 * Approved stays Approved after the loan ends, so status alone kept a unit
 * returned early blocked until the original end date. The booking is spent
 * once its loan is inspected, not merely returned: room slots read only
 * bookings, and a returned room may still go to repair.
 */
export const HOLDING_RESERVATION = {
  ApproveStatus: { in: [...HOLDING_APPROVE_STATES] },
  UsageLogs: { none: { CurrentStatus: 'Inspected' } },
} satisfies Prisma.ReservationsWhereInput;

/**
 * When an approved request stops being held for its borrower.
 *
 * §5.9: a request not collected within a day is cancelled. The day starts when
 * the borrow window opens, not at approval: a request approved today for next
 * month cannot be collected before next month, and a hold counted from today
 * would let the expiry job cancel it first.
 */
export const COLLECT_WITHIN_DAYS = 1;

export function collectDeadline(startTime: Date, now: Date): Date {
  return addDays(startTime > now ? startTime : now, COLLECT_WITHIN_DAYS);
}

/**
 * When a loan may be collected. A few minutes early is ordinary (a borrower at
 * the counter at 08:50 for a 09:00 pickup); anything earlier is an early
 * handover, which only staff can grant (`loan.confirmPickup` with `early`).
 */
export const PICKUP_GRACE_MINUTES = 15;

export function pickupOpensAt(startTime: Date): Date {
  return new Date(startTime.getTime() - PICKUP_GRACE_MINUTES * 60_000);
}

/**
 * The far edge of the same window (#212).
 *
 * `pickupOpensAt` says a handover cannot happen too early; this says it cannot
 * happen too late. A room is booked by the half-hour, so "collect it whenever"
 * has an end: checking in at 09:31 against a 09:00-09:30 slot would open a
 * loan that was already over, and the room would then read as in use for a
 * period somebody else may have booked. Equipment is the same shape with days
 * in place of minutes - a prepared loan collected past its due date is a loan
 * that starts overdue.
 *
 * Shared by both handover doors (`loan.confirmMyPickup` and the counter's
 * `loan.confirmPickup`) rather than written twice: a rule only one of them
 * enforces is a rule the other one is a way around.
 */
export function assertPickupWindowOpen(
  usageKey: number,
  dueTime: Date,
  now: Date,
): void {
  if (now < dueTime) return;
  throw new BusinessError('PICKUP_WINDOW_PASSED', {
    usageKey,
    endedAt: dueTime.toISOString(),
  });
}

/**
 * Refuses a unit nobody may be handed.
 *
 * The same three-way answer `loan.create` gives when a request is opened, made
 * shared because the two checks are the same question asked at two moments and
 * the gap between them is days long. A room sent to repair after it was
 * prepared is the case that found this (#213): the booking was already made,
 * the unit was already set aside, and nothing looked again on the way out, so
 * a room staff had just marked broken could still be checked into.
 */
export function assertResourceLendable(
  resourceKey: number,
  resource: { ResourceStatus: ResourceStatus; AllowBorrow: boolean },
): void {
  // Retired is checked on its own: AllowBorrow alone can be flipped back.
  if (
    resource.AllowBorrow &&
    resource.ResourceStatus !== 'Missing' &&
    resource.ResourceStatus !== 'Retired'
  ) {
    return;
  }
  throw new BusinessError('ITEM_UNAVAILABLE', {
    resourceKey,
    reason:
      resource.ResourceStatus === 'Retired'
        ? 'RETIRED'
        : resource.AllowBorrow
          ? 'MISSING'
          : 'NOT_LENDABLE',
  });
}

/**
 * Turns a requested window into the range that must be free.
 *
 * `ResourceInfo.BufferTime` is the days staff need around a loan — checking a
 * unit back in, testing it, charging it — so it is applied on *both* sides.
 * A one-day buffer on a unit due back Friday means the next borrower cannot
 * start before Saturday, and someone whose loan ends Thursday cannot be
 * followed by a Friday pickup.
 *
 * The buffer belongs to the unit, not to either request: it is the same delay
 * whichever direction the clash comes from.
 */
export function withBuffer(
  startTime: Date,
  endTime: Date,
  bufferDays: number,
): { from: Date; to: Date } {
  return {
    from: addDays(startTime, -bufferDays),
    to: addDays(endTime, bufferDays),
  };
}

/**
 * A Prisma filter for "reservations on this unit that clash with this window".
 *
 * Half-open on purpose: a booking that ends exactly when another starts does
 * not clash, once the buffer has already pushed them apart. Without that, a
 * room booked 09:00-10:00 would block the 10:00-11:00 slot on a zero-buffer
 * resource, and every back-to-back lecture slot would be unbookable.
 */
export function clashingWindowFilter(
  resourceKey: number,
  from: Date,
  to: Date,
  excludeReservationKey?: number,
): Prisma.ReservationsWhereInput {
  return {
    ResourceKey: resourceKey,
    ...HOLDING_RESERVATION,
    StartTime: { lt: to },
    EndTime: { gt: from },
    ...(excludeReservationKey === undefined
      ? {}
      : { ReservationKey: { not: excludeReservationKey } }),
  };
}

/**
 * A Prisma filter for "a loan on this unit that clashes with this window".
 *
 * The second half of the rule `loan.create` enforces: a unit physically out on
 * an older loan blocks the window even with no reservation behind it, which is
 * what a walk-in loan recorded at the counter looks like.
 *
 * Both ends are compared, like `clashingWindowFilter`. `DueTime > from` alone
 * was enough while a loan ran for days and a request was always for later
 * days, but a room is booked by the half-hour: a 13:00-14:00 booking prepared
 * for somebody else made every slot that morning unbookable, because its due
 * time is after 09:00 and nothing asked whether it had started yet (#214).
 */
export function heldUsageFilter(
  resourceKey: number,
  from: Date,
  to?: Date,
): Prisma.UsageLogWhereInput {
  return {
    ResourceKey: resourceKey,
    OR: [
      {
        CurrentStatus: {
          in: UNAVAILABLE_USAGE_STATES.filter((s) => s !== 'Returned'),
        },
        DueTime: { gt: from },
        // `allocate` writes the booked pickup time into CheckoutTime, so this
        // is the other edge of the same window. Omitted by a caller that has
        // only one instant to compare, which keeps the old behaviour.
        ...(to === undefined ? {} : { CheckoutTime: { lt: to } }),
      },
      // Back and not yet graded: nobody knows yet whether it can go out again,
      // so it holds every window until staff have looked at it. Keyed on the
      // due date instead, it read as free the moment it was handed back.
      { CurrentStatus: 'Returned' },
    ],
  };
}

/** The Prisma calls `resourcesFreeInWindow` needs, and nothing else. */
interface WindowReader {
  reservations: {
    findMany(args: {
      where: Prisma.ReservationsWhereInput;
      select: { ResourceKey: true };
    }): Promise<{ ResourceKey: number }[]>;
  };
  usageLog: {
    findMany(args: {
      where: Prisma.UsageLogWhereInput;
      select: { ResourceKey: true };
    }): Promise<{ ResourceKey: number }[]>;
  };
}

/**
 * Which of these resources could be booked for `[startTime, endTime)`.
 *
 * The catalogue's answer to the same question `loan.create` asks one resource
 * at a time, asked for many in two queries. It is built from the same two
 * filters, clashingWindowFilter and heldUsageFilter, with each resource's own
 * buffer, so the catalogue cannot offer a unit for a period that the request
 * would then refuse.
 */
export async function resourcesFreeInWindow(
  prisma: WindowReader,
  resources: { ResourceKey: number; BufferTime: number }[],
  startTime: Date,
  endTime: Date,
): Promise<Set<number>> {
  if (resources.length === 0) return new Set();

  const windows = resources.map((r) => ({
    key: r.ResourceKey,
    ...withBuffer(startTime, endTime, r.BufferTime),
  }));

  const [reserved, held] = await Promise.all([
    prisma.reservations.findMany({
      where: {
        OR: windows.map((w) => clashingWindowFilter(w.key, w.from, w.to)),
      },
      select: { ResourceKey: true },
    }),
    prisma.usageLog.findMany({
      where: { OR: windows.map((w) => heldUsageFilter(w.key, w.from, w.to)) },
      select: { ResourceKey: true },
    }),
  ]);

  const blocked = new Set([...reserved, ...held].map((row) => row.ResourceKey));
  return new Set(windows.map((w) => w.key).filter((key) => !blocked.has(key)));
}

/**
 * Read-then-write booking clashes need Serializable; the machinery for running
 * one and retrying a lost race is generic enough that the organisation deletes
 * use it too, so it lives in `common/db`. Re-exported here because every
 * booking caller reaches for it alongside the filters above.
 */
export { runSerializable, type SerializableRunner } from '../db/serializable';
