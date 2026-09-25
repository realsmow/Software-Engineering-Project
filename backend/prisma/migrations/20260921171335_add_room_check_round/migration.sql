-- CreateTable
CREATE TABLE "RoomCheckRound" (
    "RoundKey" SERIAL NOT NULL,
    "ResourceKey" INTEGER NOT NULL,
    "OpenedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DueAt" TIMESTAMPTZ(3) NOT NULL,
    "ClosedAt" TIMESTAMPTZ(3),
    "ConditionKey" INTEGER,

    CONSTRAINT "RoomCheckRound_pkey" PRIMARY KEY ("RoundKey")
);

-- CreateIndex
CREATE INDEX "RoomCheckRound_DueAt_idx" ON "RoomCheckRound"("DueAt");

-- CreateIndex
CREATE UNIQUE INDEX "RoomCheckRound_ResourceKey_ClosedAt_key" ON "RoomCheckRound"("ResourceKey", "ClosedAt");

-- AddForeignKey
ALTER TABLE "RoomCheckRound" ADD CONSTRAINT "RoomCheckRound_ResourceKey_fkey" FOREIGN KEY ("ResourceKey") REFERENCES "ResourceInfo"("ResourceKey") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomCheckRound" ADD CONSTRAINT "RoomCheckRound_ConditionKey_fkey" FOREIGN KEY ("ConditionKey") REFERENCES "ConditionLog"("ConditionKey") ON DELETE SET NULL ON UPDATE CASCADE;
