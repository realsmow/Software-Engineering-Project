-- Two changes that together make access revocable.
--
-- AccountInfo.IsActive  : can this person sign in at all. Distinct from a
--                         borrowing ban, which still allows login.
-- SessionInfo           : one row per sign-in, so a session can be ended
--                         before its token expires. Without it a stolen
--                         cookie stays valid until it lapses, and "sign out
--                         everywhere" is impossible.
--
-- TokenHash stores a SHA-256 of the id inside the cookie, never the cookie
-- value, so a dump of this table cannot be replayed.

-- AlterTable
ALTER TABLE "AccountInfo" ADD COLUMN     "IsActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "SessionInfo" (
    "SessionKey" SERIAL NOT NULL,
    "AccountKey" INTEGER NOT NULL,
    "TokenHash" TEXT NOT NULL,
    "IssuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ExpiresAt" TIMESTAMP(3) NOT NULL,
    "RevokedAt" TIMESTAMP(3),

    CONSTRAINT "SessionInfo_pkey" PRIMARY KEY ("SessionKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "SessionInfo_TokenHash_key" ON "SessionInfo"("TokenHash");

-- CreateIndex
CREATE INDEX "SessionInfo_AccountKey_idx" ON "SessionInfo"("AccountKey");

-- AddForeignKey
ALTER TABLE "SessionInfo" ADD CONSTRAINT "SessionInfo_AccountKey_fkey" FOREIGN KEY ("AccountKey") REFERENCES "AccountInfo"("AccountKey") ON DELETE CASCADE ON UPDATE CASCADE;

