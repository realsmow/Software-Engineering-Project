import { PrismaService } from '../../src/prisma.service';
import { requireIsolatedDatabase } from '../fixtures/isolated-database';
import { inHistoryFixture } from '../fixtures/borrower-history';
import { freezeBusinessDate } from '../fixtures/business-clock';
import { pickupFixture, pickupRequest, PICKUP_START } from '../fixtures/pickup';

/**
 * #239 (team decision D-08): one cart can hold items of several departments,
 * each collected at its own counter, so every request line says where. The
 * borrower's pages group a cart by it. Rolled back afterwards.
 */
describe('#239: a request says where it is picked up', () => {
  let prisma: PrismaService;
  beforeAll(async () => {
    requireIsolatedDatabase();
    prisma = new PrismaService();
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });
  afterEach(() => jest.useRealTimers());

  it('names the department or club that manages the unit', () =>
    inHistoryFixture(prisma, async (tx) => {
      freezeBusinessDate(PICKUP_START);
      const f = await pickupFixture(tx);
      await tx.clubInfo.create({
        data: {
          ClubName: 'Robotics Club',
          ManageGroupKey: f.group.ManageGroupKey,
        },
      });

      const request = await pickupRequest(f);
      expect(request.resource.pickupPoint).toBe('Robotics Club');
      const mine = await f.service.getMine(f.users[0], request.reservationKey);
      expect(mine.resource.pickupPoint).toBe('Robotics Club');
    }));
});
