import { itemDetail, itemSummary, roomSummary } from '../../item/item.schema';
import {
  toItemDetail,
  toItemSummary,
  toRoomSummary,
  type ItemTypeRow,
  type ItemUnitRow,
} from './item.mapper';

const GROUP = {
  ManageGroupKey: 7,
  GroupType: 'Faculty' as const,
  Branch: { BranchName: 'วิศวกรรมไฟฟ้า' },
  Club: null,
};

function unit(overrides: {
  status?: 'InStorage' | 'Lended' | 'Missing';
  allowBorrow?: boolean;
  dueAt?: Date;
  tag?: string;
}): ItemUnitRow {
  return {
    IndivKey: 1,
    ItemID: overrides.tag ?? 'EE-MM-001',
    ImageURL: null,
    Resource: {
      ResourceStatus: overrides.status ?? 'InStorage',
      AllowBorrow: overrides.allowBorrow ?? true,
      BufferTime: 2,
      ManagementGroup: GROUP,
      CurrentCondition: { Condition: 'Normal' },
      UsageLogs: overrides.dueAt ? [{ DueTime: overrides.dueAt }] : [],
    },
  };
}

function itemRow(units: ItemUnitRow[], creditWeight = 5): ItemTypeRow {
  return {
    ItemKey: 42,
    ItemName: 'มัลติมิเตอร์ Fluke 87V',
    ItemDesc: 'มัลติมิเตอร์ดิจิทัลความแม่นยำสูง',
    ImageURL: null,
    CreditWeight: creditWeight,
    Items: units,
  };
}

describe('toItemSummary', () => {
  it('produces a schema-valid summary', () => {
    expect(
      itemSummary.safeParse(toItemSummary(itemRow([unit({})]))).success,
    ).toBe(true);
  });

  it('derives the tier from credit weight', () => {
    expect(toItemSummary(itemRow([unit({})], 0)).tier).toBe('T0');
    expect(toItemSummary(itemRow([unit({})], 5)).tier).toBe('T1');
    expect(toItemSummary(itemRow([unit({})], 10)).tier).toBe('T2');
  });

  describe('availability counting', () => {
    it('counts only units in storage AND open for borrowing', () => {
      const summary = toItemSummary(
        itemRow([
          unit({ status: 'InStorage', allowBorrow: true }),
          unit({ status: 'InStorage', allowBorrow: false }),
          unit({ status: 'Lended', allowBorrow: true }),
          unit({ status: 'Missing', allowBorrow: true }),
        ]),
      );

      expect(summary.totalUnits).toBe(4);
      expect(summary.availableUnits).toBe(1);
    });

    it('reports an item with no units at all as unavailable, not as an error', () => {
      const summary = toItemSummary(itemRow([]));

      expect(summary.totalUnits).toBe(0);
      expect(summary.availableUnits).toBe(0);
      expect(summary.stockStatus).toBe('maintenance');
      expect(summary.owner).toBeNull();
      expect(summary.allowBorrow).toBe(false);
    });
  });

  describe('stockStatus', () => {
    it('is ok when something is free right now', () => {
      expect(toItemSummary(itemRow([unit({})])).stockStatus).toBe('ok');
    });

    it('is queue when every unit is out but will come back', () => {
      const summary = toItemSummary(
        itemRow([
          unit({ status: 'Lended', dueAt: new Date('2026-09-01T00:00:00Z') }),
        ]),
      );
      expect(summary.stockStatus).toBe('queue');
    });

    it('is maintenance when nothing is borrowable at all', () => {
      // Switched off, and lost - neither is coming back into circulation.
      const summary = toItemSummary(
        itemRow([unit({ allowBorrow: false }), unit({ status: 'Missing' })]),
      );
      expect(summary.stockStatus).toBe('maintenance');
    });
  });

  describe('nextAvailableAt', () => {
    it('is null while a unit is free - a date there would read as unavailable', () => {
      const summary = toItemSummary(
        itemRow([
          unit({ status: 'InStorage' }),
          unit({ status: 'Lended', dueAt: new Date('2026-09-01T00:00:00Z') }),
        ]),
      );
      expect(summary.nextAvailableAt).toBeNull();
    });

    it('is the earliest due date when everything is out', () => {
      const summary = toItemSummary(
        itemRow([
          unit({ status: 'Lended', dueAt: new Date('2026-09-10T00:00:00Z') }),
          unit({ status: 'Lended', dueAt: new Date('2026-09-02T00:00:00Z') }),
          unit({ status: 'Lended', dueAt: new Date('2026-09-20T00:00:00Z') }),
        ]),
      );
      expect(summary.nextAvailableAt).toBe('2026-09-02T00:00:00.000Z');
    });

    it('is null when nothing is out and nothing is free', () => {
      expect(
        toItemSummary(itemRow([unit({ status: 'Missing' })])).nextAvailableAt,
      ).toBeNull();
    });
  });

  it('falls back to the key rather than an empty cell for a nameless row', () => {
    const nameless = { ...itemRow([unit({})]), ItemName: null };
    expect(toItemSummary(nameless).name).toBe('#42');
  });

  it('takes the owning group from the units', () => {
    expect(toItemSummary(itemRow([unit({})])).owner).toEqual({
      id: 7,
      name: 'วิศวกรรมไฟฟ้า',
      type: 'Faculty',
    });
  });
});

describe('toItemDetail', () => {
  it('produces a schema-valid detail with every unit listed', () => {
    const detail = toItemDetail(
      itemRow([
        unit({ tag: 'EE-MM-001' }),
        unit({
          tag: 'EE-MM-002',
          status: 'Lended',
          dueAt: new Date('2026-09-02T03:00:00Z'),
        }),
      ]),
    );

    expect(itemDetail.safeParse(detail).success).toBe(true);
    expect(detail.units).toHaveLength(2);
    expect(detail.units[1]).toMatchObject({
      assetTag: 'EE-MM-002',
      status: 'Lended',
      condition: 'Normal',
      dueAt: '2026-09-02T03:00:00.000Z',
    });
  });

  it('reports a unit with no condition record as null instead of guessing Normal', () => {
    const noCondition = unit({});
    noCondition.Resource.CurrentCondition = null;

    expect(toItemDetail(itemRow([noCondition])).units[0].condition).toBeNull();
  });
});

describe('toRoomSummary', () => {
  const room = {
    RoomKey: 9,
    RoomName: 'ห้องปฏิบัติการ CAD 2',
    RoomDesc: null,
    RoomLocation: 'อาคาร 9 ชั้น 2',
    ImageURL: null,
    CreditWeight: 0,
    Resource: unit({}).Resource,
  };

  it('produces a schema-valid room', () => {
    expect(roomSummary.safeParse(toRoomSummary(room)).success).toBe(true);
  });

  it('is always T3, whatever the credit weight says', () => {
    expect(toRoomSummary(room).tier).toBe('T3');
    expect(toRoomSummary({ ...room, CreditWeight: 10 }).tier).toBe('T3');
  });

  it('is bookable only when open for borrowing and actually there', () => {
    expect(toRoomSummary(room).bookable).toBe(true);

    const lent = { ...room, Resource: unit({ status: 'Lended' }).Resource };
    expect(toRoomSummary(lent).bookable).toBe(false);

    const closed = { ...room, Resource: unit({ allowBorrow: false }).Resource };
    expect(toRoomSummary(closed).bookable).toBe(false);
  });
});
