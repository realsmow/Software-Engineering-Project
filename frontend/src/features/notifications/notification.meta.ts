import type { BadgeTone } from "@/components/ui/badge";
import type { NotificationType } from "@/types/domain";

/**
 * How each kind of notification looks in the bell.
 *
 * There is no adapter beside this file, and that is deliberate: the backend's
 * `notificationOutput` mirrors `Notification` in types/domain.ts field for
 * field, so rows arrive ready to render. Only the presentation - which icon,
 * which colour - is a frontend decision, and this is it.
 *
 * A total `Record` rather than a lookup with a fallback: adding a value to
 * `NotificationType` without deciding how it looks is a compile error here,
 * which is better than a new notification kind quietly rendering as a generic
 * grey row in production.
 */
export const NOTIFICATION_META: Record<
  NotificationType,
  { icon: string; tone: BadgeTone }
> = {
  request_approved: { icon: "check-circle", tone: "ok" },
  request_rejected: { icon: "x-circle", tone: "hot" },
  pickup_reminder: { icon: "package", tone: "info" },
  due_soon: { icon: "clock", tone: "warn" },
  // `alert`, not `warn`: past the deadline is a different state from
  // approaching it, and the two sit next to each other in the list.
  overdue: { icon: "clock", tone: "alert" },
  credit_deducted: { icon: "alert-triangle", tone: "alert" },
  appeal_result: { icon: "shield", tone: "info" },
};
