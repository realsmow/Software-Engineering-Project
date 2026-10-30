import 'dotenv/config';
import { PrismaService } from './prisma.service';
import { purge, type PurgeTarget } from './demo/purge';
import { tryMapUserRole } from './common/schemas/status.schema';
import { chooseDatabase } from './demo/database-url';

/**
 * Removes everything whose name contains "test" (any case): equipment types
 * with their units, rooms, departments and clubs, and accounts (login name,
 * name or email) - except admin accounts, which are kept.
 *
 *   npm run cleanup:test-data             (list only)
 *   npm run cleanup:test-data -- --apply
 *
 * Asks for the database URL at the prompt (hidden); Enter alone uses the
 * local one from .env.
 *
 * A department or club is removed only when every unit it owns is in the
 * list; otherwise it is reported and kept.
 */
export async function findTestData(prisma: PrismaService) {
  const like = { contains: 'test', mode: 'insensitive' as const };

  const items = await prisma.itemInfo.findMany({
    where: { ItemName: like },
    select: {
      ItemKey: true,
      ItemName: true,
      Items: {
        select: {
          ResourceKey: true,
          Resource: { select: { _count: { select: { UsageLogs: true } } } },
        },
      },
    },
    orderBy: { ItemKey: 'asc' },
  });
  const rooms = await prisma.roomInfo.findMany({
    where: { RoomName: like },
    select: {
      ResourceKey: true,
      RoomName: true,
      Resource: { select: { _count: { select: { Reservations: true } } } },
    },
    orderBy: { ResourceKey: 'asc' },
  });
  const resourceKeys = [
    ...items.flatMap((i) => i.Items.map((u) => u.ResourceKey)),
    ...rooms.map((r) => r.ResourceKey),
  ];

  const groups = await prisma.managementGroup.findMany({
    where: {
      OR: [{ Branch: { BranchName: like } }, { Club: { ClubName: like } }],
    },
    select: {
      ManageGroupKey: true,
      Branch: { select: { BranchName: true } },
      Club: { select: { ClubName: true } },
      Resources: { select: { ResourceKey: true } },
    },
  });
  const removableGroups = groups.filter((g) =>
    g.Resources.every((r) => resourceKeys.includes(r.ResourceKey)),
  );
  const keptGroups = groups.filter((g) => !removableGroups.includes(g));

  // Admins are recognised the way the app does it (tryMapUserRole: any case
  // or spacing of "admin"), and an account whose login name says admin is
  // kept as well. Matching the exact spelling 'Admin' let one through.
  const accounts = (
    await prisma.accountInfo.findMany({
      where: {
        OR: [
          { UserID: like },
          { UserFName: like },
          { UserLName: like },
          { Email: like },
        ],
      },
      select: {
        AccountKey: true,
        UserID: true,
        Email: true,
        UserFName: true,
        UserLName: true,
        Role: { select: { RoleName: true } },
        _count: { select: { UsageLogs: true } },
      },
      orderBy: { AccountKey: 'asc' },
    })
  ).filter(
    (a) =>
      tryMapUserRole(a.Role.RoleName) !== 'admin' &&
      !a.UserID.toLowerCase().includes('admin') &&
      // Only the part before the @: some real students' addresses sit on a
      // domain with "test" in it, and they are not test accounts.
      [a.UserID, a.UserFName, a.UserLName, a.Email.split('@')[0]].some((v) =>
        v.toLowerCase().includes('test'),
      ),
  );

  const target: PurgeTarget = {
    accountKeys: accounts.map((a) => a.AccountKey),
    resourceKeys,
    itemKeys: items.map((i) => i.ItemKey),
    groupKeys: removableGroups.map((g) => g.ManageGroupKey),
  };
  return { items, rooms, removableGroups, keptGroups, accounts, target };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const host = await chooseDatabase();
  const prisma = new PrismaService();
  try {
    const found = await findTestData(prisma);
    const groupName = (g: (typeof found.keptGroups)[number]) =>
      g.Branch?.BranchName ?? g.Club?.ClubName ?? `#${g.ManageGroupKey}`;

    console.log(`Names containing "test" on ${host}:\n`);
    console.log('Equipment types (with every unit and its loans):');
    for (const i of found.items) {
      const loans = i.Items.reduce(
        (n, u) => n + u.Resource._count.UsageLogs,
        0,
      );
      console.log(
        `  ${i.ItemKey}  ${i.ItemName}  (${i.Items.length} units, ${loans} loans)`,
      );
    }
    console.log('Rooms:');
    for (const r of found.rooms) {
      console.log(
        `  ${r.ResourceKey}  ${r.RoomName}  (${r.Resource._count.Reservations} bookings)`,
      );
    }
    console.log('Departments and clubs:');
    for (const g of found.removableGroups) {
      console.log(`  ${g.ManageGroupKey}  ${groupName(g)}`);
    }
    for (const g of found.keptGroups) {
      console.log(
        `  KEPT ${g.ManageGroupKey}  ${groupName(g)} (still owns units not in this list)`,
      );
    }
    console.log('Accounts (admins are never removed):');
    for (const a of found.accounts) {
      console.log(
        `  ${a.AccountKey}  ${a.UserID}  ${a.UserFName} ${a.UserLName}  ${a.Email}  (${a._count.UsageLogs} loans)`,
      );
    }

    if (!apply) {
      console.log(
        '\nNothing was changed. Run again with --apply to delete the above.',
      );
      return;
    }
    const result = await prisma.$transaction((tx) => purge(tx, found.target), {
      timeout: 120_000,
    });
    console.log(
      `\nDeleted. ${result.loans} loans, ${result.requests} requests and ${result.penalties} penalties went with them; credit recalculated for ${result.creditRecalculated} account(s).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
