import './bootstrap';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { LOCAL_DB_DIR } from './bootstrap';

// With the app stopped, verify the standalone migration and prepare local read-only smoke checks.
async function main() {
  if (process.env.DATABASE_URL)
    throw new Error('This check is for local PGlite only.');
  const client = new PGlite(LOCAL_DB_DIR);
  try {
    const result = await client.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    const tables = result.rows.map((row) => row.table_name);
    for (const retired of [
      'students',
      'teams',
      'sessions',
      'attendance',
      'submissions',
      'assessment_components',
      'cohort_settings',
    ])
      assert(!tables.includes(retired), `Retired table remains: ${retired}`);
    const people = await client.query<{
      id: string;
      email: string;
      role: string;
    }>(
      'SELECT u.id, u.email, p.role FROM users u JOIN workspace_profiles p ON p.user_id = u.id WHERE u.is_active = true',
    );
    const manifest = Object.fromEntries(
      people.rows.map((person) => [
        person.email,
        { id: person.id, role: person.role },
      ]),
    );
    fs.writeFileSync(
      path.join(LOCAL_DB_DIR, 'workspace-manifest.json'),
      JSON.stringify(manifest),
    );
    console.log(
      `Standalone schema verified: ${tables.length} tables; ${people.rows.length} active configured accounts. Retired course tables absent.`,
    );
  } finally {
    await client.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
