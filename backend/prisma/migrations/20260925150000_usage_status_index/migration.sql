-- Active loans are a handful of rows among the whole loan history; queries that
-- ask "which units are out right now" (next-available date) start from them.
CREATE INDEX "UsageLog_CurrentStatus_idx" ON "UsageLog"("CurrentStatus");
