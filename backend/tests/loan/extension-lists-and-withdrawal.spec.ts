import { LoanExtensionService } from '../../src/loan/loan.extension.service';
import {
  extensionOutput,
  paginatedExtensions,
  paginatedExtensionReviews,
  listMyExtensionsInput,
  listExtensionReviewsInput,
} from '../../src/loan/loan.schema';
import type { TrpcUser } from '../../src/trpc/context';

const BORROWER: TrpcUser = {
  accountKey: 3,
  role: 'borrower',
  facultyKey: null,
  creditScore: 100,
};
const STAFF: TrpcUser = { ...BORROWER, accountKey: 20, role: 'staff' };
const NOW = new Date('2031-09-26T00:00:00.000Z');
function extensionRow(tier = 'T2') {
  const account = {
    AccountKey: 3,
    UserID: 'S123',
    UserFName: 'Ada',
    UserLName: 'Lovelace',
    UserCredit: 100,
  };
  return {
    ExtensionKey: 5,
    UsageKey: 42,
    RequestedBy: 3,
    ExtendNo: 2,
    PreviousDueTime: NOW,
    RequestedDueTime: new Date('2031-09-27T00:00:00.000Z'),
    ApproveStatus: 'Pending',
    ApprovedBy: null as number | null,
    RequestedAt: NOW,
    ResolvedAt: null as Date | null,
    Reason: 'Project work',
    RequestedByUser: account,
    Usage: {
      UsageKey: 42,
      ReservationKey: 9,
      AccountKey: 3,
      CurrentStatus: 'Lended',
      DueTime: NOW,
      PendingExtension: 5,
      Account: account,
      Resource: {
        ResourceKey: 7,
        ManagedBy: 4,
        BufferTime: 0,
        BorrowRule: 3,
        BorrowRuleInfo: { RuleName: tier },
        Item: { ItemID: 'OSC-001', Item: { ItemName: 'Oscilloscope' } },
        Room: null,
      },
    },
  };
}
function setup(row = extensionRow()) {
  const tx = {
    extensionRequest: {
      update: jest.fn(
        ({ data }: { data: { ApproveStatus: string; ResolvedAt: Date } }) => {
          Object.assign(row, data);
          return Promise.resolve(row);
        },
      ),
    },
    usageLog: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    extensionRequest: {
      findUnique: jest.fn().mockResolvedValue(row),
      findMany: jest.fn().mockResolvedValue([row]),
      count: jest.fn().mockResolvedValue(1),
      groupBy: jest
        .fn()
        .mockResolvedValue([{ UsageKey: 42, _count: { _all: 1 } }]),
    },
    creditTier: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ CreditTierKey: 1, CreditTierName: 'D0' }]),
    },
    borrowConstraints: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { BorrowRuleKey: 3, CreditTierKey: 1, MaxExtendTime: 3 },
        ]),
    },
    $transaction: jest.fn(
      (work: Promise<unknown>[] | ((client: typeof tx) => unknown)) =>
        Array.isArray(work) ? Promise.all(work) : Promise.resolve(work(tx)),
    ),
  };
  const scope = {
    resourceScope: jest.fn().mockResolvedValue({ ManagedBy: { in: [4] } }),
  };
  const tiers = { tierMapper: jest.fn().mockResolvedValue(() => 'D0') };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  return {
    row,
    prisma,
    tx,
    scope,
    audit,
    service: new LoanExtensionService(
      prisma as never,
      scope as never,
      tiers as never,
      {} as never,
      {} as never,
      audit as never,
    ),
  };
}

describe('LoanExtensionService history, worklist and withdrawal', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());
  it('lists only the borrower’s matching extension history and resolves quota from the borrower', async () => {
    const { service, prisma } = setup();
    prisma.extensionRequest.count.mockResolvedValue(21);
    const result = paginatedExtensions.parse(
      await service.listMine(
        BORROWER,
        listMyExtensionsInput.parse({
          status: 'Pending',
          page: 2,
          pageSize: 10,
        }),
      ),
    );
    const where = { RequestedBy: 3, ApproveStatus: 'Pending' };
    expect(prisma.extensionRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        orderBy: { RequestedAt: 'desc' },
        skip: 10,
        take: 10,
      }),
    );
    expect(prisma.extensionRequest.count).toHaveBeenCalledWith({ where });
    expect(result.items[0]).toMatchObject({
      extensionsUsed: 1,
      extensionsAllowed: 3,
      route: 'supervisor',
      autoApproved: false,
    });
  });
  it('does not load quota tables for an empty history', async () => {
    const { service, prisma } = setup();
    prisma.extensionRequest.findMany.mockResolvedValue([]);
    prisma.extensionRequest.count.mockResolvedValue(0);
    expect(
      paginatedExtensions.parse(
        await service.listMine(BORROWER, listMyExtensionsInput.parse({})),
      ),
    ).toMatchObject({ items: [], total: 0 });
    expect(prisma.borrowConstraints.findMany).not.toHaveBeenCalled();
  });
  it('withdraws a pending request without changing its due date or charging extension quota', async () => {
    const { service, tx, audit } = setup();
    const result = extensionOutput.parse(
      await service.cancel(BORROWER, { extensionKey: 5 }),
    );
    expect(result).toMatchObject({
      status: 'Canceled',
      resolvedAt: NOW.toISOString(),
      dueAt: NOW.toISOString(),
      extensionsUsed: 1,
    });
    expect(tx.extensionRequest.update).toHaveBeenCalledWith({
      where: { ExtensionKey: 5 },
      data: { ApproveStatus: 'Canceled', ResolvedAt: NOW },
    });
    expect(tx.usageLog.updateMany).toHaveBeenCalledWith({
      where: { UsageKey: 42, PendingExtension: 5 },
      data: { PendingExtension: null },
    });
    expect(audit.record).toHaveBeenCalledWith(
      { accountKey: 3 },
      'update',
      'extension/5',
      expect.any(String),
    );
  });
  it.each(['Approved', 'Rejected', 'Canceled'])(
    'refuses withdrawal after %s without writes',
    async (status) => {
      const { service, row, tx, audit } = setup();
      row.ApproveStatus = status;
      row.ResolvedAt = NOW;
      await expect(
        service.cancel(BORROWER, { extensionKey: 5 }),
      ).rejects.toThrow('ALREADY_DECIDED');
      expect(tx.extensionRequest.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    },
  );
  it('gives the same not-found answer for another owner and an absent key', async () => {
    const { service, prisma, tx } = setup();
    await expect(
      service.cancel({ ...BORROWER, accountKey: 99 }, { extensionKey: 5 }),
    ).rejects.toThrow('EXTENSION_NOT_FOUND');
    prisma.extensionRequest.findUnique.mockResolvedValue(null);
    await expect(
      service.cancel(BORROWER, { extensionKey: 404 }),
    ).rejects.toThrow('EXTENSION_NOT_FOUND');
    expect(tx.usageLog.updateMany).not.toHaveBeenCalled();
  });
  it('keeps T2 supervisor work out of the staff review list and preserves department scope', async () => {
    const { service, prisma } = setup();
    expect(
      paginatedExtensionReviews.parse(
        await service.listReviews(
          STAFF,
          listExtensionReviewsInput.parse({ q: 'Ada' }),
        ),
      ),
    ).toMatchObject({ total: 0, items: [] });
    expect(prisma.extensionRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ApproveStatus: 'Pending',
          Usage: { Resource: { ManagedBy: { in: [4] } } },
          RequestedByUser: expect.any(Object),
        }),
        orderBy: { RequestedAt: 'asc' },
      }),
    );
    const result = paginatedExtensionReviews.parse(
      await service.listReviews(
        { ...STAFF, role: 'supervisor' },
        listExtensionReviewsInput.parse({ route: 'supervisor', tier: 'T2' }),
      ),
    );
    expect(result).toMatchObject({
      total: 1,
      items: [
        {
          extensionKey: 5,
          route: 'supervisor',
          tier: 'T2',
          reason: 'Project work',
          borrower: { accountKey: 3 },
        },
      ],
    });
    expect(
      paginatedExtensionReviews.parse(
        await service.listReviews(
          { ...STAFF, role: 'supervisor' },
          listExtensionReviewsInput.parse({ route: 'staff' }),
        ),
      ),
    ).toMatchObject({ total: 0 });
  });
});
