import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db.js';
import { canManageShift } from '../auth/routes.js';
import type { ShiftStatus, StaffRole } from '../types.js';

const dateQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

type ShiftRow = {
  id: string;
  restaurant_id: string;
  staff_id: string;
  display_name: string;
  staff_role: StaffRole;
  service_period_id: string | null;
  service_date: string | null;
  period_label: string | null;
  role_on_shift: StaffRole;
  status: ShiftStatus;
  scheduled_start: Date;
  scheduled_end: Date;
  clock_in_at: Date | null;
  clock_out_at: Date | null;
  notes: string | null;
};

function mapShift(row: ShiftRow) {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    staffId: row.staff_id,
    displayName: row.display_name,
    staffRole: row.staff_role,
    servicePeriodId: row.service_period_id,
    serviceDate: row.service_date,
    periodLabel: row.period_label,
    roleOnShift: row.role_on_shift,
    status: row.status,
    scheduledStart: row.scheduled_start,
    scheduledEnd: row.scheduled_end,
    clockInAt: row.clock_in_at,
    clockOutAt: row.clock_out_at,
    notes: row.notes,
  };
}

const SHIFT_SELECT = `
  SELECT
    sh.id,
    sh.restaurant_id,
    sh.staff_id,
    st.display_name,
    st.role AS staff_role,
    sh.service_period_id,
    sp.service_date::text AS service_date,
    sp.label AS period_label,
    sh.role_on_shift,
    sh.status,
    sh.scheduled_start,
    sh.scheduled_end,
    sh.clock_in_at,
    sh.clock_out_at,
    sh.notes
  FROM shifts sh
  JOIN staff st ON st.id = sh.staff_id
  LEFT JOIN service_periods sp ON sp.id = sh.service_period_id
`;

export const shiftRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  const { db } = opts;

  app.get('/shifts', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = dateQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'date=YYYY-MM-DD is required' });
    }
    const result = await db.query<ShiftRow>(
      `
      ${SHIFT_SELECT}
      WHERE sh.restaurant_id = $1
        AND (
          sp.service_date = $2::date
          OR (
            sp.id IS NULL
            AND (sh.scheduled_start AT TIME ZONE COALESCE(
              (SELECT timezone FROM restaurants WHERE id = $1),
              'UTC'
            ))::date = $2::date
          )
        )
      ORDER BY sh.scheduled_start, st.display_name
      `,
      [request.user.restaurantId, parsed.data.date],
    );
    return { date: parsed.data.date, shifts: result.rows.map(mapShift) };
  });

  app.post('/shifts/:id/clock-in', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.query<ShiftRow>(
      `${SHIFT_SELECT} WHERE sh.id = $1 AND sh.restaurant_id = $2`,
      [id, request.user.restaurantId],
    );
    const shift = existing.rows[0];
    if (!shift) {
      return reply.code(404).send({ error: 'Shift not found' });
    }
    if (!canManageShift(request.user, shift.staff_id)) {
      return reply.code(403).send({ error: 'Not allowed to clock this shift' });
    }
    if (shift.status === 'open' && shift.clock_in_at) {
      return reply.code(409).send({ error: 'Already clocked in', shift: mapShift(shift) });
    }
    if (shift.status === 'closed') {
      return reply.code(409).send({ error: 'Shift is already closed' });
    }
    const updated = await db.query<ShiftRow>(
      `
      WITH upd AS (
        UPDATE shifts
        SET status = 'open', clock_in_at = COALESCE(clock_in_at, now())
        WHERE id = $1
        RETURNING *
      )
      SELECT
        sh.id,
        sh.restaurant_id,
        sh.staff_id,
        st.display_name,
        st.role AS staff_role,
        sh.service_period_id,
        sp.service_date::text AS service_date,
        sp.label AS period_label,
        sh.role_on_shift,
        sh.status,
        sh.scheduled_start,
        sh.scheduled_end,
        sh.clock_in_at,
        sh.clock_out_at,
        sh.notes
      FROM upd sh
      JOIN staff st ON st.id = sh.staff_id
      LEFT JOIN service_periods sp ON sp.id = sh.service_period_id
      `,
      [id],
    );
    return { shift: mapShift(updated.rows[0]) };
  });

  app.post('/shifts/:id/clock-out', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.query<ShiftRow>(
      `${SHIFT_SELECT} WHERE sh.id = $1 AND sh.restaurant_id = $2`,
      [id, request.user.restaurantId],
    );
    const shift = existing.rows[0];
    if (!shift) {
      return reply.code(404).send({ error: 'Shift not found' });
    }
    if (!canManageShift(request.user, shift.staff_id)) {
      return reply.code(403).send({ error: 'Not allowed to clock this shift' });
    }
    if (shift.status !== 'open' || !shift.clock_in_at) {
      return reply.code(409).send({ error: 'Clock in before clocking out' });
    }
    if (shift.clock_out_at) {
      return reply.code(409).send({ error: 'Already clocked out' });
    }
    const updated = await db.query<ShiftRow>(
      `
      WITH upd AS (
        UPDATE shifts
        SET status = 'closed', clock_out_at = now()
        WHERE id = $1
        RETURNING *
      )
      SELECT
        sh.id,
        sh.restaurant_id,
        sh.staff_id,
        st.display_name,
        st.role AS staff_role,
        sh.service_period_id,
        sp.service_date::text AS service_date,
        sp.label AS period_label,
        sh.role_on_shift,
        sh.status,
        sh.scheduled_start,
        sh.scheduled_end,
        sh.clock_in_at,
        sh.clock_out_at,
        sh.notes
      FROM upd sh
      JOIN staff st ON st.id = sh.staff_id
      LEFT JOIN service_periods sp ON sp.id = sh.service_period_id
      `,
      [id],
    );
    return { shift: mapShift(updated.rows[0]) };
  });
};
