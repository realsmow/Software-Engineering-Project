-- Rooms learn how many people they seat.
--
-- Why a column rather than a derived number: nothing in the schema implies a
-- room's size. `CreditWeight` is what the booking costs, `BorrowRule` is how
-- long it may be held - neither says how many chairs are in it, and the room
-- list and the booking form both show the figure to the borrower.
--
-- Nullable on purpose. Backfilling the existing rooms would mean inventing
-- numbers, and an invented capacity reads exactly like a measured one once it
-- is in the column. NULL says "nobody has recorded this yet", which is the
-- truth, and the UI renders it as "-".
--
-- The CHECK is here and not in schema.prisma because Prisma has no syntax for
-- it. A room that seats zero or minus four people is not a room with an
-- unusual capacity, it is a typo, and the database is the only place that can
-- refuse it for every writer - the tRPC layer validates the same rule, but a
-- seed script or a psql session goes straight past that.
ALTER TABLE "RoomInfo" ADD COLUMN "Capacity" INTEGER;

ALTER TABLE "RoomInfo"
  ADD CONSTRAINT "RoomInfo_Capacity_positive" CHECK ("Capacity" IS NULL OR "Capacity" > 0);
