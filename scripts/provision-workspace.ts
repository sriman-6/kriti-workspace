import './bootstrap';
import { parseArgs } from 'node:util';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { LOCAL_DB_DIR } from './bootstrap';
import { personSchema } from '../src/lib/schemas/work';
import { isAllowedBitsEmail, campusForEmail } from '../src/lib/auth/domains';
import { users, workspaceProfiles, workEvents } from '../src/lib/db/schema';

// Local bootstrap with the application stopped; normal account management is in People.
async function main() {
  if (process.env.DATABASE_URL)
    throw new Error('Use People for remote workspace provisioning.');
  const { values } = parseArgs({
    options: {
      actor: { type: 'string' },
      name: { type: 'string' },
      email: { type: 'string' },
      role: { type: 'string' },
      'bootstrap-admin': { type: 'boolean' },
      'allow-external-google': { type: 'boolean' },
    },
  });
  const input = personSchema.parse({
    fullName: values.name,
    email: values.email,
    role: values.role,
  });
  const externalGoogleApproved = !isAllowedBitsEmail(input.email) && values['allow-external-google'] === true;
  if (!isAllowedBitsEmail(input.email) && (!externalGoogleApproved || values['bootstrap-admin']))
    throw new Error('An official BITS email is required unless this exact external Google account is explicitly approved.');
  const client = new PGlite(LOCAL_DB_DIR);
  const db = drizzle(client);
  try {
    await db.transaction(async (tx) => {
      const bootstrap = values['bootstrap-admin'] === true;
      const [actor] = await tx
        .select()
        .from(users)
        .where(eq(users.email, values.actor ?? ''));
      if (bootstrap) {
        const [anyAccount] = await tx
          .select({ id: users.id })
          .from(users)
          .limit(1);
        if (anyAccount || input.role !== 'head')
          throw new Error(
            'First-administrator bootstrap requires an empty workspace and a Head account.',
          );
      } else if (!actor || actor.role !== 'super_admin' || !actor.isActive) {
        throw new Error(
          'An existing active technical administrator must perform provisioning.',
        );
      }
      const [existing] = await tx
        .select()
        .from(users)
        .where(eq(users.email, input.email));
      if (existing && !existing.isActive)
        throw new Error('Account is inactive. Reactivate it in People.');
      const person =
        existing ??
        (
          await tx
            .insert(users)
            .values({
              email: input.email,
              fullName: input.fullName,
              role: bootstrap ? 'super_admin' : 'member',
              campus: campusForEmail(input.email),
              externalGoogleApproved,
            })
            .returning()
        )[0];
      if (!person) throw new Error('Account could not be created.');
      await tx.update(users).set({ fullName: input.fullName, campus: campusForEmail(input.email),
        externalGoogleApproved: externalGoogleApproved || person.externalGoogleApproved, updatedAt: new Date() }).where(eq(users.id, person.id));
      await tx
        .insert(workspaceProfiles)
        .values({ userId: person.id, role: input.role })
        .onConflictDoUpdate({
          target: workspaceProfiles.userId,
          set: { role: input.role, updatedAt: new Date() },
        });
      await tx
        .insert(workEvents)
        .values({
          actorId: actor?.id ?? person.id,
          message: `Initial workspace responsibility: ${input.role} for ${person.fullName}.`,
        });
      if (externalGoogleApproved && !existing?.externalGoogleApproved)
        await tx.insert(workEvents).values({ actorId: actor!.id, message: `External Google sign-in explicitly approved for ${input.email}.` });
    });
    console.log(`Workspace responsibility provisioned: ${input.role}.`);
  } finally {
    await client.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
