import { AdminService } from './admin.service';
import { changeRoleInput } from './admin.schema';
import { BusinessError } from '../common/errors/business-error';
import type { PrismaService } from '../prisma.service';
import type { AuditActor, AuditService } from '../common/audit/audit.service';
import type { CreditTierService } from '../common/credit/credit-tier.service';
import type { SessionService } from '../auth/session.service';
import type { StaffScopeService } from '../common/authority/staff-scope.service';
import type { CronService } from '../cron/cron.service';
import type { ConfigService } from '@nestjs/config';

/**
 * The role-change guard.
 *
 * `admin.changeRole` writes one column and deliberately leaves the account's
 * Authority rows alone, so a demotion can silently empty a department: the row
 * still says the person manages it, while every staff procedure now refuses
 * them. These cases pin down which moves are refused for that reason and -
 * just as important - which are not, since refusing every demotion would make
 * the screen unusable.
 */

const ACTOR: AuditActor = { accountKey: 99, ip: null, userAgent: null };

/** RoleInfo is seed data with free-text names; the service maps them itself. */
const ROLE_ROWS = [
  { RoleKey: 1, RoleName: 'Student' },
  { RoleKey: 2, RoleName: 'Staff' },
  { RoleKey: 3, RoleName: 'Professor' },
  { RoleKey: 4, RoleName: 'Admin' },
];

interface GroupFixture {
  ManageGroupKey: number;
  ManageGroup: {
    GroupType: 'Club' | 'Faculty';
    Branch: { BranchName: string | null } | null;
    Club: { ClubName: string | null } | null;
  };
}

/** A ManagementGroup that is a department (BranchInfo side of the pair). */
function branch(key: number, name: string): GroupFixture {
  return {
    ManageGroupKey: key,
    ManageGroup: {
      GroupType: 'Faculty',
      Branch: { BranchName: name },
      Club: null,
    },
  };
}

function serviceWith(options: {
  /** RoleName on the account being changed. */
  currentRoleName?: string;
  /** Groups the account holds an Authority row in. */
  held?: GroupFixture[];
  /** Other holders of those groups, as (group, RoleName) pairs. */
  peers?: { ManageGroupKey: number; RoleName: string }[];
  /** Counts returned for every open-work query, in query order. */
  openWork?: number[];
  /** false makes the account read as missing. */
  exists?: boolean;
}) {
  const held = options.held ?? [];
  const peers = options.peers ?? [];
  const openWork = options.openWork ?? [0, 0, 0, 0];

  const findAuthorities = jest
    .fn()
    // First call reads the groups the account holds, second reads the peers.
    .mockResolvedValueOnce(held)
    .mockResolvedValueOnce(
      peers.map((peer) => ({
        ManageGroupKey: peer.ManageGroupKey,
        Account: { Role: { RoleName: peer.RoleName } },
      })),
    );

  const findAccount = jest.fn().mockImplementation((args: unknown) => {
    const select = (args as { select: Record<string, unknown> }).select;
    if (options.exists === false) return Promise.resolve(null);
    // The role read selects only Role; the detail read selects the scalars.
    if (select.AccountKey !== true) {
      return Promise.resolve({
        Role: { RoleName: options.currentRoleName ?? 'Staff' },
      });
    }
    return Promise.resolve({
      AccountKey: 7,
      UserID: 's1',
      UserFName: 'Ana',
      UserLName: 'Lek',
      Email: 'ana@ku.th',
      UserCredit: 100,
      IsActive: true,
      Role: { RoleName: options.currentRoleName ?? 'Staff' },
      Authorities: [],
      Penalties: [],
    });
  });

  const updateAccount = jest.fn().mockResolvedValue({ AccountKey: 7 });
  const record = jest.fn().mockResolvedValue(undefined);
  const counts = openWork.map((n) => jest.fn().mockResolvedValue(n));

  const prisma = {
    accountInfo: { findUnique: findAccount, update: updateAccount },
    authority: { findMany: findAuthorities },
    roleInfo: { findMany: jest.fn().mockResolvedValue(ROLE_ROWS) },
    reservations: { count: counts[0] },
    extensionRequest: { count: counts[1] },
    usageLog: { count: counts[2] },
    repairLog: { count: counts[3] },
    // The service passes an array of pending queries; running them is what the
    // real client does, and keeps the count mocks above meaningful.
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as PrismaService;

  const service = new AdminService(
    prisma,
    {
      resolveBorrowLimits: jest.fn().mockResolvedValue({
        creditTier: 'D0',
        maxBorrowDays: 7,
        maxExtendTimes: 2,
      }),
    } as unknown as CreditTierService,
    {} as SessionService,
    { record } as unknown as AuditService,
    {} as StaffScopeService,
    {} as ConfigService,
    {} as CronService,
  );

  return { service, findAuthorities, findAccount, updateAccount, record };
}

/** Inputs go through the schema, so a test cannot pass a shape tRPC would reject. */
function input(id: number, role: string) {
  return changeRoleInput.parse({ id, role });
}

describe('changeRole - departmental cover', () => {
  it('refuses demoting the last staff member of a department', async () => {
    const { service, updateAccount } = serviceWith({
      currentRoleName: 'Staff',
      held: [branch(4, 'วิศวกรรมคอมพิวเตอร์')],
      peers: [],
      openWork: [3, 1, 5, 2],
    });

    await expect(
      service.changeRole(input(7, 'borrower'), ACTOR),
    ).rejects.toMatchObject({
      message: 'ROLE_CHANGE_WOULD_ORPHAN_GROUP',
    });
    // Refused before the column is written, not rolled back afterwards.
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it('names the group and the work stuck in it', async () => {
    const { service } = serviceWith({
      currentRoleName: 'Staff',
      held: [branch(4, 'วิศวกรรมคอมพิวเตอร์')],
      peers: [],
      openWork: [3, 1, 5, 2],
    });

    // The admin has to be told what to reassign, not only that the move is
    // refused, so the payload carries the group and its open work.
    const error = await service
      .changeRole(input(7, 'borrower'), ACTOR)
      .catch((e: unknown) => e as BusinessError);

    expect(error).toBeInstanceOf(BusinessError);
    expect((error as BusinessError).details).toEqual({
      accountKey: 7,
      from: 'staff',
      to: 'borrower',
      groups: [
        {
          manageGroupKey: 4,
          groupName: 'วิศวกรรมคอมพิวเตอร์',
          groupType: 'Faculty',
          losing: 'staff',
          openWork: {
            pendingRequests: 3,
            pendingExtensions: 1,
            openLoans: 5,
            openRepairs: 2,
          },
        },
      ],
    });
  });

  it('allows the same demotion when a colleague still covers the group', async () => {
    const { service, updateAccount } = serviceWith({
      currentRoleName: 'Staff',
      held: [branch(4, 'วิศวกรรมคอมพิวเตอร์')],
      peers: [{ ManageGroupKey: 4, RoleName: 'Staff' }],
    });

    await expect(
      service.changeRole(input(7, 'borrower'), ACTOR),
    ).resolves.toMatchObject({ id: 7 });
    expect(updateAccount).toHaveBeenCalled();
  });

  it('counts a supervisor as cover for a staff-level vacancy', async () => {
    // The roles are a ladder (auth.middleware.ts), so anyone above the level
    // being lost can do the work.
    const { service } = serviceWith({
      currentRoleName: 'Staff',
      held: [branch(4, 'วิศวกรรมคอมพิวเตอร์')],
      peers: [{ ManageGroupKey: 4, RoleName: 'Professor' }],
    });

    await expect(
      service.changeRole(input(7, 'borrower'), ACTOR),
    ).resolves.toMatchObject({ id: 7 });
  });

  it('refuses supervisor to staff when nobody else can decide T2 there', async () => {
    // A staff colleague keeps the counter open but cannot clear the
    // supervisor-routed queue, so the group still loses a level.
    const { service } = serviceWith({
      currentRoleName: 'Professor',
      held: [branch(4, 'วิศวกรรมคอมพิวเตอร์')],
      peers: [{ ManageGroupKey: 4, RoleName: 'Staff' }],
    });

    const error = await service
      .changeRole(input(7, 'staff'), ACTOR)
      .catch((e: unknown) => e as BusinessError);

    expect((error as BusinessError).businessCode).toBe(
      'ROLE_CHANGE_WOULD_ORPHAN_GROUP',
    );
    expect((error as BusinessError).details?.groups).toMatchObject([
      { manageGroupKey: 4, losing: 'supervisor' },
    ]);
  });

  it('allows supervisor to staff when another supervisor holds the group', async () => {
    const { service } = serviceWith({
      currentRoleName: 'Professor',
      held: [branch(4, 'วิศวกรรมคอมพิวเตอร์')],
      peers: [{ ManageGroupKey: 4, RoleName: 'Professor' }],
    });

    await expect(
      service.changeRole(input(7, 'staff'), ACTOR),
    ).resolves.toMatchObject({ id: 7 });
  });

  it('reports every affected group, not just the first', async () => {
    const { service } = serviceWith({
      currentRoleName: 'Staff',
      held: [branch(4, 'ภาค ก'), branch(5, 'ภาค ข')],
      // Group 5 is covered; group 4 is not.
      peers: [{ ManageGroupKey: 5, RoleName: 'Staff' }],
    });

    const error = await service
      .changeRole(input(7, 'borrower'), ACTOR)
      .catch((e: unknown) => e as BusinessError);

    expect((error as BusinessError).details?.groups).toMatchObject([
      { manageGroupKey: 4, groupName: 'ภาค ก' },
    ]);
  });

  it('does not count a peer whose RoleName maps to nothing', async () => {
    // A hand-added RoleInfo row is not evidence that somebody can cover the
    // department, so it must not silently unblock the move.
    const { service } = serviceWith({
      currentRoleName: 'Staff',
      held: [branch(4, 'ภาค ก')],
      peers: [{ ManageGroupKey: 4, RoleName: 'Librarian' }],
    });

    await expect(
      service.changeRole(input(7, 'borrower'), ACTOR),
    ).rejects.toMatchObject({ message: 'ROLE_CHANGE_WOULD_ORPHAN_GROUP' });
  });

  it('only counts colleagues who can still sign in', async () => {
    const { service, findAuthorities } = serviceWith({
      currentRoleName: 'Staff',
      held: [branch(4, 'ภาค ก')],
      peers: [{ ManageGroupKey: 4, RoleName: 'Staff' }],
    });

    await service.changeRole(input(7, 'borrower'), ACTOR);

    // A disabled account cannot authenticate, so it is not cover - the filter
    // has to be in the query rather than assumed.
    const calls = findAuthorities.mock.calls as {
      where: Record<string, unknown>;
    }[][];
    expect(calls[1][0].where).toMatchObject({
      AccountKey: { not: 7 },
      Account: { IsActive: true },
    });
  });
});

describe('changeRole - moves the guard leaves alone', () => {
  it('skips the check entirely on a promotion', async () => {
    const { service, findAuthorities } = serviceWith({
      currentRoleName: 'Student',
      held: [branch(4, 'ภาค ก')],
    });

    await expect(
      service.changeRole(input(7, 'supervisor'), ACTOR),
    ).resolves.toMatchObject({ id: 7 });
    // Nothing can lose cover by gaining a rank, so the lookups never run.
    expect(findAuthorities).not.toHaveBeenCalled();
  });

  it('allows demoting somebody attached to no department', async () => {
    const { service } = serviceWith({
      currentRoleName: 'Staff',
      held: [],
    });

    await expect(
      service.changeRole(input(7, 'borrower'), ACTOR),
    ).resolves.toMatchObject({ id: 7 });
  });

  it('still refuses self-demotion before touching the database', async () => {
    const { service, findAccount } = serviceWith({ currentRoleName: 'Admin' });

    await expect(
      service.changeRole(input(ACTOR.accountKey, 'staff'), ACTOR),
    ).rejects.toMatchObject({ message: 'CANNOT_MODIFY_SELF' });
    expect(findAccount).not.toHaveBeenCalled();
  });

  it('reports a missing account as not found', async () => {
    const { service } = serviceWith({ exists: false });

    await expect(
      service.changeRole(input(7, 'borrower'), ACTOR),
    ).rejects.toMatchObject({ message: 'USER_NOT_FOUND' });
  });
});
