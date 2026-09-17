// Local-only E2E. All paid generation endpoints are intercepted; no provider keys are loaded.
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
  const image = await requireWeb('sharp')({ create: { width: 64, height: 64, channels: 3, background: '#ccaa88' } }).png().toBuffer();
  const base64 = image.toString('base64');
  const section = (id) => ({ section_id: id, section_name: '상품 소개', goal: '소개', headline: '원래 제목', subheadline: '설명', bullets: ['특징'],
    headline_en: '', subheadline_en: '', bullets_en: [], trust_or_objection_line: '', trust_or_objection_line_en: '', CTA: '', CTA_en: '',
    prompt_ko: '제품 사진', prompt_en: 'product in studio', layout_notes: '', compliance_notes: '', image_id: id,
    purpose: '', negative_prompt: '', style_guide: '파랑', reference_usage: '보존' });
  const blueprint = () => ({ executiveSummary: '제품을 소개합니다', scorecard: [], blueprintList: [], sections: [section('S1'), section('S2')] });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const assertions = [];
  try {
    for (const mode of ['image', 'text']) {
      const context = await browser.newContext(); const page = await context.newPage();
      page.setDefaultTimeout(30000);
      const errors = []; const submissions = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', dialog => dialog.accept());
      await page.route('**/api/pdp/**', async route => {
        const path = new URL(route.request().url()).pathname;
        let data = { ok: true, references: [], items: [] };
        if (path.endsWith('/analyze')) data = { ok: true, result: { originalImage: base64, blueprint: blueprint() } };
        if (path.endsWith('/plan-from-text')) data = { ok: true, result: { brief: { offeringName: '강의', offeringKind: 'course', oneLiner: '강의 소개', audience: '직장인', problem: '시간', outcome: '학습', differentiators: [], objections: [], tone: '밝음', assumptions: [], sourceText: '강의' }, blueprint: blueprint() } };
        if (path.endsWith('/key-visual')) data = { ok: true, imageBase64: base64, mimeType: 'image/png' };
        if (path.endsWith('/images/batch')) {
          const body = route.request().postDataJSON(); submissions.push(body);
          data = { ok: true, requested: body.sections.length, succeeded: body.sections.length,
            results: body.sections.map(s => ({ ok: true, sectionId: s.section_id, imageBase64: base64, mimeType: 'image/png' })) };
        }
        await route.fulfill({ json: data });
      });
      await page.goto('http://localhost:3107/create', { waitUntil: 'networkidle' });
      if (mode === 'image') {
        await page.locator('input[type=file]').first().setInputFiles({ name: 'product.png', mimeType: 'image/png', buffer: image });
        await page.getByRole('button', { name: 'AI 분석 시작하기' }).click();
      } else {
        await page.getByRole('button', { name: /텍스트로 시작/ }).click();
        await page.getByPlaceholder(/퇴근 후 집에서 하는/).fill('직장인 대상 강의를 판매합니다');
        await page.getByRole('button', { name: '구성 시나리오 만들기' }).click();
      }
      await page.getByRole('heading', { name: '구성 시나리오를 확인해 주세요' }).waitFor();
      await page.locator('article').first().locator('textarea').nth(1).fill(`${mode} 수정 제목`);
      await page.getByRole('button', { name: '섹션 추가', exact: true }).click();
      await page.getByPlaceholder('어떤 장면을 만들지 한국어로 적어주세요.').last().fill('눈 덮인 산 위의 제품');
      await page.getByRole('button', { name: '대표 이미지 만들기', exact: true }).click();
      if (mode === 'text') await page.getByRole('button', { name: '이걸로 섹션 만들기' }).click();
      await page.getByRole('button', { name: /남은 3장 만들기/ }).click();
      await page.getByText('3 / 3 완료', { exact: true }).waitFor();
      assert.equal(submissions[0].sections[0].headline, `${mode} 수정 제목`);
      assert.match(submissions.flatMap(b => b.sections).at(-1).prompt_en, /눈 덮인 산/);
      await page.getByRole('button', { name: /02 구성 확인/ }).click();
      assert.equal(await page.locator('article').first().locator('textarea').nth(1).inputValue(), `${mode} 수정 제목`);
      await page.locator('article').first().locator('textarea').nth(1).fill(`${mode} 다시 수정`);
      await page.getByRole('button', { name: '대표 이미지 만들기', exact: true }).click();
      await page.getByRole('button', { name: '작업 저장하기', exact: true }).click();
      const id = await page.evaluate(async () => {
        for (let attempt = 0; attempt < 30; attempt++) {
          const docs = await new Promise(resolve => {
            const req = indexedDB.open('hanirum-pdp-documents', 1);
            req.onsuccess = () => { const db = req.result; const get = db.transaction('documents').objectStore('documents').getAll(); get.onsuccess = () => { db.close(); resolve(get.result); }; };
          });
          if (docs.length) return docs.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))[0].id;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error('document not saved');
      });
      await page.goto(`http://localhost:3107/create?draft=${id}`, { waitUntil: 'networkidle' });
      await page.getByText('3 / 3 완료', { exact: true }).waitFor();
      await page.getByRole('button', { name: /02 구성 확인/ }).click();
      assert.equal(await page.locator('article').first().locator('textarea').nth(1).inputValue(), `${mode} 다시 수정`);
      if (mode === 'text') {
        await page.getByRole('button', { name: /01 텍스트 입력/ }).click();
        assert.equal(await page.getByPlaceholder(/퇴근 후 집에서 하는/).inputValue(), '직장인 대상 강의를 판매합니다');
      }
      assert.deepEqual(errors, []);
      assertions.push(`${mode}: input -> edit/add -> generate -> back/edit -> v3 save/reload PASS`);
      await context.close();
    }
    console.log(assertions.join('\n'));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
