# AGENTS.md — cashflow

Ops notes for any coding agent picking up this repo. Full context: `README.md`.

## What this is

React 19 + TS + Tailwind v4 SPA served by a Hono worker on Cloudflare Workers.
Google OAuth login gate; per-user settings in Workers KV. Live:
`https://cashflow.ronakshah725.workers.dev/`

## Non-negotiable rules

1. **Never commit financial values.** Defaults live in gitignored
   `config/assumptions.defaults.json` and in KV (`defaults:v1`). Before any
   commit, run `git grep -E '\$[0-9]'` on tracked files; it must be clean.
2. **Never put secrets in the repo.** Worker secrets are managed in the
   Cloudflare dashboard (Workers & Pages → `cashflow` → Settings → Variables
   and Secrets) and persist across deploys. Names only:
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`,
   `ALLOWED_EMAIL`.
3. **Do not rename the worker.** The name `cashflow` is embedded in the Google
   OAuth redirect URI
   (`https://cashflow.ronakshah725.workers.dev/auth/callback`).

## Cloudflare wiring

- `wrangler.jsonc`: worker `cashflow`, KV namespace bound as `ASSUMPTIONS`,
  static assets from `./dist` with `run_worker_first: true` so `GET /`
  enforces login before serving the SPA.
- KV keys: `defaults:v1` (seeded defaults), `asm:<google-sub>` (per-user
  overrides), `sess:<id>` (sessions, 30d TTL), `oauth:<state>` (OAuth CSRF,
  10m TTL).
- API: `GET /api/defaults`, `GET|PUT /api/assumptions` (auth required);
  `/auth/login`, `/auth/callback`, `/auth/logout`.

## Common tasks

```bash
npm install
npm run dev        # SPA only
npm run typecheck && npm run build   # dist/ for the worker
CLOUDFLARE_API_TOKEN=... npx wrangler deploy
CLOUDFLARE_API_TOKEN=... npm run seed   # push config/assumptions.defaults.json to KV
```

CI (`.github/workflows/deploy.yml`, on push to `main`) runs build + deploy
using the `CLOUDFLARE_API_TOKEN` repo secret.

## Data refresh model

No CSV handling in the app by design. Refresh = update the gitignored defaults
JSON and re-run `npm run seed`. Per-user `asm:<sub>` overrides are untouched.
