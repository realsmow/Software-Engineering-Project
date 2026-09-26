import {
  paginatedNotifications,
  unreadCountOutput,
} from "../../../backend/src/notification/notification.schema";
import { notificationResponse } from "../fixtures/api-responses";
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

type NotificationQueryOptions = {
  enabled?: boolean;
  refetchInterval?: number | false;
  refetchOnWindowFocus?: boolean;
  queryFn: () => Promise<unknown>;
};

function getQueryOptions(): NotificationQueryOptions {
  return mocks.useQuery.mock.calls.at(-1)?.[0] as NotificationQueryOptions;
}

describe("notification polling", () => {
  it("polls the unread notification count every 60 seconds", () => {
    useUnreadCount();
    const query = getQueryOptions();

    expect(query.refetchInterval).toBe(POLLING.NOTIFICATIONS);
    expect(query.refetchOnWindowFocus).toBe(true);
  });

  it("calls the notification.unreadCount procedure", async () => {
    mocks.trpc.notification.unreadCount.query.mockResolvedValue(
      unreadCountOutput.strict().parse({ unread: 3 })
    );

    useUnreadCount();
    const query = getQueryOptions();
    const result = await query.queryFn();

    expect(mocks.trpc.notification.unreadCount.query).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ unread: 3 });
  });

  it("loads paginated notifications and polls while the popover is open", async () => {
    const response = paginatedNotifications.strict().parse({
      items: [notificationResponse({ id: "1", title: "Approved" })],
      total: 1,
      page: 1,
      pageSize: 20,
    });
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
