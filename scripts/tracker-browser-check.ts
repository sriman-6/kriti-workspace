import './bootstrap';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium, type BrowserContext } from 'playwright';
import { SignJWT } from 'jose';
import { LOCAL_DB_DIR } from './bootstrap';
async function main() {
  if (
    process.env.DATABASE_URL ||
    !process.env.KRITI_LOCAL_DB_DIR ||
    !LOCAL_DB_DIR.startsWith(path.resolve('.backups') + path.sep)
  )
    throw new Error('Tracker checks require an isolated local fixture.');
  const base = process.env.SMOKE_URL ?? 'http://localhost:3002';
  if (!/^http:\/\/localhost:\d+$/.test(base))
    throw new Error('Fixtures are local only.');
  const fixture = JSON.parse(
    fs.readFileSync(path.join(LOCAL_DB_DIR, 'http-fixture.json'), 'utf8'),
  ) as Record<string, string>;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors: string[] = [];
  async function contextFor(role: string) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const token = await new SignJWT({ sub: fixture[role] })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(
        new TextEncoder().encode(
          process.env.SESSION_SECRET ??
            'kriti-development-secret-not-for-production-use',
        ),
      );
    await context.addCookies([
      {
        name: 'kriti_session',
        value: token,
        url: base,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    return context;
  }
  async function post(context: BrowserContext, id: string, body: object) {
    return context.request.post(`${base}/api/trackers/${id}`, {
      headers: { origin: base },
      data: body,
    });
  }
  try {
    const head = await contextFor('head');
    const page = await head.newPage();
    page.on('pageerror', (cause) => errors.push(cause.message));
    await page.goto(`${base}/programmes`, {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    await page.getByRole('button', { name: 'Ideas', exact: true }).waitFor();
    await page
      .getByRole('button', { name: 'New tracker', exact: true })
      .click();
    await page
      .getByLabel('Name', { exact: true })
      .fill('Isolated programme tracker');
    await page.getByLabel('Type', { exact: true }).selectOption('project');
    await page
      .getByRole('button', { name: 'Create tracker', exact: true })
      .click();
    await page.waitForURL(/\/programmes\/[a-f0-9-]{36}$/);
    const id = page.url().split('/').at(-1)!;
    await page
      .getByRole('button', { name: 'About and people', exact: true })
      .click();
    await page.locator('#tracker-person').selectOption(fixture.intern!);
    await page
      .getByRole('button', { name: 'Save member access', exact: true })
      .click();
    await page
      .getByRole('status')
      .getByText('Saved', { exact: true })
      .waitFor();
    await page
      .getByRole('button', { name: 'Close about & people', exact: true })
      .click();
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Add row', exact: true }).click();
    await page.getByLabel('Item', { exact: true }).fill('Visit activity');
    await page.getByLabel('Type', { exact: true }).selectOption('activity');
    await page
      .getByLabel('Date (optional)', { exact: true })
      .fill('2026-02-17');
    await page
      .getByLabel('Notes', { exact: true })
      .fill('Actual visit information and outcomes.');
    await page
      .getByLabel('Related links', { exact: true })
      .fill('https://docs.google.com/document/d/tracker-check');
    const bytes = Buffer.alloc(5 * 1024 * 1024, 120);
    Buffer.from('Tracker private browser file\n').copy(bytes);
    await page
      .locator('#row-files')
      .setInputFiles({
        name: 'report.txt',
        mimeType: 'text/plain',
        buffer: bytes,
      });
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Add row', exact: true })
      .click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page
      .getByRole('button', { name: 'Visit activity', exact: true })
      .waitFor();
    await page
      .getByRole('button', {
        name: 'Edit status for Visit activity',
        exact: true,
      })
      .click();
    await page
      .getByRole('combobox', {
        name: 'Edit status for Visit activity',
        exact: true,
      })
      .selectOption('done');
    await page
      .getByRole('button', {
        name: 'Edit status for Visit activity',
        exact: true,
      })
      .getByText('Done', { exact: true })
      .waitFor();
    await page.getByRole('button', { name: 'Columns', exact: true }).click();
    await page.getByLabel('New column', { exact: true }).fill('Version');
    await page.getByRole('button', { name: 'Add column', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page
      .getByRole('button', {
        name: 'Edit Version for Visit activity',
        exact: true,
      })
      .click();
    await page
      .getByRole('textbox', {
        name: 'Edit Version for Visit activity',
        exact: true,
      })
      .fill('v1.0');
    await page
      .getByRole('textbox', {
        name: 'Edit Version for Visit activity',
        exact: true,
      })
      .press('Enter');
    await page
      .getByRole('button', {
        name: 'Edit Version for Visit activity',
        exact: true,
      })
      .getByText('v1.0', { exact: true })
      .waitFor();
    // Stale editors retain the local draft instead of overwriting another update.
    await page
      .getByRole('button', { name: 'Visit activity', exact: true })
      .click();
    await page
      .getByLabel('Notes', { exact: true })
      .fill('Keep this unsaved local draft.');
    let detail = (
      await (await head.request.get(`${base}/api/trackers/${id}`)).json()
    ).data;
    const original = detail.rows.find(
      (row: { title: string }) => row.title === 'Visit activity',
    );
    assert.equal(
      (
        await post(head, id, {
          operation: 'save',
          row: { ...original, notes: 'A newer saved update.', uploadIds: [] },
        })
      ).status(),
      200,
    );
    await page
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await page.getByRole('dialog').getByRole('alert').waitFor();
    assert.equal(
      await page.getByLabel('Notes', { exact: true }).inputValue(),
      'Keep this unsaved local draft.',
    );
    await page
      .getByRole('button', { name: 'Close row details', exact: true })
      .click();
    // A lost response is safe to retry without creating a duplicate row.
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Add row', exact: true }).click();
    await page.getByLabel('Item', { exact: true }).fill('Retry-safe update');
    let lose = true;
    await page.route(`**/api/trackers/${id}`, async (route) => {
      const body =
        route.request().method() === 'POST'
          ? route.request().postDataJSON()
          : null;
      if (body?.operation === 'save' && lose) {
        lose = false;
        await route.fetch();
        await route.abort('failed');
      } else await route.continue();
    });
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Add row', exact: true })
      .click();
    await page.getByRole('dialog').getByRole('alert').waitFor();
    assert.equal(
      await page.getByLabel('Item', { exact: true }).inputValue(),
      'Retry-safe update',
    );
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Add row', exact: true })
      .click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(
      await page
        .getByRole('button', { name: 'Retry-safe update', exact: true })
        .count(),
      1,
    );
    await page.unroute(`**/api/trackers/${id}`);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page
      .getByRole('menuitem', { name: 'Add related tracker', exact: true })
      .click();
    await page
      .getByLabel('Tracker name', { exact: true })
      .fill('Visit planning');
    await page
      .getByRole('button', { name: 'Create related tracker', exact: true })
      .click();
    await page.waitForURL(/\?sheet=[a-f0-9-]{36}$/);
    const sheetId = new URL(page.url()).searchParams.get('sheet');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page
      .getByRole('menuitem', { name: 'Create task', exact: true })
      .click();
    await page.waitForURL(/\/work\/new\?programme=/);
    assert.equal(await page.locator('[name=programmeId]').inputValue(), id);
    assert.equal(
      await page.locator('[name=trackerSheetId]').inputValue(),
      sheetId,
    );
    await page.locator('[name=title]').fill('Linked website task');
    await page
      .getByRole('button', { name: 'Create work', exact: true })
      .click();
    await page.waitForURL(/\/work\/[a-f0-9-]{36}$/);
    await page
      .getByRole('link', { name: 'Open programme tracker →', exact: true })
      .click();
    await page
      .getByRole('link', { name: 'Linked website task', exact: true })
      .waitFor();
    await page.getByRole('link', { name: 'Main tracker', exact: true }).click();
    await page
      .getByRole('link', { name: 'Visit planning', exact: false })
      .first()
      .waitFor();
    await page
      .getByRole('button', { name: 'Files & links', exact: true })
      .click();
    await page
      .getByRole('link', { name: 'report.txt ↓', exact: true })
      .waitFor();
    const intern = await contextFor('intern');
    const memberPage = await intern.newPage();
    memberPage.on('pageerror', (cause) => errors.push(cause.message));
    await memberPage.goto(`${base}/programmes`);
    assert.equal(
      await memberPage
        .getByRole('button', { name: 'Ideas', exact: true })
        .count(),
      0,
    );
    const deniedIdeas = await intern.request.get(`${base}/ideas`);
    const deniedHtml = await deniedIdeas.text();
    assert.ok(deniedHtml.includes('Page not found'));
    assert.ok(!deniedHtml.includes('Capture an idea'));
    await memberPage.locator(`a[href="/programmes/${id}"]`).click();
    await memberPage
      .getByRole('button', { name: 'Visit activity', exact: true })
      .waitFor();
    assert.equal(
      await memberPage
        .getByRole('button', {
          name: 'Edit status for Visit activity',
          exact: true,
        })
        .count(),
      0,
    );
    await memberPage
      .getByRole('button', { name: 'Visit activity', exact: true })
      .click();
    const [download] = await Promise.all([
      memberPage.waitForEvent('download'),
      memberPage
        .getByRole('dialog')
        .getByRole('link', { name: 'report.txt ↓', exact: true })
        .click(),
    ]);
    assert.equal(
      createHash('sha256')
        .update(fs.readFileSync((await download.path())!))
        .digest('hex'),
      createHash('sha256').update(bytes).digest('hex'),
    );
    await memberPage
      .getByRole('button', { name: 'Close row details', exact: true })
      .click();
    await memberPage.getByRole('button', { name: 'Add', exact: true }).click();
    await memberPage
      .getByRole('menuitem', { name: 'Add row', exact: true })
      .click();
    await memberPage.getByLabel('Item', { exact: true }).fill('Member update');
    await memberPage
      .getByRole('dialog')
      .getByRole('button', { name: 'Add row', exact: true })
      .click();
    await memberPage.getByRole('dialog').waitFor({ state: 'hidden' });
    await memberPage
      .getByRole('button', { name: 'Member update', exact: true })
      .waitFor();
    await memberPage
      .getByRole('button', { name: 'Actions for Member update', exact: true })
      .click();
    await memberPage
      .getByRole('menuitem', { name: 'Archive row', exact: true })
      .click();
    await memberPage
      .getByRole('button', { name: 'Member update', exact: true })
      .waitFor({ state: 'hidden' });
    await memberPage.getByLabel('Archived rows', { exact: true }).check();
    await memberPage
      .getByRole('button', { name: 'Member update', exact: true })
      .waitFor();
    await memberPage
      .getByRole('button', { name: 'Actions for Member update', exact: true })
      .click();
    await memberPage
      .getByRole('menuitem', { name: 'Restore row', exact: true })
      .click();
    await memberPage
      .getByRole('button', { name: 'Member update', exact: true })
      .waitFor({ state: 'hidden' });
    await memberPage.getByLabel('Archived rows', { exact: true }).uncheck();
    await memberPage
      .getByRole('button', { name: 'Member update', exact: true })
      .waitFor();
    await memberPage.setViewportSize({ width: 390, height: 844 });
    await memberPage.screenshot({
      path: path.join(LOCAL_DB_DIR, 'tracker-mobile.png'),
    });
    const mobile = await memberPage.evaluate(() => ({
      width: window.innerWidth,
      scroll: document.documentElement.scrollWidth,
      overflow: [...document.querySelectorAll('body *')]
        .filter(
          (node) => node.getBoundingClientRect().right > window.innerWidth + 2,
        )
        .slice(0, 15)
        .map((node) => ({
          tag: node.tagName,
          cls: node.className,
          right: node.getBoundingClientRect().right,
        })),
    }));
    fs.writeFileSync(
      path.join(LOCAL_DB_DIR, 'mobile-layout.json'),
      JSON.stringify(mobile, null, 2),
    );
    assert.ok(mobile.scroll <= mobile.width);
    await page.getByRole('button', { name: 'Tracker', exact: true }).click();
    await page.screenshot({
      path: path.join(LOCAL_DB_DIR, 'tracker-desktop.png'),
    });
    detail = (
      await (await head.request.get(`${base}/api/trackers/${id}`)).json()
    ).data;
    assert.equal(
      detail.rows.filter(
        (row: { title: string }) => row.title === 'Retry-safe update',
      ).length,
      1,
    );
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(LOCAL_DB_DIR, 'tracker-check-result.json'),
      JSON.stringify({ passed: true, id, sheetId }),
    );
    console.log(
      'PASS: master list, programme creation, membership, rows, dates, 5 MB file upload/download, inline edits, custom columns, stale draft retention, safe retry, linked trackers/tasks, restricted Ideas, row ownership, archive/restore visibility and mobile layout.',
    );
  } finally {
    await browser.close();
  }
}
main().catch((cause) => {
  console.error(cause);
  process.exitCode = 1;
});
