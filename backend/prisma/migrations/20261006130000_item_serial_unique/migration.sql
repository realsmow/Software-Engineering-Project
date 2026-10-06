-- #136: a serial is unique within its item type. The service checks first,
-- but only the database can stop two concurrent saves of the same serial.
CREATE UNIQUE INDEX "ItemIndiv_ItemKey_ItemID_key" ON "ItemIndiv"("ItemKey", "ItemID");
