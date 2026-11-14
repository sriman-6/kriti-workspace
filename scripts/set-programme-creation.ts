import './bootstrap';
import { parseArgs } from 'node:util';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { LOCAL_DB_DIR } from './bootstrap';
import { users, workspaceProfiles, workEvents } from '../src/lib/db/schema';

// Explicit per-account grants. Stop the app before opening its local database.
async function main() {
  if (process.env.DATABASE_URL) throw new Error('This command is for local workspace administration only.');
  const { values } = parseArgs({ options: {
    actor: { type: 'string' }, email: { type: 'string' },
    allow: { type: 'boolean' }, revoke: { type: 'boolean' },
  } });
  const actorEmail = z.string().email().parse(values.actor).toLowerCase();
  const targetEmail = z.string().email().parse(values.email).toLowerCase();
  if (Boolean(values.allow) === Boolean(values.revoke)) throw new Error('Choose exactly one of --allow or --revoke.');
  const allowed = values.allow === true;
  const client = new PGlite(LOCAL_DB_DIR);
  const db = drizzle(client);
  try {
    await db.transaction(async (tx) => {
      const [actor] = await tx.select().from(users).where(eq(users.email, actorEmail));
      const [actorProfile] = actor ? await tx.select().from(workspaceProfiles).where(eq(workspaceProfiles.userId, actor.id)) : [];
      if (!actor?.isActive || !(actor.role === 'super_admin' || actorProfile?.role === 'head'))
        throw new Error('An active Head or technical administrator must authorize this grant.');
      const [target] = await tx.select().from(users).where(eq(users.email, targetEmail));
      const [profile] = target ? await tx.select().from(workspaceProfiles).where(eq(workspaceProfiles.userId, target.id)) : [];
      if (!target?.isActive || !profile) throw new Error('Choose an active configured account.');
      await tx.update(workspaceProfiles).set({ programmeCreationAllowed: allowed, updatedAt: new Date() }).where(eq(workspaceProfiles.userId, target.id));
      await tx.insert(workEvents).values({ actorId: actor.id,
        message: `Account-specific programme creation ${allowed ? 'granted' : 'revoked'} for ${target.fullName}. KRITI responsibility remains ${profile.role}.` });
      console.log(`Programme creation ${allowed ? 'enabled' : 'revoked'}; KRITI responsibility retained: ${profile.role}.`);
    });
  } finally { await client.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
