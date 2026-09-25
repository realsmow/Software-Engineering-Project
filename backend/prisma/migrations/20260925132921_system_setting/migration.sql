-- CreateTable
CREATE TABLE "SystemSetting" (
    "Key" TEXT NOT NULL,
    "Value" JSONB NOT NULL,
    "UpdatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("Key")
);
