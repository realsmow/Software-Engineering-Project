# Deploying ULMs

## Prerequisites

- Docker and Docker Compose v2 on the host.
- A domain name pointing at the host (needed for HTTPS).
- A TLS-terminating reverse proxy in front of this stack (see HTTPS below).

## One-time setup

1. Copy the backend production env file and fill in real values:

   ```
   cp backend/.env.production.example backend/.env.production
   ```

2. Generate a session secret (must be at least 32 characters):

   ```
   openssl rand -base64 48
   ```

   Put the result in `SESSION_SECRET` in `backend/.env.production`. Also set
   `POSTGRES_PASSWORD` (used by both the `postgres` service and the backend's
   `DATABASE_URL`), `CORS_ORIGINS` (the public frontend origin), and
   `PUBLIC_API_URL` / `PUBLIC_APP_URL`.

3. Build and start the stack:

   ```
   POSTGRES_PASSWORD=... docker compose -f docker-compose.prod.yml up -d --build
   ```

   The backend container runs `prisma migrate deploy` on every start before
   starting the server, so migrations apply automatically.

4. Seed reference data and the first admin account (once):

   ```
   docker compose -f docker-compose.prod.yml exec backend node dist/src/seed-prod.js
   ```

   This reads `ADMIN_EMAIL`, `ADMIN_USER_ID`, `ADMIN_PASSWORD`,
   `ADMIN_FIRST_NAME`, `ADMIN_LAST_NAME` from `backend/.env.production`.

## HTTPS

This stack terminates plain HTTP on port 80 (the `frontend` service). Put a
TLS-terminating reverse proxy in front of it (Caddy, Traefik, or a host-level
nginx) and point it at port 80. `COOKIE_SECURE=true` in
`backend/.env.production` requires the site to actually be served over
HTTPS, or the browser will silently refuse to store the session cookie.

## Backups

The `backup` service (SRS NFR-REL-03) runs `scripts/backup.sh`: every day at
03:00 Asia/Bangkok it writes a `pg_dump` custom-format file and a tarball of
the uploaded photos to `BACKUP_DIR` on the host (default `./backups`), and
deletes files older than `BACKUP_KEEP_DAYS` (default 14).

- Check it once after deploying:
  `docker compose -f docker-compose.prod.yml run --rm backup now`
- Copy `BACKUP_DIR` off the server regularly; a backup on the same disk does
  not survive losing that disk.
- Restore the database into an empty `app` database:
  `docker compose -f docker-compose.prod.yml exec -T postgres pg_restore -U postgres -d app --clean --if-exists < backups/app-YYYYMMDD-HHMM.dump`
- Restore photos: stop `backend`, extract `media-YYYYMMDD-HHMM.tar.gz` into
  the `backend_media` volume, start `backend`.

## Updating

```
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Migrations run automatically on backend start. The `postgres` and
`backend_media` volumes persist across rebuilds.

## Single-replica constraint

Cron jobs (see `backend/src/cron/cron.service.ts`) run in-process. Do not
scale the `backend` service beyond one replica, or scheduled jobs will fire
once per replica instead of once per schedule.

## Not wired yet

These are optional, env-driven features with placeholders in
`backend/.env.production.example`, but are not required for the app to run:

- **Google OAuth** - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `GOOGLE_REDIRECT_URI`, `ALLOWED_EMAIL_DOMAINS`. Leave empty to keep
  disabled.
- **SMTP relay** - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`,
  `SMTP_PASS`. Leave empty to keep disabled; password-reset and
  registration mail will not be sent without it.
