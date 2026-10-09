import { PrismaService } from '../../src/prisma.service';
import { requireIsolatedDatabase } from '../fixtures/isolated-database';
import type { Prisma } from '../../src/generated/prisma/client';
import {
  extensionOptionsOutput,
  extensionOutput,
  requestExtensionInput,
  decideExtensionInput,
  inspectExtensionInput,
  paginatedExtensionReviews,
  staffQueueCounts,
} from '../../src/loan/loan.schema';
import {
  inHistoryFixture,
  transactionClient,
} from '../fixtures/borrower-history';
import { creditLoanFixture } from '../fixtures/loan-extension';
import { freezeBusinessDate } from '../fixtures/business-clock';
import { workHours } from '../../src/common/schemas/datetime.schema';
import { PenaltyService } from '../../src/common/penalty/penalty.service';
import { NotificationService } from '../../src/notification/notification.service';
import { CronService } from '../../src/cron/cron.service';
import { LoanService } from '../../src/loan/loan.service';
import { StaffScopeService } from '../../src/common/authority/staff-scope.service';
import { CreditTierService } from '../../src/common/credit/credit-tier.service';
import { ApprovalService } from '../../src/approval/approval.service';
import { approvalCounts } from '../../src/approval/approval.schema';

const DAY = 86_400_000;
type Fixture = Awaited<ReturnType<typeof creditLoanFixture>>;

function requestFor(f: Fixture) {
  return requestExtensionInput.parse({
    usageKey: f.activeLoan.UsageKey,
    requestedDueAt: new Date(f.due.getTime() + DAY).toISOString(),
    reason: 'Finish the laboratory project',
  });
}

async function assertUnchanged(tx: Prisma.TransactionClient, f: Fixture) {
  expect(
    await tx.usageLog.findUniqueOrThrow({
      where: { UsageKey: f.activeLoan.UsageKey },
    }),
  ).toMatchObject({ DueTime: f.due, CurrentStatus: 'Lended' });
  expect(
    await tx.reservations.findUniqueOrThrow({
      where: { ReservationKey: f.reservation.ReservationKey },
    }),
  ).toMatchObject({ EndTime: f.due });
}

/** The fixture's inspector as a staff member over the loan's department. */
async function staffInScope(tx: Prisma.TransactionClient, f: Fixture) {
  await tx.authority.create({
    data: {
      AccountKey: f.f.inspector.AccountKey,
      ManageGroupKey: f.f.group.ManageGroupKey,
      AuthorityRoleKey: f.f.authorityRole.AuthorityRoleKey,
    },
  });
  return {
    ...f.f.decider,
    accountKey: f.f.inspector.AccountKey,
    role: 'staff' as const,
  };
}

async function nextBooking(
  tx: Prisma.TransactionClient,
  f: Fixture,
  status: 'Pending' | 'Approved',
) {
  const start = new Date(f.due.getTime() + DAY / 2);
  return tx.reservations.create({
    data: {
      ResourceKey: f.activeLoan.ResourceKey,
      ReservedBy: f.f.inspector.AccountKey,
      StartTime: start,
      EndTime: new Date(start.getTime() + DAY),
      ApproveStatus: status,
      ReservationExpiration: new Date(start.getTime() + DAY),
      ActionTime: new Date(),
    },
  });
}

describe('SDS renewal workflow: gates before routing and persisted decisions', () => {
  let prisma: PrismaService;
  // Generic routing cases must not become weekend cases on Thursday/Friday CI.
  beforeEach(() => freezeBusinessDate(new Date('2031-09-22T02:00:00Z')));
  afterEach(() => jest.useRealTimers());
  beforeAll(async () => {
    requireIsolatedDatabase();
    prisma = new PrismaService();
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  describe.each(['D0', 'D1'] as const)(
    '%s routing after the gates pass',
    (band) => {
      it.each([
        { tier: 'T0', used: 0, route: 'auto' },
        { tier: 'T1', used: 0, route: 'auto' },
        { tier: 'T1', used: 1, route: 'staff' },
        { tier: 'T1', used: 2, route: 'auto' },
        { tier: 'T1', used: 3, route: 'staff' },
        { tier: 'T2', used: 0, route: 'supervisor' },
        { tier: 'unconfigured', used: 0, route: 'staff' },
      ] as const)(
        'routes $tier with $used approved extensions to $route',
        async ({ tier, used, route }) => {
          await inHistoryFixture(prisma, async (tx) => {
            const f = await creditLoanFixture(tx, tier, band, used, 4);
            const options = extensionOptionsOutput
              .strict()
              .parse(
                await f.extensions.getOptions(f.user, f.activeLoan.UsageKey),
              );
            expect(options).toMatchObject({
              canRequest: true,
              blockedBy: null,
              route,
              requiresInspection: route !== 'auto',
              extensionsUsed: used,
              extensionsAllowed: 4,
              pendingExtensionKey: null,
              currentDueAt: f.due.toISOString(),
              maxRequestedDueAt: new Date(
                f.due.getTime() + 7 * DAY,
              ).toISOString(),
            });
            const input = requestFor(f);
            const result = extensionOutput
              .strict()
              .parse(await f.extensions.request(f.user, input));
            const automatic = route === 'auto';
            const targetDue = new Date(input.requestedDueAt);
            expect(result).toMatchObject({
              status: automatic ? 'Approved' : 'Pending',
              route,
              requiresInspection: !automatic,
              autoApproved: automatic,
              extendNo: used + 1,
              dueAt: automatic ? input.requestedDueAt : f.due.toISOString(),
              extensionsUsed: used + (automatic ? 1 : 0),
            });
            expect(
              await tx.extensionRequest.findUniqueOrThrow({
                where: { ExtensionKey: result.extensionKey },
              }),
            ).toMatchObject({
              ExtendNo: used + 1,
              PreviousDueTime: f.due,
              RequestedDueTime: targetDue,
              Reason: input.reason,
              ApprovedBy: null,
              ApproveStatus: automatic ? 'Approved' : 'Pending',
            });
            expect(
              await tx.usageLog.findUniqueOrThrow({
                where: { UsageKey: f.activeLoan.UsageKey },
              }),
            ).toMatchObject({
              DueTime: automatic ? targetDue : f.due,
              PendingExtension: automatic ? null : result.extensionKey,
            });
            expect(
              await tx.reservations.findUniqueOrThrow({
                where: { ReservationKey: f.reservation.ReservationKey },
              }),
            ).toMatchObject({ EndTime: automatic ? targetDue : f.due });
            if (automatic) {
              expect(result.resolvedAt).not.toBeNull();
              expect(
                await tx.notification.count({
                  where: {
                    AccountKey: f.user.accountKey,
                    NotificationType: 'RequestApproved',
                  },
                }),
              ).toBe(1);
            } else {
              expect(result.resolvedAt).toBeNull();
            }
          });
        },
      );
    },
  );

  it.each(['D0', 'D1', 'D2', 'D3'] as const)(
    'refuses a T3 room before credit routing for %s',
    async (band) => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await creditLoanFixture(tx, 'T1', band);
        const rule = await tx.borrowRule.create({ data: { RuleName: 'T3' } });
        const room = await tx.resourceInfo.create({
          data: {
            ManagedBy: f.f.group.ManageGroupKey,
            BorrowRule: rule.BorrowRuleKey,
            ResourceType: 'Room',
            ResourceStatus: 'Lended',
            BufferTime: 0,
            AllowBorrow: true,
            Room: {
              create: {
                RoomName: `Room-${f.activeLoan.UsageKey}`,
                RoomLocation: 'Test building',
                CreditWeight: 0,
              },
            },
          },
        });
        const condition = await tx.conditionLog.create({
          data: {
            ResourceKey: room.ResourceKey,
            Condition: 'Normal',
            LoggedBy: f.f.inspector.AccountKey,
            LoggedAt: new Date(),
          },
        });
        await tx.usageLog.update({
          where: { UsageKey: f.activeLoan.UsageKey },
          data: {
            ResourceKey: room.ResourceKey,
            CheckoutCondition: condition.ConditionKey,
          },
        });
        await tx.reservations.update({
          where: { ReservationKey: f.reservation.ReservationKey },
          data: { ResourceKey: room.ResourceKey },
        });
        expect(
          extensionOptionsOutput
            .strict()
            .parse(
              await f.extensions.getOptions(f.user, f.activeLoan.UsageKey),
            ),
        ).toMatchObject({
          canRequest: false,
          blockedBy: 'ROOM_NOT_EXTENDABLE',
          route: null,
        });
        await expect(
          f.extensions.request(f.user, requestFor(f)),
        ).rejects.toMatchObject({ businessCode: 'ROOM_NOT_EXTENDABLE' });
        expect(
          await tx.extensionRequest.count({
            where: { UsageKey: f.activeLoan.UsageKey },
          }),
        ).toBe(0);
        await assertUnchanged(tx, f);
        expect(f.audit.record).not.toHaveBeenCalled();
      });
    },
  );

  it('refuses a second pending request before D3 routing or creation', async () => {
    await inHistoryFixture(prisma, async (tx) => {
      const f = await creditLoanFixture(tx, 'T1', 'D2');
      const pending = extensionOutput
        .strict()
        .parse(await f.extensions.request(f.user, requestFor(f)));
      // The request was valid when filed; a later penalty lowers the band.
      const band = await tx.creditTier.findFirstOrThrow({
        where: { CreditTierName: 'D3' },
      });
      await tx.penaltyInfo.create({
        data: {
          AccountKey: f.user.accountKey,
          CreditDeducted: f.score - band.CreditMin,
          Reason: 'ReturnLate',
          InEffect: true,
          ActionTime: new Date(),
          ExpirationTime: f.f.penalty.ExpirationTime,
        },
      });
      await tx.accountInfo.update({
        where: { AccountKey: f.user.accountKey },
        data: { UserCredit: band.CreditMin },
      });
      await tx.borrowConstraints.create({
        data: {
          BorrowRuleKey: f.f.rule.BorrowRuleKey,
          CreditTierKey: band.CreditTierKey,
          MaxBorrowDate: 5,
          MaxExtendTime: 2,
        },
      });
      f.user.creditScore = band.CreditMin;
      f.audit.record.mockClear();
      expect(
        extensionOptionsOutput
          .strict()
          .parse(await f.extensions.getOptions(f.user, f.activeLoan.UsageKey)),
      ).toMatchObject({
        canRequest: false,
        blockedBy: 'EXTENSION_ALREADY_PENDING',
        pendingExtensionKey: pending.extensionKey,
      });
      await expect(
        f.extensions.request(f.user, requestFor(f)),
      ).rejects.toMatchObject({ businessCode: 'EXTENSION_ALREADY_PENDING' });
      expect(
        await tx.extensionRequest.count({
          where: { UsageKey: f.activeLoan.UsageKey },
        }),
      ).toBe(1);
      expect(
        (
          await tx.usageLog.findUniqueOrThrow({
            where: { UsageKey: f.activeLoan.UsageKey },
          })
        ).PendingExtension,
      ).toBe(pending.extensionKey);
      await assertUnchanged(tx, f);
      expect(f.audit.record).not.toHaveBeenCalled();
    });
  });

  it.each(['D0', 'D2'] as const)(
    'blocks an exhausted quota before the %s approval route',
    async (band) => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await creditLoanFixture(tx, 'T0', band, 2);
        expect(
          extensionOptionsOutput
            .strict()
            .parse(
              await f.extensions.getOptions(f.user, f.activeLoan.UsageKey),
            ),
        ).toMatchObject({
          canRequest: false,
          blockedBy: 'EXTENSION_QUOTA_EXCEEDED',
          extensionsUsed: 2,
          extensionsAllowed: 2,
        });
        await expect(
          f.extensions.request(f.user, requestFor(f)),
        ).rejects.toMatchObject({ businessCode: 'EXTENSION_QUOTA_EXCEEDED' });
        expect(
          await tx.extensionRequest.count({
            where: { UsageKey: f.activeLoan.UsageKey },
          }),
        ).toBe(2);
        await assertUnchanged(tx, f);
        expect(f.audit.record).not.toHaveBeenCalled();
      });
    },
  );

  it.each(['Pending', 'Approved'] as const)(
    'previews the next %s booking boundary and refuses to extend across it',
    async (status) => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await creditLoanFixture(tx, 'T0', 'D0');
        const booking = await nextBooking(tx, f, status);
        expect(
          extensionOptionsOutput
            .strict()
            .parse(
              await f.extensions.getOptions(f.user, f.activeLoan.UsageKey),
            ),
        ).toMatchObject({
          canRequest: true,
          maxRequestedDueAt: booking.StartTime.toISOString(),
        });
        await expect(
          f.extensions.request(f.user, requestFor(f)),
        ).rejects.toMatchObject({
          businessCode: 'WINDOW_NOT_AVAILABLE',
          details: { blockedBy: booking.ReservationKey },
        });
        expect(
          await tx.extensionRequest.count({
            where: { UsageKey: f.activeLoan.UsageKey },
          }),
        ).toBe(0);
        await assertUnchanged(tx, f);
        expect(f.audit.record).not.toHaveBeenCalled();
      });
    },
  );

  it.each(['staff', 'self', 'outside scope'] as const)(
    'refuses a supervisor-routed decision from %s without changing the pending request',
    async (caller) => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await creditLoanFixture(tx, 'T0', 'D2');
        const pending = extensionOutput
          .strict()
          .parse(await f.extensions.request(f.user, requestFor(f)));
        await tx.authority.create({
          data: {
            AccountKey: f.f.inspector.AccountKey,
            ManageGroupKey: f.f.group.ManageGroupKey,
            AuthorityRoleKey: f.f.authorityRole.AuthorityRoleKey,
          },
        });
        const user =
          caller === 'self'
            ? { ...f.user, role: 'supervisor' as const }
            : caller === 'staff'
              ? {
                  ...f.f.decider,
                  accountKey: f.f.inspector.AccountKey,
                  role: 'staff' as const,
                }
              : { ...f.f.decider };
        if (caller === 'outside scope') {
          const otherGroup = await tx.managementGroup.create({
            data: { GroupType: 'Faculty' },
          });
          await tx.authority.updateMany({
            where: { AccountKey: user.accountKey },
            data: { ManageGroupKey: otherGroup.ManageGroupKey },
          });
        }
        f.audit.record.mockClear();
        const before = await tx.conditionLog.count({
          where: { ResourceKey: f.activeLoan.ResourceKey },
        });
        await expect(
          f.extensions.decide(
            user,
            decideExtensionInput.parse({
              extensionKey: pending.extensionKey,
              decision: 'approve',
              condition: 'Normal',
            }),
          ),
        ).rejects.toMatchObject({
          businessCode:
            caller === 'self'
              ? 'CANNOT_APPROVE_OWN_REQUEST'
              : caller === 'staff'
                ? 'EXTENSION_NEEDS_SUPERVISOR'
                : 'OUT_OF_MANAGEMENT_SCOPE',
        });
        expect(
          await tx.extensionRequest.findUniqueOrThrow({
            where: { ExtensionKey: pending.extensionKey },
          }),
        ).toMatchObject({
          ApproveStatus: 'Pending',
          ApprovedBy: null,
          ResolvedAt: null,
        });
        expect(
          await tx.conditionLog.count({
            where: { ResourceKey: f.activeLoan.ResourceKey },
          }),
        ).toBe(before);
        await assertUnchanged(tx, f);
        expect(f.audit.record).not.toHaveBeenCalled();
      });
    },
  );

  it('a supervisor deciding a staff-route extension records no condition', async () => {
    await inHistoryFixture(prisma, async (tx) => {
      const f = await creditLoanFixture(tx, 'T1', 'D0', 1);
      const pending = extensionOutput
        .strict()
        .parse(await f.extensions.request(f.user, requestFor(f)));
      const before = await tx.resourceInfo.findUniqueOrThrow({
        where: { ResourceKey: f.activeLoan.ResourceKey },
      });
      await f.extensions.decide(
        f.f.decider,
        decideExtensionInput.parse({
          extensionKey: pending.extensionKey,
          decision: 'approve',
        }),
      );
      // Decided from the desk without the unit in hand, so nothing is logged.
      expect(
        (
          await tx.resourceInfo.findUniqueOrThrow({
            where: { ResourceKey: f.activeLoan.ResourceKey },
          })
        ).ConditionKey,
      ).toBe(before.ConditionKey);
    });
  });

  it.each(
    (
      [
        { role: 'supervisor', tier: 'T0', band: 'D2', used: 0 },
        { role: 'staff', tier: 'T1', band: 'D0', used: 1 },
      ] as const
    ).flatMap((row) =>
      (['approve', 'reject'] as const).map((decision) => ({
        ...row,
        decision,
      })),
    ),
  )(
    'persists a $role $decision decision, inspection and borrower notification',
    async ({ role, tier, band, used, decision }) => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await creditLoanFixture(tx, tier, band, used);
        const decider =
          role === 'supervisor'
            ? f.f.decider
            : { ...f.f.decider, accountKey: f.f.inspector.AccountKey, role };
        if (role === 'staff') {
          await tx.authority.create({
            data: {
              AccountKey: decider.accountKey,
              ManageGroupKey: f.f.group.ManageGroupKey,
              AuthorityRoleKey: f.f.authorityRole.AuthorityRoleKey,
            },
          });
        }
        const input = requestFor(f);
        const pending = extensionOutput
          .strict()
          .parse(await f.extensions.request(f.user, input));
        if (role === 'supervisor') {
          // #156: staff check the unit before the supervisor decides.
          await f.extensions.inspect(
            await staffInScope(tx, f),
            inspectExtensionInput.parse({
              extensionKey: pending.extensionKey,
              condition: 'MinorDamage',
              note: 'Scratch on the lid',
            }),
          );
        }
        const conditionBefore = (
          await tx.resourceInfo.findUniqueOrThrow({
            where: { ResourceKey: f.activeLoan.ResourceKey },
          })
        ).ConditionKey;
        const result = extensionOutput.strict().parse(
          await f.extensions.decide(
            decider,
            decideExtensionInput.parse({
              extensionKey: pending.extensionKey,
              decision,
              condition: 'Normal',
              note: 'Inspected at the counter',
            }),
          ),
        );
        const approved = decision === 'approve';
        const target = approved ? new Date(input.requestedDueAt) : f.due;
        expect(result).toMatchObject({
          status: approved ? 'Approved' : 'Rejected',
          dueAt: target.toISOString(),
          extensionsUsed: used + (approved ? 1 : 0),
          autoApproved: false,
        });
        expect(result.resolvedAt).not.toBeNull();
        expect(
          await tx.extensionRequest.findUniqueOrThrow({
            where: { ExtensionKey: pending.extensionKey },
          }),
        ).toMatchObject({
          ApprovedBy: decider.accountKey,
          Reason: `${input.reason} · Inspected at the counter`,
        });
        expect(
          await tx.usageLog.findUniqueOrThrow({
            where: { UsageKey: f.activeLoan.UsageKey },
          }),
        ).toMatchObject({ DueTime: target, PendingExtension: null });
        expect(
          await tx.reservations.findUniqueOrThrow({
            where: { ReservationKey: f.reservation.ReservationKey },
          }),
        ).toMatchObject({ EndTime: target });
        const resource = await tx.resourceInfo.findUniqueOrThrow({
          where: { ResourceKey: f.activeLoan.ResourceKey },
        });
        if (role === 'staff') {
          expect(
            await tx.conditionLog.findUniqueOrThrow({
              where: { ConditionKey: resource.ConditionKey! },
            }),
          ).toMatchObject({
            LoggedBy: decider.accountKey,
            Condition: 'Normal',
            Notes: 'Inspected at the counter',
          });
        } else {
          // The supervisor's decision leaves the staff-recorded condition alone.
          expect(resource.ConditionKey).toBe(conditionBefore);
          expect(
            await tx.conditionLog.findUniqueOrThrow({
              where: { ConditionKey: resource.ConditionKey! },
            }),
          ).toMatchObject({
            LoggedBy: f.f.inspector.AccountKey,
            Condition: 'MinorDamage',
          });
        }
        expect(
          await tx.notification.count({
            where: {
              AccountKey: f.user.accountKey,
              NotificationType: approved
                ? 'RequestApproved'
                : 'RequestRejected',
            },
          }),
        ).toBe(1);
      });
    },
  );

  it('checks availability again when the supervisor approves a queued extension', async () => {
    await inHistoryFixture(prisma, async (tx) => {
      const f = await creditLoanFixture(tx, 'T2', 'D0');
      const pending = extensionOutput
        .strict()
        .parse(await f.extensions.request(f.user, requestFor(f)));
      await f.extensions.inspect(
        await staffInScope(tx, f),
        inspectExtensionInput.parse({
          extensionKey: pending.extensionKey,
          condition: 'Normal',
        }),
      );
      const booking = await nextBooking(tx, f, 'Approved');
      f.audit.record.mockClear();
      await expect(
        f.extensions.decide(
          f.f.decider,
          decideExtensionInput.parse({
            extensionKey: pending.extensionKey,
            decision: 'approve',
            condition: 'Normal',
          }),
        ),
      ).rejects.toMatchObject({
        businessCode: 'WINDOW_NOT_AVAILABLE',
        details: { blockedBy: booking.ReservationKey },
      });
      expect(
        await tx.extensionRequest.findUniqueOrThrow({
          where: { ExtensionKey: pending.extensionKey },
        }),
      ).toMatchObject({ ApproveStatus: 'Pending', ApprovedBy: null });
      await assertUnchanged(tx, f);
      expect(f.audit.record).not.toHaveBeenCalled();
    });
  });

  describe.each([
    { tier: 'T2', band: 'D0', used: 0, route: 'supervisor' },
    { tier: 'T0', band: 'D2', used: 0, route: 'supervisor' },
    { tier: 'T1', band: 'D2', used: 0, route: 'supervisor' },
    { tier: 'T1', band: 'D0', used: 1, route: 'staff' },
  ] as const)(
    'Work queue extension count: $tier / $band / $route',
    ({ tier, band, used, route }) => {
      let beforeCount: number;
      let afterCount: number;

      // Setup and worklist/persistence assertions are outside it.failing so
      // only the known dashboard-count mismatch can satisfy its marker.
      beforeEach(async () => {
        await inHistoryFixture(prisma, async (tx) => {
          const f = await creditLoanFixture(tx, tier, band, used);
          const staff = await staffInScope(tx, f);
          const pending = extensionOutput
            .strict()
            .parse(await f.extensions.request(f.user, requestFor(f)));
          expect(pending).toMatchObject({ status: 'Pending', route });

          // A real pending staff task in another department must not inflate
          // this counter, either before or after the local task is handled.
          const foreign = await creditLoanFixture(tx, 'T1', 'D0', 1);
          const foreignPending = extensionOutput
            .strict()
            .parse(
              await foreign.extensions.request(
                foreign.user,
                requestFor(foreign),
              ),
            );
          expect(foreignPending).toMatchObject({
            status: 'Pending',
            route: 'staff',
          });

          const client = transactionClient(tx);
          const loans = new LoanService(
            client,
            new StaffScopeService(client),
            new PenaltyService(client),
            new NotificationService(client),
            f.audit as never,
          );
          const beforeRows = paginatedExtensionReviews
            .strict()
            .parse(
              await f.extensions.listReviews(staff, { page: 1, pageSize: 100 }),
            );
          expect(beforeRows.total).toBe(1);
          expect(beforeRows.items).toEqual([
            expect.objectContaining({
              extensionKey: pending.extensionKey,
              route,
              inspection: null,
            }),
          ]);
          beforeCount = staffQueueCounts
            .strict()
            .parse(await loans.getQueueCounts(staff)).extensionsToInspect;

          if (route === 'supervisor') {
            await f.extensions.inspect(
              staff,
              inspectExtensionInput.parse({
                extensionKey: pending.extensionKey,
                condition: 'Normal',
              }),
            );
            const stored = await tx.extensionRequest.findUniqueOrThrow({
              where: { ExtensionKey: pending.extensionKey },
            });
            expect(stored.ApproveStatus).toBe('Pending');
            expect(stored.InspectedCondition).not.toBeNull();
            const supervisorRows = paginatedExtensionReviews.strict().parse(
              await f.extensions.listReviews(f.f.decider, {
                page: 1,
                pageSize: 100,
                route: 'supervisor',
              }),
            );
            expect(supervisorRows.items).toEqual([
              expect.objectContaining({
                extensionKey: pending.extensionKey,
                inspection: expect.objectContaining({ condition: 'Normal' }),
              }),
            ]);
          } else {
            const decided = extensionOutput.strict().parse(
              await f.extensions.decide(
                staff,
                decideExtensionInput.parse({
                  extensionKey: pending.extensionKey,
                  decision: 'approve',
                  condition: 'Normal',
                }),
              ),
            );
            expect(decided.status).toBe('Approved');
          }

          const afterRows = paginatedExtensionReviews
            .strict()
            .parse(
              await f.extensions.listReviews(staff, { page: 1, pageSize: 100 }),
            );
          expect(afterRows).toMatchObject({ total: 0, items: [] });
          afterCount = staffQueueCounts
            .strict()
            .parse(await loans.getQueueCounts(staff)).extensionsToInspect;
          expect(
            await tx.extensionRequest.findUniqueOrThrow({
              where: { ExtensionKey: foreignPending.extensionKey },
            }),
          ).toMatchObject({
            ApproveStatus: 'Pending',
            InspectedCondition: null,
          });
        });
      });

      if (tier === 'T2') {
        it.failing(
          'counts the pending T2 condition check shown in the staff worklist',
          () => {
            expect(beforeCount).toBe(1);
          },
        );
      } else {
        it('counts the pending extension shown in the staff worklist', () => {
          expect(beforeCount).toBe(1);
        });
      }

      if (route === 'supervisor' && tier !== 'T2') {
        it.failing(
          'removes the checked extension from the staff count while supervisor approval is pending',
          () => {
            expect(afterCount).toBe(0);
          },
        );
      } else {
        it('removes the completed staff task from the count without counting another department', () => {
          expect(afterCount).toBe(0);
        });
      }
    },
  );

  describe('Supervisor Approvals: T2 extension waiting for staff check', () => {
    let beforeCount: number;
    let afterCount: number;

    // Real request, queue and inspection assertions run outside it.failing.
    // Only the known missing dashboard count may satisfy the defect marker.
    beforeEach(async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await creditLoanFixture(tx, 'T2', 'D0');
        const staff = await staffInScope(tx, f);
        const pending = extensionOutput
          .strict()
          .parse(await f.extensions.request(f.user, requestFor(f)));
        expect(pending).toMatchObject({
          status: 'Pending',
          route: 'supervisor',
        });

        const foreign = await creditLoanFixture(tx, 'T2', 'D0');
        const foreignPending = extensionOutput
          .strict()
          .parse(
            await foreign.extensions.request(foreign.user, requestFor(foreign)),
          );
        expect(foreignPending.status).toBe('Pending');

        const client = transactionClient(tx);
        const approvals = new ApprovalService(
          client,
          new StaffScopeService(client),
          new CreditTierService(client),
          {} as never,
          {} as never,
          f.audit as never,
          {} as never,
        );
        for (const caller of [staff, f.f.decider]) {
          const worklist = paginatedExtensionReviews.strict().parse(
            await f.extensions.listReviews(caller, {
              page: 1,
              pageSize: 100,
              route: 'supervisor',
            }),
          );
          expect(worklist).toMatchObject({
            total: 1,
            items: [
              {
                extensionKey: pending.extensionKey,
                tier: 'T2',
                inspection: null,
              },
            ],
          });
        }
        beforeCount = approvalCounts
          .strict()
          .parse(await approvals.counts(f.f.decider)).staff;

        await f.extensions.inspect(
          staff,
          inspectExtensionInput.parse({
            extensionKey: pending.extensionKey,
            condition: 'Normal',
          }),
        );
        expect(
          await tx.extensionRequest.findUniqueOrThrow({
            where: { ExtensionKey: pending.extensionKey },
          }),
        ).toMatchObject({
          ApproveStatus: 'Pending',
          InspectedCondition: expect.any(Number),
        });
        expect(
          paginatedExtensionReviews
            .strict()
            .parse(
              await f.extensions.listReviews(staff, { page: 1, pageSize: 100 }),
            ),
        ).toMatchObject({ total: 0, items: [] });
        expect(
          paginatedExtensionReviews.strict().parse(
            await f.extensions.listReviews(f.f.decider, {
              page: 1,
              pageSize: 100,
              route: 'supervisor',
            }),
          ),
        ).toMatchObject({
          total: 1,
          items: [
            {
              extensionKey: pending.extensionKey,
              inspection: { condition: 'Normal' },
            },
          ],
        });
        afterCount = approvalCounts
          .strict()
          .parse(await approvals.counts(f.f.decider)).staff;
        expect(
          await tx.extensionRequest.findUniqueOrThrow({
            where: { ExtensionKey: foreignPending.extensionKey },
          }),
        ).toMatchObject({ ApproveStatus: 'Pending', InspectedCondition: null });
      });
    });

    it.failing(
      'includes the scoped T2 extension shown as waiting for staff check in Waiting on staff',
      () => {
        expect(beforeCount).toBe(1);
      },
    );

    it('excludes the checked T2 extension and the unchecked extension in another department from Waiting on staff', () => {
      expect(afterCount).toBe(0);
    });
  });

  it('needs a staff condition check before a supervisor approves a T2 extension (#156)', async () => {
    await inHistoryFixture(prisma, async (tx) => {
      const f = await creditLoanFixture(tx, 'T2', 'D0');
      const pending = extensionOutput
        .strict()
        .parse(await f.extensions.request(f.user, requestFor(f)));
      const staff = await staffInScope(tx, f);
      const approve = decideExtensionInput.parse({
        extensionKey: pending.extensionKey,
        decision: 'approve',
      });

      await expect(
        f.extensions.decide(f.f.decider, approve),
      ).rejects.toMatchObject({
        businessCode: 'EXTENSION_NOT_INSPECTED',
      });
      await assertUnchanged(tx, f);

      // Staff see it waiting for their check, the supervisor sees it unchecked.
      const staffPile = paginatedExtensionReviews.parse(
        await f.extensions.listReviews(staff, { page: 1, pageSize: 20 }),
      );
      expect(staffPile.items).toEqual([
        expect.objectContaining({
          extensionKey: pending.extensionKey,
          route: 'supervisor',
          inspection: null,
        }),
      ]);

      await f.extensions.inspect(
        staff,
        inspectExtensionInput.parse({
          extensionKey: pending.extensionKey,
          condition: 'Normal',
          note: 'Works, no marks',
        }),
      );
      const extension = await tx.extensionRequest.findUniqueOrThrow({
        where: { ExtensionKey: pending.extensionKey },
      });
      expect(extension.ApproveStatus).toBe('Pending');
      expect(
        await tx.conditionLog.findUniqueOrThrow({
          where: { ConditionKey: extension.InspectedCondition! },
        }),
      ).toMatchObject({ LoggedBy: staff.accountKey, Notes: 'Works, no marks' });

      // Checked: gone from the staff pile, shown read-only to the supervisor.
      expect(
        (await f.extensions.listReviews(staff, { page: 1, pageSize: 20 }))
          .items,
      ).toEqual([]);
      const supervisorPile = paginatedExtensionReviews.parse(
        await f.extensions.listReviews(f.f.decider, {
          page: 1,
          pageSize: 20,
          route: 'supervisor',
        }),
      );
      expect(supervisorPile.items[0].inspection).toMatchObject({
        condition: 'Normal',
        note: 'Works, no marks',
      });
      await expect(f.extensions.decide(staff, approve)).rejects.toMatchObject({
        businessCode: 'EXTENSION_NEEDS_SUPERVISOR',
      });

      const result = extensionOutput
        .strict()
        .parse(await f.extensions.decide(f.f.decider, approve));
      expect(result.status).toBe('Approved');
    });
  });

  describe('#178: weekend extensions preserve the Monday closing deadline', () => {
    beforeEach(() =>
      jest.useFakeTimers({
        now: new Date('2031-09-25T02:00:00Z'), // Thursday 09:00 Bangkok
        doNotFake: ['nextTick', 'setImmediate', 'setTimeout'],
      }),
    );
    afterEach(() => jest.useRealTimers());

    it.each([
      { day: '2031-09-27', max: 1 },
      { day: '2031-09-28', max: 2 },
    ])(
      'checks the requested $day against $max allowed days before the weekend roll',
      async ({ day, max }) => {
        await inHistoryFixture(prisma, async (tx) => {
          const f = await creditLoanFixture(tx, 'T1', 'D0');
          await tx.borrowConstraints.updateMany({
            where: { BorrowRuleKey: f.f.rule.BorrowRuleKey },
            data: { MaxBorrowDate: max },
          });
          const result = extensionOutput.strict().parse(
            await f.extensions.request(f.user, {
              usageKey: f.activeLoan.UsageKey,
              requestedDueAt: `${day}T02:00:00.000Z`,
            }),
          );
          expect(result).toMatchObject({
            status: 'Approved',
            dueAt: '2031-09-29T10:00:00.000Z',
          });
          expect(
            await tx.usageLog.findUniqueOrThrow({
              where: { UsageKey: f.activeLoan.UsageKey },
            }),
          ).toMatchObject({ DueTime: new Date('2031-09-29T10:00:00Z') });
        });
      },
    );

    it('does not use weekend rolling to bypass the requested-day maximum', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await creditLoanFixture(tx, 'T1', 'D0');
        await tx.borrowConstraints.updateMany({
          where: { BorrowRuleKey: f.f.rule.BorrowRuleKey },
          data: { MaxBorrowDate: 1 },
        });
        await expect(
          f.extensions.request(f.user, {
            usageKey: f.activeLoan.UsageKey,
            requestedDueAt: '2031-09-28T02:00:00.000Z',
          }),
        ).rejects.toMatchObject({
          businessCode: 'INVALID_EXTENSION_WINDOW',
          details: { reason: 'EXCEEDS_MAX_BORROW_DAYS' },
        });
        expect(
          await tx.extensionRequest.count({
            where: { UsageKey: f.activeLoan.UsageKey },
          }),
        ).toBe(0);
        await assertUnchanged(tx, f);
      });
    });

    it.each(
      (['Pending', 'Approved'] as const).flatMap((status) =>
        (['2031-09-27', '2031-09-28'] as const).map((day) => ({ status, day })),
      ),
    )(
      'refuses a $day extension that rolls into a $status Monday booking',
      async ({ status, day }) => {
        await inHistoryFixture(prisma, async (tx) => {
          const f = await creditLoanFixture(tx, 'T1', 'D0');
          const booking = await tx.reservations.create({
            data: {
              ResourceKey: f.activeLoan.ResourceKey,
              ReservedBy: f.f.inspector.AccountKey,
              StartTime: new Date('2031-09-29T02:00:00Z'),
              EndTime: new Date('2031-09-29T10:00:00Z'),
              ApproveStatus: status,
              ReservationExpiration: new Date('2031-09-30T02:00:00Z'),
              ActionTime: new Date(),
            },
          });
          await expect(
            f.extensions.request(f.user, {
              usageKey: f.activeLoan.UsageKey,
              requestedDueAt: `${day}T06:00:00.000Z`,
            }),
          ).rejects.toMatchObject({
            businessCode: 'WINDOW_NOT_AVAILABLE',
            details: { blockedBy: booking.ReservationKey },
          });
          expect(
            await tx.extensionRequest.count({
              where: { UsageKey: f.activeLoan.UsageKey },
            }),
          ).toBe(0);
          await assertUnchanged(tx, f);
          expect(f.audit.record).not.toHaveBeenCalled();
        });
      },
    );

    it.each(['Pending', 'Approved'] as const)(
      'rechecks a new $status Monday booking before approving the queued weekend extension',
      async (status) => {
        await inHistoryFixture(prisma, async (tx) => {
          const f = await creditLoanFixture(tx, 'T2', 'D0');
          const pending = extensionOutput.strict().parse(
            await f.extensions.request(f.user, {
              usageKey: f.activeLoan.UsageKey,
              requestedDueAt: '2031-09-28T06:00:00.000Z',
            }),
          );
          await f.extensions.inspect(await staffInScope(tx, f), {
            extensionKey: pending.extensionKey,
            condition: 'Normal',
          });
          await tx.reservations.create({
            data: {
              ResourceKey: f.activeLoan.ResourceKey,
              ReservedBy: f.f.inspector.AccountKey,
              StartTime: new Date('2031-09-29T02:00:00Z'),
              EndTime: new Date('2031-09-29T10:00:00Z'),
              ApproveStatus: status,
              ReservationExpiration: new Date('2031-09-30T02:00:00Z'),
              ActionTime: new Date(),
            },
          });
          f.audit.record.mockClear();
          await expect(
            f.extensions.decide(
              f.f.decider,
              decideExtensionInput.parse({
                extensionKey: pending.extensionKey,
                decision: 'approve',
              }),
            ),
          ).rejects.toMatchObject({ businessCode: 'WINDOW_NOT_AVAILABLE' });
          await assertUnchanged(tx, f);
          expect(
            await tx.extensionRequest.findUniqueOrThrow({
              where: { ExtensionKey: pending.extensionKey },
            }),
          ).toMatchObject({
            ApproveStatus: 'Pending',
            RequestedDueTime: new Date('2031-09-29T10:00:00Z'),
          });
          expect(f.audit.record).not.toHaveBeenCalled();
        });
      },
    );

    it('does not charge late credit on Saturday/Sunday or exactly Monday closing; charges once just after it', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await creditLoanFixture(tx, 'T1', 'D0');
        await f.extensions.request(f.user, {
          usageKey: f.activeLoan.UsageKey,
          requestedDueAt: '2031-09-28T06:00:00.000Z',
        });
        const penalties = new PenaltyService(f.f.client);
        const cron = new CronService(
          f.f.client,
          penalties,
          new NotificationService(f.f.client),
        );
        const before = await tx.accountInfo.findUniqueOrThrow({
          where: { AccountKey: f.user.accountKey },
        });
        for (const at of [
          '2031-09-27T02:00:00Z',
          '2031-09-28T16:59:59Z',
          '2031-09-29T10:00:00Z',
        ]) {
          jest.setSystemTime(new Date(at));
          expect(await cron.run('markOverdue')).toMatchObject({ affected: 0 });
          expect(
            await tx.penaltyInfo.count({
              where: {
                UsageKey: f.activeLoan.UsageKey,
                Reason: { startsWith: 'ReturnLate' },
              },
            }),
          ).toBe(0);
        }
        jest.setSystemTime(new Date('2031-09-29T10:00:00.001Z'));
        expect(await cron.run('markOverdue')).toMatchObject({ affected: 1 });
        expect(await cron.run('markOverdue')).toMatchObject({ affected: 0 });
        expect(
          await tx.penaltyInfo.count({
            where: {
              UsageKey: f.activeLoan.UsageKey,
              Reason: { startsWith: 'ReturnLate' },
            },
          }),
        ).toBe(1);
        expect(
          (
            await tx.accountInfo.findUniqueOrThrow({
              where: { AccountKey: f.user.accountKey },
            })
          ).UserCredit,
        ).toBeLessThan(before.UserCredit);
      });
    });

    describe('configured closing hour', () => {
      let original: { start: number; end: number };
      beforeEach(() => {
        original = { ...workHours };
        Object.assign(workHours, { start: 9, end: 16 });
      });
      afterEach(() => Object.assign(workHours, original));
      it.each(['2031-09-27', '2031-09-28'])(
        'persists Monday 16:00 for a %s extension',
        async (day) => {
          await inHistoryFixture(prisma, async (tx) => {
            const f = await creditLoanFixture(tx, 'T1', 'D0');
            const result = extensionOutput.strict().parse(
              await f.extensions.request(f.user, {
                usageKey: f.activeLoan.UsageKey,
                requestedDueAt: `${day}T06:00:00.000Z`,
              }),
            );
            expect(result.dueAt).toBe('2031-09-29T09:00:00.000Z');
            expect(
              await tx.reservations.findUniqueOrThrow({
                where: { ReservationKey: f.reservation.ReservationKey },
              }),
            ).toMatchObject({ EndTime: new Date('2031-09-29T09:00:00Z') });
          });
        },
      );
    });

    it.each([
      { tier: 'T0', day: '2031-09-27', route: 'auto', used: 0 },
      { tier: 'T0', day: '2031-09-28', route: 'auto', used: 0 },
      { tier: 'T1', day: '2031-09-27', route: 'auto', used: 0 },
      { tier: 'T1', day: '2031-09-28', route: 'auto', used: 0 },
      { tier: 'T1', day: '2031-09-27', route: 'staff', used: 1 },
      { tier: 'T1', day: '2031-09-28', route: 'staff', used: 1 },
      { tier: 'T2', day: '2031-09-27', route: 'supervisor', used: 0 },
      { tier: 'T2', day: '2031-09-28', route: 'supervisor', used: 0 },
    ] as const)(
      'persists $day through the $route workflow',
      async ({ tier, day, route, used }) => {
        await inHistoryFixture(prisma, async (tx) => {
          const f = await creditLoanFixture(tx, tier, 'D0', used);
          const expected = new Date('2031-09-29T10:00:00Z'); // Monday 17:00 Bangkok
          let result = extensionOutput.strict().parse(
            await f.extensions.request(
              f.user,
              requestExtensionInput.parse({
                usageKey: f.activeLoan.UsageKey,
                requestedDueAt: `${day}T06:00:00.000Z`, // 13:00 Bangkok
                reason: 'Finish the laboratory project',
              }),
            ),
          );
          expect(result.route).toBe(route);
          expect(
            await tx.extensionRequest.findUniqueOrThrow({
              where: { ExtensionKey: result.extensionKey },
            }),
          ).toMatchObject({ RequestedDueTime: expected });
          if (route !== 'auto') {
            expect(result.status).toBe('Pending');
            await assertUnchanged(tx, f);
            const staff = await staffInScope(tx, f);
            if (route === 'supervisor') {
              await f.extensions.inspect(
                staff,
                inspectExtensionInput.parse({
                  extensionKey: result.extensionKey,
                  condition: 'Normal',
                }),
              );
            }
            result = extensionOutput.strict().parse(
              await f.extensions.decide(
                route === 'staff' ? staff : f.f.decider,
                decideExtensionInput.parse({
                  extensionKey: result.extensionKey,
                  decision: 'approve',
                  ...(route === 'staff' ? { condition: 'Normal' } : {}),
                }),
              ),
            );
          }
          expect(result).toMatchObject({
            status: 'Approved',
            dueAt: expected.toISOString(),
          });
          expect(
            await tx.usageLog.findUniqueOrThrow({
              where: { UsageKey: f.activeLoan.UsageKey },
            }),
          ).toMatchObject({ DueTime: expected, PendingExtension: null });
          expect(
            await tx.reservations.findUniqueOrThrow({
              where: { ReservationKey: f.reservation.ReservationKey },
            }),
          ).toMatchObject({ EndTime: expected });
        });
      },
    );
  });

  it('refuses a separate check on a staff-routed extension', async () => {
    await inHistoryFixture(prisma, async (tx) => {
      const f = await creditLoanFixture(tx, 'T1', 'D0', 1);
      const pending = extensionOutput
        .strict()
        .parse(await f.extensions.request(f.user, requestFor(f)));
      await expect(
        f.extensions.inspect(
          await staffInScope(tx, f),
          inspectExtensionInput.parse({
            extensionKey: pending.extensionKey,
            condition: 'Normal',
          }),
        ),
      ).rejects.toMatchObject({
        businessCode: 'EXTENSION_INSPECTION_NOT_NEEDED',
      });
    });
  });
});

describe('#192: an extension granted after the due time keeps the late stretch', () => {
  let prisma: PrismaService;
  beforeEach(() => freezeBusinessDate(new Date('2031-09-22T02:00:00Z')));
  afterEach(() => jest.useRealTimers());
  beforeAll(async () => {
    requireIsolatedDatabase();
    prisma = new PrismaService();
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('charges the days before the request and bills later lateness separately', async () => {
    await inHistoryFixture(prisma, async (tx) => {
      const f = await creditLoanFixture(tx, 'T0', 'D0');
      const lateRows = () =>
        tx.penaltyInfo.findMany({
          where: {
            UsageKey: f.activeLoan.UsageKey,
            Reason: { startsWith: 'ReturnLate' },
          },
          orderBy: { PenaltyKey: 'asc' },
        });
      const before = await tx.accountInfo.findUniqueOrThrow({
        where: { AccountKey: f.user.accountKey },
      });

      // Two days past due, and the overnight job has not run.
      jest.setSystemTime(new Date(f.due.getTime() + 2 * DAY));
      const newDue = new Date(f.due.getTime() + 3 * DAY);
      const out = await f.extensions.request(f.user, {
        usageKey: f.activeLoan.UsageKey,
        requestedDueAt: newDue.toISOString(),
      });
      expect(out.status).toBe('Approved');

      const charged = await lateRows();
      expect(charged).toHaveLength(1);
      expect(charged[0]).toMatchObject({ InEffect: true });
      expect(charged[0].Reason).toContain('before extension');
      expect(charged[0].CreditDeducted).toBeGreaterThan(0);
      expect(
        (
          await tx.accountInfo.findUniqueOrThrow({
            where: { AccountKey: f.user.accountKey },
          })
        ).UserCredit,
      ).toBeLessThan(before.UserCredit);

      // Late again after the new due date: a second, separate charge.
      const penalties = new PenaltyService(f.f.client);
      const cron = new CronService(
        f.f.client,
        penalties,
        new NotificationService(f.f.client),
      );
      jest.setSystemTime(new Date(newDue.getTime() - 1));
      expect(await cron.run('markOverdue')).toMatchObject({ affected: 0 });
      jest.setSystemTime(new Date(newDue.getTime() + DAY));
      expect(await cron.run('markOverdue')).toMatchObject({ affected: 1 });
      expect(await lateRows()).toHaveLength(2);
    });
  });
});
