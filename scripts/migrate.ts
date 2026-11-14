import { describeTarget, LOCAL_DB_DIR, MIGRATIONS_DIR } from './bootstrap';

/**
 * Applies generated SQL migrations to whichever database is configured.
 * Safe to re-run: drizzle records what it has already applied.
 */
async function main(): Promise<void> {
  console.log(`Migrating ${describeTarget()}…`);

  if (process.env.DATABASE_URL) {
    const [{ drizzle }, { migrate }, postgres] = await Promise.all([
      import('drizzle-orm/postgres-js'),
      import('drizzle-orm/postgres-js/migrator'),
      import('postgres').then((m) => m.default),
    ]);

    // Prefer a direct connection for schema changes; keep runtime traffic on
    // the provider's pooler. Verify hosted certificates in production.
    const client = postgres(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL, {
      max: 1, prepare: false,
      ...(process.env.NODE_ENV === 'production' ? { ssl: 'verify-full' as const } : {}),
    });
    try {
      await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_DIR });
    } finally {
      await client.end();
    }
  } else {
    const [{ drizzle }, { migrate }, { PGlite }] = await Promise.all([
      import('drizzle-orm/pglite'),
      import('drizzle-orm/pglite/migrator'),
      import('@electric-sql/pglite'),
    ]);

    const client = new PGlite(LOCAL_DB_DIR);
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_DIR });
    await client.close();
  }

  console.log('Migrations applied.');
}

main().catch((error: unknown) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
