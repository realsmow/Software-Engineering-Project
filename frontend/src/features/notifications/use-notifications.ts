import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { POLLING } from "@/constants";
import { queryKeys } from "@/lib/query-client";
import { useTRPCClient } from "@/lib/trpc";
import type { Notification } from "@/types/domain";

/**
 * The bell's data (CONTRACT.md `notification.*`).
 *
 * Split into two queries on purpose. The badge is on screen on every page, so
 * it polls `unreadCount` - one integer, once a minute. The list of rows is
 * only ever looked at while the dropdown is open, so it is fetched then and
 * polled only for as long as it stays open. Polling a page of twenty rows
 * every minute to render a number nobody can see is the version of this that
 * costs twenty times as much and shows the user nothing extra.
 */

/** One page is all the dropdown shows; it is not a scrollback of everything. */
const BELL_PAGE_SIZE = 20;

type NotificationPage = {
  items: Notification[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * The unread badge. Polled on every page.
 *
 * This is also what keeps the due-date reminders current: the server refreshes
 * them when this is called (see NotificationService.syncDueReminders), because
 * there is no scheduler behind them yet.
 */
export function useUnreadCount() {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: queryKeys.notificationUnread,
    queryFn: () => trpc.notification.unreadCount.query(),
    refetchInterval: POLLING.NOTIFICATIONS,
    // The badge is the one thing worth being right about after the user comes
    // back to the tab, so this opts back in to the global default.
    refetchOnWindowFocus: true,
  });
}

/**
 * The dropdown's rows, newest first.
 *
 * `enabled` is the open state: closed, this holds whatever was last fetched
 * and costs nothing. The stale time is deliberately shorter than the poll so
 * reopening the dropdown shows cached rows immediately and refreshes behind
 * them, rather than flashing a spinner every time.
 */
export function useNotifications(enabled: boolean) {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: queryKeys.notificationList,
    queryFn: (): Promise<NotificationPage> =>
      trpc.notification.list.query({ page: 1, pageSize: BELL_PAGE_SIZE }),
    enabled,
    refetchInterval: enabled ? POLLING.NOTIFICATIONS : false,
  });
}

/**
 * Marks one row read, applied locally before the server confirms.
 *
 * Optimistic because the click that marks it read is the same click that
 * navigates away: waiting for the round trip would leave the dropdown showing
 * an unread dot on a row the user has already left. The badge is decremented
 * alongside it, or the two disagree for a second.
 *
 * `onError` restores the exact snapshot rather than re-deriving it, and
 * `onSettled` re-syncs from the server either way - so a failed request ends
 * with the truth rather than with a guess.
 */
export function useMarkRead() {
  const trpc = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => trpc.notification.markRead.mutate({ id }),

    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications });

      const previousList = queryClient.getQueryData<NotificationPage>(
        queryKeys.notificationList,
      );
      const previousUnread = queryClient.getQueryData<{ unread: number }>(
        queryKeys.notificationUnread,
      );

      // Only an actually-unread row changes the badge. Clicking a row twice
      // must not take the count below what is really unread.
      const wasUnread = previousList?.items.some(
        (n) => n.id === id && !n.readAt,
      );

      if (previousList) {
        queryClient.setQueryData<NotificationPage>(queryKeys.notificationList, {
          ...previousList,
          items: previousList.items.map((n) =>
            n.id === id && !n.readAt
              ? { ...n, readAt: new Date().toISOString() }
              : n,
          ),
        });
      }

      if (previousUnread && wasUnread) {
        queryClient.setQueryData(queryKeys.notificationUnread, {
          unread: Math.max(0, previousUnread.unread - 1),
        });
      }

      return { previousList, previousUnread };
    },

    onError: (_error, _id, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(
          queryKeys.notificationList,
          context.previousList,
        );
      }
      if (context?.previousUnread) {
        queryClient.setQueryData(
          queryKeys.notificationUnread,
          context.previousUnread,
        );
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
    },
  });
}

/** "อ่านทั้งหมด" - same optimistic treatment, applied to every row at once. */
export function useMarkAllRead() {
  const trpc = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => trpc.notification.markAllRead.mutate(),

    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications });

      const previousList = queryClient.getQueryData<NotificationPage>(
        queryKeys.notificationList,
      );
      const previousUnread = queryClient.getQueryData<{ unread: number }>(
        queryKeys.notificationUnread,
      );

      const readAt = new Date().toISOString();
      if (previousList) {
        queryClient.setQueryData<NotificationPage>(queryKeys.notificationList, {
          ...previousList,
          items: previousList.items.map((n) => n.readAt ? n : { ...n, readAt }),
        });
      }
      queryClient.setQueryData(queryKeys.notificationUnread, { unread: 0 });

      return { previousList, previousUnread };
    },

    onError: (_error, _vars, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(
          queryKeys.notificationList,
          context.previousList,
        );
      }
      if (context?.previousUnread) {
        queryClient.setQueryData(
          queryKeys.notificationUnread,
          context.previousUnread,
        );
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
    },
  });
}
