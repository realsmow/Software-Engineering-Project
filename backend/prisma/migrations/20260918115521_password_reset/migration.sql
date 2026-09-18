-- CreateTable
CREATE TABLE "PasswordReset" (
    "ResetKey" SERIAL NOT NULL,
    "AccountKey" INTEGER NOT NULL,
    "TokenHash" TEXT NOT NULL,
    "IssuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "UsedAt" TIMESTAMPTZ(3),

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("ResetKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_TokenHash_key" ON "PasswordReset"("TokenHash");

-- CreateIndex
CREATE INDEX "PasswordReset_AccountKey_idx" ON "PasswordReset"("AccountKey");

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_AccountKey_fkey" FOREIGN KEY ("AccountKey") REFERENCES "AccountInfo"("AccountKey") ON DELETE CASCADE ON UPDATE CASCADE;
