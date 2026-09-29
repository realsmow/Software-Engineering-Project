-- Add without a default first, so existing accounts stay NULL ("unknown")
-- instead of all being stamped with the migration time.
ALTER TABLE "AccountInfo" ADD COLUMN "CreatedAt" TIMESTAMPTZ(3);

-- New accounts from here on record their creation time.
ALTER TABLE "AccountInfo" ALTER COLUMN "CreatedAt" SET DEFAULT CURRENT_TIMESTAMP;
