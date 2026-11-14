/**
 * Shared bootstrap for CLI scripts.
 *
 * Next.js loads .env.local automatically; plain Node does not, so scripts import
 * this first to get the same configuration the app sees.
 */
import fs from 'node:fs';
import path from 'node:path';

for (const file of ['.env.local', '.env']) {
  const fullPath = path.join(process.cwd(), file);
  if (fs.existsSync(fullPath)) {
    process.loadEnvFile(fullPath);
  }
}

export const LOCAL_DB_DIR = path.resolve(process.cwd(), process.env.KRITI_LOCAL_DB_DIR ?? 'local-db');
export const MIGRATIONS_DIR = path.join(process.cwd(), 'src', 'lib', 'db', 'migrations');

export function describeTarget(): string {
  return process.env.DATABASE_URL
    ? `remote Postgres (${new URL(process.env.DATABASE_URL).host})`
    : `local PGlite (${path.relative(process.cwd(), LOCAL_DB_DIR)})`;
}
