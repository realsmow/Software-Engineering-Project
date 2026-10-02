import { PrismaService } from '../../src/prisma.service';
import { seedReference } from '../../src/seed/reference';
import { requireIsolatedDatabase } from './isolated-database';

// Runner bootstrap only: call the existing application reference seed rather
// than duplicating roles, credit bands or lending constraints in fixtures.
requireIsolatedDatabase();
const prisma = new PrismaService();
void seedReference(prisma)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
