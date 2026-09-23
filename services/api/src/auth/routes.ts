import argon2 from 'argon2';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import type { Db } from '../db.js';
import type { StaffRole } from '../types.js';

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

type StaffUserRow = {
  user_id: string;
  email: string;
  password_hash: string;
  staff_id: string;
  display_name: string;
  role: StaffRole;
  restaurant_id: string;
  restaurant_name: string;
  timezone: string;
};

function publicUser(row: StaffUserRow) {
  return {
    id: row.user_id,
    email: row.email,
    staffId: row.staff_id,
    displayName: row.display_name,
    role: row.role,
    restaurantId: row.restaurant_id,
    restaurantName: row.restaurant_name,
    timezone: row.timezone,
  };
}

const authPluginImpl: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  const { db } = opts;

  app.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  app.decorate('requireManager', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    if (request.user.role !== 'manager') {
      return reply.code(403).send({ error: 'Managers only' });
    }
  });

  app.post('/auth/login', async (request, reply) => {
    const parsed = loginBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'email and password are required' });
    }
    const emailNorm = parsed.data.email.trim().toLowerCase();
    const result = await db.query<StaffUserRow>(
      `
      SELECT
        u.id AS user_id,
        u.email,
        u.password_hash,
        s.id AS staff_id,
        s.display_name,
        s.role,
        s.restaurant_id,
        r.name AS restaurant_name,
        r.timezone
      FROM users u
      JOIN staff s ON s.user_id = u.id
      JOIN restaurants r ON r.id = s.restaurant_id
      WHERE u.email_norm = $1 AND s.active = true
      `,
      [emailNorm],
    );
    const row = result.rows[0];
    if (!row) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }
    const ok = await argon2.verify(row.password_hash, parsed.data.password);
    if (!ok) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }
    const token = await reply.jwtSign(
      {
        sub: row.user_id,
        staffId: row.staff_id,
        restaurantId: row.restaurant_id,
        role: row.role,
      },
      { expiresIn: '7d' },
    );
    return { token, user: publicUser(row) };
  });

  app.get('/auth/me', { preHandler: app.authenticate }, async (request, reply) => {
    const result = await db.query<StaffUserRow>(
      `
      SELECT
        u.id AS user_id,
        u.email,
        u.password_hash,
        s.id AS staff_id,
        s.display_name,
        s.role,
        s.restaurant_id,
        r.name AS restaurant_name,
        r.timezone
      FROM users u
      JOIN staff s ON s.user_id = u.id
      JOIN restaurants r ON r.id = s.restaurant_id
      WHERE u.id = $1
      `,
      [request.user.sub],
    );
    const row = result.rows[0];
    if (!row) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    return { user: publicUser(row) };
  });
};

export function canManageShift(appUser: { staffId: string; role: StaffRole }, shiftStaffId: string): boolean {
  return appUser.role === 'manager' || appUser.staffId === shiftStaffId;
}

export const authPlugin = fp(authPluginImpl);
