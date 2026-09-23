import './load-env-file.js';
import { loadEnv } from './env.js';
import { createPool } from './db.js';
import { migrate } from './migrate.js';

const env = loadEnv();
const pool = createPool(env.DATABASE_URL);
await migrate(pool, env.MIGRATIONS_DIR);
await pool.end();
console.log('migrations complete');
