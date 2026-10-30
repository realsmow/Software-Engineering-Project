import 'dotenv/config';
import { PrismaService } from './prisma.service';
import { removeDemo, seedDemo } from './demo/demo-seed';
import { chooseDatabase } from './demo/database-url';

/**
 * Presentation data for a deployed database (see demo/demo-seed.ts).
 *
 *   DEMO_PASSWORD=<shared demo password> npm run seed:demo
 *   npm run seed:demo -- --remove
 *
 * Both ask for the database URL at the prompt (hidden); Enter alone uses the
 * local one from .env.
 *
 * DEMO_OPEN_DAY=YYYY-MM-DD also opens that weekend day for the demo
 * departments (presentation day).
 */
async function main() {
  const host = await chooseDatabase();
  const prisma = new PrismaService();
  try {
    if (process.argv.includes('--remove')) {
      console.log(`Removing demo data from ${host}`);
      await removeDemo(prisma);
    } else {
      const password = process.env.DEMO_PASSWORD;
      if (!password)
        throw new Error('Set DEMO_PASSWORD (at least 8 characters).');
      console.log(`Adding demo data to ${host}`);
      await seedDemo(prisma, {
        password,
        openDay: process.env.DEMO_OPEN_DAY || undefined,
      });
      console.log(
        'Sign in as demo.admin, demo.staff, demo.supervisor or demo.student1-4 with DEMO_PASSWORD.',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
