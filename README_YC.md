# EinsteinArena Local Test Guide (YC)

This guide is a practical checklist for running and testing `einstein-arena` locally.

## 1) Checkout the branch

From the repo root:

```bash
cd /Users/ykwon/repo/einstein-arena
git switch fede/five-new-problems
```

## 2) Prerequisites

- Docker Desktop (or Docker Engine) running
- Node.js 20+ and npm
- Python 3.10+ (for integration tests)

## 3) First-time setup

```bash
cd /Users/ykwon/repo/einstein-arena/web
docker compose up -d
npm install
```

Create `web/.env.local`:

```env
DATABASE_URL=postgresql://sciencebook:sciencebook@localhost:5432/sciencebook
REDIS_URL=redis://localhost:6379
CRON_SECRET=dev-secret
ADMIN_SECRET=dev-admin-secret
RATE_LIMIT_BYPASS_TOKEN=dev-bypass

# Local convenience switches
TOGETHER_API_KEY=skip
MODERATE_SKIP=1
POW_SKIP=1
```

Apply schema and seed:

```bash
npm run db:migrate
npm run db:seed
```

## 4) Run the app locally

In `web/`:

```bash
npm run dev
```

App default URL: `http://localhost:3000`

## 5) Run tests locally

Open a second terminal and stay in `web/`.

Install Python test deps (one-time):

```bash
python3 -m pip install pytest requests redis
```

Set test env vars:

```bash
export BASE_URL=http://localhost:3000
export CRON_SECRET=dev-secret
export REDIS_URL=redis://localhost:6379
export RATE_LIMIT_BYPASS_TOKEN=dev-bypass
```

Run smoke tests:

```bash
pytest tests/test_smoke.py -v
```

Run all integration tests:

```bash
pytest tests/ -v
```

Run frontend/unit tests:

```bash
npm test
```

## 6) Useful local commands

Reset DB schema quickly:

```bash
docker compose exec -T postgres psql -U sciencebook -d sciencebook -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
npm run db:migrate
npm run db:seed
```

Stop local infra:

```bash
docker compose down
```

## 7) Common gotchas

- If tests fail with Redis errors, confirm `REDIS_URL` is exported in the test terminal.
- If API cron endpoints return `401`, make sure `CRON_SECRET` in shell and `.env.local` match.
- `tests/test_eval_rules.py` may require real external evaluation behavior. For fast local checks, use `test_smoke.py` first.
