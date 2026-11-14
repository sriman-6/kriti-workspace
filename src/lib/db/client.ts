import path from 'node:path';
import { drizzle as drizzlePglite, type PgliteDatabase } from 'drizzle-orm/pglite';
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { PGlite } from '@electric-sql/pglite';
import postgres from 'postgres';

import * as schema from './schema';

/**
 * Database connection factory.
 *
 * One schema, one query API, two drivers:
 *
 *   DATABASE_URL set    → postgres.js against Supabase (or any Postgres)
 *   DATABASE_URL unset  → PGlite, real Postgres compiled to WASM, stored in
 *                         ./local-db. No Docker, no credentials, data persists.
 *
 * Application code never knows which is in use. This module deliberately omits
 * the `server-only` guard so CLI scripts can reuse it; `./index.ts` is the
 * application entry point and does carry the guard.
 */
export type Database = PgliteDatabase<typeof schema> | PostgresJsDatabase<typeof schema>;

export const LOCAL_DB_DIR = process.env.NODE_ENV !== 'production' && process.env.KRITI_LOCAL_DB_DIR
  ? path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.KRITI_LOCAL_DB_DIR)
  : path.join(process.cwd(), 'local-db');

// Next.js reloads modules on every edit. Without this cache each reload would
// open a new pool, or a second PGlite instance holding the same data directory.
const globalForDb = globalThis as unknown as {
  __kritiDb?: Database;
  __kritiSql?: ReturnType<typeof postgres>;
};

export function createDatabase(): Database {
  const databaseUrl = process.env.DATABASE_URL;
  const isProduction = process.env.NODE_ENV === 'production';

  if (databaseUrl) {
    const client =
      globalForDb.__kritiSql ??
      postgres(databaseUrl, {
        max: isProduction ? 10 : 2,
        idle_timeout: 20,
        connect_timeout: 10,
        // Verify the hosted database certificate rather than inheriting the
        // weaker sslmode=require supplied in some provider connection strings.
        ...(isProduction ? { ssl: 'verify-full' as const } : {}),
        prepare: false, // required for Supabase's transaction-mode pooler
      });

    if (!isProduction) globalForDb.__kritiSql = client;

    return drizzlePostgres(client, { schema, casing: 'snake_case' });
  }

  return drizzlePglite(new PGlite(LOCAL_DB_DIR), { schema, casing: 'snake_case' });
}

export function getDatabase(): Database {
  const existing = globalForDb.__kritiDb;
  if (existing) return existing;

  const database = createDatabase();
  if (process.env.NODE_ENV !== 'production') globalForDb.__kritiDb = database;
  return database;
}

export { schema };
