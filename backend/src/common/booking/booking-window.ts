import type { Prisma } from '../../generated/prisma/client';
import { addDays } from '../schemas/datetime.schema';

/**
 * Which reservation states still hold a unit.
 *
 * `Rejected` and `Canceled` are gone; the other two are not. A `Pending`
 * request counts because two people may not queue for the same unit over the
 * same hours — whoever is approved second would find it already promised.
 */
export const HOLDING_APPROVE_STATES = ['Pending', 'Approved'] as const;

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
    ApproveStatus: { in: [...HOLDING_APPROVE_STATES] },
    StartTime: { lt: to },
    EndTime: { gt: from },
    ...(excludeReservationKey === undefined
      ? {}
      : { ReservationKey: { not: excludeReservationKey } }),
  };
}
