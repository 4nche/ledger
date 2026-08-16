# Trading Journal

A private trading journal for two traders. Manual position entry, correct position
reconstruction from raw executions, and review by day / ISO week / month.

## Requirements

- Node >= 22.15
- pnpm >= 10 (`corepack enable`)
- Docker (for PostgreSQL)

## Getting started

```bash
cp .env.example .env
pnpm install
pnpm db:up          # start PostgreSQL
pnpm dev            # run web + api
```

| Command                  | Does                                      |
| ------------------------ | ----------------------------------------- |
| `pnpm dev`               | run all apps in watch mode                |
| `pnpm test`              | run all unit tests                        |
| `pnpm check`             | typecheck + lint + test                   |
| `pnpm db:up` / `db:down` | start / stop PostgreSQL                   |
| `pnpm db:nuke`           | stop PostgreSQL **and delete its volume** |

## Layout

```
apps/
  web/        Next.js App Router + shadcn/ui
  api/        Fastify — owns all mutations and all authoritative calculation
packages/
  domain/     pure TypeScript financial calculations (no React, no DB, no HTTP)
  contracts/  Zod schemas shared between web and api
  db/         Drizzle schema, migrations, client
  config/     shared tsconfig presets
  auth/       Better Auth instance, shared by both apps
docs/
  accounting-rules.md   <- authoritative definition of every derived number
  authentication.md     <- Google sign-in and the allowlist
```

## Signing in

The API will not start without Google OAuth credentials and an allowlist in
`.env`. Setting them up takes about five minutes in the Google Cloud Console —
see [docs/authentication.md](docs/authentication.md).

Dependencies flow one way:

```
web  -> contracts, domain (domain for display-only preview)
api  -> contracts, domain, db
domain -> nothing
```

## Read this before changing any calculation

[`docs/accounting-rules.md`](docs/accounting-rules.md) defines cost basis, realized PnL,
initial risk, R multiple, percentage denominators, and reporting-period bucketing. The unit
tests in `packages/domain` encode its worked examples. Change the document and the tests
together, or not at all.

## Status

Scaffold complete. See `docs/` and the build spec for phase progress.
