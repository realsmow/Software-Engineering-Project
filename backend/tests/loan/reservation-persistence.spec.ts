import { PrismaService } from '../../src/prisma.service';
import type { Prisma } from '../../src/generated/prisma/client';
import {
  createRequestInput,
  createRequestOutput,
} from '../../src/loan/loan.schema';
import { inHistoryFixture } from '../fixtures/borrower-history';
import {
  createIsolatedDatabase,
  type IsolatedTestDatabase,
} from '../fixtures/isolated-database';
import {
  deleteRequestFixture,
  requestFixture,
  requestService,
} from '../fixtures/loan-request';

const DAY = 86_400_000;
function windowInput(resourceKey: number) {
  return createRequestInput.parse({
    // Fixed weekday hours: the server refuses times outside the counter's
    // hours and rolls weekend returns (#179, #178), so "now + 1 day" was flaky.
    startTime: '2031-09-29T02:00:00.000Z',
    endTime: '2031-10-01T02:00:00.000Z',
    lines: [{ resourceKey, reason: 'Laboratory project' }],
  });
}

describe('persisted reservation conflict handling', () => {
  let prisma: PrismaService;
  let database: IsolatedTestDatabase | undefined;
  let termEnd: string | undefined;
  beforeAll(async () => {
    termEnd = process.env.TERM_END_DATE;
    delete process.env.TERM_END_DATE;
    database = await createIsolatedDatabase('reservation', {
      seedReferenceData: true,
    });
    prisma = database.client;
  }, 60_000);
  afterAll(async () => {
    if (termEnd === undefined) delete process.env.TERM_END_DATE;
    else process.env.TERM_END_DATE = termEnd;
    await database?.dispose();
  });

  describe('FR-REQ-09: two real Serializable transactions reaching commit together', () => {
    let committed: number;
    beforeAll(async () => {
      const f = await prisma.$transaction((tx) => requestFixture(tx));
      const input = windowInput(f.units[0].ResourceKey);
      const initialCounts: number[] = [];
      let release!: () => void;
      let rejectBarrier!: (error: Error) => void;
      const barrier = new Promise<void>((resolve, reject) => {
        release = resolve;
        rejectBarrier = reject;
      });
      let releaseWrites!: () => void;
      let rejectWrites!: (error: Error) => void;
      let writes = 0;
      const writesBarrier = new Promise<void>((resolve, reject) => {
        releaseWrites = resolve;
        rejectWrites = reject;
      });
      // Attach handlers immediately; a preparation error must not leave an unhandled rejection.
      void barrier.catch(() => undefined);
      void writesBarrier.catch(() => undefined);
      // The barrier wraps real SQL reads, never their results or transaction isolation.
      const timer = setTimeout(() => {
        rejectBarrier(
          new Error('Both booking transactions must reach the clash check'),
        );
        rejectWrites(
          new Error(
            'Both booking inserts must finish before either transaction commits',
          ),
        );
      }, 5_000);
      const concurrentClient = new Proxy(prisma, {
        get(target, property) {
          if (property !== '$transaction')
            return Reflect.get(target, property) as unknown;
          return <T>(
            work: (tx: Prisma.TransactionClient) => Promise<T>,
            options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
          ) =>
            target.$transaction(async (tx) => {
              const reservations = new Proxy(tx.reservations, {
                get(delegate, method) {
                  if (method === 'create')
                    return async (args: Prisma.ReservationsCreateArgs) => {
                      const row = await delegate.create(args);
                      if (writes < 2) {
                        writes++;
                        if (writes === 2) releaseWrites();
                        await writesBarrier;
                      }
                      return row;
                    };
                  if (method !== 'count')
                    return Reflect.get(delegate, method) as unknown;
                  return async (args: Prisma.ReservationsCountArgs) => {
                    const count = await delegate.count(args);
                    if (initialCounts.length < 2) {
                      initialCounts.push(count);
                      if (initialCounts.length === 2) release();
                      await barrier;
                    }
                    return count;
                  };
                },
              });
              return work(
                new Proxy(tx, {
                  get(client, key) {
                    return key === 'reservations'
                      ? reservations
                      : (Reflect.get(client, key) as unknown);
                  },
                }),
              );
            }, options);
        },
      });
      const { service, audit } = requestService(concurrentClient);
      try {
        const settled = await Promise.allSettled(
          f.users.map((user) => service.create(user, input)),
        );
        for (const outcome of settled) {
          if (outcome.status === 'rejected') {
            const reason: unknown = outcome.reason;
            expect(reason).toMatchObject({
              name: 'DriverAdapterError',
              cause: { kind: 'TransactionWriteConflict' },
            });
          }
        }
        const outcomes = settled.flatMap((row) =>
          row.status === 'fulfilled'
            ? [createRequestOutput.strict().parse(row.value)]
            : [],
        );
        expect(initialCounts).toEqual([0, 0]);
        expect(writes).toBe(2);
        expect(outcomes.flatMap((row) => row.created)).toHaveLength(1);
        const persisted = await prisma.reservations.findMany({
          where: { ResourceKey: f.units[0].ResourceKey },
        });
        expect(persisted).toHaveLength(1);
        committed = persisted.length;
        expect(persisted[0]).toMatchObject({
          ApproveStatus: 'Pending',
          StartTime: new Date(input.startTime),
          EndTime: new Date(input.endTime),
        });
        const winner = settled.findIndex(
          (row) => row.status === 'fulfilled' && row.value.created.length === 1,
        );
        expect(persisted[0].ReservedBy).toBe(f.users[winner].accountKey);
        expect(audit.record).toHaveBeenCalledTimes(1);
      } finally {
        clearTimeout(timer);
        release();
        releaseWrites();
        await deleteRequestFixture(prisma, f);
      }
    }, 20_000);

    it('persists exactly one reservation rather than double-booking the unit', () => {
      expect(committed).toBe(1);
    });
  });

  it('FR-RSV-04: T1 commits a free sibling when the selected unit is already reserved', async () => {
    await inHistoryFixture(prisma, async (tx) => {
      const f = await requestFixture(tx, 'T1', 2);
      const input = windowInput(f.units[0].ResourceKey);
      const first = createRequestOutput
        .strict()
        .parse(await f.service.create(f.users[0], input));
      expect(first.created).toHaveLength(1);
      const second = createRequestOutput
        .strict()
        .parse(await f.service.create(f.users[1], input));
      expect(second.rejected).toEqual([]);
      expect(second.created).toHaveLength(1);
      expect(second.created[0]).toMatchObject({
        resource: { resourceKey: f.units[1].ResourceKey },
        status: 'approved',
        approval: { autoApproved: true },
      });
      expect(
        await tx.reservations.count({
          where: {
            ResourceKey: { in: f.units.map((unit) => unit.ResourceKey) },
          },
        }),
      ).toBe(2);
    });
  });

  it('FR-RSV-05: T2 keeps the selected serial and rejects it even if a sibling is free', async () => {
    await inHistoryFixture(prisma, async (tx) => {
      const f = await requestFixture(tx, 'T2', 2);
      const input = windowInput(f.units[0].ResourceKey);
      expect(
        createRequestOutput
          .strict()
          .parse(await f.service.create(f.users[0], input)).created,
      ).toHaveLength(1);
      const second = createRequestOutput
        .strict()
        .parse(await f.service.create(f.users[1], input));
      expect(second.created).toEqual([]);
      expect(second.rejected).toMatchObject([
        { resourceKey: f.units[0].ResourceKey, code: 'SERIAL_NOT_AVAILABLE' },
      ]);
      expect(
        await tx.reservations.count({
          where: { ResourceKey: f.units[1].ResourceKey },
        }),
      ).toBe(0);
    });
  });

  it('FR-RSV-06: G2 suggests the exact next-booking boundary and persists a shortened non-overlapping request', async () => {
    await inHistoryFixture(prisma, async (tx) => {
      const f = await requestFixture(tx);
      const input = windowInput(f.units[0].ResourceKey);
      const nextStart = new Date(new Date(input.startTime).getTime() + DAY);
      const next = createRequestOutput.strict().parse(
        await f.service.create(f.users[0], {
          ...input,
          startTime: nextStart.toISOString(),
          endTime: new Date(nextStart.getTime() + DAY).toISOString(),
        }),
      );
      expect(next.created).toHaveLength(1);
      const conflict = createRequestOutput
        .strict()
        .parse(await f.service.create(f.users[1], input));
      expect(conflict.created).toEqual([]);
      expect(conflict.rejected).toMatchObject([
        {
          code: 'WINDOW_CROSSES_RESERVATION',
          detail: { maxEndTime: nextStart.toISOString() },
        },
      ]);
      const shortened = createRequestOutput.strict().parse(
        await f.service.create(f.users[1], {
          ...input,
          endTime: nextStart.toISOString(),
        }),
      );
      expect(shortened.rejected).toEqual([]);
      expect(shortened.created).toHaveLength(1);
      expect(
        await tx.reservations.findUniqueOrThrow({
          where: { ReservationKey: shortened.created[0].reservationKey },
        }),
      ).toMatchObject({
        EndTime: nextStart,
        StartTime: new Date(input.startTime),
      });
      expect(
        await tx.reservations.count({
          where: { ResourceKey: f.units[0].ResourceKey },
        }),
      ).toBe(2);
    });
  });

  describe('#178: weekend pickup and persisted return dates', () => {
    beforeEach(() =>
      jest.useFakeTimers({
        now: new Date('2099-01-09T01:00:00Z'),
        doNotFake: ['nextTick', 'setImmediate', 'setTimeout'],
      }),
    );
    afterEach(() => jest.useRealTimers());

    it.each(
      (['T1', 'T2'] as const).flatMap((tier) =>
        ['2099-01-10', '2099-01-11'].map((day) => ({ tier, day })),
      ),
    )(
      'checks $tier sibling policy over the entire Monday roll for a $day return',
      async ({ tier, day }) => {
        await inHistoryFixture(prisma, async (tx) => {
          const f = await requestFixture(tx, tier, 2);
          await tx.reservations.create({
            data: {
              ResourceKey: f.units[0].ResourceKey,
              ReservedBy: f.users[1].accountKey,
              StartTime: new Date('2099-01-12T02:00:00Z'),
              EndTime: new Date('2099-01-12T10:00:00Z'),
              ApproveStatus: 'Approved',
              ReservationExpiration: new Date('2099-01-13T02:00:00Z'),
              ActionTime: new Date(),
            },
          });
          const result = createRequestOutput.strict().parse(
            await f.service.create(f.users[0], {
              startTime: '2099-01-09T02:00:00.000Z',
              endTime: `${day}T06:00:00.000Z`,
              lines: [{ resourceKey: f.units[0].ResourceKey }],
            }),
          );
          if (tier === 'T1') {
            expect(result.rejected).toEqual([]);
            expect(result.created).toHaveLength(1);
            expect(result.created[0]).toMatchObject({
              resource: { resourceKey: f.units[1].ResourceKey },
              endTime: '2099-01-12T10:00:00.000Z',
            });
            expect(
              await tx.reservations.findUniqueOrThrow({
                where: { ReservationKey: result.created[0].reservationKey },
              }),
            ).toMatchObject({
              ResourceKey: f.units[1].ResourceKey,
              EndTime: new Date('2099-01-12T10:00:00Z'),
            });
          } else {
            expect(result.created).toEqual([]);
            expect(result.rejected).toMatchObject([
              { code: 'WINDOW_CROSSES_RESERVATION' },
            ]);
            expect(
              await tx.reservations.count({
                where: { ResourceKey: f.units[1].ResourceKey },
              }),
            ).toBe(0);
          }
          expect(
            await tx.reservations.count({
              where: {
                ResourceKey: { in: f.units.map((unit) => unit.ResourceKey) },
              },
            }),
          ).toBe(tier === 'T1' ? 2 : 1);
        });
      },
    );

    it.each(
      ['2099-01-10', '2099-01-11'].flatMap((day) =>
        ['00:59:00.000Z', '10:00:00.001Z'].map((time) => ({ day, time })),
      ),
    )(
      'does not let a $day return outside counter hours ($time) bypass validation through rolling',
      async ({ day, time }) => {
        await inHistoryFixture(prisma, async (tx) => {
          const f = await requestFixture(tx, 'T1');
          const result = createRequestOutput.strict().parse(
            await f.service.create(f.users[0], {
              startTime: '2099-01-09T02:00:00.000Z',
              endTime: `${day}T${time}`,
              lines: [{ resourceKey: f.units[0].ResourceKey }],
            }),
          );
          expect(result.created).toEqual([]);
          expect(result.rejected).toMatchObject([
            { code: 'OUTSIDE_WORK_HOURS', detail: { edge: 'END' } },
          ]);
          expect(
            await tx.reservations.count({
              where: { ResourceKey: f.units[0].ResourceKey },
            }),
          ).toBe(0);
        });
      },
    );

    it.each(['2099-01-10', '2099-01-11'])(
      'keeps a T3 room booking on %s on its own slot calendar',
      async (day) => {
        jest.setSystemTime(
          new Date(new Date(`${day}T00:00:00Z`).getTime() - 3_600_000),
        ); // 06:00 Bangkok on the booking day
        await inHistoryFixture(prisma, async (tx) => {
          const f = await requestFixture(tx, 'T1');
          await tx.borrowRule.update({
            where: { BorrowRuleKey: f.rule.BorrowRuleKey },
            data: { RuleName: 'T3' },
          });
          await tx.itemIndiv.delete({
            where: { ResourceKey: f.units[0].ResourceKey },
          });
          await tx.resourceInfo.update({
            where: { ResourceKey: f.units[0].ResourceKey },
            data: { ResourceType: 'Room' },
          });
          const room = await tx.roomInfo.create({
            data: {
              ResourceKey: f.units[0].ResourceKey,
              RoomName: 'Weekend slot calendar',
              CreditWeight: 0,
              OpenTime: 7 * 60,
              CloseTime: 18 * 60,
              BreakStart: 12 * 60,
              BreakEnd: 13 * 60,
            },
          });
          const result = createRequestOutput.strict().parse(
            await f.service.createRoomBooking(f.users[0], {
              roomKey: room.RoomKey,
              date: day,
              slots: [0, 1],
            }),
          );
          expect(result.rejected).toEqual([]);
          expect(result.created).toHaveLength(1);
          expect(result.created[0]).toMatchObject({
            startTime: `${day}T00:00:00.000Z`,
            endTime: `${day}T01:00:00.000Z`,
          });
          expect(
            await tx.reservations.findUniqueOrThrow({
              where: { ReservationKey: result.created[0].reservationKey },
            }),
          ).toMatchObject({
            StartTime: new Date(`${day}T00:00:00Z`),
            EndTime: new Date(`${day}T01:00:00Z`),
          });
        });
      },
    );

    it.each(['Pending', 'Approved'] as const)(
      'checks the full Monday roll against a next %s booking and offers a usable Friday cap',
      async (status) => {
        await inHistoryFixture(prisma, async (tx) => {
          const f = await requestFixture(tx, 'T1');
          await tx.resourceInfo.update({
            where: { ResourceKey: f.units[0].ResourceKey },
            data: { BufferTime: 1 },
          });
          await tx.reservations.create({
            data: {
              ResourceKey: f.units[0].ResourceKey,
              ReservedBy: f.users[1].accountKey,
              StartTime: new Date('2099-01-12T02:00:00Z'),
              EndTime: new Date('2099-01-12T10:00:00Z'),
              ApproveStatus: status,
              ReservationExpiration: new Date('2099-01-13T02:00:00Z'),
              ActionTime: new Date(),
            },
          });
          const input = {
            startTime: '2099-01-09T02:00:00.000Z',
            endTime: '2099-01-10T06:00:00.000Z',
            lines: [{ resourceKey: f.units[0].ResourceKey }],
          };
          const refused = createRequestOutput
            .strict()
            .parse(await f.service.create(f.users[0], input));
          expect(refused.created).toEqual([]);
          expect(refused.rejected).toMatchObject([
            {
              code: 'WINDOW_CROSSES_RESERVATION',
              detail: { maxEndTime: '2099-01-09T10:00:00.000Z' },
            },
          ]);
          const shortened = createRequestOutput.strict().parse(
            await f.service.create(f.users[0], {
              ...input,
              endTime: '2099-01-09T10:00:00.000Z',
            }),
          );
          expect(shortened.rejected).toEqual([]);
          expect(shortened.created).toHaveLength(1);
          expect(
            await tx.reservations.count({
              where: { ResourceKey: f.units[0].ResourceKey },
            }),
          ).toBe(2);
        });
      },
    );

    it.each([
      { buffer: 0, next: '2099-01-12T09:59:00Z', accepted: false },
      { buffer: 0, next: '2099-01-12T10:00:00Z', accepted: true },
      { buffer: 1, next: '2099-01-13T09:59:00Z', accepted: false },
      { buffer: 1, next: '2099-01-13T10:00:00Z', accepted: true },
    ])(
      'uses half-open rolled hold and $buffer-day buffer at $next',
      async ({ buffer, next, accepted }) => {
        await inHistoryFixture(prisma, async (tx) => {
          const f = await requestFixture(tx, 'T2');
          await tx.resourceInfo.update({
            where: { ResourceKey: f.units[0].ResourceKey },
            data: { BufferTime: buffer },
          });
          const first = createRequestOutput.strict().parse(
            await f.service.create(f.users[0], {
              startTime: '2099-01-09T02:00:00.000Z',
              endTime: '2099-01-11T06:00:00.000Z',
              lines: [{ resourceKey: f.units[0].ResourceKey }],
            }),
          );
          expect(first.created).toHaveLength(1);
          const second = createRequestOutput.strict().parse(
            await f.service.create(f.users[1], {
              startTime: new Date(next).toISOString(),
              endTime: '2099-01-14T10:00:00.000Z',
              lines: [{ resourceKey: f.units[0].ResourceKey }],
            }),
          );
          expect(second.created).toHaveLength(accepted ? 1 : 0);
          expect(second.rejected).toHaveLength(accepted ? 0 : 1);
          if (!accepted)
            expect(second.rejected[0].code).toBe('SERIAL_NOT_AVAILABLE');
          expect(
            await tx.reservations.count({
              where: { ResourceKey: f.units[0].ResourceKey },
            }),
          ).toBe(accepted ? 2 : 1);
        });
      },
    );

    it.each(
      (['T0', 'T1', 'T2'] as const).flatMap((tier) =>
        ['2099-01-10', '2099-01-11'].map((day) => ({ tier, day })),
      ),
    )(
      'does not write a $tier pickup reservation on $day',
      async ({ tier, day }) => {
        await inHistoryFixture(prisma, async (tx) => {
          const f = await requestFixture(tx, 'T1');
          await tx.borrowRule.update({
            where: { BorrowRuleKey: f.rule.BorrowRuleKey },
            data: { RuleName: tier },
          });
          // T0 is requested on that same closed day, so its horizon gate cannot mask this check.
          jest.setSystemTime(new Date(`${day}T01:00:00Z`));
          const result = createRequestOutput.strict().parse(
            await f.service.create(f.users[0], {
              startTime: `${day}T02:00:00.000Z`,
              endTime: '2099-01-12T10:00:00.000Z',
              lines: [{ resourceKey: f.units[0].ResourceKey }],
            }),
          );
          expect(result.created).toEqual([]);
          expect(result.rejected).toMatchObject([
            { code: 'OUTSIDE_WORK_HOURS', detail: { edge: 'START' } },
          ]);
          expect(
            await tx.reservations.count({
              where: { ResourceKey: f.units[0].ResourceKey },
            }),
          ).toBe(0);
        });
      },
    );

    it.each(
      (['T0', 'T1', 'T2'] as const).flatMap((tier) =>
        ['2099-01-10', '2099-01-11'].map((day) => ({ tier, day })),
      ),
    )(
      'keeps $tier equipment reserved through Monday closing after a $day return request',
      async ({ tier, day }) => {
        await inHistoryFixture(prisma, async (tx) => {
          const f = await requestFixture(tx, 'T2');
          await tx.borrowRule.update({
            where: { BorrowRuleKey: f.rule.BorrowRuleKey },
            data: { RuleName: tier },
          });
          await tx.borrowConstraints.updateMany({
            where: { BorrowRuleKey: f.rule.BorrowRuleKey },
            data: { MaxBorrowDate: day === '2099-01-10' ? 2 : 3 },
          });
          const result = createRequestOutput.strict().parse(
            await f.service.create(f.users[0], {
              startTime: '2099-01-09T02:00:00.000Z',
              endTime: `${day}T06:00:00.000Z`,
              lines: [{ resourceKey: f.units[0].ResourceKey }],
            }),
          );
          expect(result.rejected).toEqual([]);
          expect(result.created).toHaveLength(1);
          expect(result.created[0].endTime).toBe('2099-01-12T10:00:00.000Z');
          expect(
            await tx.reservations.findUniqueOrThrow({
              where: { ReservationKey: result.created[0].reservationKey },
            }),
          ).toMatchObject({ EndTime: new Date('2099-01-12T10:00:00Z') });
          jest.setSystemTime(new Date('2099-01-12T01:00:00Z'));
          const overlapping = createRequestOutput.strict().parse(
            await f.service.create(f.users[1], {
              startTime: '2099-01-12T02:00:00.000Z', // Monday 09:00: inside the rolled hold
              endTime: '2099-01-12T10:00:00.000Z',
              lines: [{ resourceKey: f.units[0].ResourceKey }],
            }),
          );
          expect(overlapping.created).toEqual([]);
          expect(overlapping.rejected).toMatchObject([
            {
              code:
                tier === 'T2' ? 'SERIAL_NOT_AVAILABLE' : 'WINDOW_NOT_AVAILABLE',
            },
          ]);
          expect(
            await tx.reservations.count({
              where: { ResourceKey: f.units[0].ResourceKey },
            }),
          ).toBe(1);
        });
      },
    );
  });
});
