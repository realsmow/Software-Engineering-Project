-- FR-CRD-06: the score is 100 minus the penalties still in force. Scores were
-- previously adjusted by increments and could drift from that (seed values,
-- an admin-chosen starting credit). Bring every account back in line once;
-- from here on the app recomputes it on every penalty change.
UPDATE "AccountInfo" a
SET "UserCredit" = GREATEST(
  0,
  100 - COALESCE((
    SELECT SUM(p."CreditDeducted")
    FROM "PenaltyInfo" p
    WHERE p."AccountKey" = a."AccountKey"
      AND p."InEffect" = true
      AND p."ExpirationTime" > now()
  ), 0)
);
