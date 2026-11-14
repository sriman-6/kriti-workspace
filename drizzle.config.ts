import { defineConfig } from 'drizzle-kit';

/**
 * Migrations are generated offline from the schema (`npm run db:generate`) and
 * applied by `npm run db:migrate`, which picks the driver matching DATABASE_URL.
 * Generation never needs a live database.
 */
export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './src/lib/db/migrations',
  dialect: 'postgresql',
  casing: 'snake_case',
  strict: true,
  verbose: true,
  ...(process.env.DATABASE_URL
    ? { dbCredentials: { url: process.env.DATABASE_URL } }
    : {}),
});
