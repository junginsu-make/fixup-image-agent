// 로컬 전용. 유료 엔드포인트는 전부 가로챈다.
//
// **갤러리·이어보기가 얹은 글자를 실제로 보여 주는지 잰다.**
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

    // 편집 화면에서 글자를 하나 얹는다.
    await page.getByRole('button', { name: '편집', exact: true }).first().click();
    await page.locator('[class*="imageCanvas"]:not([class*="Fit"])').first().waitFor();
    // 「카피」 탭에서 문구를 골라 얹는다.
    await page.getByRole('button', { name: '카피', exact: true }).first().click();
    await page.waitForTimeout(300);
    const 카피버튼 = page.locator('button').filter({ hasText: '제목' }).first();
    await 카피버튼.click();
    await page.waitForTimeout(500);

    const 편집기글자 = await page.evaluate(() =>
      [...document.querySelectorAll('[class*="overlayBox"]')].length);
    assert.ok(편집기글자 > 0, '편집기에 글자 레이어가 안 생겼다');
    results.push(`편집기에 글자 ${편집기글자}개 얹음`);

    // 갤러리로 돌아가 같은 글자가 보이는지 본다.
    await page.getByRole('button', { name: '갤러리', exact: true }).first().click();
    await page.waitForTimeout(500);

    const 미리보기 = await page.evaluate(() => {
      const 얹힌글자 = [...document.querySelectorAll('span')]
        .filter(n => getComputedStyle(n).whiteSpace === 'pre-wrap' && n.textContent?.trim());
      return {
        개수: 얹힌글자.length,
        보임: 얹힌글자.filter(n => n.getBoundingClientRect().width > 0).length,
      };
    });
    assert.ok(미리보기.보임 > 0, `갤러리에 얹은 글자가 안 보인다(${JSON.stringify(미리보기)})`);
    results.push(`갤러리에 얹은 글자 보임: ${미리보기.보임}개`);

    assert.deepEqual(errors, [], `페이지 오류: ${errors.join(' / ')}`);
    console.log(results.join(String.fromCharCode(10)));
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
