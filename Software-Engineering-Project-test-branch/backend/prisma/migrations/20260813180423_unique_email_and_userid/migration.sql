-- Enforce one account per Email and per UserID.
--
-- The login flow looks an account up by one of these two columns. Without the
-- constraint the database accepts duplicates and the lookup has to fall back
-- to findFirst, which returns an arbitrary matching row.
--
-- NOTE: CREATE UNIQUE INDEX fails if the table already holds duplicates.
-- AccountInfo is empty today, so this applies cleanly. If it is ever run
-- against real data, de-duplicate first.

-- CreateIndex
CREATE UNIQUE INDEX "AccountInfo_Email_key" ON "AccountInfo"("Email");

-- CreateIndex
CREATE UNIQUE INDEX "AccountInfo_UserID_key" ON "AccountInfo"("UserID");
