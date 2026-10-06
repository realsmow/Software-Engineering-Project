-- How each session signed in, shown on the profile instead of a guess from
-- the email domain. Existing sessions stay NULL ("unknown").
ALTER TABLE "SessionInfo" ADD COLUMN "Method" TEXT;
