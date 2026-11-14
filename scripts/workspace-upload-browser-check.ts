import './bootstrap';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { SignJWT } from 'jose';
import { LOCAL_DB_DIR } from './bootstrap';

// Run only against the isolated HTTP fixture, with its server in Blob mode.
// This exercises hydration, draft preservation and the Server Action bridge
// without making any requests to a real Blob store.
async function main() {
  if (process.env.DATABASE_URL || !process.env.KRITI_LOCAL_DB_DIR ||
      !LOCAL_DB_DIR.startsWith(path.resolve('.backups') + path.sep))
    throw new Error('Browser checks require an isolated HTTP fixture inside .backups.');
  const base = process.env.SMOKE_URL ?? 'http://localhost:3002';
  const fixture = JSON.parse(fs.readFileSync(path.join(LOCAL_DB_DIR, 'http-fixture.json'), 'utf8')) as { intern: string };
  const token = await new SignJWT({ sub: fixture.intern }).setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt().setExpirationTime('10m').sign(new TextEncoder().encode(
      process.env.SESSION_SECRET ?? 'kriti-development-secret-not-for-production-use',
    ));
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addCookies([{ name: 'kriti_session', value: token, url: base, httpOnly: true, sameSite: 'Lax' }]);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/work/new`);
    await page.locator('[name=title]').fill('Private upload browser check');
    await page.getByRole('button', { name: 'Create work', exact: true }).click();
    await page.waitForURL(/\/work\/[a-f0-9-]{36}$/);
    // In database mode this notice is absent; fail instead of accidentally
    // testing the old form while believing cloud preparation was exercised.
    assert.equal(await page.locator('noscript').count(), 1, 'Start the fixture server with WORK_FILE_STORAGE=vercel-blob.');
    const summary = 'Browser test work update persists.';
    await page.locator('[name=summary]').fill(summary);
    await page.locator('[name=links]').fill('https://docs.google.com/document/d/test-link/edit');
    await page.locator('[name=files]').setInputFiles({ name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a PDF') });
    await page.getByRole('button', { name: 'Record completion', exact: true }).click();
    await page.getByText('The contents of broken.pdf do not match its file type.', { exact: true }).waitFor();
    assert.equal(await page.locator('[name=summary]').inputValue(), summary, 'Client upload failure must preserve the work update.');
    assert.equal(await page.locator('[name=files]').evaluate((input) => (input as HTMLInputElement).files?.length), 1, 'Client upload failure must preserve file selection.');
    await page.locator('[name=files]').setInputFiles([]);
    await page.locator('[name=links]').fill('http://invalid.example');
    await page.getByRole('button', { name: 'Record completion', exact: true }).click();
    await page.getByText('Use a full HTTPS link, one per line.', { exact: true }).waitFor();
    assert.equal(await page.locator('[name=summary]').inputValue(), summary, 'Server validation failure must preserve the work update.');
    await page.locator('[name=links]').fill('https://docs.google.com/document/d/test-link/edit');
    await page.getByRole('button', { name: 'Record completion', exact: true }).click();
    await page.getByText('Completed by owner · no review requested', { exact: true }).waitFor();
    assert.equal(await page.locator('[name=summary]').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: direct-upload form preserves drafts and files after client/server errors, retries successfully and records link-only completion. No browser errors.');
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
