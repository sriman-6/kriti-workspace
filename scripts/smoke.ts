import './bootstrap';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import { LOCAL_DB_DIR } from './bootstrap';

// Pure HTTP; never opens a database alongside a dev server.
async function main() {
  const base = process.env.SMOKE_URL ?? 'http://localhost:3001';
  const manifest = JSON.parse(
    fs.readFileSync(path.join(LOCAL_DB_DIR, 'workspace-manifest.json'), 'utf8'),
  ) as Record<string, { id: string; role: string }>;
  const key = new TextEncoder().encode(
    process.env.SESSION_SECRET ??
      'kriti-development-secret-not-for-production-use',
  );
  const anonymous = await fetch(`${base}/dashboard`, { redirect: 'manual' });
  assert.equal(anonymous.status, 307);
  let checks = 1;
  for (const person of Object.values(manifest)) {
    const token = await new SignJWT({ sub: person.id })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);
    for (const route of [
      '/dashboard',
      '/work',
      '/people',
      '/programmes',
      '/groups',
      '/meetings',
      '/ideas',
      '/library',
    ]) {
      const response = await fetch(base + route, {
        headers: { cookie: `kriti_session=${token}` },
      });
      assert.equal(response.status, 200, `${person.role}: ${route}`);
      const html = await response.text();
      assert(html.includes('KRITI') && html.includes('>Work<'));
      assert(!html.includes('Open SVC') && !html.includes('SVC programme'));
      checks++;
    }
  }
  console.log(`${checks} read-only workspace smoke checks passed.`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
