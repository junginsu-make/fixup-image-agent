# 전사(Transcribe) 설계 v2 — 리디자인 롱페이지 사실근거 파이프라인

- 작성일: 2026-07-24 (v2 — 3-리뷰어 적대적 검증 반영)
- 대상 영역: `/redesign`, 코어 패키지 `packages/redesign-core`
- 범위(확정): **전사 → 사실추출 → 사실 주입/노출 파이프라인.** ④ expand(2-pass 전체)는 별도 페이즈.
- 참조 원본: `pdp-maker-30-eval`(한이룸 v3.0).

> **v2 개정 이유:** v1 초안을 독립 리뷰어 3명(통합/실현성/효능)이 적대적으로 검증한 결과, v1 그대로는 **목표(깨알 사실 보존)를 달성하지 못함**이 드러났다. 사실이 2,400자 요약 단계에서 잘려나가고, 최종 산출물(이미지에 구운 텍스트)은 정확한 인증번호를 렌더하지 못하며, 프롬프트가 오히려 "작은 글씨를 피하라"고 지시한다. v2는 이 사슬을 **사실이 끝까지 살아남도록** 재설계한다. (반영 목록은 §10.)

---

## 1. 배경과 목적

### 문제 (코드로 확인됨)
현재 리디자인 분석(`redesign-core/generate.ts`)은 업로드 자료를 **참조 이미지 최대 4장**으로 축소해 분석 모델에 "눈으로 보게" 넘긴다(`renderImageToReferenceFiles`는 긴 이미지를 최대 4조각·1200×1800 축소, `renderPdfToImages`는 4쪽, `MAX_REFERENCE_IMAGES=4`). → 긴 상세페이지의 작은 글씨(성분·주의사항·인증번호·시험수치·고시정보)를 **놓치거나 환각**한다.

### 목적과 정직한 효능 경계 (중요)
전사는 원본의 **모든 텍스트를 그대로 받아쓴 뒤, 규제·근거성 사실을 구조화 추출**해 리디자인이 **사실을 지어내지도, 핵심 셀링포인트를 빠뜨리지도 않게** 한다.

단, 최종 산출물은 **이미지에 텍스트가 구워진 형태**이고, 이미지 생성 모델(gpt-image-2 / gemini image)은 **정확한 한글 인증번호·수치 문자열을 신뢰성 있게 렌더하지 못한다.** 따라서 이 기능의 정직한 효능 경계는:

- ✅ **달성:** 분석·전략이 사실에 근거 → 환각 감소, 핵심 근거/셀링포인트 누락 감소, 톤·구성 개선.
- ✅ **달성:** 추출된 정확 사실을 **사용자에게 신뢰 가능한 텍스트("원문 근거")로 노출** → 사용자가 이미지에 최종 반영/교정 가능.
- ⚠️ **한계(구조적):** 이미지에 구워진 정확 인증번호/수치의 **픽셀 정확도는 보장 못함.** 그래서 정확 사실은 픽셀이 아니라 텍스트 채널로도 함께 전달한다.

---

## 2. 처리 흐름 (End-to-End)

```
업로드(이미지/PDF)
  → ① [브라우저] 원본을 세로 스트립으로 분할 (고해상 유지: 폭 1600~2048px, JPEG q≥0.85, 위치% 메타)
  → ② [브라우저] 스트립을 배치로 나눠 전사 요청(제한된 동시성, 취소 가능)
  → ③ [서버] 배치마다 읽기전용 모델로 "빠짐없이 그대로 받아쓰기" → { transcript, lastSectionType }
  → ④ [브라우저] 배치 전사문 스티칭(연속성 힌트 best-effort), 실패 배치 명시 마커, 완성분 캐시
  → ⑤ [서버·generate] 전사문(최대 60,000자)을 읽기전용 모델 analyze에 주입
         → analyze가 { …기존 키…, verified_facts[] } 산출 (정확 사실을 구조화 추출)
  → ⑥ [서버·buildSections] verified_facts를 사실중심 섹션(S4·S5) 프롬프트에 2,400자 예산과 별개로 주입
  → ⑦ [브라우저·Results] verified_facts를 "원문 근거" 텍스트 블록으로 사용자에게 노출
```

전사는 **기존 4장-참조 경로와 별개의 새 전(前)단계**다. generate 요청에는 전사문 + 기존 참조 이미지가 **함께** 전달(보강).

---

## 3. 아키텍처 결정 (근거 포함)

| 결정 | 선택 | 근거 |
|---|---|---|
| 스트립 분할 위치 | **클라이언트 canvas/pdfjs** | 현재 redesign-wizard가 이미 브라우저 pdfjs/canvas 사용(redesign-wizard.tsx:1301). **v3.0은 서버 sharp로 스트립 준비**(시블링 리포 `C:\Users\PC\Desktop\coding\pdp-maker-30-eval\lib\pdp-server\pdp.service.ts` — line 2 `import sharp`, 2301/2323 `sharp(buffer)…`; 전체 4407줄. ⚠️ Detail Page 리포 내부 `.refs/`가 아니라 시블링 경로임)했으나, 여기선 sharp 서버 의존 추가 없이 클라이언트로 이식 → EC2 standalone과 충돌 회피 |
| 전사 ↔ 분석 관계 | **보강(augment)** | 전사문(텍스트) + 대표 참조 이미지 병행 |
| 실패 처리 | **graceful degradation** | 전사 전부 실패해도 기존 이미지-only 분석으로 폴백 → 생성은 항상 진행 |
| 순수 로직 배치 | **redesign-core** | 배치 경계·스티칭·정규화는 DOM 무관 순수 함수 → vitest 검증. canvas/pdfjs 글루만 apps/web에 얇게 |
| 정확 사실 전달 | **텍스트 채널 + 이미지(best-effort)** | 이미지 모델의 정확 문자열 렌더 한계 때문에, verified_facts를 사용자 노출 텍스트로 보장 |

---

## 4. 컴포넌트 상세

### 4.1 redesign-core: 전사 엔진 (신규 `src/transcribe.ts`)

`export async function transcribeStrips(input: TranscribeStripsInput): Promise<TranscribeStripsResult>`

- 입력 검증(빈 스트립 → `RedesignError(400)`), 배치당 스트립 수 `MAX_TRANSCRIBE_STRIPS_PER_BATCH`(=8) 상한.
- 전사 프롬프트(`buildTranscribeStripsPrompt`, v3.0 이식): 각 스트립 `yStart%~yEnd%` 위치 명시 + "모든 한/영 텍스트 빠짐없이 그대로. 요약·의역 금지. 작은 글씨(성분표·주의사항·인증번호·시험수치·고시정보) 포함. 판독불가 `(판독불가)`, 절단 `(절단)`, 텍스트 없음 `(텍스트 없음 — 이미지 연출만)`." + `previousSectionHint` 연속성.
- **모델(R1 수정):** 전사는 **읽기전용 모델**로 호출. OpenAI = `ANALYSIS_MODEL`(gpt‑5.5). Google = **신규 상수 `GOOGLE_READING_MODEL = "gemini-3.1-pro-preview"`**(이미지 생성용 `gemini-3.1-flash-image-preview` 아님). 사용자의 googleKey로 접근 실패 시 명시 오류 후 전사 스킵(폴백).
- 응답 파싱(`parseTranscriptPayload`): JSON 파싱 실패/빈 transcript → `RedesignError`. 배치 응답 transcript는 `MAX_LONG_PAGE_TRANSCRIPT_CHARS`(=**60,000**)로 트리밍. (v1의 14,000은 v3.0 expand 전용 상한 오이식이었음 — 정정.)
- `index.ts`에 `transcribeStrips` + 타입 export.

**타입**
```ts
export type RedesignStrip = { base64: string; mimeType: string; yStartRatio: number; yEndRatio: number };
export type TranscribeStripsInput = {
  strips: RedesignStrip[]; batchIndex: number; batchCount: number;
  previousSectionHint?: string; provider?: string; openaiKey?: string; googleKey?: string;
};
export type TranscribeStripsResult = { transcript: string; lastSectionType?: string };
```

### 4.2 redesign-core: 순수 배치/스티칭 (신규 `src/transcribe-batching.ts`)

DOM 무관 순수 함수 → 클라이언트 import + vitest.

- `planTranscribeBatches(strips, { maxPerBatch=8, maxBase64Chars })`: 그리디 배치(개수 또는 누적 base64 초과 시 종료). **maxBase64Chars는 v3.0의 2.6MB가 아니라 크게(약 8–12MB)** — H1 참조(EC2엔 413 한도 없음). 단일 스트립이 상한 초과여도 단독 배치 허용.
- `stitchTranscripts(parts)`: 순서 보존, 실패 배치는 `[구간 전사 실패 — N번째 배치]` 마커(유실 은폐 금지).
- `buildStripsCacheKey(strips)`: 스트립 수 + 총 길이 + 첫/끝 tail. 완성 전사문 캐시 키.

### 4.3 apps/web: 전사 API 라우트 (신규 `app/api/redesign/transcribe-strips/route.ts`)

- `runtime="nodejs"`, `maxDuration=300`(EC2에선 no-op — H2에 따라 실제 상한은 코드 타임아웃으로).
- **인증: `authenticateApiMember()`**(로그인·이메일확인·승인). **`reserveAiUsage` 미호출 → 이미지 쿼터 미차감.**
- 서버 키 주입 후 `transcribeStrips` 호출. 에러 매핑: `RedesignError.status` 그대로, 그 외 500 + `humanizeProviderError`(generate 라우트 동일 패턴).
- **타임아웃(H2):** 모델 fetch에 `AbortController`(약 90–120s). 현재 generate.ts의 provider fetch는 timeout이 없어 무한 대기 가능 — 전사 라우트는 이를 반복하지 않는다.
- **남용 방어:** 인증 + 스트립 수 상한 + 캐시. (추후 필요 시 analyze식 시간당 rate-limit 추가 — 현재 미포함, §9 범위 밖.)

### 4.4 apps/web: 클라이언트 분할·오케스트레이션 (`redesign/transcribe-client.ts` 신규 + `redesign-wizard.tsx` 결선)

- `splitFilesToStrips(files): Promise<RedesignStrip[]>`
  - **해상도(C1 수정):** 스트립 폭 **1600~2048px 유지**(원본이 그보다 작으면 업스케일 금지, 크면 2048 상한). **소스보다 다운스케일 금지** — 다운스케일은 한글 깨알(신뢰 OCR ~≥20px 자간)을 뭉개 목적 자체를 무력화. JPEG **품질 ≥0.85**.
  - **스트립 높이(NEW-4):** 목표 높이 **~2048~2560px OCR 청크**로 고정 슬라이스(경계는 §4.1 `previousSectionHint`/`(절단)` 표기로 처리). 높이를 정해야 배치 바이트 산술이 결정적이 됨. **2048px 폭에선 배치 상한이 개수(8)가 아니라 바이트(8–12MB)에 먼저 걸림**(2048×2560×q0.85 ≈ 스트립당 ~2–3MB base64 → 배치당 실질 3–4장). `planTranscribeBatches`는 `min(개수, 바이트)`로 닫고, 어떤 단일 스트립도 16,000px·모델 입력 한도 초과 금지.
  - **PDF(C2 수정):** pdfjs로 **페이지별로 렌더 후 페이지 단위로 슬라이스**. **여러 페이지를 하나의 세로 캔버스로 이어붙이지 않는다**(브라우저 캔버스 ~16,384px 초과 시 무경고 blank). 어떤 중간 캔버스도 ~16,000px 초과 금지 가드. 전사용 페이지 상한 `MAX_TRANSCRIBE_PDF_PAGES`(현행 4쪽보다 크게, 예: 20).
  - **이미지:** 기존 `cropImageToPngFile` 패턴(소스 `<img>` 하위영역을 소형 캔버스로 draw) 재사용 — 큰 캔버스 회피. (L1: iOS Safari는 대형 소스 `<img>` 디코드를 무경고 서브샘플 → 모바일 고해상 경고/텔레메트리 권장.)
  - 총 스트립 수 상한 `MAX_TRANSCRIBE_STRIPS_TOTAL`(예: **40**)로 비용/시간 방어.
  - **pdfjs 워커(M2):** 현재 `unpkg.com` CDN(`workerSrc`)은 CSP·네트워크 취약. 워커를 **로컬 번들**(`public/` 또는 `new URL(...,import.meta.url)`)해 동일 오리진 서빙.
- `runTranscription(strips)`:
  - `planTranscribeBatches` → `/api/redesign/transcribe-strips`에 POST. **제한된 동시성(2–3 in-flight)** 허용, `previousSectionHint`는 **best-effort**(M1 — 엄격 직렬 의존을 풀어 벽시계 2–3배 단축). 각 POST에 클라이언트 `AbortController`.
  - `stitchTranscripts`로 합침, `buildStripsCacheKey` 캐시 재사용.
  - **진행 UX:** 실제 배치 진행 표시 + **취소 가능**(수 분 무응답 금지). 기존 `GenerationProgressPanel` 확장.
- `generate()` 수정: 생성 직전 `runTranscription` 실행 → 성공 시 form에 `transcript` 추가, 실패 시 생략(폴백).

### 4.5 redesign-core: analyze — 사실추출 (`generate.ts` 수정)

- `GenerateSectionsInput`에 `transcript?: string` 추가. 라우트에서 `form.get("transcript")` 전달.
- **모델(R1 수정):** 전사문을 **소비**하는 analyze도 읽기전용 모델로. `analyzeWithGoogle`이 현재 이미지 모델(`GOOGLE_NANO_BANANA_2_MODEL`)을 쓰는 문제 → analyze는 `GOOGLE_READING_MODEL` 사용(이미지 생성만 image 모델 유지).
- `analyzeSource` 프롬프트: 전사 블록 주입(≤60,000자) + **analyze의 역할을 "사실 추출 + 전략"으로 재정의**:
  ```
  [원본 상세페이지 카피 인벤토리 — 전사] … <상세페이지_전사>…</상세페이지_전사>
  이 사실 범위 안에서만 재구성. 전사에 없는 수치/인증/효능/후기 생성 금지. 반복 강조 셀링포인트 누락 금지.
  ```
- **출력 스키마 확장(R2 핵심):** analyze JSON에 **`verified_facts: string[]`** 추가 — 정확 사실(인증번호·성분/함량·시험수치·핵심 클레임)을 원문 표기 그대로, 중복 제거, ~60줄 상한. (전략 요약이 아니라 별도 사실 목록 채널.)
- **폴백/비JSON 경로 가드(NEW-2):** analyze 실패 시 정적 폴백 객체(generate.ts:264-271)와 `parseMaybeJson`의 비JSON 반환(`{summary}`)에는 `verified_facts`가 **없다** → 소비처가 `undefined`를 만난다. 조치: **폴백 객체에 `verified_facts: []` 기본값 추가** + 모든 소비처(§4.6·§4.7)에서 `Array.isArray(analysis?.verified_facts) ? … : []`로 강제. 비JSON으로 사실추출이 통째 실패하면 §4.7에 **"근거 추출 실패"** 상태를 표시(전사 원칙 "유실 은폐 금지"와 정합).

### 4.6 redesign-core: buildSections — 사실 주입 (`generate.ts` 수정, R2 핵심)

- 현재 `JSON.stringify(analysis).slice(0, 2400)`는 fact-bearing 키(`page_blueprint`·`compliance_notes`)를 **뒤쪽 직렬화 → 통째 잘림** 위험(LOW). 전사 가치가 이 취약 채널에 의존하면 안 됨.
- **`verified_facts`를 2,400자 슬라이스와 별개로**, **사실중심 섹션(S5 근거/신뢰, S4 USP 차별점)** 프롬프트에 `template.id` 분기로 전용 블록 주입(`Array.isArray` 가드). (모든 섹션이 아니라 사실이 실제로 쓰이는 섹션만 — 예산·품질 균형.)
- **1패스/2패스 유의(NEW-5):** `buildSections`는 `startSection`/`count`로 슬라이스되므로(generate.ts:452), 히어로-only 1패스(count=1)에선 S4/S5가 생성되지 않아 facts가 이미지에 안 들어감 — **나머지 섹션 2패스에서 반영**된다. 단 §4.7 텍스트 노출은 패스와 무관하게 항상 사용자에게 사실을 전달하므로 근거 손실은 없음.
- **"작은 글씨를 피한다" 규칙 정합화(Q4):** 사실중심 섹션에 한해 "핵심 인증/수치는 **읽기 쉬운 정보 패널**로 크게 배치"를 허용(현행 규칙과 충돌 해소). 나머지 섹션은 기존 규칙 유지.

### 4.7 apps/web: Results — 원문 근거 노출 (Q4)

- 생성 결과 화면에 **"원문 근거(전사에서 추출한 정확 사실)"** 읽기전용 텍스트 블록으로 `verified_facts`를 노출. 이미지에 구운 텍스트의 픽셀 정확도 한계를 텍스트 채널로 보완 → 사용자가 최종 교정/신뢰 판단 가능.
- 최소 구현: 텍스트 목록 렌더 + 복사 버튼. (편집 레이어는 범위 밖 — §9.)

---

## 5. 데이터 계약 (요약)

- 클라이언트 → `/api/redesign/transcribe-strips` (POST JSON): `{ strips, batchIndex, batchCount, previousSectionHint?, provider }` → `{ transcript, lastSectionType? }`
- 클라이언트 → `/api/redesign/generate` (기존 form에 `transcript` 추가)
- analyze 결과에 `verified_facts: string[]` 추가 → generate 응답 `project.analysis.verified_facts`로 Results가 소비.

---

## 6. 에러 처리 / 경계

| 상황 | 처리 |
|---|---|
| 빈 스트립 | `RedesignError(400)` |
| 배치 전사 실패(일시적) | 재시도 → 실패 시 스티칭 마커, 다른 배치 계속, 부분 전사 사용 |
| 전사 전체 실패 / 읽기모델 접근불가 | `transcript` 생략 → 이미지-only 분석 폴백(생성 계속) |
| 모델 키/권한/쿼터 | `humanizeProviderError` 재사용, 401/403/429/500 매핑 |
| 모델 무한 대기 | `AbortController` 90–120s(H2). `maxDuration`에 의존하지 않음 |
| body 크기 | EC2엔 413 한도 없음(H1). 배치는 모델 입력/지연/비용 기준. (선택: Caddy `request_body max_size 20MB` 방어) |
| 캔버스 blank | 페이지별 슬라이스 + 16,000px 가드(C2) |

---

## 7. 테스트 (TDD, vitest)

**vitest는 워크스페이스 루트에 hoist**되어 있으나 redesign-core엔 test 스크립트가 없고, **루트에도 `test` 스크립트가 없다.** 게다가 유일한 워크플로우 `build-ec2-release.yml`은 **`push: main` + workflow_dispatch만**(PR 트리거 없음)이고 **test 스텝이 없어** 기존 pdp-core 테스트조차 CI에서 안 돈다(NEW-3, 직접 확인). 조치(전부 필요):
1. redesign-core `package.json`에 `"test": "vitest run"` 추가(루트 hoist vitest 사용, 별도 devDep 불필요).
2. **루트 `package.json`에 `"test": "pnpm -r test"` 추가**(각 패키지로 팬아웃).
3. **PR 트리거 CI 테스트 잡 추가** — 신규 `.github/workflows/ci.yml`(또는 기존 워크플로우에 `pull_request` + `pnpm test` 스텝). 이게 없으면 §8 배포순서의 "CI 그린 확인"은 테스트에 대해 공허하다.

**순수 함수 단위 테스트(redesign-core)**
- `planTranscribeBatches`: 개수·용량 경계, 초과 단독 배치, 빈 입력.
- `stitchTranscripts`: 순서, 실패 마커, 전부 실패.
- `buildStripsCacheKey`: 동일/상이 키.
- `buildTranscribeStripsPrompt`: 위치 라인·작은글씨 지시·hint 반영.
- `parseTranscriptPayload`: 정상/깨진JSON(throw)/빈값(throw)/60k 트리밍.
- analyze: transcript 존재 시 `<상세페이지_전사>` 포함 + 60k 트리밍, 미존재 시 미포함.
- **verified_facts 파이프라인**: analyze 파싱이 `verified_facts` 추출, buildSections가 S4·S5 프롬프트에 그 목록을 2,400자 슬라이스와 별개로 포함.

**제외(인프라 부재)**: canvas/pdfjs 분할·React는 순수 로직 분리로 대체 검증. 라이브 육안 검증은 `.env.local` 키로 `npx tsx` 전사 1회.

---

## 8. 배포 고려

- 새 npm 의존성 없음(pdfjs-dist 기존). 서버 sharp 미추가. **pdfjs 워커는 로컬 번들로 전환(M2).**
- 신규 상수 `GOOGLE_READING_MODEL` — 서버 키의 모델 접근 권한 확인 필요(없으면 폴백).
- 테스트 CI: §7의 3조치(루트/패키지 test 스크립트 + PR 트리거 잡). `build-ec2-release.yml`의 `pnpm audit --prod` 게이트는 **테스트 실행과 별개**(audit≠test) — 혼동 금지.
- 배포 순서: PR CI(test+audit+build) 그린 → main 병합 → build-ec2-release 아티팩트 → Session Manager로 EC2 릴리스 교체 → health 200.

---

## 9. 범위 밖 (이번 페이즈 아님)

- ④ expand(히어로 먼저 → 확장) 2-pass 전체.
- 리디자인 RAG 지식베이스 채우기.
- verified_facts **편집** UI(노출은 §4.7 포함, 편집은 제외).
- 전사식 시간당 rate-limit(현재 미포함, 남용 시 추가).

---

## 10. 리뷰 결과 반영 (v1 → v2 추적)

**독립 리뷰어 3명(통합/실현성/효능) 적대적 검증 → 반영:**

| ID | 심각도 | 결함 | v2 반영 |
|---|---|---|---|
| C-1 (R2) | CRITICAL | 2,400자 truncation이 사실을 잘라 섹션에 도달 못함 | §4.5 `verified_facts[]` 신설, §4.6 슬라이스와 별개 주입 |
| C-2 (Q4) | CRITICAL | 이미지 모델이 정확 사실 렌더 불가 + "작은 글씨 피하라" 모순 | §1 효능 경계 명시, §4.6 규칙 정합화, §4.7 텍스트 노출 |
| F-C1 | CRITICAL | 1080–1280px 폭이 한글 깨알 파괴 | §4.4 1600–2048px·q≥0.85·다운스케일 금지 |
| F-C2 | CRITICAL | PDF 이어붙인 세로 캔버스 blank | §4.4 페이지별 슬라이스·16,000px 가드 |
| R1 | HIGH | 읽기모델 미배선 + analyze도 이미지모델 사용 | §4.1/§4.5 `GOOGLE_READING_MODEL`, transcribe·analyze 둘 다 라우팅 |
| A-1 | HIGH | 주입 상한 14,000 오이식 | §4.1 60,000(`MAX_LONG_PAGE_TRANSCRIPT_CHARS`)로 정정 |
| F-H1 | HIGH | 2.6MB/413 근거가 EC2엔 틀림 | §4.2/§6 배치 근거 정정, 상한 8–12MB |
| F-H2 | HIGH | 모델 무한 대기(타임아웃 없음) | §4.3 AbortController 90–120s |
| F-M1 | MED | 직렬 배치 다분 지연 | §4.4 동시성·best-effort hint·STRIPS_TOTAL·취소 |
| F-M2 | MED | pdfjs 워커 unpkg CDN 취약 | §4.4 로컬 번들 |
| A-테스트 | MED | vitest 루트 hoist·CI 미구동 | §7 test 스크립트·루트 연결 확인 |
| A-sharp | (기각) | 1R "v3.0 이미 클라이언트 분할" 주장 | **틀림** — v3.0 서버 sharp 확인, 원 rationale 유지 |
| LOW들 | LOW | JSON slice 키순서·iOS 디코드·middleware 이중auth | §4.6/§4.4에 반영/명시 |

**2차 검증(v2 대상) 추가 반영:**

| ID | 심각도 | 결함 | 반영 |
|---|---|---|---|
| NEW-1 | (기각·오탐) | 2R 리뷰어: "sharp 인용 조작" | **오탐 확정** — `pdp-maker-30-eval` 실재·line 2/2301/2323 sharp·4407줄 직접 확인. 리뷰어가 시블링 리포를 못 찾음. §3에 경로 명확화 |
| NEW-2 | HIGH | verified_facts 폴백/비JSON 경로 undefined | §4.5 폴백 `[]` 기본값·Array.isArray 가드·"근거 추출 실패" 상태 |
| NEW-3 | MED | 루트 test 스크립트 없음·CI PR/test 미구동 | §7 3조치(루트+패키지 test, PR 트리거 잡), §8 audit≠test 명시 |
| NEW-4 | MED | 스트립 높이 미지정 → 배치 바이트 비결정 | §4.4 높이 ~2048–2560px 고정·바이트 상한 우선 명시 |
| NEW-5 | LOW | 1패스에선 S4/S5 facts 미반영 | §4.6 1/2패스 유의(텍스트 노출로 근거 손실 없음) |
