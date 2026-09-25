import { isEmailDomainAllowed, parseAllowedDomains } from './domain-policy';

describe('parseAllowedDomains', () => {
  it('splits, trims and lowercases a comma list', () => {
    expect(parseAllowedDomains(' Ku.th , KU.AC.TH ')).toEqual([
      'ku.th',
      'ku.ac.th',
    ]);
  });

  it('falls back to ku.th when unset, empty, or all-blank', () => {
    expect(parseAllowedDomains(undefined)).toEqual(['ku.th']);
    expect(parseAllowedDomains(null)).toEqual(['ku.th']);
    expect(parseAllowedDomains('')).toEqual(['ku.th']);
    expect(parseAllowedDomains(' , , ')).toEqual(['ku.th']);
  });
});

describe('isEmailDomainAllowed', () => {
  const allowed = ['ku.th', 'ku.ac.th'];

  it('accepts an address on an allowed domain', () => {
    expect(isEmailDomainAllowed('student@ku.th', allowed)).toBe(true);
    expect(isEmailDomainAllowed('staff@ku.ac.th', allowed)).toBe(true);
  });

  it('is case-insensitive on the domain', () => {
    expect(isEmailDomainAllowed('student@KU.TH', allowed)).toBe(true);
  });

  it('rejects a domain not in the list', () => {
    expect(isEmailDomainAllowed('someone@gmail.com', allowed)).toBe(false);
  });

  it('rejects malformed addresses rather than throwing', () => {
    expect(isEmailDomainAllowed('no-at-sign', allowed)).toBe(false);
    expect(isEmailDomainAllowed('trailing-at@', allowed)).toBe(false);
  });

  it('does not match a domain that merely ends with an allowed one', () => {
    // "evilku.th" is not "ku.th" - a substring check here would be a bypass.
    expect(isEmailDomainAllowed('student@evilku.th', allowed)).toBe(false);
  });
});
