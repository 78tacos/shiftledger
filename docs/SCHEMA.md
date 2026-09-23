# ShiftLedger schema

The database is the migrations. This file only points at them.

- Tables, enums, indexes, and `v_labor_hours`: [`db/migrations/001_init.sql`](../db/migrations/001_init.sql)
- Demo seed: [`db/migrations/002_seed.sql`](../db/migrations/002_seed.sql)
- Design notes: [`DECISIONS.md`](DECISIONS.md)
- HTTP routes: the API table in [`README.md`](../README.md)

The API applies both SQL files on boot. `./db/scripts/reset.sh` drops the volume and re-seeds.

## Domain

One restaurant. Staff, service periods, and sidework templates belong to that restaurant. A shift belongs to one staff member and may belong to a service period. A service period has at most one tip pool. Contributions and payouts belong to the pool. Sidework items belong to a template; completions are `shift_sidework` rows on a shift. Labor hours are the `v_labor_hours` view over closed shifts. A staff row may link to one `users` login (`staff.user_id`).

Code lives in `apps/web` and `services/api`.
