import { ItemManagementService } from './item.management.service';
import type { PrismaService } from '../prisma.service';
import type { StaffScopeService } from '../common/authority/staff-scope.service';
import type { ImageService } from '../image/image.service';
import type { TrpcUser } from '../trpc/context';

/**
 * FR-EQP-01: `price` rides on the item type, and `suggestedTier` is derived
 * from it advisorily - it never forces the unit tier, which staff still pick
 * by hand on each unit (item.createUnit). See
 * common/pricing/suggest-tier.spec.ts for the band boundaries themselves;
 * this file only checks that the service actually stores and returns them.
 */

const staff: TrpcUser = {
  accountKey: 4,
  role: 'staff',
  facultyKey: null,
  creditScore: 100,
};

function itemRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ItemKey: 5,
    ItemName: 'Oscilloscope',
    ItemDesc: null,
    ImageURL: null,
    CreditWeight: 10,
    Price: 500,
    Items: [],
    _count: { Items: 0 },
    ...overrides,
  };
}

function harness() {
  const prisma = {
    itemInfo: {
      create: jest.fn().mockResolvedValue(itemRow()),
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(itemRow()),
    },
    itemIndiv: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;
  const scope = {
    resolveGroupKeys: jest.fn().mockResolvedValue([1]),
    resourceScope: jest.fn().mockResolvedValue({}),
  } as unknown as StaffScopeService;
  const images = {
    toStoredUrl: (url?: string) => url ?? null,
    toPublicUrl: (url: string | null) => url,
  } as unknown as ImageService;
  const audit = { record: jest.fn() };
  return {
    service: new ItemManagementService(
      prisma,
      scope,
      images,
      audit as never,
      { retirementRequested: jest.fn(), retirementDecided: jest.fn() } as never,
    ),
    prisma,
    audit,
  };
}

describe('createItemType', () => {
  it('stores the price and returns the suggested tier for it', async () => {
    const t = harness();
    (t.prisma.itemInfo.create as jest.Mock).mockResolvedValueOnce(
      itemRow({ Price: 500 }),
    );

    const result = await t.service.createItemType(staff, {
      name: 'Oscilloscope',
      creditWeight: 10,
      price: 500,
    });

    expect(t.prisma.itemInfo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ Price: 500 }),
      }),
    );
    expect(result.price).toBe(500);
    // 500 baht is over the T1 band's 1,000 baht cap? No - 500 is within T1's
    // "up to 1,000" band, so T1 is what the proposal's bands suggest here.
    expect(result.suggestedTier).toBe('T1');
  });

  it('leaves price and suggestedTier null when no price is given', async () => {
    const t = harness();
    (t.prisma.itemInfo.create as jest.Mock).mockResolvedValueOnce(
      itemRow({ Price: null }),
    );

    const result = await t.service.createItemType(staff, {
      name: 'Cable',
      creditWeight: 0,
    });

    expect(result.price).toBeNull();
    expect(result.suggestedTier).toBeNull();
  });

  it('suggests T2 for a high-value item', async () => {
    const t = harness();
    (t.prisma.itemInfo.create as jest.Mock).mockResolvedValueOnce(
      itemRow({ Price: 45000 }),
    );

    const result = await t.service.createItemType(staff, {
      name: 'Spectrum analyzer',
      creditWeight: 10,
      price: 45000,
    });

    expect(result.suggestedTier).toBe('T2');
  });
});

describe('updateItemType', () => {
  it('writes a new price', async () => {
    const t = harness();
    await t.service.updateItemType(staff, { itemKey: 5, price: 250 });

    expect(t.prisma.itemInfo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ItemKey: 5 },
        data: expect.objectContaining({ Price: 250 }),
      }),
    );
  });

  it('clears a price with an explicit null, distinct from omitting it', async () => {
    const t = harness();
    await t.service.updateItemType(staff, { itemKey: 5, price: null });

    expect(t.prisma.itemInfo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ Price: null }),
      }),
    );
  });

  it('leaves price alone when omitted', async () => {
    const t = harness();
    await t.service.updateItemType(staff, { itemKey: 5, name: 'New name' });

    expect(t.prisma.itemInfo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ Price: expect.anything() }),
      }),
    );
  });
});

describe('getManagedItemById', () => {
  it('carries price and suggestedTier through the read path', async () => {
    const t = harness();
    (t.prisma.itemInfo.findUnique as jest.Mock).mockResolvedValueOnce(
      itemRow({ Price: 1500 }),
    );

    const result = await t.service.getManagedItemById(staff, 5);
    expect(result.price).toBe(1500);
    expect(result.suggestedTier).toBe('T2');
  });
});
