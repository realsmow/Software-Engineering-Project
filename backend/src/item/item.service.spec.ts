import { sortItems } from './item.service';
import type { ItemSummary } from './item.schema';

/** Only the fields the comparator reads; the rest never affects ordering. */
function item(
  name: string,
  availableUnits: number,
  totalUnits: number,
  creditWeight = 0,
): ItemSummary {
  return {
    id: 1,
    name,
    description: null,
    imageUrl: null,
    tier: 'T1',
    creditWeight,
    totalUnits,
    availableUnits,
    stockStatus: availableUnits > 0 ? 'ok' : 'queue',
    nextAvailableAt: null,
    prepDays: 0,
    allowBorrow: true,
    owner: null,
  };
}

const names = (items: ItemSummary[]) => items.map((i) => i.name);

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

  it('popular sorts by how many units exist, most first', () => {
    const items = [item('few', 1, 2), item('many', 0, 20), item('some', 5, 7)];
    sortItems(items, 'popular');

    expect(names(items)).toEqual(['many', 'some', 'few']);
  });

  it('creditWeight sorts cheapest first', () => {
    const items = [item('pricey', 1, 1, 10), item('free', 1, 1, 0), item('mid', 1, 1, 5)];
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
    const items: ItemSummary[] = [];
    expect(() => sortItems(items, 'available')).not.toThrow();
    expect(items).toEqual([]);
  });
});
