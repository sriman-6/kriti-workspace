import './bootstrap';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { LOCAL_DB_DIR, MIGRATIONS_DIR } from './bootstrap';
import {
  users,
  workspaceProfiles,
  programmes,
  programmeMembers,
} from '../src/lib/db/schema';

async function main() {
  const allowed = path.resolve('.backups') + path.sep;
  if (
    process.env.DATABASE_URL ||
    !process.env.KRITI_LOCAL_DB_DIR ||
    !LOCAL_DB_DIR.startsWith(allowed)
  )
    throw new Error(
      'HTTP fixtures require an isolated local directory inside .backups.',
    );
  if (fs.existsSync(path.join(LOCAL_DB_DIR, 'http-fixture.json')))
    throw new Error('Choose a fresh isolated directory.');
  const client = new PGlite(LOCAL_DB_DIR);
  const db = drizzle(client);
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    const members = await db
      .insert(users)
      .values(
        ['head', 'lead', 'intern', 'outsider', 'manager', 'support'].map((name) => ({
          email: `${name}@workspace.test`,
          fullName: `Test ${name}`,
          role: 'member' as const,
        })),
      )
      .returning();
    const [head, lead, intern, outsider, manager, support] = members;
    if (!head || !lead || !intern || !outsider || !manager || !support)
      throw new Error('Fixture setup failed.');
    await db.insert(workspaceProfiles).values([
      { userId: head.id, role: 'head' },
      { userId: lead.id, role: 'program_head' },
      { userId: intern.id, role: 'intern' },
      { userId: outsider.id, role: 'intern' },
      { userId: manager.id, role: 'manager' },
      { userId: support.id, role: 'administrative_support' },
    ]);
    const [programme] = await db
      .insert(programmes)
      .values({ code: 'HTTP-CHECK', name: 'HTTP check programme' })
      .returning();
    if (!programme) throw new Error('Missing programme.');
    await db.insert(programmeMembers).values([
      { programmeId: programme.id, userId: lead.id, role: 'lead' },
      { programmeId: programme.id, userId: intern.id, role: 'member' },
    ]);
    fs.writeFileSync(
      path.join(LOCAL_DB_DIR, 'http-fixture.json'),
      JSON.stringify({
        head: head.id,
        lead: lead.id,
        intern: intern.id,
        outsider: outsider.id,
        manager: manager.id,
        support: support.id,
        programmeId: programme.id,
      }),
    );
    console.log(
      'Isolated HTTP fixture ready. Working database was not opened.',
    );
  } finally {
    await client.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
