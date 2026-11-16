import './bootstrap';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { SignJWT } from 'jose';
import { LOCAL_DB_DIR } from './bootstrap';

async function main() {
  if (
    process.env.DATABASE_URL ||
    !process.env.KRITI_LOCAL_DB_DIR ||
    !LOCAL_DB_DIR.startsWith(path.resolve('.backups') + path.sep)
  )
    throw new Error(
      'Chat browser checks require an isolated fixture inside .backups.',
    );
  const base = process.env.SMOKE_URL ?? 'http://localhost:3002';
  if (!/^http:\/\/localhost:\d+$/.test(base))
    throw new Error('Browser fixtures are local only.');
  const fixture = JSON.parse(
    fs.readFileSync(path.join(LOCAL_DB_DIR, 'http-fixture.json'), 'utf8'),
  ) as { head: string; intern: string; outsider: string };
  const token = await new SignJWT({ sub: fixture.head })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(
      new TextEncoder().encode(
        process.env.SESSION_SECRET ??
          'kriti-development-secret-not-for-production-use',
      ),
    );
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    await context.addCookies([
      {
        name: 'kriti_session',
        value: token,
        url: base,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/groups?create=1`);
    await page.locator('[name=name]').fill('Chat browser verification');
    await page
      .locator('textarea[name=description]')
      .fill('Isolated checks only');
    await page.locator(`input[value="${fixture.intern}"]`).check();
    await page
      .getByRole('button', { name: 'Create group', exact: true })
      .click();
    await page.waitForURL(/\/groups\/[a-f0-9-]{36}$/);
    const groupId = page.url().split('/').at(-1)!;
    const composer = page.getByRole('textbox', {
      name: 'Message group',
      exact: true,
    });
    await composer.fill('First update');
    await composer.press('Enter');
    await page
      .locator('article')
      .getByText('First update', { exact: true })
      .waitFor();
    await page.waitForFunction(
      () =>
        (
          document.querySelector(
            '[aria-label="Message group"]',
          ) as HTMLTextAreaElement
        )?.value === '',
    );
    await composer.fill('Multiline');
    await composer.press('Shift+Enter');
    await composer.press('A');
    assert.equal(await composer.inputValue(), 'Multiline\nA');
    // A refresh while typing must preserve the controlled draft.
    await page.waitForTimeout(5500);
    assert.equal(await composer.inputValue(), 'Multiline\nA');
    await composer.fill('@Test i');
    await page
      .getByRole('option', { name: 'Test intern', exact: true })
      .click();
    assert.ok((await composer.inputValue()).includes(fixture.intern));
    await composer.press('Enter');
    await page.locator('article').filter({ hasText: '@Test intern' }).waitFor();
    // A lost send response followed by a retry must create one message only.
    let loseResponse = true;
    await page.route(`**/api/groups/${groupId}`, async (route) => {
      const input =
        route.request().method() === 'POST'
          ? route.request().postDataJSON()
          : null;
      if (input?.operation === 'send' && loseResponse) {
        loseResponse = false;
        await route.fetch();
        await route.abort('failed');
      } else await route.continue();
    });
    await composer.fill('Retry without duplication');
    await composer.press('Enter');
    await page.getByRole('button', { name: 'Retry', exact: true }).waitFor();
    assert.equal(await composer.inputValue(), 'Retry without duplication');
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.waitForFunction(
      () =>
        (
          document.querySelector(
            '[aria-label="Message group"]',
          ) as HTMLTextAreaElement
        )?.value === '',
    );
    await page
      .locator('article')
      .getByText('Retry without duplication', { exact: true })
      .waitFor();
    assert.equal(
      await page
        .locator('article')
        .getByText('Retry without duplication', { exact: true })
        .count(),
      1,
    );
    await page.unroute(`**/api/groups/${groupId}`);
    // Reactions, pins and replies stay connected to their source message.
    const first = page.locator('article').filter({ hasText: 'First update' });
    await first.hover();
    await first
      .getByRole('button', { name: 'React to message', exact: true })
      .click();
    await page.getByRole('menuitem', { name: '👍 Add reaction' }).click();
    await first.getByRole('button', { name: /1 reactions/ }).waitFor();
    await first.hover();
    await first.getByRole('button', { name: 'More message actions' }).click();
    await page
      .getByRole('menuitem', { name: 'Pin decision', exact: true })
      .click();
    await first.getByText('Pinned decision', { exact: true }).waitFor();
    await composer.fill('Main draft stays');
    await first.hover();
    await first.getByRole('button', { name: 'Reply in thread' }).click();
    const reply = page.getByRole('textbox', { name: 'Reply to thread' });
    await reply.fill('Thread reply');
    await reply.press('Enter');
    await page.getByRole('dialog').getByText('Thread reply', { exact: true }).waitFor();
    const threadRoot = page.getByRole('dialog').locator('article').filter({ hasText: 'First update' });
    await threadRoot.hover();
    await threadRoot.getByRole('button', { name: 'React to message' }).click();
    await page.getByRole('menuitem', { name: '✅ Add reaction' }).click();
    await threadRoot.getByRole('button', { name: /✅, 1 reactions/ }).waitFor();
    assert.equal(await page.getByRole('dialog').locator('article').filter({ hasText: 'First update' }).count(), 1);
    await page.getByRole('button', { name: 'Close thread' }).click();
    assert.equal(await composer.inputValue(), 'Main draft stays');
    await page.getByRole('button', { name: '1 reply', exact: true }).waitFor();
    await composer.fill('');
    // Attachments are downloadable and collected with shared links.
    await page
      .locator('input[type=file]')
      .setInputFiles({
        name: 'chat-notes.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4\nprivate chat check'),
      });
    await page
      .getByRole('button', { name: 'Send message', exact: true })
      .click();
    await page.getByRole('link', { name: /chat-notes.pdf/ }).waitFor();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: /chat-notes.pdf/ }).click(),
    ]);
    assert.equal(download.suggestedFilename(), 'chat-notes.pdf');
    await composer.fill(
      'Shared sheet https://docs.google.com/spreadsheets/d/chat-check',
    );
    await composer.press('Enter');
    await page
      .getByRole('link', {
        name: 'https://docs.google.com/spreadsheets/d/chat-check',
        exact: true,
      })
      .waitFor();
    await page.getByRole('button', { name: 'Shared files and links' }).click();
    await page
      .getByRole('dialog')
      .getByRole('link', { name: 'chat-notes.pdf', exact: true })
      .waitFor();
    await page.getByRole('button', { name: 'Close files and links' }).click();
    await page.getByRole('button', { name: 'Search group messages' }).click();
    await page
      .getByRole('textbox', { name: 'Search all messages' })
      .fill('Thread reply');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Search', exact: true })
      .click();
    await page
      .getByRole('dialog')
      .getByText('Thread reply', { exact: true })
      .waitFor();
    await page.getByRole('button', { name: 'Close search this group' }).click();
    // Work creation uses the ordinary permission-aware form, prefilling the brief.
    await first.hover();
    await first.getByRole('button', { name: 'More message actions' }).click();
    await page
      .getByRole('menuitem', { name: 'Create work from message' })
      .click();
    await page.waitForURL(/\/work\/new\?message=/);
    assert.equal(
      await page.locator('[name=title]').inputValue(),
      'First update',
    );
    assert.ok(
      (await page.locator('textarea[name=description]').inputValue()).includes(
        `/groups/${groupId}`,
      ),
    );
    await page.goto(`${base}/groups/${groupId}`);
    await page
      .getByRole('button', { name: /Group details and members/ })
      .click();
    await page.locator('#chat-name').fill('Renamed chat verification');
    await page.getByRole('button', { name: 'Save details' }).click();
    await page
      .getByRole('dialog')
      .getByText('Saved', { exact: true })
      .waitFor();
    await page.getByRole('button', { name: 'Close group details' }).click();
    await page
      .getByRole('heading', { name: 'Renamed chat verification' })
      .waitFor();
    // Mobile, light/dark and keyboard focus remain usable, without horizontal scroll.
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    await page
      .getByRole('button', { name: 'Show group list', exact: true })
      .click();
    await page
      .getByRole('dialog')
      .locator(`a[href="/groups/${groupId}"]`)
      .waitFor();
    await page.getByRole('button', { name: 'Close your groups' }).click();
    const originalTheme = await page.locator('html').getAttribute('class');
    await page.getByRole('button', { name: 'Toggle colour theme' }).click();
    assert.notEqual(await page.locator('html').getAttribute('class'), originalTheme);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await composer.fill('Mobile draft');
    await composer.focus();
    await composer.press('Tab');
    assert.ok(
      await page.evaluate(
        () =>
          document.activeElement?.getAttribute('aria-label') ===
          'Attach a file',
      ),
    );
    // Authenticate another account in an isolated context; no private group access.
    const outsider = await new SignJWT({ sub: fixture.outsider })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(
        new TextEncoder().encode(
          process.env.SESSION_SECRET ??
            'kriti-development-secret-not-for-production-use',
        ),
      );
    const other = await browser.newContext();
    await other.addCookies([
      { name: 'kriti_session', value: outsider, url: base, httpOnly: true },
    ]);
    assert.equal(
      (await other.request.get(`${base}/api/groups/${groupId}`)).status(),
      404,
    );
    await page.screenshot({ path: path.join(LOCAL_DB_DIR, 'chat-mobile.png') });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: path.join(LOCAL_DB_DIR, 'chat-desktop.png') });
    assert.deepEqual(errors, []);
    console.log(
      'PASS: chat layout, draft refresh, Enter/newline, mentions, lost-response retry, reactions, pins, threads, files/download, shared links, search, work creation, rename, mobile navigation, keyboard focus and outsider access.',
    );
    fs.writeFileSync(
      path.join(LOCAL_DB_DIR, 'chat-check-result.json'),
      JSON.stringify({ groupId, passed: true, runId: randomUUID() }),
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
