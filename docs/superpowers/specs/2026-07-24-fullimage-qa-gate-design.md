# 풀이미지 QA 생성 게이트 설계

- 작성일: 2026-07-24
- 대상 패키지: `packages/pdp-core`, 라우트 `apps/web/app/api/pdp/*`, 클라이언트 `apps/web/app/create/*`
- 상태: 설계 확정 (사용자 승인 — 접근안 1)

## 1. 목적과 배경

풀이미지 PDP 모드는 Gemini(`gemini-3-pro-image-preview`)가 **한국어 카피를 이미지에 직접 렌더**한 완성형 상세페이지 섹션을 만든다. 이 과정에서 다음 결함이 관찰됐다(S6 오타, Haneerum 같은 허구 브랜드명 사례).

- 카피에 없는 **금지/허구 브랜드명**이 이미지에 등장
- **오타·깨진 한글 글자(글리프 깨짐)**
- 카피에 없는 **근거 없는 수치/통계**
- **인체 왜곡**(손가락 개수, 사지, 얼굴 뭉개짐)

이를 생성 직후 비전 모델로 검사(QA)하고, 실패 시 프롬프트를 강화해 자동 재시도하며, 끝내 못 고치면 심각도에 따라 실패/경고 처리하는 게이트를 추가한다.

## 2. 핵심 결정 (확정)

| # | 항목 | 결정 |
|---|---|---|
| 1 | 적용 범위 | **풀이미지 PDP 모드만** (`outputMode === "full-image"`). editable 모드·redesign 경로는 범위 밖 |
| 2 | 정답 기준 | **승인된 섹션 카피 대조** (headline/subheadline/bullets/CTA/수치) + 일반 해부학 상식. 카피에 없는 브랜드/수치 = 결함 |
| 3 | 최종 실패 | **심각도 분기**: 치명적 → 생성 실패(크레딧 미차감), 경미 → 경고 배지와 함께 반환 |
| 4 | 재시도 예산 | **최대 2회 이미지 생성** (초기 1 + 재생성 최대 1). 속도 우선 |

## 3. 아키텍처 & 모듈 경계

**새 파일 `packages/pdp-core/src/pdp.qa.ts`** — 순수 판정 로직 격리. `pdp.service.ts`(현재 1507줄, 800줄 규칙 초과)를 더 키우지 않는다.

| export | 종류 | 역할 |
|---|---|---|
| `buildQaPrompt(section)` | 순수 | 승인 카피를 삽입한 비전-판정 프롬프트 문자열 |
| `parseQaResponse(response)` | 순수 | Gemini JSON → `QaVerdict`. 방어적: 파싱 실패 시 `{ passed:true, defects:[], parseError:true }`(fail-open) |
| `classifyOutcome(verdict)` | 순수 | `{ blocking: QaDefect[]; warnings: QaDefect[] }` 심각도 분기 |
| `qaRetryDirective(verdict)` | 순수 | defects → 프롬프트 강화 문자열(기존 `retryDirective` 슬롯에 삽입) |
| `runQaGate(client, input)` | async | 위를 묶어 1회 비전 호출 후 `QaVerdict` 반환. 호출/파싱 예외를 try/catch로 잡아 **fail-open** |

**(리뷰 B2) `runQaGate` 비전 호출 규격** — 기존 `validateGeneratedImage`와 동일하게: 모델 `ANALYZE_MODEL`(`gemini-3.1-pro-preview`, **이미지 모델 아님**), `config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }, responseMimeType: "application/json", responseSchema: <QaVerdict 스키마> }`. contents parts = `[ { text: buildQaPrompt(section) }, buildHighResolutionInlinePart(generatedImage) ]`. thinkingLevel LOW로 지연·비용을 억제.

**의존 방향**: `pdp.service.ts` → `pdp.qa.ts` (단방향). qa 모듈은 `@google/genai` client 타입과 `SectionBlueprint`, 공유 QA 타입만 의존하고 서비스 내부를 모른다. 응답 텍스트 추출·`asString`/`asStringArray` 같은 소형 헬퍼는 모듈 격리와 테스트 용이성을 위해 qa 모듈 안에 자체 구현한다(≈15줄, 서비스 대형 파일을 건드리지 않기 위한 의도적 선택).

**Fail-open 근거**: QA는 보안 통제가 아니라 품질 향상 장치다. QA 비전 호출 실패/파싱 오류로 *모든* 풀이미지 생성을 막는 fail-closed는 과하다. QA 인프라 문제 시 이미지를 그대로 통과시키고(결함 0으로 간주) 관측 플래그(`parseError`)만 남긴다.

## 4. QA 계약 (타입 & 결함 taxonomy)

`types.ts`에 공개 타입 추가(응답 계약의 일부):

```ts
export type QaDefectType =
  | "forbidden_brand"     // 카피에 없는 브랜드/로고/워터마크
  | "text_typo"           // 카피와 불일치하는 오타/깨진 글자
  | "unsupported_number"  // 카피에 없는 수치/통계
  | "body_distortion";    // 인체 왜곡

export type QaSeverity = "critical" | "minor";

export type QaTextLocation = "headline" | "subheadline" | "bullet" | "other";

export interface QaDefect {
  type: QaDefectType;
  severity: QaSeverity;       // 모델 제안값(관측·정렬용). 최종 blocking 판정은 코드가 강제
  location?: QaTextLocation;  // text_typo 전용: 어느 카피 요소에서 발견됐는지
  evidence: string;           // 무엇이/어디서 보였는지 (한국어)
  correctionHint: string;     // 재생성 시 교정 지시 (영어, 프롬프트에 삽입)
}
```

qa 모듈 내부 타입:

```ts
export interface QaVerdict {
  defects: QaDefect[];
  parseError?: boolean;    // 파싱 실패 시 fail-open 표시
}
export interface QaOutcome {
  blocking: QaDefect[];
  warnings: QaDefect[];
}
```

**심각도 정책(`classifyOutcome`)** — 결정론적 매핑. 모델이 severity를 제안하되 최종 분류는 코드가 강제한다:

| 결함 type | blocking(치명적) 조건 | 근거 |
|---|---|---|
| `forbidden_brand` | 항상 blocking | 타사/허구 브랜드 노출은 법적·신뢰 리스크 |
| `unsupported_number` | 항상 blocking | 근거 없는 수치 = 오해 소지 있는 표시 |
| `text_typo` | **`location ∈ {headline, subheadline}`이면 blocking**, 그 외(bullet/other) 경고 | (리뷰 B1) severity를 모델 재량에 맡기면 정작 이 기능의 동기인 headline 오타(S6 사례)가 "minor"로 통과할 수 있다. 그래서 **모델의 severity가 아니라 코드가 location으로 결정**한다. headline/subheadline은 크고 눈에 띄는 소수 단어 → 깨지면 치명적. bullet 등 작은 텍스트의 사소한 오타는 경고(결정 #3 존중) |
| `body_distortion` | `severity === "critical"`일 때만 | 프롬프트 rubric으로 severity를 명시적으로 정박: critical = 손가락 개수 오류·사지 추가/누락·얼굴 융합/뭉개짐; minor = 약간 어색한 비율/포즈. 이 한 종류는 이미지에서 코드가 severity를 못 재므로 rubric 기반 모델 severity를 신뢰(잔여 비결정성은 수용) |

정책 맵은 상수(`BLOCKING_POLICY`)로 두어 조정 가능하게 한다. `classifyOutcome`은 이 표를 코드로 강제하며, 모델의 severity는 `body_distortion`에만 반영된다.

## 5. 서비스 루프 배선

`generateSectionImageInternal`의 기존 for-루프를 확장한다.

```
// (리뷰 S2) 아래 3개는 루프 바깥에 선언 — 예산 소진 후 return이 참조하므로 hoist 필수
//   lastGeneratedImage, retryDirective (기존), lastOutcome = { blocking:[], warnings:[] }
qaEnabled = options.outputMode === "full-image"
refMax    = (refModel && withModel) ? REFERENCE_MODEL_MAX_ATTEMPTS(3) : 1
maxAttempts = qaEnabled ? QA_MAX_ATTEMPTS(2) : refMax   // qa+ref 동시면 2(속도 우선)

for attempt in 0..maxAttempts-1:
  prompt = buildImagePrompt(section, tone, { ...options, isRegeneration: ...||attempt>0, retryDirective })
  generatedImage = <gemini image gen>
  lastGeneratedImage = generatedImage

  refOk = true; refDirective = ""
  if (refModel && withModel && refProfile):
    v = validateGeneratedImage(...)
    refOk = v.isSamePerson && v.genderPresentationPreserved && v.styleMatch
    if !refOk: refDirective = buildRetryDirective(v, refProfile, style)

  qaOk = true; qaDirective = ""; lastOutcome = { blocking:[], warnings:[] }
  if qaEnabled:
    verdict = runQaGate(client, { generatedImage, section, options })   // fail-open
    lastOutcome = classifyOutcome(verdict)
    qaOk = lastOutcome.blocking.length === 0
    if verdict.defects.length: qaDirective = qaRetryDirective(verdict)

  if refOk && qaOk:
    return { ...generatedImage, qa: qaEnabled ? { passed:true, blocking:[], warnings:lastOutcome.warnings, attempts:attempt+1 } : undefined }

  retryDirective = [refDirective, qaDirective].filter(Boolean).join(" ")

// 예산 소진: 마지막 결과 반환(정책 판단은 호출자에게)
return { ...lastGeneratedImage, qa: qaEnabled ? { passed:false, blocking:lastOutcome.blocking, warnings:lastOutcome.warnings, attempts:maxAttempts } : undefined }
```

- 내부 반환 타입: `SectionImageResult = GeneratedImagePayload & { qa?: QaResult }`
  `QaResult = { passed: boolean; blocking: QaDefect[]; warnings: QaDefect[]; attempts: number }`
- **(리뷰 S1) 기존 조기 반환 제거**: 현재 `pdp.service.ts`의 `if (!normalizedReferenceModel || !options.withModel || !referenceModelProfile) return generatedImage;`(레퍼런스 모델 없으면 검증 없이 즉시 반환)를 **삭제**하고 위 `refOk && qaOk` 게이트로 대체한다. 이 줄을 남기면 풀이미지 대부분 경로에서 QA가 조용히 건너뛰어진다.
- `generateSectionImageInternal`는 **throw하지 않는다**. 심각도 throw 정책은 호출자가 적용한다.
- `buildImagePrompt`의 full-image 온이미지 텍스트 블록은 `isRegeneration`과 무관하게 끝에서 항상 실행됨을 확인함 → 재생성이 텍스트 렌더를 잃지 않는다.
- QA_MAX_ATTEMPTS=2로 인해 풀이미지+레퍼런스모델 동시 사용 시 레퍼런스 재시도가 3→2로 줄지만, 결정 #4(속도 우선)에 따른 의도된 트레이드오프.

## 6. 에러 처리 · 크레딧 · UI 전파

**호출자 정책**

- `PdpService.generateSectionImage`(크레딧 경로, `/api/pdp/images`가 사용):
  ```
  const image = await generateSectionImageInternal(...)
  if (image.qa?.blocking.length) throw new PdpServiceError("PDP_IMAGE_QA_REJECTED", <한국어 메시지>, JSON.stringify(image.qa.blocking))
  return { imageBase64: image.base64, mimeType: image.mimeType, qa: image.qa ? { warnings: image.qa.warnings } : undefined }
  ```
- `PdpService.analyzeProduct` 첫 이미지: **throw하지 않음**. blueprint를 잃지 않기 위해 blocking+warning을 모두 섹션의 `qaWarnings`로 부착.

**크레딧 상호작용** (`/api/pdp/images` 기존 흐름과 정합):
- 치명적 → `generateSectionImage` throw → 라우트 catch → `finalizeAiUsage(false, 0)` → **크레딧 미차감**. 사용자는 새 idempotency key로 재시도 가능.
- 경미 → 정상 반환 → `finalizeAiUsage(true, 1)` → 크레딧 1장 + 경고 배지.
- 내부 QA 재시도는 하나의 예약(reservation) 안에서 일어나므로 크레딧을 추가 소모하지 않는다(기존 레퍼런스-모델 루프와 동일).

**타입·상태 코드**
- `PdpErrorCode`에 `"PDP_IMAGE_QA_REJECTED"` 추가.
- `mapPdpErrorCodeToStatus`: `PDP_IMAGE_QA_REJECTED → 422`.
- `PdpGenerateImageSuccessResponse`에 `qa?: { warnings: QaDefect[] }` 추가.
- `SectionBlueprint`에 `qaWarnings?: QaDefect[]` 추가.
- `index.ts`의 `generateSectionImage` 래퍼가 `qa`를 함께 반환. **(리뷰 S3) 이 래퍼가 choke point** — 현재 `return { imageBase64, mimeType }`로 필드를 명시 선택하고 반환 타입도 `Promise<{ imageBase64; mimeType }>`로 좁다. 반환 타입을 `qa?`까지 넓히고 `qa: response.qa`를 추가하지 않으면 라우트가 `qa`를 못 본다(컨트롤러의 `...result` 스프레드는 통과시키지만 래퍼에서 잘림).

**라우트**
- `/api/pdp/images`: 성공 JSON에 `qa` 포함 → `{ ok, imageBase64, mimeType, usage, qa }`. catch·finalize(false,0)는 기존 그대로(신규 코드가 422로 매핑됨).
- `/api/pdp/analyze`: 변경 없음(blueprint에 `qaWarnings`가 실려 통과).

**UI (최소·surgical)**
- 섹션 이미지 렌더 지점에 `qa.warnings`(images 응답) 또는 `section.qaWarnings`(analyze 응답)가 있으면 작은 경고 배지 표시. 과도한 리팩터 금지 — 데이터 배선 + 최소 배지에 한정.
- **(리뷰 NIT) 심각도 구분**: analyze 경로는 blocking도 `qaWarnings`에 담기므로, 배지는 defect의 `severity`/`type`으로 톤을 구분한다 — critical(빨강, 예 "⚠ 브랜드/왜곡 확인"), minor(노랑, 예 "⚠ 오타 의심"). 하나의 뭉뚱그린 배지로 만들지 않는다.

**(리뷰 S4) 클라이언트 재시도 계약**: `/api/pdp/images`의 422(`PDP_IMAGE_QA_REJECTED`)는 반복 가능한 사용자 대면 실패다. `reserveAiUsage`는 UUID `x-idempotency-key`를 요구하고 재사용 시 `duplicate_request`(409)를 낸다. 따라서 클라이언트는 **422 후 재시도 시 새 idempotency key를 발급**해야 한다(409로 막히지 않도록). 재생성 요청이 `options.outputMode = "full-image"`를 반드시 포함하는지도 확인(포함해야 QA가 돎).

## 7. 테스트 전략 (TDD)

**순수 함수 단위 테스트 (`pdp.qa.test.ts`, vitest)**
- `parseQaResponse`: 정상 JSON, 필드 누락(안전 기본값), 깨진 JSON(→ `parseError:true`, defects=[]).
- `classifyOutcome`: 4개 type × severity 조합 → blocking/warning 분류가 정책표와 일치.
- `qaRetryDirective`: defects → 교정 문자열에 각 correctionHint 포함, 빈 defects → 빈 문자열.
- `buildQaPrompt`: 승인 카피(headline/bullets 등)와 4개 결함 지시가 프롬프트에 포함.

**통합 테스트 (`pdp.service.test.ts` 확장, fake client 주입)**
- full-image + blocking(attempt1) → 재생성(attempt2) → clean → 반환(qa.passed, attempts=2).
- full-image + blocking 지속 → 예산 소진 → `generateSectionImage`가 `PDP_IMAGE_QA_REJECTED` throw.
- full-image + minor만 → 정상 반환 + `qa.warnings` 존재, throw 없음.
- QA 호출 예외 → fail-open(이미지 정상 반환, 결함 0).
- editable 모드 → QA 미실행(기존 동작 불변).
- analyzeProduct 첫 이미지 blocking → throw 없이 `section.qaWarnings`에 부착.
- Red-Green: 재시도 테스트는 attempt1이 실제로 실패를 촉발하는지(중간 revert로 확인).

**검증 게이트**: `pnpm -r typecheck`, `pnpm -r test`, `pnpm build` 모두 그린.

## 8. 파일 변경 요약

| 파일 | 변경 |
|---|---|
| `packages/pdp-core/src/pdp.qa.ts` | 신규 — QA 순수 함수 + `runQaGate` |
| `packages/pdp-core/src/pdp.qa.test.ts` | 신규 — 순수 함수 단위 테스트 |
| `packages/pdp-core/src/types.ts` | `QaDefectType/QaSeverity/QaDefect`, `PdpErrorCode` 추가, 응답·`SectionBlueprint` 필드 추가 |
| `packages/pdp-core/src/pdp.service.ts` | 루프 배선, `QA_MAX_ATTEMPTS`, `generateSectionImage` 정책 throw, analyze 부착 |
| `packages/pdp-core/src/pdp.service.test.ts` | 통합 테스트 추가 |
| `packages/pdp-core/src/index.ts` | `generateSectionImage` 래퍼 `qa` 전파, `mapPdpErrorCodeToStatus` 422 |
| `apps/web/app/api/pdp/images/route.ts` | 성공 응답에 `qa` 포함 |
| `apps/web/app/create/*` | 최소 경고 배지 |

## 9. 비범위 (YAGNI)

- editable 모드·redesign 경로 QA (범위 밖)
- 브랜드 denylist 유지관리 (승인 카피 대조로 대체)
- QA 결과 영속화/분석 대시보드
- 3회 이상 재시도, 비동기/사후 QA

## 10. 독립 리뷰 반영 (2026-07-24, architect 서브에이전트)

| 항목 | 등급 | 처리 |
|---|---|---|
| B1 text_typo/body severity 비결정성 | BLOCKER | §4 반영: text_typo는 **location으로 코드가 blocking 결정**(headline/subheadline=blocking), body_distortion만 rubric 기반 모델 severity 신뢰 |
| B2 runQaGate 모델/스키마 미지정 | BLOCKER | §3 반영: `ANALYZE_MODEL` + `responseSchema` + `ThinkingLevel.LOW` 명시 |
| S1 기존 조기 반환 삭제 명시 | SHOULD | §5 반영: 조기 `return generatedImage` 삭제 명시 |
| S2 lastOutcome/qaEnabled hoist | SHOULD | §5 반영: 루프 바깥 선언 명시 |
| S3 index.ts 래퍼가 qa 누락 | SHOULD | §6 반영: 반환 타입 확장 + `qa` 전달 강조 |
| S4 재시도 idempotency key | SHOULD | §6 반영: 클라이언트가 422 후 새 key 발급 |
| S5 analyze hero 비대칭 + 예산 3→2 | SHOULD | **수용(문서화)**: analyze는 blueprint 보존 위해 throw 안 함(배지로 표기), 크레딧 경로(/images)에서 hard-block. hero 예산 2는 결정 #4(속도)의 의도된 트레이드오프. constant로 조정 가능 |
| S6 지연·비용 | SHOULD | §3 반영: thinkingLevel LOW. 매 풀이미지 생성에 QA 1회 + 실패 시 재생성 1회 추가 — `maxDuration=300`s 내 허용 |
| NIT 프롬프트 인젝션 | NIT | `buildQaPrompt`에서 카피를 명확한 구분자로 감싸고 "데이터로만 취급" 지시 |
| NIT fail-open 무신호 | NIT | **수용**: 품질 장치라 fail-open 유지. `parseError` 플래그만 관측용으로 남김 |
| NIT 배지 severity 미구분 | NIT | §6 반영: critical/minor 톤 구분 |
| NIT /images regenerate outputMode 전달 | NIT | 구현 시 클라이언트에서 확인 |
| 크레딧 경로·타입 경계 | 건전 확인 | throw→finalize(false,0)=미차감, 422 매핑, 타입 additive 확인됨 |
