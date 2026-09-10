-- Reshapes Notification into what the bell dropdown actually renders.
--
-- The table was defined in the init migration and never written to: no service
-- referenced it, so there are no rows to preserve and the columns are replaced
-- outright rather than back-filled. If this ever runs against a database where
-- somebody did write notifications, those three columns go with it - check
-- before applying, because the DROP is not reversible.
--
-- The old shape could not drive the UI:
--   NotificationContent : one text blob, but the dropdown renders a title and
--                         a body at different weights
--   IsRead              : a nullable boolean, so three states for a two-state
--                         question, and no record of *when* it was read
--   (nothing)           : no route to open, no creation time to sort or age by
--
-- The enum is replaced wholesale. 'Anonuncement'/'Approval'/'Warning' were
-- three categories; the frontend switches on six specific events plus the
-- credit deduction, and picks an icon and colour per value.

-- AlterEnum
-- Postgres cannot remove values from an enum in place, so the type is rebuilt.
-- Safe here only because no row uses the old values.
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";

CREATE TYPE "NotificationType" AS ENUM ('RequestApproved', 'RequestRejected', 'PickupReminder', 'DueSoon', 'Overdue', 'CreditDeducted', 'AppealResult');

ALTER TABLE "Notification" ALTER COLUMN "NotificationType" TYPE "NotificationType" USING ("NotificationType"::text::"NotificationType");

DROP TYPE "NotificationType_old";

-- AlterTable
ALTER TABLE "Notification" DROP COLUMN "NotificationContent",
DROP COLUMN "SentTime",
DROP COLUMN "IsRead",
ADD COLUMN     "Title" TEXT NOT NULL,
ADD COLUMN     "Body" TEXT NOT NULL,
ADD COLUMN     "LinkTo" TEXT,
ADD COLUMN     "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "ReadAt" TIMESTAMP(3),
ADD COLUMN     "DedupeKey" TEXT;

-- CreateIndex
-- Lets the reminder sweep write with an upsert instead of "select then insert",
-- which would let two concurrent polls both find nothing and both insert.
-- DedupeKey is NULL for one-off notifications, and Postgres treats NULLs as
-- distinct in a unique index, so those rows are free to repeat.
CREATE UNIQUE INDEX "Notification_AccountKey_NotificationType_DedupeKey_key" ON "Notification"("AccountKey", "NotificationType", "DedupeKey");

-- CreateIndex
-- The bell reads "my notifications, newest first" and nothing else.
CREATE INDEX "Notification_AccountKey_CreatedAt_idx" ON "Notification"("AccountKey", "CreatedAt");
