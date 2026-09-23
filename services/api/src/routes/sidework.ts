import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db.js';
import { canManageShift } from '../auth/routes.js';
import type { StaffRole } from '../types.js';

const patchBody = z.object({
  done: z.boolean(),
});

type SideworkRow = {
  id: string;
  shift_id: string;
  item_id: string;
  label: string;
  sort_order: number;
  template_name: string;
  done: boolean;
  done_at: Date | null;
};

function mapItem(row: SideworkRow) {
  return {
    id: row.id,
    shiftId: row.shift_id,
    itemId: row.item_id,
    label: row.label,
    sortOrder: row.sort_order,
    templateName: row.template_name,
    done: row.done,
    doneAt: row.done_at,
  };
}

export const sideworkRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  const { db } = opts;

  app.get('/shifts/:id/sidework', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const shift = await db.query<{
      id: string;
      staff_id: string;
      role_on_shift: StaffRole;
    }>(
      `SELECT id, staff_id, role_on_shift FROM shifts WHERE id = $1 AND restaurant_id = $2`,
      [id, request.user.restaurantId],
    );
    const row = shift.rows[0];
    if (!row) {
      return reply.code(404).send({ error: 'Shift not found' });
    }

    await db.query(
      `
      INSERT INTO shift_sidework (shift_id, item_id, done)
      SELECT $1, si.id, false
      FROM sidework_items si
      JOIN sidework_templates st ON st.id = si.template_id
      WHERE st.restaurant_id = $2
        AND st.active = true
        AND (st.role IS NULL OR st.role = $3)
      ON CONFLICT (shift_id, item_id) DO NOTHING
      `,
      [id, request.user.restaurantId, row.role_on_shift],
    );

    const items = await db.query<SideworkRow>(
      `
      SELECT
        ss.id,
        ss.shift_id,
        ss.item_id,
        si.label,
        si.sort_order,
        st.name AS template_name,
        ss.done,
        ss.done_at
      FROM shift_sidework ss
      JOIN sidework_items si ON si.id = ss.item_id
      JOIN sidework_templates st ON st.id = si.template_id
      WHERE ss.shift_id = $1
      ORDER BY st.name, si.sort_order
      `,
      [id],
    );
    return { shiftId: id, items: items.rows.map(mapItem) };
  });

  app.patch('/shift-sidework/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = patchBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'done boolean is required' });
    }
    const existing = await db.query<{
      id: string;
      shift_id: string;
      staff_id: string;
    }>(
      `
      SELECT ss.id, ss.shift_id, sh.staff_id
      FROM shift_sidework ss
      JOIN shifts sh ON sh.id = ss.shift_id
      WHERE ss.id = $1 AND sh.restaurant_id = $2
      `,
      [id, request.user.restaurantId],
    );
    const row = existing.rows[0];
    if (!row) {
      return reply.code(404).send({ error: 'Sidework item not found' });
    }
    if (!canManageShift(request.user, row.staff_id)) {
      return reply.code(403).send({ error: 'Not allowed to update this checklist' });
    }
    const updated = await db.query<SideworkRow>(
      `
      WITH upd AS (
        UPDATE shift_sidework
        SET done = $2,
            done_at = CASE WHEN $2 THEN now() ELSE NULL END
        WHERE id = $1
        RETURNING *
      )
      SELECT
        ss.id,
        ss.shift_id,
        ss.item_id,
        si.label,
        si.sort_order,
        st.name AS template_name,
        ss.done,
        ss.done_at
      FROM upd ss
      JOIN sidework_items si ON si.id = ss.item_id
      JOIN sidework_templates st ON st.id = si.template_id
      `,
      [id, parsed.data.done],
    );
    return { item: mapItem(updated.rows[0]) };
  });
};
