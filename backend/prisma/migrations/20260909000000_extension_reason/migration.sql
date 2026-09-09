-- Gives an extension request a reason, and the two extension desks an index.
--
-- `Reason` is what §5.4 has staff weigh: an extension is granted or refused on
-- whether the borrower's reason justifies holding a unit somebody else is
-- queuing for, and until now there was nowhere to record the sentence being
-- judged. Nullable because the column is new and every existing row predates
-- it — an extension with no stated reason is a legitimate state, not a defect.
--
-- The indexes back the two queries `loan.extensionReviews` /
-- `approval.extensionQueue` and `loan.requestExtension` run on every poll and
-- every request: "pending, oldest first" and "how many extensions has this
-- loan already had". Neither had one, so both were sequential scans.

-- AlterTable
ALTER TABLE "ExtensionRequest" ADD COLUMN "Reason" TEXT;

-- CreateIndex
CREATE INDEX "ExtensionRequest_ApproveStatus_RequestedAt_idx" ON "ExtensionRequest"("ApproveStatus", "RequestedAt");

-- CreateIndex
CREATE INDEX "ExtensionRequest_UsageKey_idx" ON "ExtensionRequest"("UsageKey");
