# Cash Flow Calculator

Private household cash-flow calculator. React 19 + TypeScript + Tailwind CSS v4
+ Recharts SPA served by a Hono worker on Cloudflare Workers (free tier),
behind Google OAuth. Live at <https://cashflow.ronakshah725.workers.dev/>.

**Privacy rule: no financial default values in this repo.** Seeded defaults live
in gitignored `config/assumptions.defaults.json` and are pushed to Workers KV
(`defaults:v1` in the `cashflow-kv` namespace). The SPA loads them at runtime
from the authenticated `GET /api/defaults` endpoint. A shape-only example is
committed at `config/assumptions.defaults.example.json`.

## What it shows

A decision-oriented dashboard, not an input form:

- **Verdict headline** — one live sentence combining the current rent,
  care plan, and monthly investing figure, plus a plain verdict
  (Comfortable / Workable / Tight / In the red).
- **Waterfall chart** — income minus housing, lifestyle, and care buckets
  equals monthly investing, with a Phase 1 / Phase 2 toggle.
- **Care scenario bars** — four care plans, each split
  into cash-flow and bonus layers. This is the highest-weight decision.
- **5-year timeline** — stacked cumulative investing showing the rent-only
  window, the care-start marker, and the bonus as its own layer.
- **5 hero inputs** — effective rent, care plan, bonus toggle, care-start
  month, and lifestyle as one editable number with an expandable breakdown.
  Everything else lives under a "Fine-tune" collapsible.

## Refreshing the data (no CSV upload in the app)

There is deliberately no CSV parsing or actuals-vs-plan UI in the app. When
spending or income reality changes:

1. The user hands a fresh CSV export to the assistant.
2. The assistant re-runs the reconciliation and updates
   `config/assumptions.defaults.json` (gitignored, never committed).
3. The assistant re-seeds KV: `CLOUDFLARE_API_TOKEN=... npm run seed`.

The app picks up the new defaults on next load; per-user overrides in
`asm:<sub>` are untouched.

## Stack

- **Frontend:** Vite 7 + React 19 + TypeScript, Tailwind CSS v4 (utilities only;
  the dashboard keeps its own stylesheet in `src/web/dashboard.css`), Recharts
  for the waterfall / scenario / timeline charts
- **Worker:** Hono 4 on Cloudflare Workers, Workers Static Assets for the SPA
- **Storage:** Workers KV (`cashflow-kv`, bound as `ASSUMPTIONS`)
  - `defaults:v1` — seeded lever defaults (owner-managed)
  - `asm:<google-sub>` — per-user lever overrides
  - `sess:<id>` — login sessions (30-day TTL)
  - `oauth:<state>` — OAuth CSRF states (10-minute TTL)

## Local dev

```bash
npm install
npm run dev        # Vite dev server for the SPA only
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production build into dist/
```

Worker dev (`npx wrangler dev`) serves the API routes; the SPA needs a
production build in `dist/` for the assets binding to resolve.

## Required Worker secrets

Set in the Cloudflare dashboard under Workers & Pages → `cashflow` →
Settings → Variables and Secrets. They are **already set** and persist across
deploys; CI never manages them.

| Secret                | Purpose                                              |
| --------------------- | ---------------------------------------------------- |
| `GOOGLE_CLIENT_ID`    | Google OAuth client for this app                     |
| `GOOGLE_CLIENT_SECRET`| Google OAuth client secret                           |
| `SESSION_SECRET`      | HMAC key signing the session cookies                 |
| `ALLOWED_EMAIL`       | The single Google account allowed to sign in         |

Do not rename the worker: the name `cashflow` is part of the Google OAuth
redirect URI (`https://cashflow.ronakshah725.workers.dev/auth/callback`).

## Seeding / re-seeding defaults

1. Copy the shape file and fill in real values:
   `cp config/assumptions.defaults.example.json config/assumptions.defaults.json`
2. Push to KV: `CLOUDFLARE_API_TOKEN=... npm run seed`

The file is gitignored. Before pushing a commit, the repo is checked with
`git grep -E '\$[0-9]'` to prove no dollar amounts leaked into tracked files.

## CI/CD

`.github/workflows/deploy.yml` runs on every push to `main`: install, build,
then `npx wrangler deploy`. It needs one repo secret.

### One manual step: add the Cloudflare API token

1. Go to <https://dash.cloudflare.com/profile/api-tokens> and create a token
   (use the **Edit Cloudflare Workers** template, or a custom token scoped to
   your account with Workers Scripts:Edit and Workers KV Storage:Edit).
2. In this repo: Settings → Secrets and variables → Actions → New repository
   secret, name `CLOUDFLARE_API_TOKEN`, value = the token.

Never paste the token in chat; paste it only into GitHub's secret form.
The first push's Actions run will fail until this secret exists; re-run it
afterwards from the Actions tab.

## Project layout

```
src/worker/index.ts        Hono app: Google OAuth, sessions, /api/*, SPA gating
src/web/                   React SPA (Vite)
  main.tsx, App.tsx        entry + data loading / persistence wiring
  lib/                     types, pure calc + dashboard view models, API client,
                           lever definitions (ranges only, no values)
  components/              Verdict, Waterfall, ScenarioBars, Timeline,
                           HeroInputs, FineTune, MoneyControl, TopBar
  dashboard.css             dashboard stylesheet (mobile-first, dense)
config/                    seeded defaults (gitignored) + committed shape example
scripts/seed-defaults.mjs  pushes the defaults JSON into KV
.github/workflows/         CI: build + wrangler deploy on push to main
```
