-- CreateTable
CREATE TABLE "CronRunLog" (
    "RunKey" SERIAL NOT NULL,
    "Job" TEXT NOT NULL,
    "StartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "FinishedAt" TIMESTAMP(3),
    "Result" TEXT NOT NULL,
    "Affected" INTEGER NOT NULL DEFAULT 0,
    "Detail" TEXT,

    CONSTRAINT "CronRunLog_pkey" PRIMARY KEY ("RunKey")
);

-- CreateIndex
CREATE INDEX "CronRunLog_Job_StartedAt_idx" ON "CronRunLog"("Job", "StartedAt");
