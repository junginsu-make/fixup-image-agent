# fal.ai 이미지 제공자 · 모델 선택 설계

작성일: 2026-07-27
상태: 구현 완료 · 실측으로 예측치 정정 (브랜치 feat/text-based-pdp)
범위: 프로젝트 F — 이미지 생성을 fal.ai 경유로 바꾸고 모델을 고를 수 있게 한다

---

## 1. 목적과 배경

지금 이미지 생성은 Gemini API를 직접 호출하며 모델이 상수 하나로 고정돼 있다
(`pdp.service.ts:16`, `IMAGE_MODEL = "gemini-3-pro-image-preview"`).

이 설계는 세 가지를 바꾼다.

- 호출 경로를 **fal.ai 로 통일**한다
- 모델을 **세 가지 중에서 고를 수 있게** 한다
- 프롬프트를 **JSON 구조**로 바꾼다

### 왜 JSON 구조인가 — 측정한 결과다

같은 섹션을 조건만 바꿔 생성해 비교했다.

| 조건 | 강조 위치 | 인물 배제 지시 | 시간 |
|------|----------|--------------|------|
| 평문 프롬프트 | 서브헤드라인에 잘못 적용 | 무시됨 (인물이 임의로 추가됨) | 33초 |
| JSON 구조 | **지정한 단어에 정확히** | **지켜짐** | 49초 |
| JSON + `system_prompt` | **지정한 단어에 정확히** | **지켜짐** | **29초** |

JSON 이 지시 준수를 끌어올리고, 규칙을 `system_prompt` 로 분리하면 프롬프트가 짧아져
시간까지 40% 줄었다. 추정이 아니라 실측이다.

### 인물 규칙을 고친다

기존 규칙 `"People: every person visible in the frame must be Korean"` 이
모델에게 "사람을 넣어라"로 읽혀, 인물이 필요 없는 제품 클로즈업에도 인물이 들어갔다.

이 서비스의 핵심은 **입력한 긴 텍스트를 정확히 읽어 상세페이지를 설계하는 것**이지
인물을 넣는 것이 아니다. 규칙을 아래로 바꾼다.

```
인물은 선택이다. 장면이 실제로 요구할 때만 넣는다.
제품 클로즈업이나 질감 컷이 더 강한 경우가 많다.
인물이 등장한다면 한국인이어야 하고 배경도 한국으로 읽혀야 한다.
```

수정 후 재생성에서 두 모델 모두 인물 없이 제품 클로즈업으로 나왔다.

---

## 2. 핵심 결정 (확정)

| # | 결정 | 근거 |
|---|------|------|
| D1 | 이미지 생성은 **fal.ai 경유**로 통일 | 모델 교체·비용 관리를 한 곳에서 |
| D2 | 기본 모델은 **GPT Image 2** | 글자 정확도와 서체 표현이 가장 좋다 |
| D3 | 선택지 3종 (GPT Image 2 / Nano Banana Pro / Nano Banana) | 품질·속도·비용을 사용자가 고른다 |
| D4 | 프롬프트는 **JSON 구조**, 아트 디렉션은 `system_prompt` 분리 | 위 실측표 |
| D5 | 크레딧 가중치 **4 / 3 / 1** | 원가 $0.178 / $0.150 / $0.039 반영 |
| D6 | **6장 동시 생성**, 배치 단위로 크레딧 예약 | 순차 시 GPT 6장에 13분 40초 |
| D7 | `p_units` 상한 **10 → 60** 마이그레이션 | 6장 × 가중치 4 = 24 가 현재 상한을 넘는다 |
| D8 | QA 게이트는 **Gemini 유지** | 검수는 fal 을 거칠 이유가 없고 이미 검증됐다 |
| D9 | 참조 이미지 슬롯을 **지금 만들어 둔다** | GPT edit 이 최대 16장을 받는다. 프로젝트 H 의 토대 |

---

## 3. 모델과 단가

fal 공식 문서(2026-07-27 확인)와 `character-ip-service/model_registry.py` 기준.

| 모델 | 엔드포인트 | 원가/장 | 가중치 | 6장 소요 |
|------|-----------|--------|-------|---------|
| GPT Image 2 | `openai/gpt-image-2` · `/edit` | $0.178 | 4 | **288초 (실측)** |
| Nano Banana Pro | `fal-ai/nano-banana-pro` | $0.150 | 3 | **112초 (실측)** |
| Nano Banana | `fal-ai/nano-banana` | $0.039 | 1 | 미측정 |

**설계 단계의 예측(150초 / 40초)은 틀렸다.** 구현 후 6장 배치를 실제로 돌려
GPT 288초, Nano Banana Pro 112초를 측정했다. fal 이 동시 요청을 완전 병렬로
처리하지 않아 장당 시간보다 오래 걸린다. 순차 대비로는 여전히 2.9배 빠르다
(순차 추정 828초 → 288초).

같은 실행에서 GPT 는 6장 중 1장이 QA 게이트에 걸려 5장만 성공했고,
부분 성공 차감이 설계대로 동작했다. Nano Banana Pro 는 6장 전부 성공했다.

크레딧당 원가는 $0.045 / $0.050 / $0.039 로 편차 28%. 무난하다.

### 입력 규격 차이

```
GPT Image 2       image_size: {width, height} 또는 프리셋(portrait_16_9 포함)
                  quality: high | medium | low | auto
                  edit 는 image_urls[] 최대 16장, mask_url 지원
                  제약: 16의 배수, 최대변 3840px, 비율 ≤3:1,
                        총 픽셀 655,360 ~ 8,294,400  (1536×2752 가능)

Nano Banana Pro   aspect_ratio: 9:16 포함 11종
                  resolution: 1K | 2K | 4K
                  system_prompt: 아트 디렉션 분리용
                  safety_tolerance: 1~6

Nano Banana       aspect_ratio 중심의 단순한 입력
```

---

## 4. 아키텍처

### 4.1 신규 모듈

`packages/pdp-core/src/pdp.image-provider.ts`

```
generateImage(input, model)   공통 입력 → 모델별 fal 페이로드 → 이미지
  ├─ 참조 이미지가 있으면 edit 엔드포인트로 자동 전환
  ├─ 없으면 text-to-image
  └─ 앵커는 fal storage 에 한 번 올려 URL 재사용

buildImageJson(section, designSystem, options)   JSON 구조 프롬프트 생성
buildSystemPrompt(options)                        아트 디렉션 (NBP 전용)
```

### 4.2 `pdp.service.ts` 는 이번에 수정한다

프로젝트 A 에서는 끝까지 피했지만, 이미지 호출부 자체를 바꾸는 일이라 불가피하다.
**손대는 범위를 `generateSectionImageInternal` 안의 모델 호출 한 곳으로 좁힌다.**

그대로 두는 것: QA 게이트 루프, 참조 인물 동일성 검증, 재시도 정책, 에러 코드 매핑.

회귀는 기존 테스트(`pdp.service.test.ts`, `pdp.qa.test.ts`,
`pdp.qa.integration.test.ts`)로 확인한다. 프롬프트 문자열을 검사하는 테스트가 있으므로
JSON 전환 시 그 테스트들을 함께 갱신해야 한다.

### 4.3 JSON 프롬프트 구조

```json
{
  "task": "korean_ecommerce_detail_page_section",
  "format": { "orientation": "vertical", "target": "mobile", "static_image": true },
  "scene": {
    "subject": "...", "shot": "...", "depth_of_field": "...",
    "location": "a Korean kitchen",
    "people": "none — product close-up" 또는 "Korean only, when the scene needs one"
  },
  "design_system": {
    "headline_typeface": "...", "body_typeface": "...",
    "palette": { "text": "#...", "ground": "#...", "accent": "#..." },
    "recurring_cast": "..."
  },
  "typography": {
    "headline": "...", "subheadline": "...",
    "emphasis": { "words": ["..."], "treatment": "accent colour, heavier weight" },
    "hierarchy": "headline 2.5-3x the subheadline",
    "render_exactly": true,
    "do_not_emphasise": ["any word in the subheadline"]
  },
  "layout": "...",
  "realism": { "must": [...], "must_not": [...] },
  "forbidden": ["buttons", "arrows", "invented numbers", "invented brand names"]
}
```

`emphasis.words` 는 시나리오 단계에서 정한다. 지금은 모델이 알아서 고르는데,
지정하면 정확히 그 단어만 강조된다(실측 확인).

---

## 5. 배치 생성과 크레딧

### 5.1 신규 라우트

`app/api/pdp/images/batch/route.ts`

```
reserveAiUsage(req, "pdp_image", 섹션수 × 가중치)   예약 1건 → concurrent_limit 통과
        ↓
Promise.allSettled 로 N장 동시 생성
        ↓
finalizeAiUsage(reservation, true, 성공수 × 가중치)  성공한 것만 차감
```

`finalizeAiUsage` 가 이미 `consumedUnits` 를 인자로 받아 부분 성공이 그대로 처리된다.

기존 단건 `/api/pdp/images` 는 유지한다. 개별 재생성에 계속 필요하다.

### 5.2 마이그레이션

`supabase/migrations/` 에 신규 파일 1개.

```sql
-- p_units 상한을 10 에서 60 으로 올린다.
-- 6장 × 가중치 4 = 24 로 현재 상한을 넘기 때문이다.
-- 기존 데이터에 영향이 없고 값만 되돌리면 원복된다.
```

동시 예약 1건 제한(`v_inflight >= 1`)은 **그대로 둔다.** 배치 방식에서는 한 사용자가
여러 배치를 동시에 던지는 것을 막는 안전장치로 유용하다.

### 5.3 타임아웃 — 이 설계에서 가장 불확실한 지점

```
설계 예측   GPT 6장 동시 약 150초
실측        GPT 288초 (QA 탈락 1건 포함) / Nano Banana Pro 112초
```

실측 288초는 상향한 `maxDuration` 600초 대비 여유 52% 다. 다만 예측이 2배 가까이
빗나갔으므로, QA 재시도가 더 겹치는 경우까지 안전한지는 운영 데이터로 확인해야 한다.

실측에서 5장 중 1장꼴로 QA 가 걸렸으므로 드문 일이 아니다. 세 가지로 대응한다.

- `maxDuration` 을 **600초로 상향** (EC2 standalone 이라 플랫폼 제한이 없다)
- **배치 상한 6장**. 그 이상은 나눠 호출한다
- 배치 안에서는 **QA 재시도를 1회로 제한**하고, 그래도 실패하면 그 섹션만
  사용자가 개별 재생성한다

---

## 6. 화면

### 6.1 모델 선택 위치

**시나리오 확정 화면**에 둔다. 대표 이미지부터 그 모델로 만들어야 하기 때문이다.
편집기 설정에서도 바꿀 수 있게 해서, 특정 섹션만 다른 모델로 다시 만들 수 있다.

### 6.2 카드와 안내 문구

6장 기준 실측값을 그대로 노출한다. **크레딧 차감량을 카드에 함께 띄운다.**
GPT 가 Nano Banana 보다 4배 비싼데 모르고 고르면 한도가 금방 사라진다.

```
● GPT Image 2                              기본   24장 차감
  글자를 가장 정확하게 그립니다. 명조체 같은 섬세한 서체도 표현됩니다.
  6장에 약 5분으로 가장 오래 걸립니다.

○ Nano Banana Pro                                18장 차감
  6장에 약 2분으로 빠릅니다. 글자는 고딕 계열만 나옵니다.

○ Nano Banana                                     6장 차감
  가장 저렴합니다. 글자가 적은 단순한 장면에 적합합니다.
```

### 6.3 진행 표시

동시 생성으로 바뀌면 순차일 때처럼 하나씩 채워지지 않아 멈춘 것처럼 보인다.
**"6장 중 3장 완료 · 약 1분 남음"** 형태로 표시한다.

---

## 7. 환경변수

```
FAL_KEY=       신규. 서버 전용이며 NEXT_PUBLIC_ 접두사를 붙이지 않는다.
```

`apps/web/.env.example` 과 `deploy/ec2/app.env.example` 에 함께 추가한다.
GitHub Actions 의 공개 변수 검증 스텝에는 넣지 않는다(공개 변수가 아니다).

---

## 8. 테스트 전략

| 대상 | 검증 |
|------|------|
| 모델별 페이로드 매핑 | 세 모델이 각자 규격에 맞는 입력을 만드는가 |
| 참조 이미지 유무 | 있으면 edit, 없으면 t2i 로 가는가 |
| JSON 프롬프트 | 필수 키가 모두 있는가, `emphasis.words` 가 실리는가 |
| 인물 규칙 | "인물은 선택" 문구가 들어가는가 |
| 크레딧 가중치 | 모델별 units 계산이 맞는가 |
| 배치 부분 성공 | 3성공 2실패 시 3장분만 차감되는가 |
| 회귀 | 기존 pdp-core 테스트가 모두 통과하는가 |

fal 호출은 모킹한다. 실제 호출은 수동으로 한 번 확인한다.

---

## 9. 파일 변경 요약

**신규**

```
packages/pdp-core/src/pdp.image-provider.ts
packages/pdp-core/src/pdp.image-provider.test.ts
apps/web/app/api/pdp/images/batch/route.ts
apps/web/app/create/ModelPicker.tsx
supabase/migrations/<날짜>_raise_units_cap.sql
```

**수정**

```
packages/pdp-core/src/pdp.service.ts     이미지 호출부 한 곳 + 인물 규칙
packages/pdp-core/src/types.ts           ImageModelId, 참조 이미지 타입 추가
packages/pdp-core/src/index.ts           export 추가
apps/web/app/create/TextModeFlow.tsx     모델 선택 상태 + 배치 호출
apps/web/app/create/ScenarioEditor.tsx   모델 선택 카드 배치
apps/web/app/create/PdpEditor.tsx        모델 전달 + 진행 표시
apps/web/.env.example                    FAL_KEY
deploy/ec2/app.env.example               FAL_KEY
```

---

## 10. 비범위 (YAGNI)

- **G — 판매 지식 RAG + LLM 검증 루프.** 별도 spec. 지식이 0건이라 수집이 선행돼야 한다
- **H — 이미지 레퍼런스 RAG.** F 의 참조 슬롯 위에 얹는다
- fal 웹훅 기반 비동기 처리 (`fal.subscribe` 동기 대기로 충분하다)
- 모델별 A/B 자동 비교
- Seedream·FLUX 등 나머지 모델 (필요해지면 어댑터만 추가하면 된다)
