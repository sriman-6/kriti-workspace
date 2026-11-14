import 'server-only';

import { getDatabase, type Database } from './client';

/**
 * The application's database handle.
 *
 * Importing this from a Client Component is a build error by design — data
 * access belongs in a Server Component or a service, never in the browser
 * bundle. CLI scripts import `./client` directly instead.
 *
 * `db` is a lazy proxy, not `getDatabase()` called directly at module scope.
 * `new PGlite(dir)` boots the WASM engine as soon as it is constructed —
 * eagerly resolving `db` at import time meant every Next build worker that
 * merely *imported* this module (during static analysis, before any route
 * actually ran) opened its own PGlite instance against the same `./local-db`
 * directory. With several parallel workers doing this at once, PGlite has no
 * cross-process lock coordination and the WASM module aborted outright. This
 * proxy defers construction until the first real property access — i.e. the
 * first actual query — which happens inside a single request, never during
 * module loading.
 */
let instance: Database | undefined;

function resolve(): Database {
  instance ??= getDatabase();
  return instance;
}

export const db: Database = new Proxy({} as Database, {
  get(_target, property, receiver) {
    return Reflect.get(resolve(), property, receiver);
  },
});

export type { Database };
export * from './schema';
