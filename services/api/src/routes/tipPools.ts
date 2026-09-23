import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db.js';
import { computePayouts, defaultPointsForRole } from '../lib/tips.js';
import type { StaffRole, TipPoolStatus, TipSource } from '../types.js';

const contributionBody = z.object({
  staffId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  source: z.enum(['cash', 'card', 'other']).default('cash'),
});

const closeBody = z.object({
  allocations: z
    .array(
      z.object({
        staffId: z.string().uuid(),
        points: z.number().positive(),
      }),
    )
    .optional(),
});

type PoolRow = {
  id: string;
  restaurant_id: string;
  service_period_id: string;
  status: TipPoolStatus;
  total_cents: number;
  notes: string | null;
  closed_at: Date | null;
  created_at: Date;
  service_date: string;
  period_label: string;
};

type ContributionRow = {
  id: string;
  staff_id: string;
  display_name: string;
  amount_cents: number;
  source: TipSource;
  created_at: Date;
};

type PayoutRow = {
  id: string;
  staff_id: string;
  display_name: string;
  points: string;
  amount_cents: number;
};

function mapPool(row: PoolRow) {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    servicePeriodId: row.service_period_id,
    status: row.status,
    totalCents: row.total_cents,
    notes: row.notes,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    serviceDate: row.service_date,
    periodLabel: row.period_label,
  };
}

const POOL_SELECT = `
  SELECT
    tp.id,
    tp.restaurant_id,
    tp.service_period_id,
    tp.status,
    tp.total_cents,
    tp.notes,
    tp.closed_at,
    tp.created_at,
    sp.service_date::text AS service_date,
    sp.label AS period_label
  FROM tip_pools tp
  JOIN service_periods sp ON sp.id = tp.service_period_id
`;

async function loadBundle(db: Db, poolId: string) {
  const contributions = await db.query<ContributionRow>(
    `
    SELECT c.id, c.staff_id, s.display_name, c.amount_cents, c.source, c.created_at
    FROM tip_contributions c
    JOIN staff s ON s.id = c.staff_id
    WHERE c.tip_pool_id = $1
    ORDER BY c.created_at
    `,
    [poolId],
  );
  const payouts = await db.query<PayoutRow>(
    `
    SELECT p.id, p.staff_id, s.display_name, p.points::text, p.amount_cents
    FROM tip_payouts p
    JOIN staff s ON s.id = p.staff_id
    WHERE p.tip_pool_id = $1
    ORDER BY s.display_name
    `,
    [poolId],
  );
  return {
    contributions: contributions.rows.map((row) => ({
      id: row.id,
      staffId: row.staff_id,
      displayName: row.display_name,
      amountCents: row.amount_cents,
      source: row.source,
      createdAt: row.created_at,
    })),
    payouts: payouts.rows.map((row) => ({
      id: row.id,
      staffId: row.staff_id,
      displayName: row.display_name,
      points: Number(row.points),
      amountCents: row.amount_cents,
    })),
  };
}

export const tipPoolRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  const { db } = opts;

  app.get('/service-periods', { preHandler: app.authenticate }, async (request) => {
    const query = z
      .object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .parse(request.query);
    const result = await db.query<{
      id: string;
      service_date: string;
      label: string;
      starts_at: Date;
      ends_at: Date;
      pool_id: string | null;
      pool_status: TipPoolStatus | null;
      total_cents: number | null;
    }>(
      `
      SELECT
        sp.id,
        sp.service_date::text AS service_date,
        sp.label,
        sp.starts_at,
        sp.ends_at,
        tp.id AS pool_id,
        tp.status AS pool_status,
        tp.total_cents
      FROM service_periods sp
      LEFT JOIN tip_pools tp ON tp.service_period_id = sp.id
      WHERE sp.restaurant_id = $1
        AND ($2::date IS NULL OR sp.service_date >= $2::date)
        AND ($3::date IS NULL OR sp.service_date <= $3::date)
      ORDER BY sp.service_date DESC, sp.starts_at
      `,
      [request.user.restaurantId, query.from ?? null, query.to ?? null],
    );
    return {
      periods: result.rows.map((row) => ({
        id: row.id,
        serviceDate: row.service_date,
        label: row.label,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        poolId: row.pool_id,
        poolStatus: row.pool_status,
        totalCents: row.total_cents,
      })),
    };
  });

  app.get('/tip-pools/:periodId', { preHandler: app.authenticate }, async (request, reply) => {
    const { periodId } = request.params as { periodId: string };
    const period = await db.query<{ id: string }>(
      `SELECT id FROM service_periods WHERE id = $1 AND restaurant_id = $2`,
      [periodId, request.user.restaurantId],
    );
    if (!period.rows[0]) {
      return reply.code(404).send({ error: 'Service period not found' });
    }
    await db.query(
      `
      INSERT INTO tip_pools (restaurant_id, service_period_id, status, total_cents)
      VALUES ($1, $2, 'open', 0)
      ON CONFLICT (service_period_id) DO NOTHING
      `,
      [request.user.restaurantId, periodId],
    );
    const poolResult = await db.query<PoolRow>(`${POOL_SELECT} WHERE tp.service_period_id = $1`, [periodId]);
    const pool = poolResult.rows[0];
    const bundle = await loadBundle(db, pool.id);
    return { pool: mapPool(pool), ...bundle };
  });

  app.post('/tip-pools/:id/contributions', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = contributionBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'staffId and amountCents (> 0) are required' });
    }
    const poolResult = await db.query<PoolRow>(
      `${POOL_SELECT} WHERE tp.id = $1 AND tp.restaurant_id = $2`,
      [id, request.user.restaurantId],
    );
    const pool = poolResult.rows[0];
    if (!pool) {
      return reply.code(404).send({ error: 'Tip pool not found' });
    }
    if (pool.status !== 'open') {
      return reply.code(409).send({ error: 'Pool is closed' });
    }
    const staff = await db.query<{ id: string }>(
      `SELECT id FROM staff WHERE id = $1 AND restaurant_id = $2 AND active = true`,
      [parsed.data.staffId, request.user.restaurantId],
    );
    if (!staff.rows[0]) {
      return reply.code(400).send({ error: 'Staff not found' });
    }
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `
        INSERT INTO tip_contributions (tip_pool_id, staff_id, amount_cents, source)
        VALUES ($1, $2, $3, $4)
        `,
        [id, parsed.data.staffId, parsed.data.amountCents, parsed.data.source],
      );
      await client.query(
        `
        UPDATE tip_pools
        SET total_cents = total_cents + $2
        WHERE id = $1
        `,
        [id, parsed.data.amountCents],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    const updated = await db.query<PoolRow>(`${POOL_SELECT} WHERE tp.id = $1`, [id]);
    const bundle = await loadBundle(db, id);
    return { pool: mapPool(updated.rows[0]), ...bundle };
  });

  app.post('/tip-pools/:id/close', { preHandler: app.requireManager }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = closeBody.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid allocations' });
    }
    const poolResult = await db.query<PoolRow>(
      `${POOL_SELECT} WHERE tp.id = $1 AND tp.restaurant_id = $2`,
      [id, request.user.restaurantId],
    );
    const pool = poolResult.rows[0];
    if (!pool) {
      return reply.code(404).send({ error: 'Tip pool not found' });
    }
    if (pool.status !== 'open') {
      return reply.code(409).send({ error: 'Pool is already closed' });
    }

    let allocations = parsed.data.allocations;
    if (!allocations || allocations.length === 0) {
      const workers = await db.query<{ staff_id: string; role_on_shift: StaffRole }>(
        `
        SELECT DISTINCT sh.staff_id, sh.role_on_shift
        FROM shifts sh
        WHERE sh.service_period_id = $1
          AND sh.restaurant_id = $2
          AND sh.status IN ('open', 'closed')
        `,
        [pool.service_period_id, request.user.restaurantId],
      );
      allocations = workers.rows
        .map((row) => ({
          staffId: row.staff_id,
          points: defaultPointsForRole(row.role_on_shift),
        }))
        .filter((row) => row.points > 0);
    }
    if (allocations.length === 0) {
      return reply.code(400).send({ error: 'No point allocations — pass allocations or clock in FOH first' });
    }

    let payouts;
    try {
      payouts = computePayouts(pool.total_cents, allocations);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid allocations';
      return reply.code(400).send({ error: message });
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM tip_payouts WHERE tip_pool_id = $1`, [id]);
      for (const payout of payouts) {
        await client.query(
          `
          INSERT INTO tip_payouts (tip_pool_id, staff_id, points, amount_cents)
          VALUES ($1, $2, $3, $4)
          `,
          [id, payout.staffId, payout.points, payout.amountCents],
        );
      }
      await client.query(
        `
        UPDATE tip_pools
        SET status = 'closed', closed_at = now()
        WHERE id = $1
        `,
        [id],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const updated = await db.query<PoolRow>(`${POOL_SELECT} WHERE tp.id = $1`, [id]);
    const bundle = await loadBundle(db, id);
    return { pool: mapPool(updated.rows[0]), ...bundle };
  });
};
