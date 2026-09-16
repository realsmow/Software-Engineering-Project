-- Append-only audit trail.
--
-- Admin actions (create/disable/ban/role change/password reset/config) had no
-- record of who performed them. This adds one.
--
-- ActorName and ActorRole are stored rather than joined from AccountInfo on
-- read: a join would rewrite history whenever someone is renamed or promoted,
-- and the log has to say what was true at the time. ActorKey is ON DELETE SET
-- NULL for the same reason - removing an account must not erase what it did.

-- CreateTable
CREATE TABLE "AuditLog" (
    "AuditKey" SERIAL NOT NULL,
    "At" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ActorKey" INTEGER,
    "ActorName" TEXT NOT NULL,
    "ActorRole" TEXT NOT NULL,
    "Action" TEXT NOT NULL,
    "Target" TEXT NOT NULL,
    "Ip" TEXT,
    "UserAgent" TEXT,
    "Detail" TEXT NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("AuditKey")
);

-- CreateIndex
CREATE INDEX "AuditLog_At_idx" ON "AuditLog"("At");

-- CreateIndex
CREATE INDEX "AuditLog_Action_idx" ON "AuditLog"("Action");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_ActorKey_fkey" FOREIGN KEY ("ActorKey") REFERENCES "AccountInfo"("AccountKey") ON DELETE SET NULL ON UPDATE CASCADE;

