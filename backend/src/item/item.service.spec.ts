import { ItemService, sortItems } from './item.service';
import type { PrismaService } from '../prisma.service';
import type { TrpcUser } from '../trpc/context';
import type { CatalogItem } from './item.schema';

/** Only the fields the comparator reads; the rest never affects ordering. */
function item(
  name: string,
  availableUnits: number,
  borrowCount: number,
  creditWeight = 0,
): CatalogItem {
  return {
    id: 1,
    name,
    description: null,
    imageUrl: null,
    tier: 'T1',
    creditWeight,
    totalUnits: availableUnits,
    availableUnits,
    borrowCount,
    stockStatus: availableUnits > 0 ? 'ok' : 'queue',
    nextAvailableAt: null,
    prepDays: 0,
    allowBorrow: true,
    eligible: true,
    owner: null,
  };
}

const names = (items: CatalogItem[]) => items.map((i) => i.name);

describe('sortItems', () => {
  describe('available (the catalogue default)', () => {
    it('puts anything in stock above everything out of stock', () => {
      const items = [item('out', 0, 10), item('one left', 1, 1)];
      sortItems(items, 'available');

      // One unit free beats ten due back later — that is the whole point.
      expect(names(items)).toEqual(['one left', 'out']);
    });

    it('orders in-stock items by how many are free', () => {
      const items = [item('b', 2, 5), item('a', 9, 9), item('c', 5, 5)];
      sortItems(items, 'available');

      expect(names(items)).toEqual(['a', 'c', 'b']);
    });

    it('breaks ties by name so the order is stable, not arbitrary', () => {
      const items = [item('ข', 3, 3), item('ก', 3, 3)];
      sortItems(items, 'available');

      expect(names(items)).toEqual(['ก', 'ข']);
    });

    it('keeps out-of-stock items in a meaningful order too', () => {
      const items = [item('ข', 0, 1), item('ก', 0, 1)];
      sortItems(items, 'available');

      expect(names(items)).toEqual(['ก', 'ข']);
    });
  });

  it('popular sorts by how often the type was borrowed, most first', () => {
    const items = [item('few', 1, 2), item('many', 0, 20), item('some', 5, 7)];
    sortItems(items, 'popular');

    expect(names(items)).toEqual(['many', 'some', 'few']);
  });

  it('popular ignores stock: more units on the shelf is not demand', () => {
    const items = [item('stocked', 50, 1), item('wanted', 1, 9)];
    sortItems(items, 'popular');

    expect(names(items)).toEqual(['wanted', 'stocked']);
  });

  it('creditWeight sorts cheapest first', () => {
    const items = [
      item('pricey', 1, 1, 10),
      item('free', 1, 1, 0),
      item('mid', 1, 1, 5),
    ];
    sortItems(items, 'creditWeight');

    expect(names(items)).toEqual(['free', 'mid', 'pricey']);
  });

  describe('name', () => {
    it('uses Thai collation, not code points', () => {
      const items = [item('ฮ', 1, 1), item('ก', 1, 1), item('ข', 1, 1)];
      sortItems(items, 'name');

      expect(names(items)).toEqual(['ก', 'ข', 'ฮ']);
    });

    it('ignores availability entirely', () => {
      const items = [item('ข', 99, 99), item('ก', 0, 0)];
      sortItems(items, 'name');

      expect(names(items)).toEqual(['ก', 'ข']);
    });
  });

  it('handles an empty catalogue without complaint', () => {
    const items: CatalogItem[] = [];
    expect(() => sortItems(items, 'available')).not.toThrow();
    expect(items).toEqual([]);
  });
});

describe('roomAvailability eligibility (#163)', () => {
  const user = { accountKey: 7 } as TrpcUser;
  function catalog(rules: { GroupKey: number; RoleKey: number }[]) {
    const prisma = {
      roomInfo: {
        findUnique: jest.fn().mockResolvedValue({
          RoomKey: 1,
          OpenTime: 420,
          CloseTime: 1080,
          BreakStart: null,
          BreakEnd: null,
          Resource: {
            ResourceKey: 5,
            ResourceStatus: 'InStorage',
            Eligibilities: rules,
          },
        }),
      },
      reservations: { findMany: jest.fn().mockResolvedValue([]) },
      authority: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ ManageGroupKey: 3, AuthorityRoleKey: 1 }]),
      },
    } as unknown as PrismaService;
    return new ItemService(prisma);
  }

  it('offers no slot in a room with no eligibility rules', async () => {
    const day = await catalog([]).roomAvailability(user, {
      roomKey: 1,
      date: '2099-01-12',
    });
    expect(day.eligible).toBe(false);
    expect(day.slots.some((slot) => slot.available)).toBe(false);
  });

  it('offers free slots to a borrower a rule names', async () => {
    const day = await catalog([{ GroupKey: 3, RoleKey: 1 }]).roomAvailability(
      user,
      { roomKey: 1, date: '2099-01-12' },
    );
    expect(day.eligible).toBe(true);
    expect(day.slots.every((slot) => slot.available)).toBe(true);
  });
});
