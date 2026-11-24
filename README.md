# ULMs — University Lending Management System

A web system for borrowing and returning university equipment and rooms at
Kasetsart University. Borrowers request items or rooms, staff approve and hand
out loans, supervisors oversee, and admins manage users and settings.

Built by a 12-person team for the Software Engineering course (2026).

## Features

- Borrowing requests for items and rooms, with a staff approval desk and an approval trail
- Loan extensions, returns with photos, and inspection of returned items
- Borrower credit with borrowing bans, and appeals with evidence
- Room capacity, opening hours and time slots
- In-app and email notifications, scheduled jobs and reports
- Admin tools: user management, CSV user import, system settings
- Four roles: borrower, staff, supervisor, admin

## Tech stack

| Layer | Tools |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Zod |
| API | tRPC 11 on NestJS 11 (Express 5), Zod validation, cookie sessions |
| Database | PostgreSQL 16, Prisma 7 with migrations |
| Testing | Jest (backend), Vitest (frontend), Playwright (end-to-end), Node load tests in `perf/` |
| CI / deploy | GitHub Actions, Docker, Render |

## Repository layout

| Path | What is there |
|---|---|
| [`backend/`](backend/) | NestJS + tRPC API, Prisma schema and migrations, seed scripts |
| [`frontend/`](frontend/) | React single-page app |
| [`tests/`](tests/) | Playwright end-to-end tests |
| [`perf/`](perf/) | Load tests and results |
| [`docs/`](docs/) | Proposal, SRS, SDS and progress reports; start at [`docs/INDEX.md`](docs/INDEX.md) |

## Run locally

Requirements: Node 22, Docker.

```bash
# 1. Database
docker compose -f backend/docker-compose.yml up -d postgres

# 2. Backend (http://localhost:3000, tRPC at /trpc)
cd backend
cp .env.example .env
npm install
npx prisma migrate deploy
npm run seed          # roles, rules and the four dev test accounts
npm run start

# 3. Frontend (in another terminal)
cd frontend
cp .env.example .env  # set VITE_API_URL to the backend
npm install
npm run dev
```

Test accounts and more detail: [`backend/README.md`](backend/README.md) and
[`frontend/README.md`](frontend/README.md). Production deploy:
[`docs/deploy.md`](docs/deploy.md).
