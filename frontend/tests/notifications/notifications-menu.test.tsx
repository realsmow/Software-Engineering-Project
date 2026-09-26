import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../src/i18n";
import { NotificationsMenu } from "../../src/features/notifications/notifications-menu";
import { notificationResponse } from "../fixtures/api-responses";
import {
  paginatedNotifications,
  unreadCountOutput,
} from "../../../backend/src/notification/notification.schema";
import { queryResult, mutationResult } from "../fixtures/query-results";

const hooks = vi.hoisted(() => ({
  useUnreadCount: vi.fn(),
  useNotifications: vi.fn(),
  useMarkRead: vi.fn(),
  useMarkAllRead: vi.fn(),
}));

vi.mock("../../src/features/notifications/use-notifications", () => hooks);

const item = notificationResponse();

function CurrentPath() {
  return <span data-testid="path">{useLocation().pathname}</span>;
}

describe("NotificationsMenu", () => {
  const markRead = vi.fn();
  const markAllRead = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    void i18n.changeLanguage("en");
    hooks.useUnreadCount.mockReturnValue(
      queryResult(unreadCountOutput.strict().parse({ unread: 1 }))
    );
    hooks.useNotifications.mockReturnValue(
      queryResult(
        paginatedNotifications
          .strict()
          .parse({ items: [item], total: 1, page: 1, pageSize: 20 })
      )
    );
    hooks.useMarkRead.mockReturnValue({ ...mutationResult(vi.fn()), mutate: markRead });
    hooks.useMarkAllRead.mockReturnValue({
      ...mutationResult(vi.fn()),
      mutate: markAllRead,
    });
  });

  const renderMenu = () =>
    render(
      <MemoryRouter initialEntries={["/"]}>
        <NotificationsMenu />
        <CurrentPath />
      </MemoryRouter>
    );

  it("shows the unread count while closed and loads rows only when opened", () => {
    renderMenu();

    expect(
      screen.getByRole("button", { name: i18n.t("common.notifications") })
    ).toHaveTextContent("1");
    expect(hooks.useNotifications).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.notifications") }));
    expect(hooks.useNotifications).toHaveBeenLastCalledWith(true);
    expect(screen.getByText("Request approved")).toBeInTheDocument();
  });

  it("marks all notifications read from the open menu", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.notifications") }));

    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("notifications.markAllRead") })
    );
    expect(markAllRead).toHaveBeenCalledTimes(1);
  });

  it("marks one unread notification read and follows its link", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.notifications") }));

    fireEvent.click(screen.getByRole("button", { name: /Request approved/ }));

    expect(markRead).toHaveBeenCalledWith("77");
    expect(screen.getByTestId("path")).toHaveTextContent("/pickup");
    expect(hooks.useNotifications).toHaveBeenLastCalledWith(false);
  });
});
