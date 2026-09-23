import './load-env-file.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { loadEnv } from './env.js';
import { createPool } from './db.js';
import { migrate } from './migrate.js';
import { authPlugin } from './auth/routes.js';
import { shiftRoutes } from './routes/shifts.js';
import { tipPoolRoutes } from './routes/tipPools.js';
import { sideworkRoutes } from './routes/sidework.js';
import { laborRoutes } from './routes/labor.js';
import { staffRoutes } from './routes/staff.js';

const env = loadEnv();
const db = createPool(env.DATABASE_URL);

await migrate(db, env.MIGRATIONS_DIR);

const app = Fastify({
  logger: true,
});

await app.register(cors, { origin: true });
await app.register(jwt, { secret: env.JWT_SECRET });
await app.register(authPlugin, { db });
await app.register(shiftRoutes, { db });
await app.register(tipPoolRoutes, { db });
await app.register(sideworkRoutes, { db });
await app.register(laborRoutes, { db });
await app.register(staffRoutes, { db });

app.setErrorHandler((err: unknown, request, reply) => {
  const asRecord = err && typeof err === 'object' ? (err as { code?: string; statusCode?: number; message?: string }) : {};
  if (asRecord.code === '23514') {
    request.log.warn({ err }, 'check constraint');
    return reply.code(409).send({
      error: 'That clock time is invalid (out must be after in). If this is a seed shift, clock-in was later than now — refresh the demo data.',
    });
  }
  request.log.error({ err }, 'request failed');
  const status = typeof asRecord.statusCode === 'number' ? asRecord.statusCode : 500;
  const message = err instanceof Error ? err.message : 'Internal Server Error';
  return reply.code(status >= 400 ? status : 500).send({ error: message });
});

app.get('/health', async () => ({ ok: true, service: 'shiftledger-api' }));

const shutdown = async () => {
  await app.close();
  await db.end();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: env.PORT, host: env.HOST });
