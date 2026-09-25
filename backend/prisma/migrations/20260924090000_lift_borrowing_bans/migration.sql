-- There is no borrowing ban in the SRS; penalties limit borrowing through the
-- credit band (FR-CRD-08). A ban was the only penalty with neither a loan nor
-- a credit deduction behind it. Lift the ones still in force; the rows stay as
-- history.
UPDATE "PenaltyInfo"
SET "InEffect" = false
WHERE "InEffect" = true
  AND "UsageKey" IS NULL
  AND "CreditDeducted" IS NULL;
