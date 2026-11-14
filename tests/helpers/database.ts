import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import * as schema from '@/lib/db/schema';

/**
 * A throwaway database per test file.
 *
 * Each suite gets its own PGlite directory under the OS temp dir, so tests
 * never touch ./local-db and can run without the dev server being stopped.
 */
export type TestDatabase = ReturnType<typeof drizzle<typeof schema>>;

export async function createTestDatabase(): Promise<{
  db: TestDatabase;
  cleanup: () => Promise<void>;
}> {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kriti-test-'));
  const client = new PGlite(directory);
  const db = drizzle(client, { schema, casing: 'snake_case' });

  await migrate(db, {
    migrationsFolder: path.join(process.cwd(), 'src', 'lib', 'db', 'migrations'),
  });

  return {
    db,
    cleanup: async () => {
      await client.close();
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}
