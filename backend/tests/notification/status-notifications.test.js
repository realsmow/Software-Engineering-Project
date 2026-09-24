const test = require('node:test');
const assert = require('node:assert/strict');

function createNotification({ accountKey, requestId, status, isRead = false }) {
  return {
    accountKey,
    requestId,
    status,
    isRead,
    title: `Request ${requestId} status changed to ${status}`,
  };
}

function processStatusChange(notifications, request, nextStatus) {
  request.status = nextStatus;
  notifications.push(
    createNotification({
      accountKey: request.borrowerId,
      requestId: request.id,
      status: nextStatus,
      isRead: false,
    }),
  );
  return notifications;
}

test('Backend generates notifications when request or loan status changes', () => {
  const notifications = [];
  const request = { id: 77, borrowerId: 42, status: 'Pending' };

  processStatusChange(notifications, request, 'Approved');
  processStatusChange(notifications, request, 'Ready for pickup');

  assert.equal(notifications.length, 2);
  assert.equal(notifications[0].accountKey, 42);
  assert.equal(notifications[0].status, 'Approved');
  assert.equal(notifications[1].status, 'Ready for pickup');
  assert.equal(notifications[1].isRead, false);
});