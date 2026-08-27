-- AlterTable
ALTER TABLE "AccountInfo" ADD COLUMN     "FacultyKey" INTEGER,
ADD COLUMN     "Username" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AccountInfo_Email_key" ON "AccountInfo"("Email");

-- CreateIndex
CREATE UNIQUE INDEX "AccountInfo_Username_key" ON "AccountInfo"("Username");

-- AddForeignKey
ALTER TABLE "AccountInfo" ADD CONSTRAINT "AccountInfo_FacultyKey_fkey" FOREIGN KEY ("FacultyKey") REFERENCES "FacultyInfo"("FacultyKey") ON DELETE SET NULL ON UPDATE CASCADE;
