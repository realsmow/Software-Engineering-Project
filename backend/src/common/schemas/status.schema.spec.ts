import {
  creditWeightRangeForTier,
  mapUserRole,
  tierFromCreditWeight,
  tryMapUserRole,
} from './status.schema';

describe('tierFromCreditWeight', () => {
  it('matches the weights the team already agreed on in TIER_CONFIG', () => {
    // frontend/src/constants/index.ts — T0:0, T1:5, T2:10
    expect(tierFromCreditWeight(0, 'Item')).toBe('T0');
    expect(tierFromCreditWeight(5, 'Item')).toBe('T1');
    expect(tierFromCreditWeight(10, 'Item')).toBe('T2');
  });

  it('is a room before it is a weight', () => {
    // A room is T3 because of what it is, whatever its credit weight says.
    expect(tierFromCreditWeight(0, 'Room')).toBe('T3');
    expect(tierFromCreditWeight(10, 'Room')).toBe('T3');
  });

  it('places weights nobody anticipated instead of throwing', () => {
    expect(tierFromCreditWeight(2.5, 'Item')).toBe('T1');
    expect(tierFromCreditWeight(7, 'Item')).toBe('T2');
    expect(tierFromCreditWeight(999, 'Item')).toBe('T2');
    // Negative is nonsense data, but a catalogue page must still render.
    expect(tierFromCreditWeight(-1, 'Item')).toBe('T0');
  });
});

describe('creditWeightRangeForTier', () => {
  /** The range and the classifier must agree, or a tier filter hides its own rows. */
  const weights = [0, 0.5, 1, 2.5, 5, 5.5, 7, 10, 42];

  it.each(['T0', 'T1', 'T2'] as const)(
    'round-trips every sample weight for %s',
    (tier) => {
      const range = creditWeightRangeForTier(tier);
      expect(range).not.toBeNull();

      for (const weight of weights) {
        const inRange =
          (range!.gte === undefined || weight >= range!.gte) &&
          (range!.lte === undefined || weight <= range!.lte);

        expect(inRange).toBe(tierFromCreditWeight(weight, 'Item') === tier);
      }
    },
  );

  it('has no range for T3, because rooms are a different table', () => {
    expect(creditWeightRangeForTier('T3')).toBeNull();
  });
});

describe('mapUserRole', () => {
  it('maps the names the seed data actually uses', () => {
    expect(mapUserRole('Student')).toBe('borrower');
    expect(mapUserRole('Professor')).toBe('supervisor');
    expect(mapUserRole('Staff')).toBe('staff');
    expect(mapUserRole('Admin')).toBe('admin');
  });

  it('ignores casing and stray whitespace', () => {
    expect(mapUserRole('  ADMIN ')).toBe('admin');
  });

  it('throws on a name nobody mapped, rather than guessing', () => {
    expect(() => mapUserRole('Librarian')).toThrow(/Librarian/);
  });

  it('has a non-throwing twin for scanning rows', () => {
    expect(tryMapUserRole('Librarian')).toBeNull();
    expect(tryMapUserRole('Staff')).toBe('staff');
  });
});
