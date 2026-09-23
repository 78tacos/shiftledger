import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '../db.js';
import type { StaffRole } from '../types.js';

export const staffRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  const { db } = opts;

  app.get('/staff', { preHandler: app.authenticate }, async (request) => {
    const result = await db.query<{
      id: string;
      display_name: string;
      role: StaffRole;
      hire_date: string | null;
      active: boolean;
    }>(
      `
      SELECT id, display_name, role, hire_date::text, active
      FROM staff
      WHERE restaurant_id = $1 AND active = true
      ORDER BY
        CASE role
          WHEN 'manager' THEN 0
          WHEN 'server' THEN 1
          WHEN 'bartender' THEN 2
          WHEN 'host' THEN 3
          WHEN 'cook' THEN 4
          ELSE 5
        END,
        display_name
      `,
      [request.user.restaurantId],
    );
    return {
      staff: result.rows.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        role: row.role,
        hireDate: row.hire_date,
        active: row.active,
      })),
    };
  });
};
