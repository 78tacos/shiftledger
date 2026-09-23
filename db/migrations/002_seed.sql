-- Jalea Demo seed. Fake names only — no real PII.
-- Dates are relative: last Friday (closed pool) + tonight (open board).
-- Manager login (demo): manager@jalea.demo / jalea-demo-2026
-- Password hash is argon2id of jalea-demo-2026.

INSERT INTO restaurants (id, name, timezone)
VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',
  'Jalea Demo',
  'America/Chicago'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, email, email_norm, password_hash)
VALUES (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001',
  'manager@jalea.demo',
  'manager@jalea.demo',
  '$argon2id$v=19$m=65536,t=3,p=4$H1aipY3mlg2iZQL3IIVNcQ$VCNGhjXKfu2m9iOTvl9FhQg010hRkbBK9gKjobwY0to'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO staff (id, restaurant_id, user_id, display_name, role, hire_date, active)
VALUES
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccc0001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001',
    'Maya Chen',
    'manager',
    DATE '2024-03-01',
    true
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccc0002',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',
    NULL,
    'Luca Navarro',
    'server',
    DATE '2025-01-12',
    true
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccc0003',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',
    NULL,
    'Priya Shah',
    'server',
    DATE '2025-04-04',
    true
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccc0004',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',
    NULL,
    'Diego Alvarez',
    'server',
    DATE '2024-11-18',
    true
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccc0005',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',
    NULL,
    'Noor Haddad',
    'host',
    DATE '2025-06-20',
    true
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccc0006',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',
    NULL,
    'Kenji Okada',
    'cook',
    DATE '2023-08-08',
    true
  )
ON CONFLICT (id) DO NOTHING;

-- Last Friday and tonight on the restaurant calendar (America/Chicago).
-- Do not use CURRENT_DATE: Compose Postgres is UTC, so after ~19:00 CT the
-- UTC date rolls forward and the UI "Tonight" / last-Friday buttons miss seed.
INSERT INTO service_periods (id, restaurant_id, service_date, label, starts_at, ends_at)
SELECT
  'dddddddd-dddd-4ddd-8ddd-dddddddd0001',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',
  last_fri,
  'dinner',
  (last_fri + TIME '16:00') AT TIME ZONE 'America/Chicago',
  (last_fri + TIME '23:00') AT TIME ZONE 'America/Chicago'
FROM (
  SELECT (today - ((EXTRACT(ISODOW FROM today)::integer + 1) % 7 + 1))::date AS last_fri
  FROM (SELECT (timezone('America/Chicago', now()))::date AS today) t
) d
ON CONFLICT (id) DO NOTHING;

INSERT INTO service_periods (id, restaurant_id, service_date, label, starts_at, ends_at)
SELECT
  'dddddddd-dddd-4ddd-8ddd-dddddddd0002',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',
  today,
  'dinner',
  (today + TIME '16:00') AT TIME ZONE 'America/Chicago',
  (today + TIME '23:00') AT TIME ZONE 'America/Chicago'
FROM (SELECT (timezone('America/Chicago', now()))::date AS today) d
ON CONFLICT (id) DO NOTHING;

-- Friday closed shifts (clocked)
INSERT INTO shifts (
  id, restaurant_id, staff_id, service_period_id, role_on_shift, status,
  scheduled_start, scheduled_end, clock_in_at, clock_out_at, notes
)
SELECT
  v.id,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',
  v.staff_id,
  'dddddddd-dddd-4ddd-8ddd-dddddddd0001',
  v.role_on_shift,
  'closed',
  (sp.service_date + v.sched_start) AT TIME ZONE 'America/Chicago',
  (sp.service_date + v.sched_end) AT TIME ZONE 'America/Chicago',
  (sp.service_date + v.in_at) AT TIME ZONE 'America/Chicago',
  (sp.service_date + v.out_at) AT TIME ZONE 'America/Chicago',
  v.notes
FROM service_periods sp
JOIN (
  VALUES
    (
      'ffffffff-ffff-4fff-8fff-ffffffff0101'::uuid,
      'cccccccc-cccc-4ccc-8ccc-cccccccc0001'::uuid,
      'manager'::staff_role,
      TIME '15:00', TIME '23:00', TIME '15:02', TIME '23:05',
      'Closed the floor books'
    ),
    (
      'ffffffff-ffff-4fff-8fff-ffffffff0102'::uuid,
      'cccccccc-cccc-4ccc-8ccc-cccccccc0002'::uuid,
      'server'::staff_role,
      TIME '16:00', TIME '22:30', TIME '16:05', TIME '22:40',
      NULL
    ),
    (
      'ffffffff-ffff-4fff-8fff-ffffffff0103'::uuid,
      'cccccccc-cccc-4ccc-8ccc-cccccccc0003'::uuid,
      'server'::staff_role,
      TIME '16:00', TIME '22:30', TIME '15:58', TIME '22:28',
      NULL
    ),
    (
      'ffffffff-ffff-4fff-8fff-ffffffff0104'::uuid,
      'cccccccc-cccc-4ccc-8ccc-cccccccc0004'::uuid,
      'server'::staff_role,
      TIME '16:00', TIME '22:45', TIME '16:12', TIME '22:48',
      NULL
    ),
    (
      'ffffffff-ffff-4fff-8fff-ffffffff0105'::uuid,
      'cccccccc-cccc-4ccc-8ccc-cccccccc0005'::uuid,
      'host'::staff_role,
      TIME '16:00', TIME '22:00', TIME '15:55', TIME '22:02',
      NULL
    ),
    (
      'ffffffff-ffff-4fff-8fff-ffffffff0106'::uuid,
      'cccccccc-cccc-4ccc-8ccc-cccccccc0006'::uuid,
      'cook'::staff_role,
      TIME '15:30', TIME '22:30', TIME '15:28', TIME '22:33',
      NULL
    )
) AS v(id, staff_id, role_on_shift, sched_start, sched_end, in_at, out_at, notes)
  ON TRUE
WHERE sp.id = 'dddddddd-dddd-4ddd-8ddd-dddddddd0001'
ON CONFLICT (id) DO NOTHING;

-- Tonight: mix of scheduled + already clocked in so clock in/out is demoable
INSERT INTO shifts (
  id, restaurant_id, staff_id, service_period_id, role_on_shift, status,
  scheduled_start, scheduled_end, clock_in_at, clock_out_at, notes
)
SELECT
  v.id,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',
  v.staff_id,
  'dddddddd-dddd-4ddd-8ddd-dddddddd0002',
  v.role_on_shift,
  v.status,
  (sp.service_date + v.sched_start) AT TIME ZONE 'America/Chicago',
  (sp.service_date + v.sched_end) AT TIME ZONE 'America/Chicago',
  CASE
    WHEN v.in_at IS NULL THEN NULL
    ELSE LEAST(
      (sp.service_date + v.in_at) AT TIME ZONE 'America/Chicago',
      now() - interval '20 minutes'
    )
  END,
  NULL,
  v.notes
FROM service_periods sp
JOIN (
  VALUES
    (
      'ffffffff-ffff-4fff-8fff-ffffffff0201'::uuid,
      'cccccccc-cccc-4ccc-8ccc-cccccccc0001'::uuid,
      'manager'::staff_role,
      'open'::shift_status,
      TIME '15:00', TIME '23:00', TIME '15:01',
      'On the floor'
    ),
    (
      'ffffffff-ffff-4fff-8fff-ffffffff0202'::uuid,
      'cccccccc-cccc-4ccc-8ccc-cccccccc0002'::uuid,
      'server'::staff_role,
      'open'::shift_status,
      TIME '16:00', TIME '22:30', TIME '16:04',
      NULL
    ),
    (
      'ffffffff-ffff-4fff-8fff-ffffffff0203'::uuid,
      'cccccccc-cccc-4ccc-8ccc-cccccccc0003'::uuid,
      'server'::staff_role,
      'scheduled'::shift_status,
      TIME '16:00', TIME '22:30', NULL,
      NULL
    ),
    (
      'ffffffff-ffff-4fff-8fff-ffffffff0204'::uuid,
      'cccccccc-cccc-4ccc-8ccc-cccccccc0004'::uuid,
      'server'::staff_role,
      'scheduled'::shift_status,
      TIME '17:00', TIME '23:00', NULL,
      NULL
    ),
    (
      'ffffffff-ffff-4fff-8fff-ffffffff0205'::uuid,
      'cccccccc-cccc-4ccc-8ccc-cccccccc0005'::uuid,
      'host'::staff_role,
      'open'::shift_status,
      TIME '16:00', TIME '22:00', TIME '15:50',
      NULL
    ),
    (
      'ffffffff-ffff-4fff-8fff-ffffffff0206'::uuid,
      'cccccccc-cccc-4ccc-8ccc-cccccccc0006'::uuid,
      'cook'::staff_role,
      'open'::shift_status,
      TIME '15:30', TIME '22:30', TIME '15:27',
      NULL
    )
) AS v(id, staff_id, role_on_shift, status, sched_start, sched_end, in_at, notes)
  ON TRUE
WHERE sp.id = 'dddddddd-dddd-4ddd-8ddd-dddddddd0002'
ON CONFLICT (id) DO NOTHING;

INSERT INTO tip_pools (id, restaurant_id, service_period_id, status, total_cents, notes, closed_at)
VALUES
  (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',
    'dddddddd-dddd-4ddd-8ddd-dddddddd0001',
    'closed',
    24750,
    'Friday dinner pool — FOH points split',
    ((SELECT service_date FROM service_periods WHERE id = 'dddddddd-dddd-4ddd-8ddd-dddddddd0001') + TIME '23:10')
      AT TIME ZONE 'America/Chicago'
  ),
  (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeee0002',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',
    'dddddddd-dddd-4ddd-8ddd-dddddddd0002',
    'open',
    0,
    NULL,
    NULL
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO tip_contributions (id, tip_pool_id, staff_id, amount_cents, source)
VALUES
  (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeee0101',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001',
    'cccccccc-cccc-4ccc-8ccc-cccccccc0002',
    8500,
    'cash'
  ),
  (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeee0102',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001',
    'cccccccc-cccc-4ccc-8ccc-cccccccc0003',
    7250,
    'card'
  ),
  (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeee0103',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001',
    'cccccccc-cccc-4ccc-8ccc-cccccccc0004',
    9000,
    'cash'
  )
ON CONFLICT (id) DO NOTHING;

-- Points: servers 1.0, host 0.5. Largest-remainder cents:
-- Luca 7072, Priya 7071, Diego 7071, Noor 3536 (sum 24750).
INSERT INTO tip_payouts (id, tip_pool_id, staff_id, points, amount_cents)
VALUES
  (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeee0201',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001',
    'cccccccc-cccc-4ccc-8ccc-cccccccc0002',
    1.00,
    7072
  ),
  (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeee0202',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001',
    'cccccccc-cccc-4ccc-8ccc-cccccccc0003',
    1.00,
    7071
  ),
  (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeee0203',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001',
    'cccccccc-cccc-4ccc-8ccc-cccccccc0004',
    1.00,
    7071
  ),
  (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeee0204',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001',
    'cccccccc-cccc-4ccc-8ccc-cccccccc0005',
    0.50,
    3536
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO sidework_templates (id, restaurant_id, name, role, active)
VALUES (
  '11111111-1111-4111-8111-111111110001',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',
  'Close dining',
  NULL,
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO sidework_items (id, template_id, sort_order, label)
VALUES
  ('11111111-1111-4111-8111-111111110101', '11111111-1111-4111-8111-111111110001', 1, 'Wipe and reset all tables'),
  ('11111111-1111-4111-8111-111111110102', '11111111-1111-4111-8111-111111110001', 2, 'Restock napkins, salt, and pepper'),
  ('11111111-1111-4111-8111-111111110103', '11111111-1111-4111-8111-111111110001', 3, 'Sweep dining room'),
  ('11111111-1111-4111-8111-111111110104', '11111111-1111-4111-8111-111111110001', 4, 'Polish glassware'),
  ('11111111-1111-4111-8111-111111110105', '11111111-1111-4111-8111-111111110001', 5, 'Take out recycling and trash')
ON CONFLICT (id) DO NOTHING;

-- Some Friday close-out checks on Luca's shift
INSERT INTO shift_sidework (id, shift_id, item_id, done, done_at)
SELECT
  v.id,
  'ffffffff-ffff-4fff-8fff-ffffffff0102',
  v.item_id,
  v.done,
  CASE
    WHEN v.done THEN (sp.service_date + TIME '22:20') AT TIME ZONE 'America/Chicago'
    ELSE NULL
  END
FROM service_periods sp
JOIN (
  VALUES
    ('11111111-1111-4111-8111-111111111001'::uuid, '11111111-1111-4111-8111-111111110101'::uuid, true),
    ('11111111-1111-4111-8111-111111111002'::uuid, '11111111-1111-4111-8111-111111110102'::uuid, true),
    ('11111111-1111-4111-8111-111111111003'::uuid, '11111111-1111-4111-8111-111111110103'::uuid, true),
    ('11111111-1111-4111-8111-111111111004'::uuid, '11111111-1111-4111-8111-111111110104'::uuid, false),
    ('11111111-1111-4111-8111-111111111005'::uuid, '11111111-1111-4111-8111-111111110105'::uuid, false)
) AS v(id, item_id, done) ON TRUE
WHERE sp.id = 'dddddddd-dddd-4ddd-8ddd-dddddddd0001'
ON CONFLICT (id) DO NOTHING;
