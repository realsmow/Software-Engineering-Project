-- One submit of the borrow cart, so its lines are approved and handled as one
-- borrow on screen (demo feedback). Old rows keep a null CartKey.
CREATE TABLE "RequestCart" (
    "CartKey" SERIAL NOT NULL,
    "CreatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestCart_pkey" PRIMARY KEY ("CartKey")
);

ALTER TABLE "Reservations" ADD COLUMN "CartKey" INTEGER;

CREATE INDEX "Reservations_CartKey_idx" ON "Reservations"("CartKey");

ALTER TABLE "Reservations" ADD CONSTRAINT "Reservations_CartKey_fkey" FOREIGN KEY ("CartKey") REFERENCES "RequestCart"("CartKey") ON DELETE SET NULL ON UPDATE CASCADE;
