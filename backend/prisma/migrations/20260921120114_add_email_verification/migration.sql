-- CreateTable
CREATE TABLE "EmailVerification" (
    "VerificationKey" SERIAL NOT NULL,
    "AccountKey" INTEGER NOT NULL,
    "TokenHash" TEXT NOT NULL,
    "IssuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "UsedAt" TIMESTAMPTZ(3),

    CONSTRAINT "EmailVerification_pkey" PRIMARY KEY ("VerificationKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerification_TokenHash_key" ON "EmailVerification"("TokenHash");

-- CreateIndex
CREATE INDEX "EmailVerification_AccountKey_idx" ON "EmailVerification"("AccountKey");

-- AddForeignKey
ALTER TABLE "EmailVerification" ADD CONSTRAINT "EmailVerification_AccountKey_fkey" FOREIGN KEY ("AccountKey") REFERENCES "AccountInfo"("AccountKey") ON DELETE CASCADE ON UPDATE CASCADE;
