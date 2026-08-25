import {
  DAMAGE_CONDITION,
  DAMAGE_CREDIT_WEIGHT,
  tryMapDamageLevel,
  tryMapTier,
} from './status.schema';
import {
  addDays,
  daysBetween,
  toDueDate,
  toIsoNullable,
} from './datetime.schema';

/**
 * The two vocabularies the staff domain adds — tiers and damage grades — plus
 * the date helpers every one of its outputs goes through.
 *
 * Worth testing because both are conversions at the schema boundary: get one
 * wrong and the wrong penalty is charged, or the wrong tier's approval rules
 * are applied, with nothing in the type system to notice.
 */

describe('tryMapTier', () => {
  it.each(['T0', 'T1', 'T2', 'T3'])('recognises %s', (name) => {
    expect(tryMapTier(name)).toBe(name);
  });

  it('accepts the lowercase a seed script might write', () => {
    expect(tryMapTier('t2')).toBe('T2');
  });

  it('returns null for a BorrowRule that is not one of the four tiers', () => {
    // Departments may add their own rules; those are simply not tier options,
    // and a list query must not blow up on one.
    expect(tryMapTier('Special lab rule')).toBeNull();
  });

  it('returns null rather than throwing on an unnamed rule', () => {
    expect(tryMapTier(null)).toBeNull();
  });
});

describe('damage grades', () => {
  it('maps each grade to the ConditionType stored in ConditionLog', () => {
    expect(DAMAGE_CONDITION).toEqual({
      B0: 'Normal',
      B1: 'MinorDamage',
      B2: 'MajorDamage',
      B3: 'Broken',
    });
  });

  it('keeps the proposal multipliers 0 / 1 / 3 / 5', () => {
    expect(DAMAGE_CREDIT_WEIGHT).toEqual({ B0: 0, B1: 1, B2: 3, B3: 5 });
  });

  it('reads a stored condition back as its grade', () => {
    expect(tryMapDamageLevel('MajorDamage')).toBe('B2');
  });

  it('has no grade for Missing — that is a state, not something staff award', () => {
    expect(tryMapDamageLevel('Missing')).toBeNull();
  });
});

describe('date helpers', () => {
  it('turns a calendar day into the agreed due instant', () => {
    // 10:00 UTC is 17:00 in Thailand, the counter's closing time.
    expect(toDueDate('2026-08-20')).toEqual(new Date('2026-08-20T10:00:00Z'));
  });

  it('adds whole days without moving the time of day', () => {
    expect(addDays(new Date('2026-08-20T10:00:00Z'), 24)).toEqual(
      new Date('2026-09-13T10:00:00Z'),
    );
  });

  it('reports no elapsed days when the second moment is earlier', () => {
    expect(
      daysBetween(
        new Date('2026-08-20T10:00:00Z'),
        new Date('2026-08-01T00:00:00Z'),
      ),
    ).toBe(0);
  });

  it('passes null through instead of inventing a timestamp', () => {
    expect(toIsoNullable(null)).toBeNull();
    expect(toIsoNullable(undefined)).toBeNull();
  });
});
