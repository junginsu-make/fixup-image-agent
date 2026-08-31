# 전사(Transcribe) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 업로드된 긴 상세페이지를 스트립으로 전사해 리디자인 분석의 사실근거로 주입하고, 추출된 정확 사실을 사용자에게 텍스트로 노출한다.

**Architecture:** 클라이언트가 원본을 고해상 스트립으로 분할 → 배치로 서버 `transcribe-strips` 라우트에 전송 → 읽기전용 모델이 전사 → 클라이언트가 스티칭 → generate 시 전사문을 analyze에 주입 → analyze가 `verified_facts[]` 추출 → 사실중심 섹션 프롬프트 + Results 텍스트에 반영. 순수 로직은 redesign-core(vitest 검증), DOM 글루는 apps/web에 얇게.

**Tech Stack:** TypeScript(ESM, `.js` import 확장자), Next.js App Router, pdfjs-dist(브라우저 canvas), vitest, OpenAI `/responses` + Google `generateContent` fetch.

**설계 근거:** `docs/superpowers/specs/2026-07-24-transcribe-design.md` (2라운드 적대적 검증 완료). 참조 원본: 시블링 리포 `C:\Users\PC\Desktop\coding\pdp-maker-30-eval\lib\pdp-server\pdp.service.ts`.

## Global Constraints

- ESM 패키지: redesign-core는 `"type":"module"` — 내부 import는 `.js` 확장자 사용(`./errors.js`).
- 커밋 author: `Jung_insu <9843ohs@gmail.com>` (`git -c user.name=... -c user.email=...`).
- 브랜드명 규칙 유지: 프롬프트에 "한이룸/HANEERUM/HR"을 제품명으로 쓰지 말 것(기존 generate.ts 규칙 보존).
- 전사 상한: `MAX_TRANSCRIBE_STRIPS_PER_BATCH=8`, `MAX_LONG_PAGE_TRANSCRIPT_CHARS=60_000`, `MAX_TRANSCRIBE_STRIPS_TOTAL=40`, `MAX_TRANSCRIBE_PDF_PAGES=20`, 스트립 폭 1600~2048px·JPEG q≥0.85·높이 2048~2560px, 배치 바이트 상한 ~10MB, 캔버스 ≤16000px.
- 읽기전용 모델: OpenAI=`ANALYSIS_MODEL`(gpt-5.5, 기존 상수), Google=`GOOGLE_READING_MODEL="gemini-3.1-pro-preview"`(신규). 이미지 생성 모델(`gemini-3.1-flash-image-preview`)을 전사/분석에 쓰지 않는다.
- graceful degradation: 전사 실패는 절대 생성을 막지 않는다(transcript 생략 후 기존 경로).
- 인증: 전사 라우트는 `authenticateApiMember()`만(이미지 쿼터 미차감).

---

## File Structure

**생성:**
- `packages/redesign-core/src/transcribe-batching.ts` — 순수 배치/스티칭/캐시키 (DOM 무관)
- `packages/redesign-core/src/transcribe-batching.test.ts`
- `packages/redesign-core/src/transcribe.ts` — 전사 엔진(모델 호출·프롬프트·파싱·타입)
- `packages/redesign-core/src/transcribe.test.ts`
- `apps/web/app/api/redesign/transcribe-strips/route.ts` — 전사 API 라우트
- `apps/web/app/redesign/transcribe-client.ts` — 클라이언트 분할·오케스트레이션
- `apps/web/public/pdf.worker.min.mjs` — 로컬 pdfjs 워커(번들)
- `.github/workflows/ci.yml` — PR 트리거 test 잡

**수정:**
- `packages/redesign-core/src/index.ts` — transcribe export 추가
- `packages/redesign-core/src/generate.ts` — transcript 주입·verified_facts·읽기모델 라우팅·buildSections
- `packages/redesign-core/package.json` — `"test":"vitest run"`
- `package.json`(루트) — `"test":"pnpm -r test"`
- `apps/web/app/api/redesign/generate/route.ts` — transcript form 필드 전달
- `apps/web/app/redesign/redesign-wizard.tsx` — 전사 결선·진행 UX·Results 원문근거·워커 로컬화

---

## Phase A — redesign-core 순수 로직 + 전사 엔진

### Task 1: vitest 배선 (redesign-core + 루트)

**Files:**
- Modify: `packages/redesign-core/package.json`
- Modify: `package.json` (루트)
- Create: `packages/redesign-core/vitest.config.ts`

**Interfaces:**
- Produces: `pnpm --filter @fixup/redesign-core test` 및 `pnpm -r test`가 vitest를 구동.

- [ ] **Step 1: redesign-core package.json에 test 스크립트 추가**

`packages/redesign-core/package.json`의 `"scripts"`를 다음으로:
```json
"scripts": { "typecheck": "tsc --noEmit", "test": "vitest run" }
```

- [ ] **Step 2: vitest 설정 생성**

`packages/redesign-core/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", include: ["src/**/*.test.ts"] } });
```

- [ ] **Step 3: 루트 package.json에 test 팬아웃 추가**

루트 `package.json`의 `"scripts"`에 추가:
```json
"test": "pnpm -r test"
```

- [ ] **Step 4: 스모크 — 빈 실행 확인**

Run: `pnpm --filter @fixup/redesign-core test`
Expected: "No test files found" (또는 0 tests) — vitest가 정상 기동하면 성공.

- [ ] **Step 5: Commit**
```bash
git add packages/redesign-core/package.json packages/redesign-core/vitest.config.ts package.json
git commit -m "chore(redesign-core): vitest 배선 (패키지+루트 test 스크립트)"
```

---

### Task 2: 순수 배치/스티칭/캐시키

**Files:**
- Create: `packages/redesign-core/src/transcribe-batching.ts`
- Test: `packages/redesign-core/src/transcribe-batching.test.ts`

**Interfaces:**
- Produces:
  - `type RedesignStrip = { base64: string; mimeType: string; yStartRatio: number; yEndRatio: number }`
  - `planTranscribeBatches(strips: RedesignStrip[], opts?: { maxPerBatch?: number; maxBase64Chars?: number }): RedesignStrip[][]`
  - `stitchTranscripts(parts: { transcript: string | null; batchIndex: number }[]): string`
  - `buildStripsCacheKey(strips: RedesignStrip[]): string`

- [ ] **Step 1: Write the failing tests**

`packages/redesign-core/src/transcribe-batching.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { planTranscribeBatches, stitchTranscripts, buildStripsCacheKey, type RedesignStrip } from "./transcribe-batching.js";

const strip = (n: number, chars = 10): RedesignStrip => ({
  base64: "a".repeat(chars), mimeType: "image/jpeg",
  yStartRatio: n / 10, yEndRatio: (n + 1) / 10,
});

describe("planTranscribeBatches", () => {
  it("closes a batch at maxPerBatch", () => {
    const batches = planTranscribeBatches(Array.from({ length: 5 }, (_, i) => strip(i)), { maxPerBatch: 2, maxBase64Chars: 1e9 });
    expect(batches.map((b) => b.length)).toEqual([2, 2, 1]);
  });
  it("closes a batch when the byte cap would be exceeded", () => {
    const batches = planTranscribeBatches([strip(0, 100), strip(1, 100), strip(2, 100)], { maxPerBatch: 8, maxBase64Chars: 150 });
    expect(batches.map((b) => b.length)).toEqual([1, 1, 1]);
  });
  it("keeps an over-cap single strip as its own batch", () => {
    const batches = planTranscribeBatches([strip(0, 500)], { maxPerBatch: 8, maxBase64Chars: 100 });
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(1);
  });
  it("returns [] for empty input", () => {
    expect(planTranscribeBatches([])).toEqual([]);
  });
});

describe("stitchTranscripts", () => {
  it("joins in order", () => {
    const out = stitchTranscripts([{ transcript: "A", batchIndex: 0 }, { transcript: "B", batchIndex: 1 }]);
    expect(out.indexOf("A")).toBeLessThan(out.indexOf("B"));
  });
  it("inserts a visible marker for a failed batch", () => {
    const out = stitchTranscripts([{ transcript: "A", batchIndex: 0 }, { transcript: null, batchIndex: 1 }]);
    expect(out).toContain("전사 실패");
    expect(out).toContain("2");
  });
});

describe("buildStripsCacheKey", () => {
  it("is stable for identical strips and differs otherwise", () => {
    const a = [strip(0), strip(1)];
    expect(buildStripsCacheKey(a)).toBe(buildStripsCacheKey([strip(0), strip(1)]));
    expect(buildStripsCacheKey(a)).not.toBe(buildStripsCacheKey([strip(0)]));
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @fixup/redesign-core test`
Expected: FAIL — cannot find module `./transcribe-batching.js`.

- [ ] **Step 3: Implement**

`packages/redesign-core/src/transcribe-batching.ts`:
```ts
export type RedesignStrip = {
  base64: string;
  mimeType: string;
  yStartRatio: number;
  yEndRatio: number;
};

const DEFAULT_MAX_PER_BATCH = 8;
const DEFAULT_MAX_BASE64_CHARS = 10_000_000; // ~10MB; EC2엔 413 한도 없음(스펙 §4.2)

export function planTranscribeBatches(
  strips: RedesignStrip[],
  opts: { maxPerBatch?: number; maxBase64Chars?: number } = {}
): RedesignStrip[][] {
  const maxPerBatch = opts.maxPerBatch ?? DEFAULT_MAX_PER_BATCH;
  const maxBase64Chars = opts.maxBase64Chars ?? DEFAULT_MAX_BASE64_CHARS;
  const batches: RedesignStrip[][] = [];
  let current: RedesignStrip[] = [];
  let currentChars = 0;

  for (const strip of strips) {
    const chars = strip.base64.length;
    const full = current.length >= maxPerBatch || (current.length > 0 && currentChars + chars > maxBase64Chars);
    if (full) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(strip);
    currentChars += chars;
  }
  if (current.length) batches.push(current);
  return batches;
}

export function stitchTranscripts(parts: { transcript: string | null; batchIndex: number }[]): string {
  return parts
    .slice()
    .sort((a, b) => a.batchIndex - b.batchIndex)
    .map((part) =>
      part.transcript && part.transcript.trim()
        ? part.transcript.trim()
        : `[구간 전사 실패 — ${part.batchIndex + 1}번째 배치]`
    )
    .join("\n\n");
}

export function buildStripsCacheKey(strips: RedesignStrip[]): string {
  const first = strips[0]?.base64 ?? "";
  const last = strips[strips.length - 1]?.base64 ?? "";
  const totalChars = strips.reduce((sum, s) => sum + s.base64.length, 0);
  return [strips.length, totalChars, first.length, first.slice(-80), last.length, last.slice(-80)].join(":");
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @fixup/redesign-core test`
Expected: PASS (all in this file).

- [ ] **Step 5: Commit**
```bash
git add packages/redesign-core/src/transcribe-batching.ts packages/redesign-core/src/transcribe-batching.test.ts
git commit -m "feat(redesign-core): 전사 배치/스티칭/캐시키 순수 로직 + 테스트"
```

---

### Task 3: 전사 엔진 (프롬프트·모델 호출·파싱)

**Files:**
- Create: `packages/redesign-core/src/transcribe.ts`
- Test: `packages/redesign-core/src/transcribe.test.ts`

**Interfaces:**
- Consumes: `RedesignStrip` from `./transcribe-batching.js`, `RedesignError` from `./errors.js`.
- Produces:
  - `type TranscribeStripsInput = { strips: RedesignStrip[]; batchIndex: number; batchCount: number; previousSectionHint?: string; provider?: string; openaiKey?: string; googleKey?: string }`
  - `type TranscribeStripsResult = { transcript: string; lastSectionType?: string }`
  - `transcribeStrips(input: TranscribeStripsInput): Promise<TranscribeStripsResult>`
  - `buildTranscribeStripsPrompt(strips, batchIndex, batchCount, previousSectionHint?): string` (export for test)
  - `parseTranscriptPayload(raw: string): TranscribeStripsResult` (export for test)
  - const `GOOGLE_READING_MODEL = "gemini-3.1-pro-preview"`

> **Note:** `errors.ts`의 `RedesignError` 생성자 시그니처를 먼저 확인(`new RedesignError(message, status)`)하고 그대로 사용한다. 모델 호출은 generate.ts의 raw `fetch` 스타일(OpenAI `/v1/responses`, Google `generateContent`)을 미러링한다.

- [ ] **Step 1: Write failing tests (pure parts only — no network)**

`packages/redesign-core/src/transcribe.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildTranscribeStripsPrompt, parseTranscriptPayload } from "./transcribe.js";
import type { RedesignStrip } from "./transcribe-batching.js";

const strip = (a: number, b: number): RedesignStrip => ({ base64: "x", mimeType: "image/jpeg", yStartRatio: a, yEndRatio: b });

describe("buildTranscribeStripsPrompt", () => {
  it("includes strip position lines and the fine-print instruction", () => {
    const p = buildTranscribeStripsPrompt([strip(0, 0.1), strip(0.1, 0.2)], 0, 2);
    expect(p).toContain("0.0%");
    expect(p).toContain("성분표");
    expect(p).toContain("(판독불가)");
  });
  it("includes the previous-section hint when provided", () => {
    const p = buildTranscribeStripsPrompt([strip(0, 0.1)], 1, 2, "신뢰요소");
    expect(p).toContain("신뢰요소");
  });
});

describe("parseTranscriptPayload", () => {
  it("parses valid JSON", () => {
    const r = parseTranscriptPayload(JSON.stringify({ transcript: "hello", lastSectionType: "CTA" }));
    expect(r).toEqual({ transcript: "hello", lastSectionType: "CTA" });
  });
  it("throws on invalid JSON", () => {
    expect(() => parseTranscriptPayload("not json")).toThrow();
  });
  it("throws on empty transcript", () => {
    expect(() => parseTranscriptPayload(JSON.stringify({ transcript: "  " }))).toThrow();
  });
  it("trims to 60,000 chars", () => {
    const r = parseTranscriptPayload(JSON.stringify({ transcript: "a".repeat(70_000) }));
    expect(r.transcript.length).toBe(60_000);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @fixup/redesign-core test`
Expected: FAIL — cannot find `./transcribe.js`.

- [ ] **Step 3: Implement engine**

`packages/redesign-core/src/transcribe.ts` (모델 호출부는 generate.ts의 fetch 패턴을 따른다):
```ts
import { RedesignError } from "./errors.js";
import type { RedesignStrip } from "./transcribe-batching.js";

const OPENAI_ANALYSIS_MODEL = process.env.OPENAI_ANALYSIS_MODEL || "gpt-5.5";
export const GOOGLE_READING_MODEL = process.env.GOOGLE_READING_MODEL || "gemini-3.1-pro-preview";
const MAX_TRANSCRIBE_STRIPS_PER_BATCH = 8;
const MAX_LONG_PAGE_TRANSCRIPT_CHARS = 60_000;

export type TranscribeStripsInput = {
  strips: RedesignStrip[];
  batchIndex: number;
  batchCount: number;
  previousSectionHint?: string;
  provider?: string;
  openaiKey?: string;
  googleKey?: string;
  signal?: AbortSignal;
};
export type TranscribeStripsResult = { transcript: string; lastSectionType?: string };

export async function transcribeStrips(input: TranscribeStripsInput): Promise<TranscribeStripsResult> {
  const strips = (input.strips || []).slice(0, MAX_TRANSCRIBE_STRIPS_PER_BATCH);
  if (strips.length === 0) {
    throw new RedesignError("전사할 스트립 이미지가 없습니다.", 400);
  }
  const provider = String(input.provider || "openai") === "google" ? "google" : "openai";
  const apiKey = provider === "google" ? String(input.googleKey || "") : String(input.openaiKey || "");
  if (!apiKey) {
    throw new RedesignError(provider === "google" ? "Google 읽기 모델 API 키가 필요합니다." : "OpenAI API 키가 필요합니다.", 400);
  }
  const batchIndex = Number.isFinite(input.batchIndex) ? Math.max(0, Math.floor(input.batchIndex)) : 0;
  const batchCount = Number.isFinite(input.batchCount) ? Math.max(batchIndex + 1, Math.floor(input.batchCount)) : batchIndex + 1;
  const prompt = buildTranscribeStripsPrompt(strips, batchIndex, batchCount, input.previousSectionHint);

  const raw = provider === "google"
    ? await callGoogleReading({ apiKey, prompt, strips, signal: input.signal })
    : await callOpenAiReading({ apiKey, prompt, strips, signal: input.signal });
  return parseTranscriptPayload(raw);
}

export function buildTranscribeStripsPrompt(
  strips: RedesignStrip[], batchIndex: number, batchCount: number, previousSectionHint?: string
): string {
  const stripLines = strips
    .map((s, i) => `- ${i + 1}번째 이미지 = 페이지 세로 ${(s.yStartRatio * 100).toFixed(1)}%~${(s.yEndRatio * 100).toFixed(1)}% 구간`)
    .join("\n");
  const hint = previousSectionHint?.trim()
    ? `이전 배치의 마지막 섹션 유형: ${previousSectionHint.trim().slice(0, 80)} (이 흐름이 첫 구간으로 이어질 수 있습니다.)`
    : "";
  return `당신은 한국 이커머스 상세페이지 전사 전문가입니다. 지금 전달되는 이미지들은 하나의 상품 상세페이지를 위에서 아래로 자른 연속 구간이며, 이번 배치는 전체 ${batchCount}개 중 ${batchIndex + 1}번째입니다.

[구간 위치]
${stripLines}
${hint}

각 구간에 대해 transcript 필드에 아래 형식의 마크다운을 작성하세요.

### 구간 N (세로 X%~Y%)
[전사] 이미지 안의 모든 한국어/영어 텍스트를 빠짐없이 그대로 받아쓰세요. 요약·의역 금지. 작은 글씨(성분표, 주의사항, 인증번호, 시험 수치, 고시정보)도 모두 포함하고, 읽을 수 없는 글자는 (판독불가)로 표시하세요. 구간 경계에서 잘린 문장은 보이는 부분까지만 적고 끝에 (절단)을 붙이세요. 텍스트가 없으면 "(텍스트 없음 — 이미지 연출만)"으로 표시하세요.
[섹션 유형] 후킹 / 문제제기 / 혜택·약속 / 신뢰요소 / 스펙·상세정보 / 비교 / FAQ / CTA·프로모션 / 배송·교환·법정정보 / 기타 중 판정.

규칙:
1. 전사의 완전성이 최우선입니다. 분석·평가보다 받아쓰기가 중요합니다.
2. 가격, 수치, 단위, 브랜드명, 제품명은 보이는 표기 그대로 적으세요. 추측 금지.
3. lastSectionType 필드에는 이번 배치 마지막 구간의 섹션 유형 하나만 적으세요.
반드시 { "transcript": string, "lastSectionType": string } 형태의 JSON만 반환하세요.`;
}

export function parseTranscriptPayload(raw: string): TranscribeStripsResult {
  let parsed: unknown;
  const jsonText = String(raw || "").match(/\{[\s\S]*\}/)?.[0] ?? raw;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new RedesignError(`상세페이지 전사 응답을 해석하지 못했습니다. (${error instanceof Error ? error.message : "invalid json"})`, 502);
  }
  const obj = (parsed || {}) as Record<string, unknown>;
  const transcript = String(obj.transcript ?? "").trim();
  if (!transcript) throw new RedesignError("상세페이지 전사 결과가 비어 있습니다.", 502);
  const lastSectionType = String(obj.lastSectionType ?? "").trim().slice(0, 80);
  return { transcript: transcript.slice(0, MAX_LONG_PAGE_TRANSCRIPT_CHARS), lastSectionType: lastSectionType || undefined };
}

async function callOpenAiReading({ apiKey, prompt, strips, signal }: { apiKey: string; prompt: string; strips: RedesignStrip[]; signal?: AbortSignal }): Promise<string> {
  const content: Array<{ type: "input_text"; text: string } | { type: "input_image"; image_url: string }> = [{ type: "input_text", text: prompt }];
  for (const s of strips) content.push({ type: "input_image", image_url: `data:${s.mimeType};base64,${s.base64}` });
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model: OPENAI_ANALYSIS_MODEL,
      input: [
        { role: "system", content: "You are a meticulous Korean ecommerce detail-page transcriber. Return only valid JSON { transcript, lastSectionType }." },
        { role: "user", content },
      ],
    }),
  });
  const data = await readJson(response);
  if (!response.ok) throw new RedesignError(data?.error?.message || "OpenAI 전사 요청 실패", 502);
  return data.output_text || (data.output?.flatMap((i: any) => i.content || []).map((c: any) => c.text || "").join("\n") ?? "");
}

async function callGoogleReading({ apiKey, prompt, strips, signal }: { apiKey: string; prompt: string; strips: RedesignStrip[]; signal?: AbortSignal }): Promise<string> {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  for (const s of strips) parts.push({ inlineData: { mimeType: s.mimeType, data: s.base64 } });
  parts.push({ text: prompt });
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_READING_MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: "application/json" } }),
  });
  const data = await readJson(response);
  if (!response.ok) throw new RedesignError(data?.error?.message || "Google 전사 요청 실패", 502);
  return data?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text || "";
}

async function readJson(response: Response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { error: { message: text || response.statusText } }; }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @fixup/redesign-core test`
Expected: PASS (prompt + parse tests). (모델 호출부는 네트워크라 단위테스트 제외 — 라이브 검증은 Task 12.)

- [ ] **Step 5: Commit**
```bash
git add packages/redesign-core/src/transcribe.ts packages/redesign-core/src/transcribe.test.ts
git commit -m "feat(redesign-core): 전사 엔진(프롬프트·모델호출·파싱) + 순수 테스트"
```

---

### Task 4: index.ts export

**Files:**
- Modify: `packages/redesign-core/src/index.ts`

**Interfaces:**
- Produces: `@fixup/redesign-core`에서 `transcribeStrips`, `RedesignStrip`, `TranscribeStripsInput`, `TranscribeStripsResult` 사용 가능.

- [ ] **Step 1: export 추가**

`packages/redesign-core/src/index.ts`의 generate export 블록 아래에 추가:
```ts
// transcribe route
export {
  transcribeStrips,
  GOOGLE_READING_MODEL,
  type TranscribeStripsInput,
  type TranscribeStripsResult
} from "./transcribe.js";
export {
  planTranscribeBatches,
  stitchTranscripts,
  buildStripsCacheKey,
  type RedesignStrip
} from "./transcribe-batching.js";
```

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @fixup/redesign-core typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**
```bash
git add packages/redesign-core/src/index.ts
git commit -m "feat(redesign-core): 전사 공개 API export"
```

---

## Phase B — analyze / buildSections 통합 (사실근거 주입)

### Task 5: analyze에 transcript 주입 + verified_facts + 읽기모델 라우팅

**Files:**
- Modify: `packages/redesign-core/src/generate.ts`
- Test: `packages/redesign-core/src/generate.test.ts` (신규)

**Interfaces:**
- Consumes: 기존 `analyzeSource`, `parseMaybeJson`, `GenerateSectionsInput`.
- Produces: `GenerateSectionsInput`에 `transcript?: string`. analyze 결과 객체에 `verified_facts: string[]`(폴백 포함). 신규 export `buildAnalyzePrompt(payload, modelInfo, transcript?)` (테스트용).

> analyze 프롬프트는 현재 `analyzeSource` 내부에 인라인이다. 테스트 가능하도록 프롬프트 문자열 생성을 `buildAnalyzePrompt`로 추출하고 export한다.

- [ ] **Step 1: Write failing tests**

`packages/redesign-core/src/generate.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildAnalyzePrompt } from "./generate.js";

const payload = { request: "", rolloutRequest: "", knowledgeText: "", options: { channel: "스마트스토어", ratio: "9:16", count: 1 } };
const modelInfo = { provider: "openai" as const, label: "OpenAI Image 2.0", id: "gpt-image-2-2026-04-21" };

describe("buildAnalyzePrompt", () => {
  it("injects the transcript block when transcript is present", () => {
    const p = buildAnalyzePrompt(payload, modelInfo, "성분: 나이아신아마이드 2%");
    expect(p).toContain("<상세페이지_전사>");
    expect(p).toContain("나이아신아마이드 2%");
    expect(p).toContain("verified_facts");
  });
  it("omits the transcript block when absent", () => {
    const p = buildAnalyzePrompt(payload, modelInfo, undefined);
    expect(p).not.toContain("<상세페이지_전사>");
  });
  it("trims the transcript to 60,000 chars", () => {
    const p = buildAnalyzePrompt(payload, modelInfo, "a".repeat(70_000));
    expect(p).not.toContain("a".repeat(60_001));
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @fixup/redesign-core test`
Expected: FAIL — `buildAnalyzePrompt` not exported.

- [ ] **Step 3: Implement**

`generate.ts` 변경:
1. `GenerateSectionsInput`에 `transcript?: string;` 추가.
2. `generateSections`에서 `const transcript = String(input.transcript || "").slice(0, 60000);` 후 `analyzeSource`에 전달.
3. 인라인 analyze 프롬프트를 `buildAnalyzePrompt`로 추출·export하고, 전사 블록 + verified_facts 키를 추가:
```ts
export function buildAnalyzePrompt(
  payload: { request: string; rolloutRequest: string; knowledgeText: string; options: { channel: string; ratio: string; count: number } },
  modelInfo: { label: string; id: string },
  transcript?: string
): string {
  const trimmed = String(transcript || "").slice(0, 60_000);
  const transcriptBlock = trimmed
    ? [
        "[원본 상세페이지 카피 인벤토리 — 전사]: 아래는 업로드된 기존 상세페이지에서 실제로 받아쓴 전체 텍스트다. 이 사실 범위 안에서만 재구성하라.",
        "전사에 없는 수치/인증/효능/후기를 새로 만들지 마라. 전사에서 반복 강조된 셀링포인트는 누락하지 마라.",
        "<상세페이지_전사>",
        trimmed,
        "</상세페이지_전사>",
      ].join("\n")
    : "원본 전사: 없음(이미지만으로 추정).";
  return [
    "너는 전환율 중심 CRO 카피라이터 + 상세페이지 UX 디자이너 + 커머스 리서처다.",
    "업로드된 기존 상세페이지와 전사를 근거로 카테고리, USP, 타겟, 전환 저해 요소, 유지할 장점, 리디자인 전략을 한국어 JSON으로 요약하라.",
    "근거 없는 수치/효과/리뷰/인증을 만들지 말고, 위험 표현은 안전하게 완화하라.",
    `판매 채널: ${payload.options.channel}`,
    `추가 요청사항: ${payload.request || "전환율 중심으로 리디자인"}`,
    payload.rolloutRequest ? `히어로 검토 후 나머지 섹션에 반영할 요청: ${payload.rolloutRequest}` : "히어로 검토 후 요청: 없음",
    payload.knowledgeText ? `사용자 사전 지식:\n${payload.knowledgeText.slice(0, 30000)}` : "사용자 사전 지식: 없음",
    transcriptBlock,
    `이미지 생성 모델: ${modelInfo.label} (${modelInfo.id})`,
    "JSON 키: product_inferred, diagnostic_summary, strategy, page_blueprint, compliance_notes, verified_facts.",
    "verified_facts: 전사에서 확인된 정확 사실(인증번호·성분/함량·시험수치·핵심 클레임)을 원문 표기 그대로, 중복 제거해 문자열 배열로. 없으면 빈 배열. 최대 60개.",
  ].join("\n");
}
```
4. `analyzeSource`가 `buildAnalyzePrompt(payload, modelInfo, transcript)`를 쓰도록 수정하고, 프롬프트 인자로 `transcript`를 받게 시그니처 확장.
5. `analyzeSource`의 **폴백 객체**(catch 블록)에 `verified_facts: []` 추가.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @fixup/redesign-core test`
Expected: PASS.

- [ ] **Step 5: 읽기모델 라우팅 — analyzeWithGoogle**

`analyzeWithGoogle`의 모델 URL을 이미지 모델에서 읽기모델로 교체:
```ts
import { GOOGLE_READING_MODEL } from "./transcribe.js";
// ...analyzeWithGoogle 내부 fetch URL:
`https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_READING_MODEL}:generateContent`
```
(이미지 생성 함수 `generateGoogleImage`는 그대로 `GOOGLE_NANO_BANANA_2_MODEL` 유지.)

- [ ] **Step 6: typecheck + Commit**

Run: `pnpm --filter @fixup/redesign-core typecheck` → 0 errors.
```bash
git add packages/redesign-core/src/generate.ts packages/redesign-core/src/generate.test.ts
git commit -m "feat(redesign-core): analyze에 전사 주입·verified_facts·읽기모델 라우팅"
```

---

### Task 6: buildSections에 verified_facts 주입 + "작은 글씨" 규칙 정합화

**Files:**
- Modify: `packages/redesign-core/src/generate.ts`
- Test: `packages/redesign-core/src/generate.test.ts` (추가)

**Interfaces:**
- Consumes: analyze 결과의 `verified_facts`.
- Produces: `buildSections`가 S4/S5 섹션 프롬프트에 facts 블록 포함. `factsForSections(analysis): string[]` 헬퍼(Array.isArray 가드) export.

- [ ] **Step 1: Write failing tests (추가)**

`generate.test.ts`에 추가:
```ts
import { factsForSections } from "./generate.js";

describe("factsForSections", () => {
  it("returns the array when present", () => {
    expect(factsForSections({ verified_facts: ["제2024-1호", "비타민C 500mg"] })).toEqual(["제2024-1호", "비타민C 500mg"]);
  });
  it("returns [] when missing or non-array (fallback/non-JSON path)", () => {
    expect(factsForSections({})).toEqual([]);
    expect(factsForSections({ verified_facts: "oops" })).toEqual([]);
    expect(factsForSections(null)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @fixup/redesign-core test`
Expected: FAIL — `factsForSections` not exported.

- [ ] **Step 3: Implement**

`generate.ts`에 추가 + buildSections 수정:
```ts
export function factsForSections(analysis: unknown): string[] {
  const facts = (analysis as { verified_facts?: unknown })?.verified_facts;
  return Array.isArray(facts) ? facts.filter((f): f is string => typeof f === "string").slice(0, 60) : [];
}
```
`buildSections` 내부, 각 template 프롬프트 조립부에서 S4/S5에 한해 facts 블록과 규칙 완화를 추가:
```ts
const facts = factsForSections(analysis);
const isFactSection = template.id === "S4" || template.id === "S5";
const factsBlock = isFactSection && facts.length
  ? `\n검증된 원본 사실(정확 표기 유지, 이 안에서만 인증/수치 사용):\n${facts.map((f) => `- ${f}`).join("\n")}\n핵심 인증/수치는 읽기 쉬운 정보 패널로 크게 배치한다(이 섹션에 한해 '작은 글씨 회피' 규칙보다 우선).`
  : "";
```
그리고 `promptText` 배열에 `factsBlock`을 append(빈 문자열이면 무영향).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @fixup/redesign-core test`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add packages/redesign-core/src/generate.ts packages/redesign-core/src/generate.test.ts
git commit -m "feat(redesign-core): S4/S5에 verified_facts 주입 + 작은글씨 규칙 정합화"
```

---

## Phase C — API 라우트

### Task 7: transcribe-strips 라우트

**Files:**
- Create: `apps/web/app/api/redesign/transcribe-strips/route.ts`

**Interfaces:**
- Consumes: `transcribeStrips`, `RedesignError` from `@fixup/redesign-core`; `authenticateApiMember` from `../../../../lib/membership/api`; `resolveOpenaiKey`/`resolveGoogleKey` from `../../../../lib/server-keys`.
- Produces: `POST /api/redesign/transcribe-strips` → `{ transcript, lastSectionType? }` | `{ error }`.

- [ ] **Step 1: Implement route** (generate 라우트 에러패턴 미러링)

```ts
import { transcribeStrips, humanizeProviderError, RedesignError } from "@fixup/redesign-core";
import { resolveOpenaiKey, resolveGoogleKey } from "../../../../lib/server-keys";
import { authenticateApiMember } from "../../../../lib/membership/api";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    try {
      const result = await transcribeStrips({
        strips: Array.isArray(body?.strips) ? body.strips : [],
        batchIndex: Number(body?.batchIndex ?? 0),
        batchCount: Number(body?.batchCount ?? 1),
        previousSectionHint: body?.previousSectionHint ? String(body.previousSectionHint) : undefined,
        provider: String(body?.provider || "openai"),
        openaiKey: resolveOpenaiKey(),
        googleKey: resolveGoogleKey(),
        signal: controller.signal,
      });
      return Response.json(result);
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    if (err instanceof RedesignError) return Response.json({ error: err.message }, { status: err.status });
    const message = err instanceof Error ? humanizeProviderError(err.message) : "전사 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
```

> **참고:** `signal`은 Task 3에서 이미 `TranscribeStripsInput`·두 call 함수·fetch에 배선돼 있다. 라우트의 120s `AbortController`가 실제로 모델 fetch를 중단한다(스펙 §4.3 타임아웃).

- [ ] **Step 2: typecheck**

Run: `pnpm --filter web typecheck` (또는 프로젝트의 web typecheck 명령)
Expected: 0 errors.

- [ ] **Step 3: Commit**
```bash
git add apps/web/app/api/redesign/transcribe-strips/route.ts packages/redesign-core/src/transcribe.ts
git commit -m "feat(web): 전사 API 라우트(회원 인증·타임아웃)"
```

---

### Task 8: generate 라우트에 transcript 전달

**Files:**
- Modify: `apps/web/app/api/redesign/generate/route.ts`

- [ ] **Step 1: transcript form 필드 전달**

`generateSections({...})` 호출 인자에 추가:
```ts
transcript: String(form.get("transcript") || ""),
```

- [ ] **Step 2: typecheck + Commit**
```bash
git add apps/web/app/api/redesign/generate/route.ts
git commit -m "feat(web): generate 라우트에 transcript 전달"
```

---

## Phase D — 클라이언트 (분할·오케스트레이션·UI)

### Task 9: transcribe-client.ts (분할 + 오케스트레이션)

**Files:**
- Create: `apps/web/app/redesign/transcribe-client.ts`
- Create: `apps/web/public/pdf.worker.min.mjs` (pdfjs-dist에서 복사)

**Interfaces:**
- Produces:
  - `splitFilesToStrips(files: File[]): Promise<RedesignStrip[]>`
  - `runTranscription(strips: RedesignStrip[], opts: { provider: string; onProgress?: (done: number, total: number) => void; signal?: AbortSignal }): Promise<{ transcript: string | null; failedBatches: number }>`

> 기존 `redesign-wizard.tsx`의 `renderPdfToImages`(L1412)·`cropImageToPngFile`(L1370) 패턴을 미러링한다. **핵심 스펙 준수:** 폭 1600~2048px(다운스케일 금지), JPEG q≥0.85, 높이 ~2048~2560px, PDF는 페이지별 슬라이스(세로 이어붙이기 금지), 캔버스 ≤16000px, 총 스트립 ≤40, PDF 페이지 ≤20, pdfjs 워커는 로컬(`/pdf.worker.min.mjs`).

- [ ] **Step 1: 로컬 워커 배치**

pdfjs-dist 설치 경로에서 워커를 public으로 복사:
```bash
cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs apps/web/public/pdf.worker.min.mjs
```

- [ ] **Step 2: Implement splitFilesToStrips**

`apps/web/app/redesign/transcribe-client.ts` (요지 — 위 상수 준수):
```ts
import { planTranscribeBatches, stitchTranscripts, type RedesignStrip } from "@fixup/redesign-core";

const STRIP_TARGET_WIDTH_MAX = 2048;
const STRIP_TARGET_HEIGHT = 2560;
const MAX_STRIPS_TOTAL = 40;
const MAX_PDF_PAGES = 20;
const JPEG_QUALITY = 0.88;

function canvasToJpegBase64(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY).split(",")[1] ?? "";
}

// 소스 영역(<img> 또는 페이지 캔버스)을 목표폭 유지로 세로 스트립들로 자른다.
function sliceRegionToStrips(
  source: CanvasImageSource, srcW: number, srcH: number,
  pageStartRatio: number, pageEndRatio: number, out: RedesignStrip[]
) {
  const width = Math.min(srcW, STRIP_TARGET_WIDTH_MAX); // 다운스케일만, 업스케일 금지
  const scale = width / srcW;
  const scaledH = srcH * scale;
  const stripPx = STRIP_TARGET_HEIGHT;
  const count = Math.max(1, Math.ceil(scaledH / stripPx));
  for (let i = 0; i < count && out.length < MAX_STRIPS_TOTAL; i += 1) {
    const sY = (srcH / count) * i;
    const sH = i === count - 1 ? srcH - sY : srcH / count;
    const cw = Math.round(width);
    const ch = Math.min(16000, Math.round(sH * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) continue;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(source, 0, sY, srcW, sH, 0, 0, cw, ch);
    const span = pageEndRatio - pageStartRatio;
    out.push({
      base64: canvasToJpegBase64(canvas), mimeType: "image/jpeg",
      yStartRatio: pageStartRatio + span * (i / count),
      yEndRatio: pageStartRatio + span * ((i + 1) / count),
    });
  }
}

export async function splitFilesToStrips(files: File[]): Promise<RedesignStrip[]> {
  const out: RedesignStrip[] = [];
  for (const file of files) {
    if (out.length >= MAX_STRIPS_TOTAL) break;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (isPdf) await splitPdf(file, out);
    else if (file.type.startsWith("image/")) await splitImage(file, out);
  }
  return out;
}

async function splitImage(file: File, out: RedesignStrip[]) {
  const img = await loadImage(file);
  sliceRegionToStrips(img, img.naturalWidth, img.naturalHeight, 0, 1, out);
  URL.revokeObjectURL(img.src);
}

async function splitPdf(file: File, out: RedesignStrip[]) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"; // 로컬 번들
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = Math.min(pdf.numPages, MAX_PDF_PAGES);
  for (let n = 1; n <= pages && out.length < MAX_STRIPS_TOTAL; n += 1) {
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.min(16000, Math.floor(viewport.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    // 페이지별로만 슬라이스(세로 이어붙이기 금지)
    sliceRegionToStrips(canvas, canvas.width, canvas.height, (n - 1) / pages, n / pages, out);
  }
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지 파일을 열 수 없습니다."));
    img.src = URL.createObjectURL(file);
  });
}

export async function runTranscription(
  strips: RedesignStrip[],
  opts: { provider: string; onProgress?: (done: number, total: number) => void; signal?: AbortSignal }
): Promise<{ transcript: string | null; failedBatches: number }> {
  const batches = planTranscribeBatches(strips);
  if (batches.length === 0) return { transcript: null, failedBatches: 0 };
  const parts: { transcript: string | null; batchIndex: number }[] = [];
  let done = 0, failed = 0, prevHint: string | undefined;
  for (let i = 0; i < batches.length; i += 1) {
    try {
      const res = await fetch("/api/redesign/transcribe-strips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strips: batches[i], batchIndex: i, batchCount: batches.length, previousSectionHint: prevHint, provider: opts.provider }),
        signal: opts.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "전사 실패");
      parts.push({ transcript: data.transcript, batchIndex: i });
      prevHint = data.lastSectionType || prevHint;
    } catch {
      parts.push({ transcript: null, batchIndex: i });
      failed += 1;
    }
    done += 1;
    opts.onProgress?.(done, batches.length);
  }
  const stitched = stitchTranscripts(parts);
  return { transcript: failed === batches.length ? null : stitched, failedBatches: failed };
}
```

> **동시성(M1):** MVP는 순차(위). 성능 여유 없으면 이후 2–3 in-flight로 개선(별도 커밋). previousSectionHint는 순차에서만 정확 — 동시화 시 best-effort로 낮춘다.

- [ ] **Step 3: typecheck + Commit**
```bash
git add apps/web/app/redesign/transcribe-client.ts apps/web/public/pdf.worker.min.mjs
git commit -m "feat(web): 클라이언트 스트립 분할·전사 오케스트레이션(로컬 워커)"
```

---

### Task 10: redesign-wizard 결선 (generate 전 전사 + 진행 UX)

**Files:**
- Modify: `apps/web/app/redesign/redesign-wizard.tsx`

- [ ] **Step 1: generate() 안에서 전사 실행**

`generate()`의 업로드 정규화 직후, `/api/redesign/generate` 호출 전에 전사를 실행하고 form에 추가:
```ts
import { splitFilesToStrips, runTranscription } from "./transcribe-client";
// ... form 구성 전:
let transcript: string | null = null;
try {
  setToast("원본 상세페이지를 전사하는 중입니다(작은 글씨까지 확인).");
  const strips = await splitFilesToStrips(files);
  const r = await runTranscription(strips, {
    provider: selectedModel,
    signal: abortController.signal,
    onProgress: (d, t) => setToast(`전사 진행 ${d}/${t} 배치`),
  });
  transcript = r.transcript;
  if (r.failedBatches) setToast(`일부 구간 전사 실패(${r.failedBatches}) — 가능한 범위로 진행합니다.`);
} catch {
  transcript = null; // graceful degradation
}
// ... form.append 목록에 추가:
if (transcript) form.append("transcript", transcript);
```

- [ ] **Step 2: 로컬 지식 PDF 워커도 로컬로(선택 정합)**

기존 `extractPdfText`(L1300)·`renderPdfToImages`(L1412)의 `workerSrc`를 `/pdf.worker.min.mjs`로 통일(unpkg 제거, M2).

- [ ] **Step 3: 수동 검증**

로컬 `pnpm --filter web dev` → `/redesign`에서 긴 상세페이지 업로드 → 콘솔/네트워크에 `/api/redesign/transcribe-strips` 순차 호출·200, generate 요청 form에 `transcript` 포함 확인.

- [ ] **Step 4: Commit**
```bash
git add apps/web/app/redesign/redesign-wizard.tsx
git commit -m "feat(web): generate 전 전사 실행·진행표시·워커 로컬화"
```

---

### Task 11: Results 원문 근거(verified_facts) 노출

**Files:**
- Modify: `apps/web/app/redesign/redesign-wizard.tsx` (Results 컴포넌트)

- [ ] **Step 1: Results에 원문 근거 블록 추가**

`Results`에서 `project.analysis`의 facts를 읽어 노출(가드 포함):
```tsx
const facts = Array.isArray((project?.analysis as any)?.verified_facts)
  ? ((project!.analysis as any).verified_facts as string[])
  : [];
// 렌더:
{facts.length > 0 && (
  <Card>
    <CardHeader><CardTitle>원문 근거(전사에서 추출한 정확 사실)</CardTitle>
      <CardDescription>이미지에 구운 텍스트는 정확도 한계가 있어, 정확 인증번호·수치는 아래 텍스트를 최종 기준으로 삼으세요.</CardDescription>
    </CardHeader>
    <CardContent>
      <ul className="list-disc space-y-1 pl-5 text-sm">{facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
      <Button variant="ghost" size="sm" onClick={() => navigator.clipboard?.writeText(facts.join("\n"))}>사실 목록 복사</Button>
    </CardContent>
  </Card>
)}
```

- [ ] **Step 2: 수동 검증** — 전사 성공 케이스에서 Results에 원문 근거 카드 표시 확인.

- [ ] **Step 3: Commit**
```bash
git add apps/web/app/redesign/redesign-wizard.tsx
git commit -m "feat(web): Results에 원문 근거(verified_facts) 텍스트 노출"
```

---

## Phase E — CI + 라이브 검증

### Task 12: PR 트리거 CI 테스트 + 라이브 전사 검증

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: CI 워크플로우 추가**

`.github/workflows/ci.yml`:
```yaml
name: ci
on:
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.15.9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
      - run: pnpm -r typecheck
```

- [ ] **Step 2: CI 그린 확인**

PR 생성 → `gh pr checks <#>`로 test/typecheck 그린.

- [ ] **Step 3: 라이브 전사 육안 검증 (`.env.local` 키)**

`npx tsx` 스크립트로 실제 스트립 1페이지를 `transcribeStrips`에 통과시켜 전사문에 성분/인증번호가 잡히는지, verified_facts가 추출되는지 확인. (읽기모델 `gemini-3.1-pro-preview`/`gpt-5.5` 접근 확인.)

- [ ] **Step 4: Commit**
```bash
git add .github/workflows/ci.yml
git commit -m "ci: PR 트리거 test/typecheck 잡"
```

---

## 배포 (스펙 §8)

PR CI 그린 → main 병합 → `build-ec2-release.yml` 아티팩트 → AWS Session Manager로 EC2 릴리스 교체(WIP 배포 절차) → health 200 → `/redesign` 라이브 전사 1회 검증.

## 범위 밖 (스펙 §9)
④ expand 2-pass, RAG 채우기, verified_facts 편집 UI, 전사 rate-limit.
