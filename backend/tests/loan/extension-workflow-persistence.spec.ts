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
} from '../../src/loan/loan.schema';
import { rollDueOffWeekend } from '../../src/common/schemas/datetime.schema';
import { inHistoryFixture } from '../fixtures/borrower-history';
import { creditLoanFixture } from '../fixtures/loan-extension';

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

  it('rolls a weekend due date to Monday closing time (#178)', async () => {
    await inHistoryFixture(prisma, async (tx) => {
      const f = await creditLoanFixture(tx, 'T2', 'D0');
      // First Saturday (Bangkok) after the current due date.
      let asked = new Date(f.due.getTime() + DAY);
      while (new Date(asked.getTime() + 7 * 3_600_000).getUTCDay() !== 6) {
        asked = new Date(asked.getTime() + DAY);
      }
      const pending = extensionOutput.strict().parse(
        await f.extensions.request(
          f.user,
          requestExtensionInput.parse({
            usageKey: f.activeLoan.UsageKey,
            requestedDueAt: asked.toISOString(),
            reason: 'Finish the laboratory project',
          }),
        ),
      );
      const stored = await tx.extensionRequest.findUniqueOrThrow({
        where: { ExtensionKey: pending.extensionKey },
      });
      expect(stored.RequestedDueTime.getTime()).toBe(
        rollDueOffWeekend(asked).getTime(),
      );
      expect(
        new Date(stored.RequestedDueTime.getTime() + 7 * 3_600_000).getUTCDay(),
      ).toBe(1);
    });
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
