-- FR-EQP-04: per-room opening hours, replacing the one fixed grid every room
-- used to share (common/booking/room-slots.ts).
--
-- Minutes past local midnight, same unit loan.request.service.ts and
-- room-slots.ts already use internally. Defaults reproduce the grid every
-- room ran under before this column existed (07:00-12:00, 13:00-18:00), so an
-- unedited room's chip strip does not move.
--
-- The CHECK is here rather than in schema.prisma for the same reason
-- RoomInfo_Capacity_positive is: Prisma has no syntax for it, and a bad pair
-- of hours is a data problem the database should refuse regardless of which
-- writer sent it.
ALTER TABLE "RoomInfo"
  ADD COLUMN "OpenTime" INTEGER NOT NULL DEFAULT 420,
  ADD COLUMN "CloseTime" INTEGER NOT NULL DEFAULT 1080,
  ADD COLUMN "BreakStart" INTEGER DEFAULT 720,
  ADD COLUMN "BreakEnd" INTEGER DEFAULT 780;

ALTER TABLE "RoomInfo" ADD CONSTRAINT "RoomInfo_hours_valid" CHECK (
  "OpenTime" >= 0 AND "OpenTime" < 1440
  AND "CloseTime" > "OpenTime" AND "CloseTime" <= 1440
  AND "OpenTime" % 30 = 0 AND "CloseTime" % 30 = 0
  AND (("BreakStart" IS NULL) = ("BreakEnd" IS NULL))
  AND (
    "BreakStart" IS NULL
    OR (
      "BreakStart" % 30 = 0 AND "BreakEnd" % 30 = 0
      AND "BreakStart" >= "OpenTime" AND "BreakEnd" <= "CloseTime"
      AND "BreakStart" < "BreakEnd"
    )
  )
);
