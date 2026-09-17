// Explicit W3 live gate: synthetic fixtures only, no image generation or database writes.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = path.resolve(__dirname, '../../..');
process.loadEnvFile(path.resolve(root, '../../apps/web/.env.local'));
const originalLoad = Module._load;
Module._load = function (id, ...args) { return id === 'server-only' ? {} : originalLoad.call(this, id, ...args); };
const requireWeb = Module.createRequire(path.join(root, 'apps/web/package.json'));
const { createPdpProviders } = require(path.join(root, 'apps/web/lib/pdp/providers.ts'));
const { withLlmMeter, readLlmMeter } = require(path.join(root, 'apps/web/lib/llm/meter.ts'));
const { analyzeProduct, planFromText } = require(path.join(root, 'packages/pdp-core/src/index.ts'));

(async () => {
  const svg = '<svg width="256" height="384" xmlns="http://www.w3.org/2000/svg"><rect width="256" height="384" fill="white"/><rect x="90" y="35" width="76" height="40" rx="8" fill="#111"/><rect x="65" y="70" width="126" height="265" rx="25" fill="#245bba"/><rect x="78" y="170" width="100" height="60" rx="5" fill="white"/><text x="100" y="208" font-size="22">TEST</text></svg>';
  const image = await requireWeb('sharp')(Buffer.from(svg)).png().toBuffer();
  const summaries = [], results = {};
  for (const mode of ['image', 'text']) {
    const providers = createPdpProviders(process.env);
    // Planning must never create a paid image in this verification.
    providers.generateImage = async () => { throw new Error('unexpected_image_generation'); };
    const started = Date.now();
    try {
      await withLlmMeter(async () => {
        const result = mode === 'image'
          ? await analyzeProduct({ imageBase64: image.toString('base64'), mimeType: 'image/png', aspectRatio: '3:4', outputMode: 'full-image',
              sellerBrief: { audience: '출퇴근에 물병을 챙기는 직장인', features: '검증용 가상 제품. 파란 몸체, 검은 뚜껑, TEST 라벨.', emphasis: '실제 판매용이 아닌 기획 검증 시안' }, gapPolicy: 'omit' }, providers, { skipFirstImage: true })
          : await planFromText({ text: '직장인을 위한 온라인 문서 작성 강의. 구성은 주제 정리, 목차 작성, 문장 다듬기입니다. 구매 목적의 상세페이지 시안을 만들되 후기나 성과 숫자는 만들지 마세요. 실제 판매가 아닌 검증용 입력입니다.', aspectRatio: '3:4', outputMode: 'full-image', gapPolicy: 'omit' }, providers);
        results[mode] = result;
        const planning = providers.llm.executions.filter(entry => entry.purpose === 'planning');
        const passed = result.blueprint.sections.length > 0 && planning.length > 0 && planning.every(entry => entry.model === 'claude-fable-5' && !entry.fallbackFrom);
        const summary = { mode, passed, sectionCount: result.blueprint.sections.length, planning, meter: readLlmMeter(), elapsedMs: Date.now() - started };
        summaries.push(summary); console.log(JSON.stringify(summary));
      });
    } catch (error) {
      const summary = { mode, passed: false, errorType: error.name, code: error.code ?? error.status ?? null, elapsedMs: Date.now() - started };
      summaries.push(summary); console.log(JSON.stringify(summary));
    }
  }
  fs.writeFileSync(path.join(__dirname, 'w3-live-planning-results.json'), JSON.stringify({ fixtureOnly: true, summaries, results }, null, 2));
  if (summaries.some(summary => !summary.passed)) process.exitCode = 1;
})().catch(error => { console.log(JSON.stringify({ errorType: error.name, status: error.status ?? null })); process.exitCode = 1; });
