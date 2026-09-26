-- FR-EQP-08: staff-requested, supervisor-approved retirement.
--
-- The new enum value is its own statement, added and never referenced again in
-- this same file - same pattern as 20260924110000_appeal_evidence, because
-- ALTER TYPE ... ADD VALUE cannot run in the same transaction that uses it.
ALTER TYPE "ResourceStatus" ADD VALUE 'Retired';

-- CreateTable
CREATE TABLE "RetirementRequest" (
    "RequestKey" SERIAL NOT NULL,
    "ResourceKey" INTEGER NOT NULL,
    "RequestedBy" INTEGER NOT NULL,
    "Reason" TEXT NOT NULL,
    "ApproveStatus" "ApproveStatus" NOT NULL,
    "DecidedBy" INTEGER,
    "DecidedAt" TIMESTAMP(3),
    "DecisionNote" TEXT,
    "RequestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetirementRequest_pkey" PRIMARY KEY ("RequestKey")
);

-- CreateIndex
-- The supervisor queue reads "pending, oldest first".
CREATE INDEX "RetirementRequest_ApproveStatus_RequestedAt_idx" ON "RetirementRequest"("ApproveStatus", "RequestedAt");

-- CreateIndex
CREATE INDEX "RetirementRequest_ResourceKey_idx" ON "RetirementRequest"("ResourceKey");

-- AddForeignKey
ALTER TABLE "RetirementRequest" ADD CONSTRAINT "RetirementRequest_ResourceKey_fkey" FOREIGN KEY ("ResourceKey") REFERENCES "ResourceInfo"("ResourceKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetirementRequest" ADD CONSTRAINT "RetirementRequest_RequestedBy_fkey" FOREIGN KEY ("RequestedBy") REFERENCES "AccountInfo"("AccountKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- SET NULL rather than RESTRICT: deleting a supervisor's account must not
-- delete the retirement decisions they made, the same choice
-- Reservations.ApprovedBy makes.
ALTER TABLE "RetirementRequest" ADD CONSTRAINT "RetirementRequest_DecidedBy_fkey" FOREIGN KEY ("DecidedBy") REFERENCES "AccountInfo"("AccountKey") ON DELETE SET NULL ON UPDATE CASCADE;
