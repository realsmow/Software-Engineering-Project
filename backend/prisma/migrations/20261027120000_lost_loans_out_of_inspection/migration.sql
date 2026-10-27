-- #230: the scheduled write-off used to leave a lost loan as 'Returned', which
-- is the "waiting for inspection" state, so it showed in the staff queue.
-- Those rows are the Returned ones with no check-in time (a real return always
-- records one) on a unit marked Missing. Move them to the state a staff
-- write-off leaves: closed, unit off the shelf.
UPDATE "ResourceInfo" r
SET "AllowBorrow" = false
FROM "UsageLog" u
WHERE u."ResourceKey" = r."ResourceKey"
  AND u."CurrentStatus" = 'Returned'
  AND u."CheckInTime" IS NULL
  AND r."ResourceStatus" = 'Missing';

UPDATE "UsageLog" u
SET "CurrentStatus" = 'Inspected',
    "CheckInTime" = u."DueTime" + INTERVAL '14 days'
FROM "ResourceInfo" r
WHERE u."ResourceKey" = r."ResourceKey"
  AND u."CurrentStatus" = 'Returned'
  AND u."CheckInTime" IS NULL
  AND r."ResourceStatus" = 'Missing';
