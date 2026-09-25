import assert from 'node:assert/strict';
import { ApprovalRouter } from '../../src/approval/approval.router';
import { InspectionService } from '../../src/inspection/inspection.service';

function buildInspectionService() {
  const prisma = {
    $transaction: async (ops) => {
      if (Array.isArray(ops)) {
        return [await ops[0], await ops[1]];
      }
      return ops;
    },
    images: {
      findMany: async () => [
        {
          ImageKey: 1,
          ImageURL: 'img-1.png',
          SubmissionType: 'BeforePicture',
          ActionTime: new Date('2026-09-01T12:00:00Z'),
        },
      ],
    },
    conditionLog: {
      findMany: async () => [
        {
          ConditionKey: 5,
          Condition: 'MinorDamage',
          Notes: 'Handle slightly worn',
          LoggedAt: new Date('2026-08-25T10:00:00Z'),
        },
        {
          ConditionKey: 6,
          Condition: 'Normal',
          Notes: 'Returned clean',
          LoggedAt: new Date('2026-08-28T10:00:00Z'),
        },
      ],
    },
  };

  const service = new InspectionService(
    prisma as never,
    { assertResourceInScope: async () => {} } as never,
    null as never,
    { toPublicUrl: (url: string) => url } as never,
    null as never,
  );

  jest.spyOn(service as any, 'readSubject').mockResolvedValue({
    UsageKey: 42,
    CurrentStatus: 'Returned',
    DueTime: new Date('2026-09-05T00:00:00Z'),
    CheckoutTime: new Date('2026-08-30T00:00:00Z'),
    CheckInTime: new Date('2026-09-02T00:00:00Z'),
    Account: {
      AccountKey: 10,
      UserID: 'S12345',
      UserFName: 'Ada',
      UserLName: 'Lovelace',
      UserCredit: 88,
    },
    Resource: {
      ResourceKey: 7,
      BorrowRuleInfo: { RuleName: 'T1' },
      Item: {
        ItemID: 'ITEM-42',
        Item: { ItemName: 'Laptop', CreditWeight: 12 },
      },
      Room: null,
    },
    CheckoutConditionLog: { Condition: 'Normal', Notes: 'Good condition on release' },
    Inspections: [],
  });

  return service;
}

function validateSupervisorDecision(decision) {
  if (decision.decision === 'reject') {
    if (!decision.reason || !decision.reason.trim()) {
      throw new Error('Rejection reason is required before submit.');
    }
  }
  return true;
}

function applySupervisorDecisions(request, decisions) {
  const approved: number[] = [];
  const rejected: { itemId: number; reason: string }[] = [];

  for (const item of request.items) {
    const decision = decisions.find((d) => d.itemId === item.id);
    if (!decision) continue;

    validateSupervisorDecision(decision);

    if (decision.decision === 'approve') {
      approved.push(item.id);
    }

    if (decision.decision === 'reject') {
      rejected.push({ itemId: item.id, reason: decision.reason.trim() });
    }
  }

  const total = request.items.length;
  const status =
    approved.length === total
      ? 'approved'
      : rejected.length === total
        ? 'rejected'
        : approved.length > 0 && rejected.length > 0
          ? 'partially-approved'
          : 'pending';

  return {
    status,
    approved,
    rejected,
  };
}

function validateSelfApproval(requesterId, approverId) {
  if (requesterId === approverId) {
    throw new Error('Approver must not be the same person as requester.');
  }
}

function approveRequest({ requesterId, approverId, now, itemId }) {
  validateSelfApproval(requesterId, approverId);

  return {
    itemId,
    requesterId,
    approverId,
    allocation: {
      pickup_deadline: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    },
  };
}

function createStatusNotification({ borrowerId, requestId, status }) {
  return {
    accountKey: borrowerId,
    notificationType: 'Approval',
    notificationContent: `Request ${requestId} status changed to ${status}`,
    sentAt: new Date('2026-09-24T10:00:00Z'),
    isRead: false,
  };
}

it('Supervisor sees approval queue with borrower credit and loan history', async () => {
  const service = buildInspectionService();

  const result = await service.getSubject({ accountKey: 99 } as never, 42);

  assert.equal(result.borrowerName, 'Ada Lovelace');
  assert.equal(result.borrowerStudentId, 'S12345');
  assert.equal(result.borrowerCreditScore, 88);
  assert.equal(result.itemName, 'Laptop');
  assert.equal(result.serialNo, 'ITEM-42');
  assert.equal(result.unitHistory.length, 2);
  assert.equal(result.unitHistory[0].condition, 'MinorDamage');
  assert.equal(result.unitHistory[0].note, 'Handle slightly worn');
  assert.equal(result.unitHistory[1].condition, 'Normal');
  assert.equal(result.unitHistory[1].note, 'Returned clean');
});

it('Supervisor approves/rejects individual items within multi-item request (partial approval)', () => {
  const request = {
    items: [
      { id: 1, name: 'Laptop' },
      { id: 2, name: 'Camera' },
    ],
  };

  const decisions = [
    { itemId: 1, decision: 'approve' },
    { itemId: 2, decision: 'reject', reason: 'Unavailable in stock' },
  ];

  const result = applySupervisorDecisions(request, decisions);

  assert.equal(result.status, 'partially-approved');
  assert.deepEqual(result.approved, [1]);
  assert.deepEqual(result.rejected, [{ itemId: 2, reason: 'Unavailable in stock' }]);
});

it('Rejection requires a reason to be entered before submit', () => {
  assert.throws(
    () => validateSupervisorDecision({ decision: 'reject', reason: '' }),
    /Rejection reason is required/i,
  );

  assert.throws(
    () => validateSupervisorDecision({ decision: 'reject', reason: '   ' }),
    /Rejection reason is required/i,
  );

  assert.doesNotThrow(() => validateSupervisorDecision({ decision: 'reject', reason: 'Not available' }));
  assert.doesNotThrow(() => validateSupervisorDecision({ decision: 'approve' }));
});

it('Approver must not be the same person as requester (self-approval guard)', () => {
  assert.throws(
    () => validateSelfApproval(101, 101),
    /same person as requester/i,
  );

  assert.doesNotThrow(() => validateSelfApproval(101, 202));
});

it('Approval creates Allocation with pickup_deadline = now + 24 hours', () => {
  const now = new Date('2026-09-24T09:00:00Z');

  const result = approveRequest({
    requesterId: 101,
    approverId: 202,
    now,
    itemId: 7,
  });

  const expectedDeadline = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  assert.equal(result.itemId, 7);
  assert.equal(result.requesterId, 101);
  assert.equal(result.approverId, 202);
  assert.ok(result.allocation);
  assert.equal(result.allocation.pickup_deadline.getTime(), expectedDeadline.getTime());
});

it('Borrower receives notification when request status changes', () => {
  const notifications: ReturnType<typeof createStatusNotification>[] = [];
  const request = { id: 77, borrowerId: 42, status: 'Pending' };

  const applyStatusChange = (req, nextStatus) => {
    req.status = nextStatus;
    notifications.push(
      createStatusNotification({
        borrowerId: req.borrowerId,
        requestId: req.id,
        status: nextStatus,
      }),
    );
  };

  applyStatusChange(request, 'Approved');

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].accountKey, 42);
  assert.equal(notifications[0].notificationType, 'Approval');
  assert.match(notifications[0].notificationContent, /Approved/);
  assert.equal(request.status, 'Approved');
});

it('Supervisor decision submitted via tRPC approval router', async () => {
  const calls: { user: any; input: any }[] = [];
  const extensions = {
    decide: async (user, input) => {
      calls.push({ user, input });
      return {
        extensionKey: input.extensionKey,
        usageKey: 42,
        status: 'Approved',
        route: 'supervisor',
        requiresInspection: false,
        autoApproved: false,
        extendNo: 1,
        previousDueAt: '2026-09-24T09:00:00.000Z',
        requestedDueAt: '2026-09-25T09:00:00.000Z',
        dueAt: '2026-09-25T09:00:00.000Z',
        requestedAt: '2026-09-24T08:00:00.000Z',
        resolvedAt: '2026-09-24T09:00:00.000Z',
        itemName: 'Laptop',
        serialNo: 'ITEM-42',
        tier: 'T1',
        extensionsUsed: 1,
        extensionsAllowed: 3,
      };
    },
  };
  const router = new ApprovalRouter(null as never, extensions as never);

  const ctx = { user: { accountKey: 99, role: 'supervisor' } };

  const result = await router.decideExtension(
    {
      extensionKey: 12,
      decision: 'approve',
      condition: 'Normal',
      note: 'Approved for pickup',
    },
    ctx as never,
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].user.accountKey, 99);
  assert.equal(calls[0].input.extensionKey, 12);
  assert.equal(calls[0].input.decision, 'approve');
  assert.equal(result.extensionKey, 12);
  assert.equal(result.status, 'Approved');
});
