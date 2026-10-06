-- #156: staff record the unit's condition before a supervisor may approve a
-- supervisor-routed extension. Nullable, so existing rows read as "not checked".
ALTER TABLE "ExtensionRequest" ADD COLUMN "InspectedCondition" INTEGER;

ALTER TABLE "ExtensionRequest" ADD CONSTRAINT "ExtensionRequest_InspectedCondition_fkey" FOREIGN KEY ("InspectedCondition") REFERENCES "ConditionLog"("ConditionKey") ON DELETE SET NULL ON UPDATE CASCADE;
