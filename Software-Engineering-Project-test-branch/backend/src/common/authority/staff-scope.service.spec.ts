import { StaffScopeService } from './staff-scope.service';
import { BusinessError } from '../errors/business-error';
import type { PrismaService } from '../../prisma.service';
import type { TrpcUser } from '../../trpc/context';

/**
 * Departmental scope is the check that stops one department's staff acting on
 * another's equipment (§5.1), so its edge cases are worth pinning down: an
 * admin must stay unscoped, a staff member with no Authority must not silently
 * see nothing, and a resource key that arrives from the client must be verified
 * rather than trusted.
 */

function user(overrides: Partial<TrpcUser> = {}): TrpcUser {
  return {
    accountKey: 1,
    role: 'staff',
    facultyKey: null,
    creditScore: 100,
    ...overrides,
  };
}

function serviceWith(options: {
  authorities?: { ManageGroupKey: number }[];
  resource?: { ManagedBy: number } | null;
}) {
  // The spies are handed back directly rather than read off the client later,
  // so asserting on one never detaches a method from its object.
  const findAuthorities = jest
    .fn()
    .mockResolvedValue(options.authorities ?? []);
  const findResource = jest.fn().mockResolvedValue(options.resource ?? null);

  const prisma = {
    authority: { findMany: findAuthorities },
    resourceInfo: { findUnique: findResource },
  } as unknown as PrismaService;

  return {
    service: new StaffScopeService(prisma),
    findAuthorities,
    findResource,
  };
}

describe('resolveGroupKeys', () => {
  it('returns null for an admin, meaning every group', async () => {
    const { service, findAuthorities } = serviceWith({});

    await expect(
      service.resolveGroupKeys(user({ role: 'admin' })),
    ).resolves.toBeNull();
    // Not "every key in the table": a list would go stale, and no filter is
    // what unscoped actually means downstream.
    expect(findAuthorities).not.toHaveBeenCalled();
  });

  it('returns the groups the account holds an Authority in', async () => {
    const { service } = serviceWith({
      authorities: [{ ManageGroupKey: 3 }, { ManageGroupKey: 9 }],
    });

    await expect(service.resolveGroupKeys(user())).resolves.toEqual([3, 9]);
  });

  it('refuses a staff account attached to no department', async () => {
    // Returning an empty scope would render as "your department has no
    // equipment", which is the wrong thing for that person to conclude.
    const { service } = serviceWith({ authorities: [] });

    await expect(service.resolveGroupKeys(user())).rejects.toMatchObject({
      message: 'NO_MANAGEMENT_SCOPE',
    });
  });
});

describe('resourceScope', () => {
  it('is an empty filter for an admin', async () => {
    const { service } = serviceWith({});

    await expect(
      service.resourceScope(user({ role: 'admin' })),
    ).resolves.toEqual({});
  });

  it('filters ManagedBy to the caller groups', async () => {
    const { service } = serviceWith({ authorities: [{ ManageGroupKey: 4 }] });

    await expect(service.resourceScope(user())).resolves.toEqual({
      ManagedBy: { in: [4] },
    });
  });
});

describe('assertResourceInScope', () => {
  it('lets an admin through without reading the row', async () => {
    const { service, findResource } = serviceWith({});

    await expect(
      service.assertResourceInScope(user({ role: 'admin' }), 55),
    ).resolves.toBeUndefined();
    expect(findResource).not.toHaveBeenCalled();
  });

  it('accepts a resource owned by one of the caller groups', async () => {
    const { service } = serviceWith({
      authorities: [{ ManageGroupKey: 4 }],
      resource: { ManagedBy: 4 },
    });

    await expect(
      service.assertResourceInScope(user(), 55),
    ).resolves.toBeUndefined();
  });

  it('rejects a resource owned by another department', async () => {
    const { service } = serviceWith({
      authorities: [{ ManageGroupKey: 4 }],
      resource: { ManagedBy: 5 },
    });

    await expect(
      service.assertResourceInScope(user(), 55),
    ).rejects.toMatchObject({
      message: 'OUT_OF_MANAGEMENT_SCOPE',
    });
  });

  it('reports a missing resource as not found rather than out of scope', async () => {
    const { service } = serviceWith({
      authorities: [{ ManageGroupKey: 4 }],
      resource: null,
    });

    await expect(
      service.assertResourceInScope(user(), 55),
    ).rejects.toMatchObject({
      message: 'RESOURCE_NOT_FOUND',
    });
  });

  it('throws BusinessError, so the code reaches the client as a business code', async () => {
    const { service } = serviceWith({
      authorities: [{ ManageGroupKey: 4 }],
      resource: { ManagedBy: 5 },
    });

    await expect(
      service.assertResourceInScope(user(), 55),
    ).rejects.toBeInstanceOf(BusinessError);
  });
});

describe('assertGroupInScope', () => {
  it('rejects registering equipment into a department the caller has no authority in', async () => {
    const { service } = serviceWith({ authorities: [{ ManageGroupKey: 4 }] });

    await expect(service.assertGroupInScope(user(), 8)).rejects.toMatchObject({
      message: 'OUT_OF_MANAGEMENT_SCOPE',
    });
  });

  it('accepts one the caller does', async () => {
    const { service } = serviceWith({ authorities: [{ ManageGroupKey: 4 }] });

    await expect(
      service.assertGroupInScope(user(), 4),
    ).resolves.toBeUndefined();
  });
});
