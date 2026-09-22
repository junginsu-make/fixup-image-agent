// 로컬 전용. 유료 엔드포인트는 전부 가로채므로 키를 안 읽고 돈도 안 든다.
//
// **좌표가 화면 폭과 무관한지 실제 브라우저로 잰다.** 단위 시험으로는 CSS
// transform 과 레이아웃을 못 잰다 — 설계 §11 이 「실제 브라우저 이미지로
// 비교한다. 소스 문자열만으로 통과시키지 않는다」고 적은 자리다.
const { createRequire } = require('node:module');
const { readdirSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const root = resolve(__dirname, '../../..');
const modules = resolve(root, 'node_modules/.pnpm');
const playwrightDir = readdirSync(modules).find(name => /^playwright@/.test(name));
const { chromium } = require(resolve(modules, playwrightDir, 'node_modules/playwright'));
const requireWeb = createRequire(resolve(root, 'apps/web/package.json'));

(async () => {
  const image = await requireWeb('sharp')({ create: { width: 768, height: 1024, channels: 3, background: '#ccaa88' } }).png().toBuffer();
  const base64 = image.toString('base64');
  const section = (id) => ({ section_id: id, section_name: '상품 소개', goal: '소개', headline: '제목', subheadline: '설명', bullets: ['특징'],
    headline_en: '', subheadline_en: '', bullets_en: [], trust_or_objection_line: '', trust_or_objection_line_en: '', CTA: '', CTA_en: '',
    prompt_ko: '제품 사진', prompt_en: 'product in studio', layout_notes: '', compliance_notes: '', image_id: id,
    purpose: '', negative_prompt: '', style_guide: '', reference_usage: '' });
  const blueprint = () => ({ executiveSummary: '제품을 소개합니다', scorecard: [], blueprintList: [], sections: [section('S1')] });

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const results = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.route('**/api/pdp/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let data = { ok: true, references: [], items: [] };
      if (path.endsWith('/analyze')) data = { ok: true, result: { originalImage: base64, blueprint: blueprint() } };
      if (path.endsWith('/images/batch')) {
        const body = route.request().postDataJSON();
        data = { ok: true, requested: body.sections.length, succeeded: body.sections.length,
          results: body.sections.map(s => ({ ok: true, sectionId: s.section_id, imageBase64: base64, mimeType: 'image/png' })) };
      }
      await route.fulfill({ json: data });
    });

    await page.goto('http://localhost:3107/create', { waitUntil: 'networkidle' });
    await page.locator('input[type=file]').first().setInputFiles({ name: 'product.png', mimeType: 'image/png', buffer: image });
    await page.getByRole('button', { name: 'AI 분석 시작하기' }).click();
    await page.getByRole('heading', { name: '구성 시나리오를 확인해 주세요' }).waitFor();
    await page.getByRole('button', { name: '대표 이미지 만들기', exact: true }).click();
    await page.getByRole('button', { name: /남은 \d+장 만들기/ }).click();
    await page.getByText(/^\d+ \/ \d+ 완료$/).first().waitFor();

    // 생성이 끝나면 갤러리다. 캔버스는 편집 화면에 있다.
    await page.getByRole('button', { name: '편집', exact: true }).first().click();

    const canvas = page.locator('[class*="imageCanvas"]:not([class*="Fit"])').first();
    try {
      await canvas.waitFor({ timeout: 15000 });
    } catch (error) {
      const classes = await page.evaluate(() =>
        [...document.querySelectorAll('[class*="Canvas"], [class*="canvas"]')].map(n => n.className).slice(0, 10));
      const buttons = await page.evaluate(() =>
        [...document.querySelectorAll('button')].map(n => n.textContent?.trim()).filter(Boolean).slice(0, 25));
      console.error('캔버스를 못 찾음. 화면의 캔버스류:', classes);
      console.error('버튼들:', buttons);
      throw error;
    }

    // ── 1. 안쪽 폭은 화면과 무관하게 460 이다 ───────────────────────
    const 넓은화면 = await canvas.evaluate(node => ({
      logical: node.clientWidth,
      shown: node.getBoundingClientRect().width,
    }));
    assert.equal(넓은화면.logical, 460, `넓은 화면의 논리 폭이 460 이 아니다: ${넓은화면.logical}`);

    // 휴대폰 폭. 여기서야 무대가 460 보다 좁아진다.
    await page.setViewportSize({ width: 380, height: 900 });
    await page.waitForTimeout(400);
    const 좁은화면 = await canvas.evaluate(node => ({
      logical: node.clientWidth,
      shown: node.getBoundingClientRect().width,
    }));
    assert.equal(좁은화면.logical, 460, `좁은 화면의 논리 폭이 460 이 아니다: ${좁은화면.logical}`);
    if (!(좁은화면.shown < 넓은화면.shown)) {
      const 진단 = await page.evaluate(() => {
        const fit = document.querySelector('[class*="imageCanvasFit"]');
        const inner = fit?.querySelector('[class*="imageCanvas"]:not([class*="Fit"])');
        return {
          fitWidth: fit?.getBoundingClientRect().width,
          fitClass: fit?.className,
          innerTransform: inner ? getComputedStyle(inner).transform : null,
          cssVar: inner ? getComputedStyle(inner).getPropertyValue('--canvas-fit') : null,
          stageWidth: document.querySelector('[class*="previewStage"]')?.getBoundingClientRect().width,
        };
      });
      console.error('진단:', JSON.stringify(진단, null, 1));
    }
    assert.ok(좁은화면.shown < 넓은화면.shown, '좁은 화면에서 겉이 줄지 않았다');
    results.push(`논리 폭 고정: 넓게 ${넓은화면.logical}px / 좁게 ${좁은화면.logical}px, 겉은 ${Math.round(넓은화면.shown)} → ${Math.round(좁은화면.shown)}`);

    // ── 2. 줄인 만큼 자리도 준다 (아래 빈 공간이 안 생긴다) ─────────
    const 겉 = page.locator('[class*="imageCanvasFit"]').first();
    const 자리 = await 겉.evaluate(node => node.getBoundingClientRect().height);
    const 보이는높이 = await canvas.evaluate(node => node.getBoundingClientRect().height);
    assert.ok(Math.abs(자리 - 보이는높이) < 4, `자리(${Math.round(자리)})와 보이는 높이(${Math.round(보이는높이)})가 어긋난다`);
    results.push(`자리 = 보이는 높이: ${Math.round(자리)}px ≈ ${Math.round(보이는높이)}px`);

    // ── 3. 넓은 화면으로 되돌려도 그대로다 ──────────────────────────
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(400);
    const 되돌림 = await canvas.evaluate(node => node.clientWidth);
    assert.equal(되돌림, 460, '되돌린 뒤 논리 폭이 달라졌다');
    results.push('창을 줄였다 늘려도 논리 폭 그대로');

    assert.deepEqual(errors, [], `페이지 오류: ${errors.join(' / ')}`);
    console.log(results.join('\n'));
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
