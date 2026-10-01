// Local UI smoke only; OAuth is intercepted and is not a live-provider test.
// Start Next with both OAuth flags=1 and the dummy Supabase origin below.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const require = createRequire(new URL('../../packages/ingest-core/package.json', import.meta.url));
const { chromium } = require('playwright');
const origin = 'http://localhost:3107';
const output = await mkdtemp(path.join(tmpdir(), 'social-signup-ui-'));
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 980 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const redirects = [];
    await page.route('https://auth.example.invalid/auth/v1/authorize**', async route => {
      redirects.push(new URL(route.request().url()));
      await route.fulfill({ contentType: 'text/html', body: '<p>Intercepted test OAuth request</p>' });
    });
    for (const entry of ['/signup', '/login']) {
      const response = await page.goto(origin + entry, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200);
      await page.getByRole('button', { name: 'Google로 계속하기' }).waitFor();
      await page.getByRole('button', { name: '카카오로 계속하기' }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'horizontal overflow');
      await page.screenshot({ path: path.join(output, `${entry.slice(1)}-${width}.png`), fullPage: true });
      const provider = entry === '/signup' ? 'google' : 'kakao';
      await page.getByRole('button', { name: provider === 'google' ? 'Google로 계속하기' : '카카오로 계속하기' }).click();
      await page.waitForURL('https://auth.example.invalid/**');
      const redirect = redirects.at(-1);
      assert.equal(redirect.searchParams.get('provider'), provider);
      assert.equal(redirect.searchParams.get('prompt'), 'select_account');
      assert.equal(redirect.searchParams.get('code_challenge_method'), 's256');
      assert.ok(redirect.searchParams.get('code_challenge'));
      assert.equal(new URL(redirect.searchParams.get('redirect_to')).pathname, '/auth/callback');
      results.push({ entry, width, provider, pkce: true });
    }
    await page.goto(origin + '/login?error=oauth_cancelled', { waitUntil: 'networkidle' });
    assert.match(await page.getByRole('alert').filter({ hasText: '로그인이 취소' }).innerText(), /로그인이 취소/);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(JSON.stringify({ results, screenshots: output, liveOAuth: false }, null, 2));
} finally { await browser.close(); }
