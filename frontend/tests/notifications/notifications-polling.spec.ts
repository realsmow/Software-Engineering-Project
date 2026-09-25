import { beforeEach, describe, expect, it, vi } from "vitest";
import { POLLING } from "../../src/constants";
import {
  useNotifications,
  useUnreadCount,
} from "../../src/features/notifications/use-notifications";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  trpc: {
    notification: {
      list: { query: vi.fn() },
      unreadCount: { query: vi.fn() },
    },
  },
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("@tanstack/react-query");
  return {
    ...actual,
    useQuery: mocks.useQuery,
    useMutation: vi.fn(),
    useQueryClient: vi.fn(),
  };
});

vi.mock("../../src/lib/trpc", () => ({
  useTRPCClient: () => mocks.trpc,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useQuery.mockImplementation((options) => options);
});

type BellNotification = { readAt?: string; title: string };
type BellState = {
  unreadCount: number;
  items: BellNotification[];
  open: boolean;
};
type NotificationQueryOptions = {
  enabled?: boolean;
  refetchInterval?: number | false;
  refetchOnWindowFocus?: boolean;
  queryFn: () => Promise<unknown>;
};

function getQueryOptions(): NotificationQueryOptions {
  return mocks.useQuery.mock.calls.at(-1)?.[0] as NotificationQueryOptions;
}

function buildNotificationBellState(items: BellNotification[]): BellState {
  return {
    unreadCount: items.filter((item) => !item.readAt).length,
    items,
    open: false,
  };
}

function togglePopover(state: BellState): BellState {
  return { ...state, open: !state.open };
}

describe("notification polling", () => {
  it("shows the unread count and opens the notification popover", () => {
    const items = [
      { readAt: undefined, title: "Approved" },
      { readAt: "2026-09-25T10:00:00.000Z", title: "Rejected" },
      { readAt: undefined, title: "Pending" },
    ];

    const bell = buildNotificationBellState(items);
    const opened = togglePopover(bell);

    expect(bell.unreadCount).toBe(2);
    expect(opened.open).toBe(true);
    expect(opened.unreadCount).toBe(2);
  });

  it("polls the unread notification count every 60 seconds", () => {
    useUnreadCount();
    const query = getQueryOptions();

    expect(query.refetchInterval).toBe(POLLING.NOTIFICATIONS);
    expect(query.refetchOnWindowFocus).toBe(true);
  });

  it("calls the notification.unreadCount procedure", async () => {
    mocks.trpc.notification.unreadCount.query.mockResolvedValue({ unread: 3 });

    useUnreadCount();
    const query = getQueryOptions();
    const result = await query.queryFn();

    expect(mocks.trpc.notification.unreadCount.query).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ unread: 3 });
  });

  it("uses the 30-second polling interval for the staff queue", () => {
    expect(POLLING.STAFF_QUEUE).toBe(30_000);
  });

  it("uses the 15-second polling interval for equipment availability", () => {
    expect(POLLING.AVAILABILITY).toBe(15_000);
  });

  it("loads paginated notifications and polls while the popover is open", async () => {
    const response = {
      items: [
        {
          id: "1",
          userId: "42",
          type: "request_approved",
          title: "Approved",
          body: "Laptop is ready for pickup",
          createdAt: "2026-09-25T10:00:00.000Z",
          linkTo: "/pickup",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    };
    mocks.trpc.notification.list.query.mockResolvedValue(response);

    useNotifications(true);
    const query = getQueryOptions();
    const result = await query.queryFn();

    expect(query.enabled).toBe(true);
    expect(query.refetchInterval).toBe(POLLING.NOTIFICATIONS);
    expect(mocks.trpc.notification.list.query).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
    });
    expect(result).toEqual(response);
  });

  it("stops polling when the popover is closed", () => {
    useNotifications(false);
    const query = getQueryOptions();

    expect(query.enabled).toBe(false);
    expect(query.refetchInterval).toBe(false);
  });
});
