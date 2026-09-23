-- ShiftLedger v1 schema
-- Portable: no citext. emails stored on `email` and uniqueness is `email_norm` (lower(trim(email))).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE staff_role AS ENUM ('server', 'cook', 'host', 'bartender', 'manager');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE shift_status AS ENUM ('scheduled', 'open', 'closed', 'no_show');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tip_pool_status AS ENUM ('open', 'closed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS restaurants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  timezone      text NOT NULL DEFAULT 'America/Chicago',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  email_norm    text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS staff (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id         uuid UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  display_name    text NOT NULL,
  role            staff_role NOT NULL DEFAULT 'server',
  hire_date       date,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_restaurant_idx ON staff (restaurant_id) WHERE active;

CREATE TABLE IF NOT EXISTS service_periods (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  service_date    date NOT NULL,
  label           text NOT NULL,
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  UNIQUE (restaurant_id, service_date, label),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS service_periods_restaurant_date_idx
  ON service_periods (restaurant_id, service_date DESC);

CREATE TABLE IF NOT EXISTS shifts (
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
CREATE INDEX IF NOT EXISTS shifts_staff_time_idx ON shifts (staff_id, scheduled_start DESC);
CREATE INDEX IF NOT EXISTS shifts_restaurant_time_idx ON shifts (restaurant_id, scheduled_start DESC);
CREATE INDEX IF NOT EXISTS shifts_period_idx ON shifts (service_period_id);

CREATE TABLE IF NOT EXISTS tip_pools (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id       uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  service_period_id   uuid NOT NULL UNIQUE REFERENCES service_periods(id) ON DELETE CASCADE,
  status              tip_pool_status NOT NULL DEFAULT 'open',
  total_cents         integer NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  notes               text,
  closed_at           timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tip_contributions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tip_pool_id   uuid NOT NULL REFERENCES tip_pools(id) ON DELETE CASCADE,
  staff_id      uuid NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  amount_cents  integer NOT NULL CHECK (amount_cents > 0),
  source        text NOT NULL DEFAULT 'cash' CHECK (source IN ('cash', 'card', 'other')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tip_contributions_pool_idx ON tip_contributions (tip_pool_id);

CREATE TABLE IF NOT EXISTS tip_payouts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tip_pool_id   uuid NOT NULL REFERENCES tip_pools(id) ON DELETE CASCADE,
  staff_id      uuid NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  points        numeric(8,2) NOT NULL CHECK (points > 0),
  amount_cents  integer NOT NULL CHECK (amount_cents >= 0),
  UNIQUE (tip_pool_id, staff_id)
);

CREATE TABLE IF NOT EXISTS sidework_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name            text NOT NULL,
  role            staff_role,
  active          boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS sidework_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   uuid NOT NULL REFERENCES sidework_templates(id) ON DELETE CASCADE,
  sort_order    integer NOT NULL DEFAULT 0,
  label         text NOT NULL,
  UNIQUE (template_id, sort_order)
);

CREATE TABLE IF NOT EXISTS shift_sidework (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id      uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  item_id       uuid NOT NULL REFERENCES sidework_items(id) ON DELETE RESTRICT,
  done          boolean NOT NULL DEFAULT false,
  done_at       timestamptz,
  UNIQUE (shift_id, item_id)
);

CREATE OR REPLACE VIEW v_labor_hours AS
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
