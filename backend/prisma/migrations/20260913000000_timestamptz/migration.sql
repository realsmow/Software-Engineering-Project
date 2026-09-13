-- Every DateTime column moves from `timestamp` to `timestamptz`.
--
-- Why: a naive `timestamp` stores wall-clock digits with no offset, so what it
-- means depends on who reads it. Prisma writes and reads UTC, but three columns
-- are filled by the database instead - AuditLog.At, SessionInfo.IssuedAt and
-- Notification.CreatedAt all carry DEFAULT CURRENT_TIMESTAMP - and
-- CURRENT_TIMESTAMP is evaluated in the database session's TimeZone. Deploy
-- Postgres with TZ=Asia/Bangkok, which is the obvious setting for a Thai
-- university, and those rows land seven hours ahead of every row the
-- application wrote. `timestamptz` stores the instant, so both paths agree no
-- matter how either machine is configured.
--
-- SET TIME ZONE 'UTC' first: the implicit timestamp -> timestamptz conversion
-- reads the existing naive values in the session's zone, and the values that
-- are already there were written as UTC by Prisma. Without this line, running
-- the migration on a Bangkok-configured server would shift all history by
-- seven hours - the very bug this migration exists to remove.
SET TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "SessionInfo" ALTER COLUMN "IssuedAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "ExpiresAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "RevokedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "AuditLog" ALTER COLUMN "At" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "ConditionLog" ALTER COLUMN "LoggedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Reservations" ALTER COLUMN "StartTime" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "EndTime" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "ApprovedAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "ReservationExpiration" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "ActionTime" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "ResolvedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "UsageLog" ALTER COLUMN "DueTime" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "CheckoutTime" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "CheckInTime" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "ExtensionRequest" ALTER COLUMN "PreviousDueTime" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "RequestedDueTime" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "RequestedAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "ResolvedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Inspection" ALTER COLUMN "ActionTime" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "PenaltyInfo" ALTER COLUMN "ActionTime" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "ExpirationTime" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "AppealInfo" ALTER COLUMN "ActionTime" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "ResolvedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Images" ALTER COLUMN "ActionTime" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Notification" ALTER COLUMN "CreatedAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "ReadAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "RepairLog" ALTER COLUMN "BeginRepairDate" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "EndRepairDate" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "CronRunLog" ALTER COLUMN "StartedAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "FinishedAt" SET DATA TYPE TIMESTAMPTZ(3);

