# ShiftLedger — schema & repo layout

Restaurant ops demo: shifts, tip pools, sidework checklists, labor hours.
Stack target: React (Vite) + Node/Express or Fastify + Postgres + Docker Compose.

## Domain (v1 scope)

- One **restaurant** (multi-tenant ready via `restaurant_id`, seed one).
- **Staff** with roles (server, cook, host, manager).
- **Shifts** with clock-in/out and role-on-shift.
- **Tip pools** per service period (e.g. dinner Fri) with contributions & payouts.
- **Sidework** templates + per-shift completions.
- **Labor hours** = derived from shifts (views), not a separate write table.

Out of v1: payroll tax, POS sync, scheduling AI, multi-location UI.

## ER sketch

```
restaurants 1──* staff
restaurants 1──* service_periods
restaurants 1──* sidework_templates
staff 1──* shifts
service_periods 1──* shifts
service_periods 1──* tip_pools
tip_pools 1──* tip_contributions
tip_pools 1──* tip_payouts
sidework_templates 1──* sidework_items
shifts 1──* shift_sidework (completions)
users 1──1 staff (login; managers see all, staff see self)
```

## Postgres DDL (v1)

```sql
-- 001_init.sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE staff_role AS ENUM ('server', 'cook', 'host', 'bartender', 'manager');
CREATE TYPE shift_status AS ENUM ('scheduled', 'open', 'closed', 'no_show');
CREATE TYPE tip_pool_status AS ENUM ('open', 'closed');

CREATE TABLE restaurants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  timezone      text NOT NULL DEFAULT 'America/Chicago',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Auth users (app login). Link to staff row.
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext, -- or text + lower() unique; enable citext if available
  email_norm    text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE staff (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id         uuid UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  display_name    text NOT NULL,
  role            staff_role NOT NULL DEFAULT 'server',
  hire_date       date,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX staff_restaurant_idx ON staff (restaurant_id) WHERE active;

-- A service period = one meal service (e.g. 2026-09-23 dinner).
CREATE TABLE service_periods (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  service_date    date NOT NULL,
  label           text NOT NULL, -- 'lunch' | 'dinner' | custom
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  UNIQUE (restaurant_id, service_date, label),
  CHECK (ends_at > starts_at)
);
CREATE INDEX service_periods_restaurant_date_idx
  ON service_periods (restaurant_id, service_date DESC);

CREATE TABLE shifts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id       uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  staff_id            uuid NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  service_period_id   uuid REFERENCES service_periods(id) ON DELETE SET NULL,
  role_on_shift       staff_role NOT NULL,
  status              shift_status NOT NULL DEFAULT 'scheduled',
  scheduled_start     timestamptz NOT NULL,
  scheduled_end       timestamptz NOT NULL,
  clock_in_at         timestamptz,
  clock_out_at        timestamptz,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (scheduled_end > scheduled_start),
  CHECK (
    clock_out_at IS NULL
    OR (clock_in_at IS NOT NULL AND clock_out_at >= clock_in_at)
  )
);
CREATE INDEX shifts_staff_time_idx ON shifts (staff_id, scheduled_start DESC);
CREATE INDEX shifts_restaurant_time_idx ON shifts (restaurant_id, scheduled_start DESC);
CREATE INDEX shifts_period_idx ON shifts (service_period_id);

CREATE TABLE tip_pools (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id       uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  service_period_id   uuid NOT NULL UNIQUE REFERENCES service_periods(id) ON DELETE CASCADE,
  status              tip_pool_status NOT NULL DEFAULT 'open',
  total_cents         integer NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  notes               text,
  closed_at           timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Cash/card tip amounts dropped into the pool (who contributed).
CREATE TABLE tip_contributions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tip_pool_id   uuid NOT NULL REFERENCES tip_pools(id) ON DELETE CASCADE,
  staff_id      uuid NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  amount_cents  integer NOT NULL CHECK (amount_cents > 0),
  source        text NOT NULL DEFAULT 'cash', -- cash | card | other
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tip_contributions_pool_idx ON tip_contributions (tip_pool_id);

-- How the pool was split (points or percent — v1 uses points).
CREATE TABLE tip_payouts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tip_pool_id   uuid NOT NULL REFERENCES tip_pools(id) ON DELETE CASCADE,
  staff_id      uuid NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  points        numeric(8,2) NOT NULL CHECK (points > 0),
  amount_cents  integer NOT NULL CHECK (amount_cents >= 0),
  UNIQUE (tip_pool_id, staff_id)
);

CREATE TABLE sidework_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name            text NOT NULL, -- 'Close dining room'
  role            staff_role,    -- null = any role
  active          boolean NOT NULL DEFAULT true
);

CREATE TABLE sidework_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   uuid NOT NULL REFERENCES sidework_templates(id) ON DELETE CASCADE,
  sort_order    integer NOT NULL DEFAULT 0,
  label         text NOT NULL,
  UNIQUE (template_id, sort_order)
);

CREATE TABLE shift_sidework (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id      uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  item_id       uuid NOT NULL REFERENCES sidework_items(id) ON DELETE RESTRICT,
  done          boolean NOT NULL DEFAULT false,
  done_at       timestamptz,
  UNIQUE (shift_id, item_id)
);

-- Labor hours: read model (no duplicate storage)
CREATE VIEW v_labor_hours AS
SELECT
  s.restaurant_id,
  s.staff_id,
  s.id AS shift_id,
  s.role_on_shift,
  s.clock_in_at,
  s.clock_out_at,
  CASE
    WHEN s.clock_in_at IS NOT NULL AND s.clock_out_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (s.clock_out_at - s.clock_in_at)) / 3600.0
    ELSE NULL
  END AS hours_worked
FROM shifts s
WHERE s.status = 'closed';
```

### Design notes (README “decisions”)

- Money as **integer cents** — no float.
- `service_periods` keep tips and shifts aligned to a meal, not a calendar day only.
- Tip split: **points** (e.g. server 1.0, bartender 0.8, host 0.5); app computes `amount_cents` when pool closes.
- Labor report = `v_labor_hours` filtered by date range; managers only in API.
- v1 auth: email + password hash (argon2); one restaurant seed; skip RLS until multi-tenant is real (document that).

## Seed story (demo)

- Restaurant: “Jalea Demo”
- Staff: 1 manager, 3 servers, 1 host, 1 cook
- 2 service periods (last Fri dinner, tonight dinner)
- Shifts clocked for Fri; tip pool closed with sample payouts
- Sidework template “Close dining” with 5 items; some checked on one shift

## Repo layout

```
shiftledger/
├── README.md                 # screenshots, stack, decisions, how to run
├── docker-compose.yml        # postgres + api (+ optional web)
├── .env.example
├── .gitignore
├── package.json              # npm workspaces root (optional)
│
├── apps/
│   └── web/                  # React + Vite + TypeScript
│       ├── package.json
│       ├── index.html
│       ├── vite.config.ts
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── api/          # fetch client
│       │   ├── pages/
│       │   │   ├── Login.tsx
│       │   │   ├── Board.tsx          # today’s shifts
│       │   │   ├── TipPool.tsx
│       │   │   ├── Sidework.tsx
│       │   │   └── Labor.tsx          # hours report
│       │   ├── components/
│       │   └── types/
│       └── public/
│
├── services/
│   └── api/                  # Node + Fastify (or Express) + TypeScript
│       ├── package.json
│       ├── src/
│       │   ├── index.ts
│       │   ├── env.ts
│       │   ├── db.ts                 # pg pool
│       │   ├── auth/                 # login, jwt/session
│       │   ├── routes/
│       │   │   ├── shifts.ts
│       │   │   ├── tipPools.ts
│       │   │   ├── sidework.ts
│       │   │   ├── labor.ts
│       │   │   └── staff.ts
│       │   └── lib/tips.ts           # close-pool math
│       └── Dockerfile
│
├── db/
│   ├── migrations/
│   │   ├── 001_init.sql
│   │   └── 002_seed.sql
│   └── scripts/
│       └── reset.sh
│
└── docs/
    ├── SCHEMA.md             # this file (or keep only in README)
    └── DECISIONS.md          # short ADRs
```

## API surface (v1)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/auth/login` | session/JWT |
| GET | `/shifts?date=` | board |
| POST | `/shifts/:id/clock-in` | |
| POST | `/shifts/:id/clock-out` | |
| GET | `/tip-pools/:periodId` | pool + contributions + payouts |
| POST | `/tip-pools/:id/contributions` | add tip drop |
| POST | `/tip-pools/:id/close` | compute payouts from points |
| GET | `/shifts/:id/sidework` | checklist |
| PATCH | `/shift-sidework/:id` | toggle done |
| GET | `/labor?from=&to=` | hours from view |

## Build order

1. `db/migrations` + Compose Postgres + seed  
2. API: auth + shifts board + clock in/out  
3. Tip pool contribute + close  
4. Sidework + labor page  
5. README with screenshot + decisions  

## After ShiftLedger

Cha Caddy (`78tacos/cha-caddy`): add Postgres for brew notes / inventory / photo metadata — do not start until ShiftLedger v1 is shippable.
