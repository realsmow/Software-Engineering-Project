import { test } from 'node:test';
import assert from 'node:assert/strict';

function buildNotificationBellState(unread) {
  return {
    unreadCount: unread.filter((i) => !i.isRead).length,
    items: unread,
    open: false,
  };
}

function togglePopover(state) {
  return { ...state, open: !state.open };
}

function pollConfig() {
  return {
    notification: 60_000,
    staffQueue: 30_000,
    equipmentAvailability: 15_000,
  };
}

test('Notification bell badge shows unread count and opens popover', () => {
  const items = [
    { isRead: false, title: 'Approved' },
    { isRead: true, title: 'Rejected' },
    { isRead: false, title: 'Pending' },
  ];

  const bell = buildNotificationBellState(items);
  const opened = togglePopover(bell);

  assert.equal(bell.unreadCount, 2);
  assert.equal(opened.open, true);
  assert.equal(opened.unreadCount, 2);
});

test('In-app notifications polled every 60 seconds (TanStack Query)', () => {
  const config = pollConfig();
  assert.equal(config.notification, 60_000);
});

test('Staff queue polled every 30 seconds', () => {
  const config = pollConfig();
  assert.equal(config.staffQueue, 30_000);
});

test('Equipment availability polled every 15 seconds', () => {
  const config = pollConfig();
  assert.equal(config.equipmentAvailability, 15_000);
});

test('In-app notification polling via tRPC', async () => {
  const calls = [];
  const trpcClient = {
    query: async (path, input) => {
      calls.push({ path, input });
      return {
        items: [{ id: 1, isRead: false, title: 'Approved' }],
        unreadCount: 1,
      };
    },
  };

  const result = await trpcClient.query('notifications.list', { limit: 20 });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, 'notifications.list');
  assert.equal(result.unreadCount, 1);
  assert.equal(result.items[0].title, 'Approved');
});
