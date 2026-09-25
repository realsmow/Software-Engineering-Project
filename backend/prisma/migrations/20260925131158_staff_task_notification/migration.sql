-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'StaffTask';

-- AlterTable
ALTER TABLE "RetirementRequest" ALTER COLUMN "DecidedAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "RequestedAt" SET DATA TYPE TIMESTAMPTZ(3);
