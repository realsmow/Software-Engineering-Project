import { ApprovalService } from './approval.service';
import type { TrpcUser } from '../trpc/context';

/** FR-APV-01: the requester's history, scoped to the decider's departments. */
const staff = { accountKey: 1, role: 'staff' } as TrpcUser;
const DAY = 86_400_000;
const due = new Date('2026-09-10T10:00:00.000Z');

function build(inScope: number) {
  const prisma = {
    reservations: { count: jest.fn().mockResolvedValue(inScope) },
    usageLog: {
      findMany: jest.fn().mockResolvedValue([
        // Returned two days late.
        {
          UsageKey: 2,
          CheckoutTime: new Date(due.getTime() - 3 * DAY),
          CheckInTime: new Date(due.getTime() + 2 * DAY),
          DueTime: due,
          CurrentStatus: 'Inspected',
          Resource: {
            Item: { ItemID: 'OSC-1', Item: { ItemName: 'Oscilloscope' } },
            Room: null,
          },
        },
        // Returned on time.
        {
          UsageKey: 1,
          CheckoutTime: new Date(due.getTime() - 9 * DAY),
          CheckInTime: new Date(due.getTime() - 5 * DAY),
          DueTime: new Date(due.getTime() - 5 * DAY),
          CurrentStatus: 'Inspected',
          Resource: { Item: null, Room: { RoomName: 'Lab 3' } },
        },
      ]),
    },
    inspection: {
      findMany: jest.fn().mockResolvedValue([{ ActionTime: due }]),
    },
  };
  const scope = { resolveGroupKeys: jest.fn().mockResolvedValue([8]) };
  const service = new ApprovalService(
    prisma as never,
    scope as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, prisma };
}

it('counts late returns and damage and lists loans newest first', async () => {
  const { service } = build(1);

  const history = await service.borrowerHistory(staff, 42);

  expect(history).toMatchObject({
    totalLoans: 2,
    lateReturns: 1,
    damageIncidents: 1,
    lastDamageDate: due.toISOString(),
  });
  expect(history.items[0]).toMatchObject({
    usageKey: 2,
    itemName: 'Oscilloscope',
    serialNo: 'OSC-1',
    overdueDays: 2,
  });
  expect(history.items[1]).toMatchObject({ serialNo: null, overdueDays: 0 });
});

it('refuses a borrower with no request in the caller departments', async () => {
  const { service, prisma } = build(0);

  await expect(service.borrowerHistory(staff, 42)).rejects.toThrow(
    /OUT_OF_MANAGEMENT_SCOPE/,
  );
  expect(prisma.usageLog.findMany).not.toHaveBeenCalled();
});
