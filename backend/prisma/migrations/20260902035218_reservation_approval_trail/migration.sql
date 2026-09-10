-- What a decision on a borrowing request leaves behind.
--
-- ApprovedBy already existed as a loose Int with no relation, which is why
-- nothing could enforce "the approver may not be the requester" (proposal
-- §5.9) or show who signed off. The foreign key is the point of this
-- migration; the other two columns are what the approval desk needs beside it.
--
-- AutoApproved : tells "the system cleared it" apart from "a person cleared
--                it", which ApprovedBy alone cannot - both leave it null.
-- ApprovedAt   : when it was decided. ResolvedAt is set on every terminal
--                outcome including a cancellation, so it cannot answer
--                "approved how long ago", which is the question the
--                "not collected within a day" job (§5.9) asks.
--
-- ON DELETE SET NULL rather than CASCADE: deleting a staff account must not
-- delete the requests they approved. The row keeps its history with an unnamed
-- approver, the same choice AuditLog.ActorKey makes.

-- AlterTable
ALTER TABLE "Reservations" ADD COLUMN     "AutoApproved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ApprovedAt" TIMESTAMP(3);

-- CreateIndex
-- The queue reads "pending, oldest first".
CREATE INDEX "Reservations_ApproveStatus_ActionTime_idx" ON "Reservations"("ApproveStatus", "ActionTime");

-- CreateIndex
-- Finding the requests that clash with one being approved is a range scan over
-- a single resource's bookings.
CREATE INDEX "Reservations_ResourceKey_StartTime_EndTime_idx" ON "Reservations"("ResourceKey", "StartTime", "EndTime");

-- AddForeignKey
ALTER TABLE "Reservations" ADD CONSTRAINT "Reservations_ApprovedBy_fkey" FOREIGN KEY ("ApprovedBy") REFERENCES "AccountInfo"("AccountKey") ON DELETE SET NULL ON UPDATE CASCADE;
