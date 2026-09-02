-- Give an account a faculty.
--
-- Adapted from the schema half of PR "trpc-auth: added login with hashed
-- passwords and JWT sessions" (branch feat/trpc-auth-connect). That branch's
-- own migration also recreated AccountInfo_Email_key, which this database
-- already has from 20260813180423_unique_email_and_userid, so replaying it
-- would fail on a duplicate index. Only the faculty half is taken here.
--
-- Nullable with ON DELETE SET NULL: every existing row predates the column,
-- and losing a faculty record should orphan the accounts rather than delete
-- the people in it.
--
-- This is the column admin.router.ts refers to when it says staff scoping
-- "cannot be enforced yet". Populating it is what makes ctx.user.facultyKey
-- meaningful; until then it stays null and staff procedures are faculty-wide.

-- AlterTable
ALTER TABLE "AccountInfo" ADD COLUMN     "FacultyKey" INTEGER;

-- AddForeignKey
ALTER TABLE "AccountInfo" ADD CONSTRAINT "AccountInfo_FacultyKey_fkey" FOREIGN KEY ("FacultyKey") REFERENCES "FacultyInfo"("FacultyKey") ON DELETE SET NULL ON UPDATE CASCADE;
