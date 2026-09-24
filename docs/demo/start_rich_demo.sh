#!/usr/bin/env bash
# Start everything the live demo needs, from the frozen copy of origin/main.
#
#   bash docs/demo/start_rich_demo.sh        # then open http://localhost:5173
#
# Code: ~/Projects/ulms-demo (git archive of origin/main e0a4865, not a git
# checkout, so nothing the team pushes changes it mid-presentation).
# Logs: ~/Projects/ulms-demo/{backend,frontend}.log   Mail: http://localhost:8025
set -euo pipefail

APP="${DEMO_APP:-$HOME/Projects/ulms-demo}"
DEMO_DB="${DEMO_DB:-ulms_demo5}"

docker start postgres >/dev/null
# Mailpit catches the registration mail: the backend sends to SMTP localhost:1025.
docker start ulms-mailpit >/dev/null 2>&1 \
  || docker run -d --name ulms-mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit >/dev/null

for port in 3000 5173; do
  if ss -ltn | grep -q ":$port "; then
    echo "port $port is already in use - stop that server first:"; ss -ltnp | grep ":$port "; exit 1
  fi
done

cd "$APP/backend"
# A fixed secret: with the default random one every backend restart logs every
# open browser out, which is the last thing you want mid-demo.
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/${DEMO_DB}" \
SESSION_SECRET="ulms-demo-session-secret-not-for-production-2569" \
PUBLIC_API_URL=http://localhost:3000 MEDIA_ROOT=./media NODE_ENV=development \
  nohup node dist/src/main.js > "$APP/backend.log" 2>&1 &

cd "$APP/frontend"
nohup npm run dev -- --port 5173 --strictPort > "$APP/frontend.log" 2>&1 &

for i in $(seq 1 60); do
  curl -s -o /dev/null localhost:3000/trpc/auth.me && curl -s -o /dev/null localhost:5173 && break
  sleep 1
done
echo "backend  http://localhost:3000  (database ${DEMO_DB})"
echo "frontend http://localhost:5173"
echo "mail     http://localhost:8025"
