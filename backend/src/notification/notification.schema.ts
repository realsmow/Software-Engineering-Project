import { z } from 'zod';
import type { NotificationType as DbNotificationType } from '../generated/prisma/enums';
import { isoDateTime } from '../common/schemas/datetime.schema';
import {
  paginated,
  paginationInput,
} from '../common/schemas/pagination.schema';

/**
 * In-app notifications — the topbar bell (CONTRACT.md `notification.*`).
 *
 * Every field here mirrors the frontend's `Notification` interface in
 * `types/domain.ts`, including the snake_case type names and the two optional
 * fields. The bell renders this object directly, so a rename on either side is
 * a compile error on the other rather than an empty row at runtime.
 */
export const notificationType = z.enum([
  'request_approved',
  'request_rejected',
  'pickup_reminder',
  'due_soon',
  'overdue',
  'credit_deducted',
  'appeal_result',
]);

export type NotificationTypeWire = z.infer<typeof notificationType>;

/**
 * The Prisma enum and the wire enum are the same list in two spellings.
 *
 * Written as a total `Record` rather than a lookup with a fallback: adding a
 * value to the Prisma enum without adding it here fails to compile, which is
 * the only way to stop a new notification kind from reaching the bell as a
 * blank row.
 */
const TO_WIRE: Record<DbNotificationType, NotificationTypeWire> = {
  RequestApproved: 'request_approved',
  RequestRejected: 'request_rejected',
  PickupReminder: 'pickup_reminder',
  DueSoon: 'due_soon',
  Overdue: 'overdue',
  CreditDeducted: 'credit_deducted',
  AppealResult: 'appeal_result',
};

export function toWireType(type: DbNotificationType): NotificationTypeWire {
  return TO_WIRE[type];
}

export const notificationOutput = z.object({
  /**
   * String, not the int primary key: `Notification.id` is a string on the
   * frontend, as every domain id there is. The service stringifies the key.
   */
  id: z.string(),
  userId: z.string(),
  type: notificationType,
  title: z.string(),
  body: z.string(),
  createdAt: isoDateTime,
  /**
   * Optional rather than nullable, because the frontend declares `readAt?:
   * string`. Unread rows omit the key instead of sending null — the two are
   * not interchangeable once the type says `?`.
   */
  readAt: isoDateTime.optional(),
  /** Frontend route to open. Absent for items with nowhere to drill into. */
  linkTo: z.string().optional(),
});

export type NotificationOutput = z.infer<typeof notificationOutput>;

/**
 * The bell's list. Polled every 60s (POLLING.NOTIFICATIONS), so it is paginated
 * like every other list and never returns the account's whole history.
 */
export const listNotificationsInput = paginationInput.extend({
  /** The bell shows everything; a "only unread" filter is one flag away. */
  unreadOnly: z.boolean().default(false),
});

export type ListNotificationsInput = z.infer<typeof listNotificationsInput>;

export const paginatedNotifications = paginated(notificationOutput);

/** String id, matching `notificationOutput.id` and the frontend's call site. */
export const notificationIdInput = z.object({ id: z.string() });

/**
 * Just the badge number.
 *
 * Separate from `list` because the bell shows a count on every page while the
 * dropdown is closed, and polling a 20-row page every minute to count the
 * unread ones is a page fetch for one integer.
 */
export const unreadCountOutput = z.object({
  unread: z.number().int().min(0),
});
