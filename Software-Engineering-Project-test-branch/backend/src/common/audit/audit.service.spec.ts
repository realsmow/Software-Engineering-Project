import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma.service';
import { AuditService } from './audit.service';

/**
 * Against a real database, because the whole value of this table is that rows
 * survive. A mocked Prisma would prove only that the service calls the methods
 * this file told it to call.
 */
describe('AuditService', () => {
  let service: AuditService;
  let prisma: PrismaService;

  let roleKey: number;
  let actorKey: number;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditService, PrismaService],
    }).compile();

    service = module.get(AuditService);
    prisma = module.get(PrismaService);

    const role = await prisma.roleInfo.create({ data: { RoleName: 'Admin' } });
    roleKey = role.RoleKey;

    const actor = await prisma.accountInfo.create({
      data: {
        Email: 'audit.spec@example.com',
        HashedPassword: 'not-a-real-hash',
        UserID: 'AUDITSPEC1',
        UserFName: 'Audit',
        UserLName: 'Actor',
        UserCredit: 100,
        RoleKey: roleKey,
      },
    });
    actorKey = actor.AccountKey;
  }, 30_000);

  afterAll(async () => {
    try {
      if (actorKey) {
        await prisma.auditLog.deleteMany({ where: { ActorKey: actorKey } });
        await prisma.accountInfo.delete({ where: { AccountKey: actorKey } });
      }
      if (roleKey)
        await prisma.roleInfo.delete({ where: { RoleKey: roleKey } });
    } finally {
      await prisma?.$disconnect();
    }
  }, 30_000);

  afterEach(async () => {
    if (actorKey)
      await prisma.auditLog.deleteMany({ where: { ActorKey: actorKey } });
  });

  it('records who did what, with the request context', async () => {
    await service.record(
      { accountKey: actorKey, ip: '203.0.113.9', userAgent: 'jest' },
      'role',
      'account/42',
      'Role changed to staff',
    );

    const page = await service.list({ page: 1, pageSize: 10, order: 'desc' });
    const row = page.items.find((e) => e.target === 'account/42');

    expect(row).toMatchObject({
      actorId: actorKey,
      actorName: 'Audit Actor',
      actorRole: 'admin',
      action: 'role',
      target: 'account/42',
      ip: '203.0.113.9',
      userAgent: 'jest',
      detail: 'Role changed to staff',
    });
  });

  it('copies the actor name in, so later renames do not rewrite history', async () => {
    await service.record(
      { accountKey: actorKey },
      'update',
      'account/1',
      'before rename',
    );

    await prisma.accountInfo.update({
      where: { AccountKey: actorKey },
      data: { UserFName: 'Renamed' },
    });

    try {
      const page = await service.list({ page: 1, pageSize: 10, order: 'desc' });
      // The row still says who they were at the time, not who they are now.
      expect(page.items[0].actorName).toBe('Audit Actor');
    } finally {
      await prisma.accountInfo.update({
        where: { AccountKey: actorKey },
        data: { UserFName: 'Audit' },
      });
    }
  });

  it('returns newest first', async () => {
    await service.record(
      { accountKey: actorKey },
      'create',
      'account/1',
      'first',
    );
    await service.record(
      { accountKey: actorKey },
      'create',
      'account/2',
      'second',
    );

    const page = await service.list({ page: 1, pageSize: 10, order: 'desc' });
    const mine = page.items.filter(
      (e) => e.detail === 'first' || e.detail === 'second',
    );
    expect(mine[0].detail).toBe('second');
  });

  it('filters by action', async () => {
    await service.record(
      { accountKey: actorKey },
      'login',
      'account/1',
      'signed in',
    );
    await service.record(
      { accountKey: actorKey },
      'config',
      'borrowRule/1',
      'changed',
    );

    const page = await service.list({
      page: 1,
      pageSize: 50,
      order: 'desc',
      action: 'config',
    });
    expect(page.items.every((e) => e.action === 'config')).toBe(true);
    expect(page.items.some((e) => e.detail === 'changed')).toBe(true);
  });

  it('getById returns null for an id that does not exist', async () => {
    await expect(service.getById(99_999_999)).resolves.toBeNull();
  });

  it('never throws when the write fails, so it cannot undo the action it records', async () => {
    // A non-existent actor violates the foreign key. The action that triggered
    // this has already succeeded, so losing the row must not surface as an
    // error to the caller.
    await expect(
      service.record(
        { accountKey: 99_999_999 },
        'update',
        'account/1',
        'orphan',
      ),
    ).resolves.toBeUndefined();
  });
});
