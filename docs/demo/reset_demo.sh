#!/usr/bin/env bash
# Rebuild the demo database from scratch and put it back into the state a
# presentation starts from.
#
# Safe to run minutes before the demo: it only ever touches $DEMO_DB, never the
# team's `app` database or the ones the tests use (ulms_test, ulms_e2e).
#
# The backend must already be running against $DEMO_DB, because the last step
# drives it over tRPC. Dropping the database under a running server is fine —
# Prisma reconnects on the next query.
#
#   bash docs/demo/reset_demo.sh
set -euo pipefail

DEMO_DB="${DEMO_DB:-ulms_demo3}"
PG_CONTAINER="${PG_CONTAINER:-postgres}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/${DEMO_DB}"

echo "== dropping and recreating ${DEMO_DB}"
docker exec "$PG_CONTAINER" psql -U postgres -c "DROP DATABASE IF EXISTS ${DEMO_DB} WITH (FORCE);" >/dev/null
docker exec "$PG_CONTAINER" psql -U postgres -c "CREATE DATABASE ${DEMO_DB};" >/dev/null

echo "== applying migrations"
(cd "$REPO/backend" && npx prisma migrate deploy | tail -1)

echo "== seeding reference data and the four test accounts"
(cd "$REPO/backend" && npm run seed --silent | tail -3)

echo "== preparing the demo state"
DEMO_DB="$DEMO_DB" python3 "$REPO/docs/demo/prepare_demo_state.py"
