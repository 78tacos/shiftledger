# Design decisions

## Money is integer cents

Never store or compute tips as floats. Contributions, pool totals, and payouts are `integer` cents. Display divides by 100 at the edge.

## Service periods, not calendar days

A lunch and a dinner on the same date are different periods. Shifts and tip pools hang off `service_periods` so Friday dinner does not mix with Friday lunch.

## Tip split is points, settled on close

v1 uses points (server 1.0, bartender 0.8, host 0.5). `services/api/src/lib/tips.ts` converts points to cents with the largest-remainder method so payouts always sum to `total_cents`. Cooks and managers default to 0 points.

## Labor is a view

Hours are derived from closed shifts in `v_labor_hours`. There is no write table for labor. The `/labor` API is manager-only.

## Auth: argon2 + JWT

Passwords are argon2id hashes on `users.password_hash`. Login returns a JWT (`Authorization: Bearer`). Sessions live in the browser (`localStorage`). This is a demo — rotate `JWT_SECRET` before any real deployment.

## RLS is deferred

Schema is multi-tenant-ready (`restaurant_id` on the main tables) but Postgres Row Level Security is **not** enabled in v1. The API scopes every query by the JWT `restaurantId`. Turn on RLS when a second restaurant is real.

## email_norm instead of citext

`citext` is not assumed. Uniqueness is `users.email_norm` (`lower(trim(email))`).

## Seed dates are relative (Chicago calendar)

The seed story is “last Friday closed / tonight open” so `docker compose up` always has a board to click, not a stale 2026-09-18 only.

Calendar dates are `(timezone('America/Chicago', now()))::date`, not `CURRENT_DATE`. Compose Postgres is UTC; after ~19:00 CT the UTC date is already tomorrow and a UTC `CURRENT_DATE` seed would miss the UI Tonight / last-Friday buttons. `docker-compose` also sets `TZ`/`PGTZ=America/Chicago` on `db`.
