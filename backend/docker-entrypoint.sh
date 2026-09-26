#!/bin/sh
# Runs pending migrations against DATABASE_URL, then starts the server.
# Safe to run on every container start: migrate deploy is a no-op when
# there is nothing pending.
set -e

npx prisma migrate deploy

exec node dist/src/main.js
