#!/usr/bin/env bash
# Rebuild the rich demo database from nothing. Takes about 3 minutes.
#
#   bash docs/demo/reset_rich_demo.sh
#
# The backend must already be running on ulms_demo5 (start_rich_demo.sh):
# seed_rich_demo.py drives it over tRPC. Dropping the database under a running
# server is fine - Prisma reconnects on the next query. Browsers stay logged
# out afterwards (their session rows are gone): log in again.
set -euo pipefail

APP="${DEMO_APP:-$HOME/Projects/ulms-demo}"
DEMO_DB="${DEMO_DB:-ulms_demo5}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/${DEMO_DB}"

echo "== recreating ${DEMO_DB}"
docker exec postgres psql -U postgres -c "DROP DATABASE IF EXISTS ${DEMO_DB} WITH (FORCE);" >/dev/null
docker exec postgres psql -U postgres -c "CREATE DATABASE ${DEMO_DB};" >/dev/null
echo "== migrations"
(cd "$APP/backend" && npx prisma migrate deploy | tail -1)
echo "== npm run seed (4 test accounts, 2 departments, 15 units)"
(cd "$APP/backend" && node dist/src/seed.js | tail -1)
echo "== clearing old demo mail"
curl -s -X DELETE http://localhost:8025/api/v1/messages >/dev/null || true
echo "== rich demo data"
DEMO_DB="$DEMO_DB" python3 "$HERE/seed_rich_demo.py"
