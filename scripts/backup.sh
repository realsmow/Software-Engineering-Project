#!/bin/sh
# Daily database + media backup (SRS NFR-REL-03: every day at 03:00).
#
# Runs inside the `backup` service of docker-compose.prod.yml, which uses the
# postgres image so pg_dump always matches the server version.
#
#   backup.sh        sleep until 03:00 (TZ), back up, repeat forever
#   backup.sh now    back up once and exit (first check after deploy, or by hand)
#
# Env: PGHOST (default postgres), PGUSER (default postgres), PGPASSWORD,
#      PGDATABASE (default app), BACKUP_KEEP_DAYS (default 14), TZ.
# Writes to /backups; reads uploaded photos from /media (mounted read-only).
set -eu

export PGHOST="${PGHOST:-postgres}"
export PGUSER="${PGUSER:-postgres}"
export PGDATABASE="${PGDATABASE:-app}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
OUT=/backups

backup_once() {
  stamp=$(date +%Y%m%d-%H%M)
  # Written under a temporary name and renamed at the end, so a crash never
  # leaves a truncated file that looks like a good backup.
  pg_dump --format=custom --file="$OUT/app-$stamp.dump.part"
  mv "$OUT/app-$stamp.dump.part" "$OUT/app-$stamp.dump"

  if [ -d /media ]; then
    tar -czf "$OUT/media-$stamp.tar.gz.part" -C /media .
    mv "$OUT/media-$stamp.tar.gz.part" "$OUT/media-$stamp.tar.gz"
  fi

  find "$OUT" -maxdepth 1 \( -name 'app-*.dump' -o -name 'media-*.tar.gz' \) \
    -mtime +"$KEEP_DAYS" -delete
  echo "backup $stamp done: $(ls -1 "$OUT" | wc -l) file(s) kept in $OUT"
}

if [ "${1:-}" = "now" ]; then
  backup_once
  exit 0
fi

while true; do
  now=$(date +%s)
  next=$(date -d 'today 03:00' +%s)
  if [ "$next" -le "$now" ]; then
    next=$(date -d 'tomorrow 03:00' +%s)
  fi
  sleep $((next - now))
  # One failed night must not stop the next one; the error is in the logs.
  backup_once || echo "backup failed at $(date)" >&2
done
