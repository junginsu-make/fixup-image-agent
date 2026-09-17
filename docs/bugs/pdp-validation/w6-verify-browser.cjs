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
    await page.getByRole('button', { name: '편집', exact: true }).first().click();
    await page.locator('[class*="imageCanvas"]:not([class*="Fit"])').first().waitFor();
    await page.getByRole('button', { name: '카피', exact: true }).first().click();
    await page.waitForTimeout(300);
    await page.locator('button').filter({ hasText: '제목' }).first().click();
    await page.waitForTimeout(500);

    // ── B-10: 그림자 blur 가 화면과 내보내기에서 다른가 ──────────────
    //
    // html2canvas 1.4.1 은 blur 에 scale 을 안 곱한다는 지적이었다. 지금은
    // 그림자 기본이 꺼져 있으므로(shadowEnabled: false) **기본 설정에서는
    // 나타나지 않는다.** 실제로 그런지 잰다.
    const 그림자 = await page.evaluate(() => {
      const 레이어 = document.querySelector('[class*="overlayBox"] span');
      return 레이어 ? getComputedStyle(레이어).textShadow : null;
    });
    results.push(`B-10 기본 설정의 글자 그림자: ${그림자 === 'none' || !그림자 ? '없음(해당 없음)' : 그림자}`);

    // ── B-12-e: object-fit 이 무시되어 찌그러지는가 ─────────────────
    //
    // 내보내기 노드의 높이를 원본 비율로 계산하므로 `cover` 가 무시돼도
    // 결과가 같다는 지적이었다. 실제 비율을 잰다.
    const 비율 = await page.evaluate(() => {
      const img = document.querySelector('[class*="sectionImage"]');
      if (!img) return null;
      const box = img.getBoundingClientRect();
      return { 화면비: box.width / box.height, 원본비: img.naturalWidth / img.naturalHeight };
    });
    const 찌그러짐 = 비율 ? Math.abs(비율.화면비 - 비율.원본비) : null;
    results.push(`B-12-e 화면 비율 ${비율?.화면비.toFixed(3)} vs 원본 ${비율?.원본비.toFixed(3)} → 차이 ${찌그러짐?.toFixed(4)}`);
    assert.ok(찌그러짐 !== null && 찌그러짐 < 0.01, 'B-12-e: 화면에서 이미 찌그러진다');

    // ── B-12-f: pre-wrap 이 실제로 적용되는가 ───────────────────────
    const 줄바꿈 = await page.evaluate(() => {
      const 레이어 = document.querySelector('[class*="overlayBox"] span');
      return 레이어 ? getComputedStyle(레이어).whiteSpace : null;
    });
    results.push(`B-12-f 글자 상자의 whiteSpace: ${줄바꿈}`);

    assert.deepEqual(errors, [], `페이지 오류: ${errors.join(' / ')}`);
    console.log(results.join(String.fromCharCode(10)));
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
