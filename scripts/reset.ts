import fs from 'node:fs';

import { LOCAL_DB_DIR } from './bootstrap';

/**
 * Deletes the local PGlite database so the next migration starts clean.
 * Refuses to touch a remote database — dropping a hosted schema should be a
 * deliberate act in the Supabase console, not a one-word npm script.
 */
function main(): void {
  if (process.env.DATABASE_URL) {
    console.error(
      'DATABASE_URL is set. This script only resets the local PGlite database.\n' +
        'To reset a remote database, do it explicitly from the Supabase dashboard.',
    );
    process.exit(1);
  }

  if (fs.existsSync(LOCAL_DB_DIR)) {
    fs.rmSync(LOCAL_DB_DIR, { recursive: true, force: true });
    console.log('Local database removed.');
  } else {
    console.log('No local database to remove.');
  }

  console.log('Run `npm run setup` to recreate an empty workspace.');
}

main();
