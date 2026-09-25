import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../src/i18n';
import { NotificationsMenu } from '../../src/features/notifications/notifications-menu';
import type { Notification } from '../../src/types/domain';

const hooks = vi.hoisted(() => ({
  useUnreadCount: vi.fn(),
  useNotifications: vi.fn(),
  useMarkRead: vi.fn(),
  useMarkAllRead: vi.fn(),
}));

vi.mock('../../src/features/notifications/use-notifications', () => hooks);

const item: Notification = {
  id: '77',
  userId: '42',
  type: 'request_approved',
  title: 'Request approved',
  body: 'Laptop is ready for pickup',
  createdAt: '2026-09-25T10:00:00.000Z',
  linkTo: '/pickup',
};

function CurrentPath() {
  return <span data-testid="path">{useLocation().pathname}</span>;
}

describe('NotificationsMenu', () => {
  const markRead = vi.fn();
  const markAllRead = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    void i18n.changeLanguage('en');
    hooks.useUnreadCount.mockReturnValue({ data: { unread: 2 } });
    hooks.useNotifications.mockReturnValue({
      data: { items: [item], total: 1, page: 1, pageSize: 20 },
      isPending: false,
      isError: false,
    });
    hooks.useMarkRead.mockReturnValue({ mutate: markRead });
    hooks.useMarkAllRead.mockReturnValue({ mutate: markAllRead, isPending: false });
  });

  const renderMenu = () => render(
    <MemoryRouter initialEntries={['/']}>
      <NotificationsMenu />
      <CurrentPath />
    </MemoryRouter>,
  );

  it('shows the unread count while closed and loads rows only when opened', () => {
    renderMenu();

    expect(screen.getByRole('button', { name: i18n.t('common.notifications') })).toHaveTextContent('2');
    expect(hooks.useNotifications).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: i18n.t('common.notifications') }));
    expect(hooks.useNotifications).toHaveBeenLastCalledWith(true);
    expect(screen.getByText('Request approved')).toBeInTheDocument();
  });

  it('marks all notifications read from the open menu', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('common.notifications') }));

    fireEvent.click(screen.getByRole('button', { name: i18n.t('notifications.markAllRead') }));
    expect(markAllRead).toHaveBeenCalledTimes(1);
  });

  it('marks one unread notification read and follows its link', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('common.notifications') }));

    fireEvent.click(screen.getByRole('button', { name: /Request approved/ }));

    expect(markRead).toHaveBeenCalledWith('77');
    expect(screen.getByTestId('path')).toHaveTextContent('/pickup');
    expect(hooks.useNotifications).toHaveBeenLastCalledWith(false);
  });
});
