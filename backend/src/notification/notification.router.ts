import {
  Ctx,
  Input,
  Mutation,
  Query,
  Router,
  UseMiddlewares,
} from 'nestjs-trpc';
import { AuthMiddleware } from '../trpc/auth.middleware';
import type { TrpcContext } from '../trpc/context';
import { okOutput } from '../common/schemas/ok.schema';
import {
  listNotificationsInput,
  notificationIdInput,
  paginatedNotifications,
  unreadCountOutput,
  type ListNotificationsInput,
} from './notification.schema';
import { NotificationService } from './notification.service';

/**
 * The topbar bell (CONTRACT.md `notification.*`).
 *
 * `AuthMiddleware` on the whole router, and no procedure takes an account id:
 * every one of these reads `ctx.user.accountKey`. A notification list that
 * accepted a user id would let any borrower read everyone else's, and there is
 * no legitimate caller for that — staff reviewing a borrower look at the
 * loans and the credit history, not at what the borrower was told.
 *
 * `list` and `unreadCount` are both on the polling list (60s), so both are
 * cheap: `list` is paginated and `unreadCount` returns a single integer rather
 * than making the client count a page.
 */
@Router({ alias: 'notification' })
@UseMiddlewares(AuthMiddleware)
export class NotificationRouter {
  constructor(private readonly notifications: NotificationService) {}

  /** The dropdown's contents, newest first. Polled every 60s. */
  @Query({ input: listNotificationsInput, output: paginatedNotifications })
  list(@Input() input: ListNotificationsInput, @Ctx() ctx: TrpcContext) {
    return this.notifications.list(ctx.user!.accountKey, input);
  }

  /** Just the badge count, for the bell while the dropdown is shut. */
  @Query({ output: unreadCountOutput })
  unreadCount(@Ctx() ctx: TrpcContext) {
    return this.notifications.unreadCount(ctx.user!.accountKey);
  }

  /** Marking one read — the dropdown does this on click. */
  @Mutation({ input: notificationIdInput, output: okOutput })
  markRead(@Input() input: { id: string }, @Ctx() ctx: TrpcContext) {
    return this.notifications.markRead(ctx.user!.accountKey, input.id);
  }

  /** "อ่านทั้งหมด". */
  @Mutation({ output: okOutput })
  markAllRead(@Ctx() ctx: TrpcContext) {
    return this.notifications.markAllRead(ctx.user!.accountKey);
  }
}
