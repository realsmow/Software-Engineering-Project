import { PrismaService } from '../../src/prisma.service';
import type { Prisma } from '../../src/generated/prisma/client';
import {
  createRequestInput,
  createRequestOutput,
} from '../../src/loan/loan.schema';
import { inHistoryFixture } from '../fixtures/borrower-history';
import {
  deleteRequestFixture,
  requestFixture,
  requestService,
} from '../fixtures/loan-request';

const DAY = 86_400_000;
function windowInput(resourceKey: number) {
  return createRequestInput.parse({
    startTime: new Date(Date.now() + DAY).toISOString(),
    endTime: new Date(Date.now() + 3 * DAY).toISOString(),
    lines: [{ resourceKey, reason: 'Laboratory project' }],
  });
}

describe('persisted reservation conflict handling', () => {
  let prisma: PrismaService;
  let termEnd: string | undefined;
  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    termEnd = process.env.TERM_END_DATE;
    delete process.env.TERM_END_DATE;
  });
  afterAll(async () => {
    if (termEnd === undefined) delete process.env.TERM_END_DATE;
    else process.env.TERM_END_DATE = termEnd;
    await prisma?.$disconnect();
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
});
