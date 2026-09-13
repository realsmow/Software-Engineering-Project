import 'dotenv/config';
import { PrismaClient } from './src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { toDueDate, toIso, toLocalDayKey } from './src/common/schemas/datetime.schema';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const bkk = (d: Date) =>
  new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok',
  }).format(d);

async function main() {
  const picked = '2026-09-20';           // what the borrower chose in the date picker
  const due = toDueDate(picked);         // the instant it means

  console.log('host TZ                 ', Intl.DateTimeFormat().resolvedOptions().timeZone);
  console.log('picked in the UI        ', picked);
  console.log('instant it means        ', toIso(due), `(= ${bkk(due)} at the counter)`);

  const row = await prisma.cronRunLog.create({
    data: { Job: 'tz-roundtrip-probe', StartedAt: due, Result: 'pending' },
    select: { RunKey: true },
  });
  const read = await prisma.cronRunLog.findUniqueOrThrow({
    where: { RunKey: row.RunKey },
    select: { StartedAt: true },
  });
  await prisma.cronRunLog.delete({ where: { RunKey: row.RunKey } });

  console.log('read back from Postgres ', toIso(read.StartedAt), `(= ${bkk(read.StartedAt)})`);
  console.log('instant preserved       ', read.StartedAt.getTime() === due.getTime());
  console.log('day key round-trips     ', toLocalDayKey(read.StartedAt) === picked);
}

main().finally(() => prisma.$disconnect());
