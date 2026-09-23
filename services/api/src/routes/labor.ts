import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db.js';
import type { StaffRole } from '../types.js';

const rangeQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const laborRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  const { db } = opts;

  app.get('/labor', { preHandler: app.requireManager }, async (request, reply) => {
    const parsed = rangeQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'from= and to= (YYYY-MM-DD) are required' });
    }
    const tzResult = await db.query<{ timezone: string }>(
      `SELECT timezone FROM restaurants WHERE id = $1`,
      [request.user.restaurantId],
    );
    const timezone = tzResult.rows[0]?.timezone ?? 'UTC';
    const result = await db.query<{
      restaurant_id: string;
      staff_id: string;
      display_name: string;
      shift_id: string;
      role_on_shift: StaffRole;
      clock_in_at: Date;
      clock_out_at: Date;
      hours_worked: string | number;
    }>(
      `
      SELECT
        v.restaurant_id,
        v.staff_id,
        st.display_name,
        v.shift_id,
        v.role_on_shift,
        v.clock_in_at,
        v.clock_out_at,
        v.hours_worked
      FROM v_labor_hours v
      JOIN staff st ON st.id = v.staff_id
      WHERE v.restaurant_id = $1
        AND (v.clock_in_at AT TIME ZONE $4)::date >= $2::date
        AND (v.clock_in_at AT TIME ZONE $4)::date <= $3::date
      ORDER BY v.clock_in_at, st.display_name
      `,
      [request.user.restaurantId, parsed.data.from, parsed.data.to, timezone],
    );

    const rows = result.rows.map((row) => ({
      restaurantId: row.restaurant_id,
      staffId: row.staff_id,
      displayName: row.display_name,
      shiftId: row.shift_id,
      roleOnShift: row.role_on_shift,
      clockInAt: row.clock_in_at,
      clockOutAt: row.clock_out_at,
      hoursWorked: Number(row.hours_worked),
    }));
    const totalHours = rows.reduce((sum, row) => sum + row.hoursWorked, 0);
    return {
      from: parsed.data.from,
      to: parsed.data.to,
      timezone,
      totalHours,
      rows,
    };
  });
};
