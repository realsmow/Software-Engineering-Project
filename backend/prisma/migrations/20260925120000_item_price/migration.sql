-- FR-EQP-01: baht price on an equipment type.
--
-- Nullable and advisory only - it feeds `suggestTierFromPrice`
-- (common/pricing/suggest-tier.ts) for the tier picker's hint, but staff still
-- choose the tier by hand on each unit, so nothing here constrains BorrowRule.
ALTER TABLE "ItemInfo" ADD COLUMN "Price" DOUBLE PRECISION;

ALTER TABLE "ItemInfo"
  ADD CONSTRAINT "ItemInfo_Price_nonnegative" CHECK ("Price" IS NULL OR "Price" >= 0);
