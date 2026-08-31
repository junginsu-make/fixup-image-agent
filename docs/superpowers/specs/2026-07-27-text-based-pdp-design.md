# 텍스트 기반 상세페이지 생성 설계

작성일: 2026-07-27
상태: 구현 완료 (브랜치 `feat/text-based-pdp`) · 브라우저 UI 확인 미완
범위: 프로젝트 A — 텍스트 기반 진입점

---

## 1. 목적과 배경

현재 `/create`는 상품 이미지 1장이 반드시 있어야 시작한다. 이미지가 없는 사용자는
진입 자체가 불가능하다. 이 설계는 **텍스트만 입력해도 기획·구성·제작까지 끝나는
경로**를 추가한다.

핵심 제약 하나를 먼저 밝힌다. 원본 이미지는 분석 입력에 그치지 않는다.
`pdp.service.ts:369-376`에서 **모든 섹션 이미지 생성의 첫 번째 입력**으로 매번 들어가며,
섹션 간 시각 일관성을 이 이미지가 잡는다.

```ts
const parts = [{ inlineData: { mimeType: DEFAULT_IMAGE_MIME, data: originalImageBase64 } }];
```

따라서 텍스트 전용 모드는 "이미지 단계를 건너뛰는" 것이 아니라
**"기준 이미지를 만들어서 기존 파이프라인에 넣는"** 것이다.

한편 `app/api/pdp/analyze/route.ts:34`는 이미 `skipFirstImage: true`로 호출한다.
즉 기존 흐름도 구성 초안이 먼저 나오고 이미지는 나중이다. 이번에 추가하는 시나리오
단계는 없던 순서를 만드는 것이 아니라 **이미 있는 중간 산출물을 편집 가능하게 만드는
일**이다.

---

## 2. 핵심 결정 (확정)

| # | 결정 | 근거 |
|---|------|------|
| D1 | 주 사용자는 **무형 상품·서비스** (강의·컨설팅·구독·앱) | 실물 사진 개념이 없어 합성 제품 이미지의 허위표시 리스크가 없다 |
| D2 | 부족한 입력에 **되묻지 않는다** | "텍스트만 입력" 취지 유지 |
| D3 | 대신 **시나리오 확인·수정 단계를 신설**한다 | 되묻기 없이도 사용자가 방향을 교정할 지점을 확보 |
| D4 | 시나리오는 **읽히는 문서 + 항목별 인라인 편집** | 편집 결과가 곧 `SectionBlueprint[]`라 재파싱이 불필요 |
| D5 | **대표 이미지를 생성 후 승인받는다** | 이 1장이 전 섹션 분위기를 결정하므로 여기서 거르면 전체 재생성을 막는다 |
| D6 | 진입은 **`/create` 안에서 시작 방식 선택** | 상단 네비 중복을 만들지 않고 2단계 이후 화면을 전부 공유 |
| D7 | 로직은 **`pdp-core`의 신규 모듈**에 넣는다 | 1584줄인 `pdp.service.ts`를 건드리지 않아 기존 흐름 회귀 위험이 0 |
| D8 | 사용량은 **기존 operation을 재사용**한다 | DB CHECK 제약이 4종만 허용 — 마이그레이션 회피 |

---

## 3. 사용자 흐름

```
1  텍스트 입력          자유 형식. 되묻기 없음
        │
        ▼  POST /api/pdp/plan-from-text
2  시나리오 확인·수정    전체 전략 + 섹션별 카피 인라인 편집
        │               섹션 추가·삭제·순서 변경
        │               AI가 채운 가정(assumptions) 명시
        ▼  확정
3  대표 이미지 승인      POST /api/pdp/key-visual
        │               승인 / 다시 만들기
        ▼  승인
4  섹션 이미지 생성      기존 POST /api/pdp/images × 섹션 수
        │               originalImageBase64 = 승인된 대표 이미지
        ▼
5  편집 · 내보내기       기존 PdpEditor 그대로
```

4·5단계는 기존 코드를 **수정 없이** 재사용한다.

---

## 4. 아키텍처 & 모듈 경계

### 4.1 신규 코어 모듈

`packages/pdp-core/src/pdp.text-plan.ts`

```
planFromText(input, apiKey)      자유 텍스트 → { brief, blueprint }
  ├─ LLM ①  텍스트 → ProductBrief        (의도 분석)
  └─ LLM ②  ProductBrief → LandingPageBlueprint  (구성 설계)

generateKeyVisual(input, apiKey)  brief + blueprint → 대표 이미지 1장
```

**LLM을 2회로 나누는 이유.** 브리프를 독립 산출물로 보존해야 사용자가 시나리오를
고친 뒤 원문 텍스트부터 다시 시작하지 않고 브리프 기준으로 재생성할 수 있다.
또한 "의도를 먼저 정확히 파악한다"는 요구가 그 자체로 하나의 단계다.

**`pdp.service.ts`는 수정하지 않는다.** 이 모듈은 `types.ts`만 공유하고 독립 파일로
존재한다. 800줄 상한을 지키기 위한 선택이기도 하다.

이 결정에는 대가가 따르므로 명시한다. `pdp.service.ts`의 아래 셋은 **비공개(export
되지 않음)이라 재사용할 수 없고, 신규 모듈에서 다시 구현한다.**

| 항목 | 재사용 불가 사유 | 대응 |
|------|-----------------|------|
| blueprint `responseSchema` | `analyzeProduct` 호출부에 인라인 | 신규 모듈에 동등한 스키마 정의 |
| `normalizeSection` / blueprint 정규화 | 파일 내부 private 함수 | 신규 모듈에 정규화 재구현 + 테스트로 고정 |
| `buildAnalyzePrompt` | export 되지만 **이미지 입력을 전제**한 프롬프트 | 텍스트 전용 프롬프트를 새로 작성 |

약 45줄의 정규화 로직이 중복된다. 이를 공용 파일로 추출하면 중복은 사라지지만
1584줄 파일을 수정해야 하고, 그 순간 기존 이미지 흐름의 회귀 위험이 0이 아니게 된다.
**지금은 중복을 택한다.** 두 정규화가 갈라지면 곧바로 드러나도록, 신규 모듈의
정규화는 `LandingPageBlueprint` 타입을 그대로 만족시키는지 테스트로 고정한다.
프로젝트 B 착수 시 공용 추출을 재검토한다.

### 4.2 신규 API 라우트

| 라우트 | 역할 | 사용량 |
|--------|------|--------|
| `app/api/pdp/plan-from-text/route.ts` | 텍스트 → 시나리오 | `pdp_analyze`, 0 units |
| `app/api/pdp/key-visual/route.ts` | 대표 이미지 1장 | `pdp_image`, 1 unit |

두 라우트 모두 기존 `analyze/route.ts` 패턴을 따른다 —
`reserveAiUsage` → 작업 → `finalizeAiUsage`, `x-idempotency-key` 필수,
`runtime = "nodejs"`, `dynamic = "force-dynamic"`, `maxDuration = 300`.

### 4.3 UI

| 파일 | 변경 |
|------|------|
| `app/create/TextModeFlow.tsx` | 신규 — 텍스트 경로 3단계를 묶는 오케스트레이터 |
| `app/create/ScenarioEditor.tsx` | 신규 — 시나리오 문서형 인라인 편집 |
| `app/create/KeyVisualGate.tsx` | 신규 — 대표 이미지 승인/재생성 |
| `app/create/TextBriefInput.tsx` | 신규 — 자유 텍스트 입력 |
| `app/create/PdpMakerClient.tsx` | 수정 — 시작 방식 선택 + 텍스트 경로 분기 |
| `app/create/StepBar.tsx` | 수정 — 라벨을 모드별로 교체하는 `mode` prop 추가 |
| `app/create/pdp-utils.ts` | 수정 — 앵커 축소 함수(`toAnchorImage`) 추가 |

`TextModeFlow`를 따로 둔 이유는 `PdpMakerClient.tsx`가 이미 1175줄이기 때문이다.
텍스트 경로의 상태·API 호출·단계 전환을 거기에 얹으면 파일이 프로젝트 상한(800줄)에서
더 멀어진다. `PdpMakerClient`는 시작 방식 분기와 완료 콜백만 갖고, 나머지는
`TextModeFlow`가 담는다.

**StepBar는 4단계를 유지한다.** `StepBar`는 `PdpEditor.tsx:1864`에서도 쓰인다.
단계 배열 자체를 prop으로 빼면 `PdpEditor`까지 수정 대상이 되고, 텍스트 모드 여부를
편집기까지 전달해야 한다. 그럴 만한 이득이 없다 — 3·4단계 라벨(섹션 생성 / 편집·
내보내기)은 두 모드가 동일하기 때문이다.

따라서 `mode?: "image" | "text"` (기본 `"image"`) 하나만 추가해 1·2단계 라벨만
바꾸고, **대표 이미지 승인은 2단계 안에 포함**시킨다. `PdpEditor`는 수정하지 않는다.

```
이미지 모드  이미지 업로드 → AI 분석      → 섹션 생성 → 편집·내보내기
텍스트 모드  텍스트 입력   → 시나리오·대표 → 섹션 생성 → 편집·내보내기
```

### 4.4 기존 초안 저장과의 연결

`pdp-drafts.ts`는 `GeneratedResult = { originalImage, blueprint }`를 IndexedDB에
저장한다. 텍스트 모드는 이 구조를 **그대로 사용한다**.

```
originalImage  ←  승인된 대표 이미지
blueprint      ←  사용자가 수정한 시나리오
```

이 매핑 덕분에 초안 저장·복원·편집기 진입이 무변경으로 동작한다.

**`ProductBrief`는 draft에 저장하지 않는다.** v1에는 "브리프로 재생성" 기능이 없어
편집기 도달 이후 브리프가 필요하지 않다. 저장하려면 `pdp-drafts.ts`의 레코드 스키마와
버전을 건드려야 하는데, 쓰지도 않을 필드 때문에 기존 초안 호환성을 위험에 빠뜨릴
이유가 없다. 브리프는 `PdpMakerClient`의 컴포넌트 상태로만 유지한다.

같은 이유로 `PdpAppState`(`"upload" | "processing" | "editor"`)도 확장하지 않는다.
텍스트 모드의 중간 단계는 컴포넌트 로컬 상태(`textStage`)로 다룬다.

### 4.5 시나리오에서 무엇을 편집할 수 있나

| 항목 | 편집 | 비고 |
|------|------|------|
| 전체 전략 (`executiveSummary`) | 가능 | |
| 헤드라인 · 서브 · 불릿 · CTA | 가능 | 한국어 |
| 섹션 목표 (`goal`) | 가능 | |
| 이미지 방향 (`prompt_ko`) | 가능 | 아래 병합 규칙 적용 |
| 섹션 추가 · 삭제 · 순서 변경 | 가능 | |
| 영어 번역본 (`*_en`) | 불가 | 화면에 노출하지 않는다 |

**카피 편집이 이미지에 반영되는 경로는 이미 존재한다.** `buildImagePrompt`는
full-image 모드에서 `section.headline` / `section.subheadline`을 직접 읽는다
(`pdp.service.ts:885-895`). 편집한 섹션 객체를 그대로 넘기면 반영되므로
별도 동기화가 필요 없다.

**이미지 방향 병합 규칙.** 실제 이미지 생성에 쓰이는 값은 `prompt_en`이다.
사용자가 한국어 방향을 고쳤을 때 그것이 무시되면 막다른 길이 된다. 그래서
대표 이미지를 승인하는 시점에 한 번 아래처럼 합쳐 편집기로 넘긴다.

```
prompt_ko 가 원본과 다르면
  prompt_en = `${원본 prompt_en}\n\nArt direction override (Korean, follow this): ${수정된 prompt_ko}`
같으면
  prompt_en 을 그대로 둔다
```

병합 함수 `mergeArtDirection`은 **`pdp-core`에 둔다.** `apps/web`에는 테스트 스크립트가
없어(`apps/web/package.json`) 클라이언트에 두면 순수 로직을 검증할 방법이 사라진다.
섹션을 `section_id`로 짝지어 비교하므로 순서를 바꿔도 어긋나지 않고, 여러 번 고쳐도
지시가 중첩되지 않는다. 원본 비교 대상은 `planFromText`가 처음 돌려준 blueprint다.

`pdp.service.ts`는 건드리지 않는다. 프롬프트에 한국어를 섞는 방식은 기존 full-image
경로가 이미 쓰고 있다(같은 파일 894-895행).

### 4.6 대표 이미지 생성 규칙

**`outputMode`와 무관하게 항상 텍스트 없는 이미지로 생성한다.** 대표 이미지는
납품물이 아니라 색·조명·질감·분위기를 고정하는 **스타일 앵커**다. 여기에 한국어
카피가 박히면 이후 모든 섹션 이미지에 그 글자가 번져 들어간다.

- 입력: `ProductBrief` + 확정된 blueprint의 첫 섹션 방향(`prompt_en`, `style_guide`)
- 출력: 텍스트·로고·워터마크 없는 장면 이미지 1장
- 화면비: 사용자가 고른 `aspectRatio`와 동일
- 재생성: 같은 라우트를 새 idempotency key로 다시 호출 (1 unit 추가 소비)

**승인 후 앵커 규격으로 축소한다.** 대표 이미지는 2K로 생성되지만, `PdpEditor`가
섹션마다 `originalImageBase64`로 다시 올린다(`PdpEditor.tsx:1308`). 원본 그대로 두면
요청 하나가 3MB를 넘는다. 이미지 흐름이 업로드본에 적용하는 규격(1024px, JPEG 0.84)을
똑같이 적용한다.

```
1536x2752 · base64 3246 KB   →   572x1024 · base64 81 KB   (97.5% 감소)
```

축소 로직은 `pdp-utils.ts`의 `toAnchorImage`가 맡고, `prepareImageFile`과 같은
함수를 공유한다. 두 경로가 갈라지면 한쪽만 무거워지기 때문이다.

---

## 5. 타입 계약

`packages/pdp-core/src/types.ts`에 추가한다. 기존 타입은 변경하지 않는다.

```ts
export type OfferingKind =
  | "course" | "coaching" | "subscription"
  | "software" | "community" | "other";

export interface ProductBrief {
  offeringName: string;
  offeringKind: OfferingKind;
  oneLiner: string;
  audience: string;          // 누구에게
  problem: string;           // 어떤 문제를
  outcome: string;           // 어떤 결과로
  differentiators: string[]; // 왜 이것이어야 하는가
  objections: string[];      // 예상 반론
  pricePositioning: string;  // 가격/포지션 (모르면 추정값)
  tone: string;
  assumptions: string[];     // AI가 채운 가정. 화면에 반드시 노출
  sourceText: string;        // 사용자 원문 보존
}

export interface TextPlanRequest {
  text: string;
  aspectRatio: AspectRatio;
  desiredTone?: string;
  outputMode?: PdpOutputMode;
}

export interface TextPlanResult {
  brief: ProductBrief;
  blueprint: LandingPageBlueprint;  // 기존 타입 그대로
}

export interface KeyVisualRequest {
  brief: ProductBrief;
  blueprint: LandingPageBlueprint;
  aspectRatio: AspectRatio;
}
```

**`assumptions`가 필수인 이유.** D2에 따라 되묻지 않으므로, AI가 무엇을 지어냈는지
사용자가 알 수 있어야 한다. 시나리오 화면 상단에 항상 표시한다.

**`LandingPageBlueprint`를 그대로 쓰는 이유.** 이 타입이 동일하기 때문에
`SectionGallery`·`PdpEditor`·`generateSectionImage`·`pdp-drafts`가 전부 무변경으로
재사용된다. 이것이 이 설계의 핵심 레버리지다.

---

## 6. API 계약

### POST `/api/pdp/plan-from-text`

```
헤더   x-idempotency-key: <uuid v1-5>   (필수)
본문   TextPlanRequest
성공   200 { ok: true, result: TextPlanResult, usage: UsageSummary }
실패   { ok: false, code: PdpErrorCode, message, detail? }
```

기존 analyze 라우트와 동일하게 `INVALID_REQUEST` 중 blueprint 스키마 결손은
최대 2회 재시도한다 (`isTransientBlueprintFailure` 동일 정책).

### POST `/api/pdp/key-visual`

```
헤더   x-idempotency-key: <uuid v1-5>   (필수)
본문   KeyVisualRequest
성공   200 { ok: true, imageBase64, mimeType, usage }
실패   { ok: false, code, message, detail? }
```

재생성은 새 idempotency key로 같은 라우트를 다시 호출한다. 매 호출이 1 unit을 소비한다.

### 기존 `/api/pdp/images` — 변경 없음

`originalImageBase64`에 승인된 대표 이미지를 넣어 호출한다.

---

## 7. 에러 처리

`PdpErrorCode`에 1개만 추가한다.

```ts
| "TEXT_INPUT_INSUFFICIENT"   // 빈 문자열·공백·의미 없는 입력
```

`mapPdpErrorCodeToStatus`에 `TEXT_INPUT_INSUFFICIENT → 400`을 추가한다.

D2에 따라 **얇은 입력은 통과시킨다.** 이 코드는 "부족함"이 아니라 "판독 불가"에만
쓴다. 이 구분을 흐리면 D2가 무력화되므로 판정 기준을 코드로 고정한다.

```
TEXT_INPUT_INSUFFICIENT 은 아래 둘 중 하나일 때만 반환한다.
  (a) 입력을 trim 한 결과가 비어 있다
  (b) LLM ① 이 offeringName 을 빈 문자열로 반환한다
      = 무엇을 파는지 특정하지 못했다는 뜻
```

그 외에는 전부 통과시키고 부족분은 `assumptions`로 채워 노출한다.
"요가 강의" 같은 두 단어 입력도 (b)에 걸리지 않으므로 정상 진행한다.

나머지는 기존 코드를 재사용한다.

| 상황 | 코드 |
|------|------|
| 대표 이미지 생성 실패 | `PDP_IMAGE_GENERATION_FAILED` |
| blueprint 스키마 결손 | `INVALID_REQUEST` (2회 재시도 후 반환) |
| API 키·쿼터·모델 접근 | 기존 `GEMINI_*` 코드 |

---

## 8. 사용량 · 크레딧

`supabase/migrations/202607230001_membership_usage.sql:22`의 CHECK 제약이
`pdp_analyze`·`pdp_image`·`redesign_generate`·`redesign_edit` 4종만 허용한다.
**신규 operation을 만들지 않는다.**

| 단계 | operation | units |
|------|-----------|-------|
| 텍스트 → 시나리오 | `pdp_analyze` | 0 (시간당 횟수 제한만 적용) |
| 대표 이미지 | `pdp_image` | 1 |
| 섹션 이미지 | `pdp_image` | 1 × 섹션 수 (기존) |

DB 마이그레이션이 필요 없다.

---

## 9. 테스트 전략 (TDD)

`packages/pdp-core/src/pdp.text-plan.test.ts` — Gemini 클라이언트는 모킹한다.

| 대상 | 검증 |
|------|------|
| 빈 문자열 / 공백만 | `TEXT_INPUT_INSUFFICIENT` |
| 판독 불가 입력 ("asdf") | `TEXT_INPUT_INSUFFICIENT` |
| 얇지만 유효한 입력 ("요가 강의") | 성공하고 `assumptions.length > 0` |
| 충분한 입력 | `assumptions`가 비어도 허용 |
| blueprint 필수 필드 결손 | `INVALID_REQUEST` |
| 반환 blueprint | 기존 `LandingPageBlueprint` 형태 충족 |
| `generateKeyVisual` 실패 | `PDP_IMAGE_GENERATION_FAILED` |

**회귀 검증.** `pdp.service.ts`를 수정하지 않으므로 기존 `pdp.service.test.ts`,
`pdp.qa.test.ts`, `pdp.qa.integration.test.ts`가 전부 그대로 통과해야 한다.
통과하지 않으면 경계를 잘못 그은 것이다.

**수동 확인.** 실제 Gemini 호출로 얇은 입력 1건, 충분한 입력 1건을 끝까지
(텍스트 → 시나리오 → 대표 이미지 → 섹션 2개) 돌려본다.

---

## 10. 파일 변경 요약

**신규 (8)**

```
packages/pdp-core/src/pdp.text-plan.ts
packages/pdp-core/src/pdp.text-plan.test.ts
apps/web/app/api/pdp/plan-from-text/route.ts
apps/web/app/api/pdp/key-visual/route.ts
apps/web/app/create/TextModeFlow.tsx
apps/web/app/create/TextBriefInput.tsx
apps/web/app/create/ScenarioEditor.tsx
apps/web/app/create/KeyVisualGate.tsx
```

**수정 (5)**

```
packages/pdp-core/src/types.ts       추가만 (ProductBrief 외)
packages/pdp-core/src/index.ts       export 추가 + 에러코드 매핑 1줄
apps/web/app/create/PdpMakerClient.tsx   시작 방식 분기 + 텍스트 경로
apps/web/app/create/StepBar.tsx      mode prop 추가 (기본값은 기존 동작)
apps/web/app/create/pdp-utils.ts     toAnchorImage 추가 (기존 축소 로직 공유)
```

**무변경 (핵심)**

```
packages/pdp-core/src/pdp.service.ts     1584줄. 건드리지 않는다
apps/web/app/api/pdp/images/route.ts
apps/web/app/create/SectionGallery.tsx
apps/web/app/create/PdpEditor.tsx        StepBar 호출부 그대로
apps/web/app/create/pdp-drafts.ts        레코드 스키마·버전 그대로
supabase/migrations/                     마이그레이션 없음
```

클라이언트는 `apiJson`(`pdp-utils.ts:37-38`)을 그대로 쓴다. POST에
`x-idempotency-key`가 자동으로 붙고 `usage` 이벤트도 자동 전파되므로
신규 라우트 호출에 추가 작업이 없다.

---

## 11. 비범위 (YAGNI)

이번 구현에 포함하지 않는다.

- **되묻기·대화형 입력** — D2로 배제
- **유형 상품(실물) 텍스트 생성** — D1로 배제. 합성 제품 이미지의 허위표시 문제는
  별도 판단이 필요하다
- **이미지 흐름에 시나리오 편집기 적용** — 기술적으로 가능하고 가치도 있지만
  별건이다. A 완료 후 재검토
- **프로젝트 B — PDP 다중 참조 이미지 지원**
- **프로젝트 C — character-ip-service 통합**
- 시나리오 버전 관리·되돌리기
- 대표 이미지를 여러 후보로 제시하기 (승인/재생성 1:1로 시작)

---

## 12. 후속 프로젝트

```
A. 텍스트 기반 상세페이지 생성   ← 이 문서
B. PDP 다중 참조 이미지 지원      C의 선행조건
C. character-ip-service 통합      캐릭터·모델 제공
```

B·C는 각각 독립 spec으로 작성한다. A와 의존 관계가 없다.
