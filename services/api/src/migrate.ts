import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';

function defaultMigrationsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../../../db/migrations');
}

async function dirExists(dir: string): Promise<boolean> {
  try {
    await access(dir);
    return true;
  } catch {
    return false;
  }
}

export async function resolveMigrationsDir(fromEnv = process.env.MIGRATIONS_DIR): Promise<string> {
  const fallback = defaultMigrationsDir();
  if (!fromEnv) {
    return fallback;
  }
  const candidates = path.isAbsolute(fromEnv)
    ? [fromEnv]
    : [path.resolve(process.cwd(), fromEnv), path.resolve(process.cwd(), '../..', fromEnv), fallback];
  for (const candidate of candidates) {
    if (await dirExists(candidate)) {
      return candidate;
    }
  }
  return fallback;
}

export async function migrate(pool: pg.Pool, migrationsDir?: string): Promise<void> {
  const dir = migrationsDir && (await dirExists(migrationsDir)) ? migrationsDir : await resolveMigrationsDir(migrationsDir);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(dir))
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const applied = await pool.query('SELECT 1 FROM schema_migrations WHERE id = $1', [file]);
    if ((applied.rowCount ?? 0) > 0) {
      continue;
    }
    const sql = await readFile(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`applied migration ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
