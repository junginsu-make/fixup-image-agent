# 크레딧 과금 전환 설계 — 월 구독 + 크레딧 구매

작성: 2026-09-22 · 상태: **로컬 구현·기초 검증 완료 / 최종 검수 미완료 / 운영 미적용** · 최초 조사 기준 커밋: `b58e4ac`
작성자: Claude (Opus 5) · 검토 요청 대상: **Codex 2차 리뷰**

---

## 구현 계약 보완 — 비용 전략실과 같은 기준 (2026-09-22, Codex)

사용자 추가 지시: 이 문서를 전달한 목적은 새 판매 정책을 비용 예산 페이지와 연결하는 것이다. **회원의 이해 → 실제 서비스 차감/만료 → 회사의 비용·수익 예측**을 하나의 계약으로 구현한다. 아래 계약과 개정된 §6·§8이 구현 기준이다. §2·§3은 변경 전 조사 기록이다. 검토 원문과 구체 반례는 `docs/bugs/2026-09-22-credit-subscription-design-review.md`에 보존했다.

### A. 무엇을 같은 기준으로 맞추는가

- `cost-v1`: 기존 원가 $0.05 환산. 과거 예약/비교안을 재현하기 위해 유지한다.
- `image-v2`: **회원에게 제공하는 최종 이미지 생성/수정 결과 1장=1크레딧**, 600만 픽셀 이상은2크레딧. 이 문턱은 비용 실측 전의 명시적 상품 가정이다.
- 카드뉴스는 최종 카드가 단위다. 내부 그림 슬롯/서비스 재시도는 회원에게 별도 차감하지 않고 회사 원가에 합산한다. 단가 상한도 모델 호출1회가 아니라 최종 결과물1개에 필요한 전체 비용으로 검증한다.
- 캐릭터의 새 후보·추가 각도·별도 sheet는 각각 새 결과물이다. 이미 만든 정면을 선택/저장하는 것은 다시 차감하지 않는다.
- 기획/분석은 이미지가 없으므로0크레딧이며 비용 장부와 호출 제한은 유지한다. 단순 내보내기/크기 변경도0, AI로 새 이미지를 생성/수정한 결과는 과금한다.
- 사용자 재생성은 새 결과물로 차감한다. 실패/중지는 실제 제공된 결과까지만 확정한다. 처리 완료 여부가 불명확하면 임의로 예약을 풀지 않고 정산 확인 대상으로 남긴다.
- 공통 정본은 `packages/shared/src/credit-policy.ts`. 서버가 확정한 크기로 quote를 만들고, 고객 미리보기와 예산 계산기도 같은 정책 함수를 사용한다.

### B. 비용 전략실 연결

통합 요약에서 **기존 원가 환산 / 새 이미지 정책**을 전환한다. 같은 고객·사용량·모델 조건에서 장수·API·저장·전송·서버·DB·이익을 다시 계산한다. `image-v2`는 기존의 가상 원화 충전형(1크레딧=1원)과 다른 정책이다.

정사각 표준형·기획 없음·100명×100크레딧 전액 사용 예시는 기존2,000장/$421.44, 새10,000장/$2,107.20이다. 원가가 그대로인데 제공량이5배가 되는 것이다. 모델/크기에 따라 배수는 달라진다.

구독은 월 갱신/이월 없음, 구매는 일회 지급/3개월 소멸 코호트로 비교한다. 실제 장부는 정확한 KST 시각을 쓰고, 월별 예측은 월초 지급으로 근사했다고 표시한다. 구매 매출을 판매 월의 현금 예산으로 보는 것과 미사용 원화 충전금의 인식매출은 구분한다.

### C. 정산과 지급의 불변식

1. 잔액의 정본은 lot다. **예약 시 어떤 lot의 몇 units를 확보했는지 기록**한다. 확보한 몫은 자연 만료가 지나도 해당 요청의 확정에 사용할 수 있다. 미사용 몫이 풀릴 때 이미 만료된 lot이면 가용 잔액으로 되살리지 않는다.
2. 같은 요청의 정산은 한 번만 반영한다. 이벤트 상태 전이, lot 소비, 소비 명세 기록을 동일 트랜잭션에서 수행한다. 다른 금액의 재시도는 기존 결과를 반환하거나 충돌로 거부한다.
3. 비동기 요청은 사용자 수정 가능한 project.data만으로 정산을 찾지 않는다. 서버 소유 job/request 연결과 요청 당시 quote를 저장한다. 다른 작업/공급자 요청으로 예약을 확정하지 못하게 검증한다.
4. expiry TTL은 외부 작업 완료 증거가 아니다. v2 예약은 시간만 지나면 자동 면제하지 않는다. 불명확한 실패는 보류하고 관리자 확인/정산 이력에 남긴다.
5. 구독 active만으로 지급하지 않는다. **관리자가 확인한 해당 기간의 납부/이용권**이 있어야 lazy 지급한다. PG는 나중에 같은 확인 경로를 호출한다. 미래 시작·미납·해지 이후의 새 기간을 자동 지급하지 않는다.
6. 정기 구독 지급의 유일성은 유료 기간 식별자, 수동 추가 지급은 action/source key로 보장한다. 구매 주문/수동 제출/웹훅 재시도도 같은 source key는 한 번만 지급한다.
7. 회수는 지급 기록을 삭제하지 않는다. 진행 중 예약이 있으면 먼저 그 정산을 해결해야 한다. 지급/회수/수납/전환에 actor·사유·원래 값·결과를 남긴다.
8. 1차 장부 쓰기는 짧은 공통 advisory transaction lock을 먼저 획득해 직렬화한다. 생성 API 대기와 관리자 목록 조회는 이 잠금 밖이다. profile/event/grant/FK 잠금 순서 교착을 피하고 동시 정산 테스트로 검증한다. 향후 잠금 세분화는 실측 후 별도 변경이다.
9. 팀 한도는 지갑과 별도 천장이다. 팀 전체 확정 사용과 예약을 한 번씩 계산하고, 0은 기존처럼 미설정이다. 단위 전환은 팀원과 팀의 기준까지 일관되게 처리해야 한다.

### D. 이행·운영 활성화

기존 `monthly_quota`를 새 보너스 의미로 덮어쓰지 않는다. legacy 정보는 보존하고 새 계정/지급 이력을 별도로 둔다. 신규 가입 보너스와 판매 플랜은 관리자 설정이며 문서 예시 가격을 실제 판매 설정으로 자동 활성화하지 않는다.

기존 회원 전환은 **명시적 환산값·시점·사유·구단위 snapshot**을 저장한다. 진행 중/미정산 요청을 먼저 확인한다. 서로 다른 단위의 과거 이벤트를 한 SUM에 섞지 않는다. 구매/소비가 발생한 뒤 함수만 옛 버전으로 되돌리는 것은 rollback이 아니다. 문제가 생기면 신규 생성/지급을 차단하되 새 장부와 이미 지급한 권리는 보존한다.

구현과 운영 적용을 구분한다. 새 SQL은 테스트용 PostgreSQL에서 검증하고, 운영 DB 적용·기존 회원 환산 실행·유료 API 원가 측정은 별도 실행 상태로 기록한다. 실제 원가가 미측정인 크기는 미검증으로 남긴다. 기능 플래그만 바꾸어 기존 잔액을 자동 환산하지 않는다.

### E. 회원·관리자 화면

회원은 총 가용 크레딧, 예약분, 구독/구매/보너스 잔액과 다음 만료일을 본다. “상세페이지 몇 개”는 구성 예시(8섹션+대표1)와 실제 생성 직전 quote를 구분한다. 기존 화면의 `quota-used-reserved` 식에 이미 소비가 반영된 balance를 넣지 않는다.

관리자는 `/admin/members`에서 DB 전체 범위를 기준으로 검색·정렬·필터한 뒤 페이지를 나눈다. 지급/회수·기간 납부 확인·플랜 변경·전환 준비·정산 보류를 관리한다. 페이지50개를 가져온 뒤 잔액순으로 다시 정렬하지 않는다. 관리자 대시보드의 전체 비용 집계를 회원 관리 진입 때마다 실행하지 않는다.

### F. 검증과 경제성

기존 마진 표는 세금/수수료 전 그림 원가 비교다. VAT10% 포함·PG3.3%·판매가1,000원의 경우 표준형 이미지 비용만으로 순매출 대비 마진은64.38%, 글 비용11원 추가 시63.17%다. $0.25 상한이65%를 보장하지 않는다. 예산 페이지에서 API·실패·인프라까지 포함해 판단한다.

DB `model_prices` 변경이 코드 CI를 자동 실행하지 않는다. DB 단가/코드 단가/실제 공급자 청구는 구분하고 날짜·버전·근거를 남긴다. 회귀 검증은 중복 지급/차감, 만료 중 확정, 조회 시 lazy 지급, 팀 경합, 잘못된 job 연결, 부분 성공, 미납, 구·신 단위 비교, 3개월 구매분 만료를 포함한다.

---

## 0. 이 문서를 읽는 사람에게

### 구현 검증 기록 (2026-09-22)

| 검증 | 결과 |
|---|---|
| `pnpm -r test` | 전체 패키지 통과. 웹 3,008 통과 / 6 건너뜀 |
| `pnpm -r typecheck` | 전체 통과. 마지막 포스터 정산 보완 후 웹 재검사도 통과 |
| `pnpm --filter web lint` | 오류 없음. 기존 이미지 태그·Hook 경고는 남음 |
| `pnpm test:credit-db` | 임시 PostgreSQL 17.10에서 20개 통과. 운영 접속 정보 사용 안 함 |
| `node scripts/tests/credit-mutations.mjs` | 중복 정산 방지 제거 / 만료 lot 보호 제거 모두 실패 감지 |
| 마지막 변경 회귀 | 포스터·회원·관리자 액션·SNS 정산·작업 목록 144개 통과 |
| 비용 예산 | 번들 최신성, 기존 159개·충전형 82개·시장 데이터 검사 통과 |
| 브라우저 | 계정·회원관리·설명서·포스터·SNS·비용예산 200, JS 오류 0; 390px/1440px 확인 |
| 예산 비교 저장 | JSON v3, 독립 HTML, fragment 왕복과 모바일/다크 화면 통과 |

브라우저 검증은 `LOCAL_AUTH_BYPASS=1`, `LOCAL_STORE=1`, `LOCAL_CREDIT_PREVIEW=1`로 실행했다. 미리보기 잔액은 개발용 고정값이며 실제 지급이 아니다. 관리자 금융 변경은 로컬 미리보기에서 비활성이다. 관리자 액션→SQL 인자 계약과 금융 동작은 별도 자동 테스트로 검증했다. 임시 개발 서버는 검증 후 종료했다.

검사 중 수동 대시보드용 SQL 사본을 최신 마이그레이션으로 오인하는 기존 테스트를 발견했다. 숫자 순서의 정본 SQL만 검사하고, 구 함수와 새 함수의 실제 작업 허용 목록을 각각 검사하도록 수정했다. 수동 SQL 사본은 변경하지 않았다.

**미실행:** 운영 DB 적용, 회원 잔액 환산, 실제 상품 활성화, 유료 fal 호출 실측, Linux 릴리스 빌드, 배포·운영 성능 검증. EC2/DB 권장 사양은 입력한 가정과 실측 수준을 표시하는 예측이며 성능 보장이 아니다.

**검수 범위 정정:** 위 결과는 로컬 자동 테스트와 화면 기본 동작 검증이다. 실제 Supabase 인증/권한 및 장부를 연결해 관리자가 지급→회원이 생성→정산→만료/회수하는 전체 브라우저 흐름을 검증한 것은 아니다. 전체 변경에 대한 최종 코드 리뷰도 완료로 표시하지 않는다.

**후속 리뷰에서 발견·수정한 문제:** `credit_mark_started`가 이미 반환·확정된 예약에서도 성공 응답을 주어, 서버가 예약 없이 제공사 호출을 시작할 수 있었다. 임시 DB에서 `Missing expected rejection`으로 재현한 뒤, 사용자/요청 이벤트를 잠그고 v2 예약의 상태가 `reserved`일 때 한 번만 시작하도록 수정했다. 반환된 예약의 시작 차단과 중복 시작 차단/기존 정책 호환 테스트를 추가했으며 장부 전체 20개가 통과했다. 이는 해당 경계 조건의 수정 증거이며 전체 검수 완료 선언은 아니다.

### 0.1 이 문서는 무엇인가

이 저장소(`fixup-image-agent`, 서비스명 MCS)의 **사용량 통제 방식을 "월 한도"에서
"구독 + 구매 크레딧 잔액"으로 바꾸는 설계안**이다.

**현재 상태:** 사용자 지시로 로컬 구현과 검증을 진행했다. 새 정책, 예산 계산기, DB 장부, 생성 경로, 회원·관리자 화면을 연결했다. 운영 DB 적용·회원 전환·배포·유료 API 실측은 실행하지 않았다.

### 0.2 Codex에게 요청하는 것

이 문서만 읽고 2차 리뷰가 가능하도록 썼다. **사용자에게 추가 설명을 요구하지 말 것.**
리뷰해 주길 바라는 관점은 §9에 따로 적었다.

### 0.3 읽는 순서

| 절 | 내용 | 급한 사람은 |
|---|---|---|
| §1 | 사용자 요구 원문과 해석 | 읽어야 함 |
| §2 | 현재 시스템 조사 결과 (전수) | 건너뛰고 필요할 때 |
| §3 | 조사에서 발견한 문제 — **버그 4건 포함** | 읽어야 함 |
| §4 | 결정 사항과 그 경위 (대화 히스토리) | 읽어야 함 |
| §5 | 설계 — 크레딧 표 | 읽어야 함 |
| §6 | 설계 — 데이터 구조와 차감 경로 | 읽어야 함 |
| §7 | 설계 — 화면 (회원/관리자) | 읽어야 함 |
| §8 | 단계 계획 | 읽어야 함 |
| §9 | 미해결 항목 · 가정 · 리뷰 관점 | **반드시** |

### 0.4 용어

| 말 | 뜻 |
|---|---|
| **크레딧(credit)** | 회원이 사는 이용 단위. 이 설계에서 **이미지 1장 = 1크레딧** |
| **units** | 기존 코드가 크레딧을 부르는 이름 (`requested_units`, `consumed_units`). 같은 것이다 |
| **장** | 기존 화면이 크레딧을 부르는 이름 (`84/100장`). 같은 것이다 |
| **원가** | 우리가 fal·OpenAI·Anthropic에 실제로 내는 돈 |
| **묶음(grant / lot)** | 한 번에 지급된 크레딧 덩어리. 만료일이 하나씩 붙는다 |
| **예약(reserve)** | 만들기 전에 크레딧을 잡아 두는 것. 10분 뒤 자동 해제 |
| **확정(finalize)** | 만들고 나서 실제로 차감하는 것 |

---

## 1. 사용자 요구

### 1.1 원문 (2026-09-22)

> 지금 시스템에서 사용량 통제 관리 사용자당 생성할 수 있는 이미지 장수로 하고 있습니다.
> 하지만 이 시스템은 이제 월 구독과 크레딧 구매로 비용 플랜을 계획하고 있습니다.
> 예를 들어서 월 100000원이면 100 크레딧을 제공하고, 100 크레딧 만큼 이미지를 생성할 수 있는거죠.
> 추가로 월 구독이 아니라 100 크레딧을 구매하면 그만큼 사용할 수 있는겁니다.
> 2개 차이가 있다면 **월 구독은 크레딧 이월 없이 다 소멸**하고
> **크레딧 구매는 3개월까지 보존하고 3개월 이후 소멸**되게 할 생각입니다.
> 그래서 시스템이 위에 맞게 자동으로 적용되어야 하고,
> **관리자 페이지에서 모든 사용자(수백명)을 빠르게 확인**할 수 있어야 하고 쉽게 확인/관리 할 수 있어야 합니다.

(원문의 "월 100000만원"은 오기로 보인다. 맥락상 **월 100,000원 = 100크레딧**, 즉 크레딧당
1,000원으로 해석했다. §9.1의 미확정 항목에 남겼다.)

### 1.2 대화에서 추가로 확인된 요구

| 시각 | 사용자 발언 요지 | 설계 반영 |
|---|---|---|
| 11:04 | "약관은 무시하세요. 변경하면 됩니다. 임시로 작성해둔 것입니다." | 약관 초안(§3.4)을 제약에서 제외. 단 환불 계산 **구조**는 법령 요구라 유지 |
| 11:08 | "코드 수정은 하지 마세요. 다른 터미널에서 관리자 페이지 예상 비용 지출 페이지를 개선 중입니다." | 이 설계는 문서만. 비용 전략실(cost-lab)과의 충돌은 §9.3에 명시 |
| 11:10 | "어렵게 가지 말고… 표준 모델 1크레딧, 상위 모델 2크레딧, 여러 장은 곱하기 식으로 쉽게" | 등급표 방향 채택 |
| 11:18 | "100크레딧 샀는데 20장만? 같은 오해를 최소화하고 싶다. 상세페이지 100장 만들겠네? 같은 오해도 없었으면" | §5.3 "작업 개수 환산" 도입. 모델 등급 제거 |

### 1.3 요구의 핵심 세 가지

1. **월 구독분은 이월 없이 소멸, 구매분은 3개월 보존.** 같은 "크레딧"인데 만료 규칙이 다르다.
2. **회원이 헷갈리지 않아야 한다.** 이게 가격 체계 설계를 좌우했다 (§4.3).
3. **관리자가 수백 명을 빠르게 확인·관리**해야 한다.

---

## 2. 현재 시스템 조사 결과

조사는 4개 영역을 병렬로 전수 조사했다. 아래는 그 결과를 합친 것이다.
**경로는 저장소 루트 기준이다.**

### 2.1 한 줄 요약

현재 시스템은 **"잔액"이 아니라 "달마다 리셋되는 한도"**다.
`profiles.monthly_quota`(정수)를 두고, 매번 `generation_events`의 이번 달 기록을 SUM해서
한도와 비교한다. **잔액을 담아 둘 칸이 없다.**

### 2.2 크레딧의 현재 정의 — 원가 연동

`packages/shared/src/credit.ts` (2026-09-08 사용자 결정)

```
CREDIT_UNIT_USD = 0.05            // 1크레딧 = $0.05
creditUnits(usd) = max(1, ceil(usd / 0.05))   // 0원이면 0, 그 외 최소 1, 올림
LLM_PLAN_USD = 0.009              // 기획 1회 (어림값, 실측 아님)
LLM_VISION_READ_USD = 0.007       // 그림 1장 읽기 (어림값, 실측 아님)
```

2026-09-08 이전에는 정수 가중치(4/3/2/1) 방식이었으나, 같은 "1장"이 모델마다 $0.039~$0.060으로
54% 차이 나 폐기했다. (Obsidian `decisions/2026-09-08-credit-follows-real-cost.md`)

### 2.3 모델과 실제 원가

`packages/sns-core/src/models.ts` · `apps/web/lib/credit-cost.ts`

**회원에게는 모델명을 숨기고 "성격 이름"만 보여준다** (2026-09-11 결정).

| 화면 이름 | 실제 모델 id | 원가 (1024×1024) | 지금 차감 |
|---|---|---|---|
| **표준형** (기본값) | `gpt-image-2.5-flare` (quality: max) | $0.21072 | 5크레딧 |
| 정밀형 플러스 | `gpt-image-2.5-sunburst` | $0.21072 | 5크레딧 |
| 정밀형 | `gpt-image-2` | t2i $0.211 / i2i $0.219 | 5크레딧 |
| 속도형 | `nano-banana-pro` | $0.15 (flat) | 3크레딧 |
| 속도형 라이트 | `nano-banana-2` | $0.08 × 1.5 = $0.12 | 3크레딧 |
| 경제형 | `nano-banana` | $0.039 (flat) | 1크레딧 |

`sns-core` 표에 없는 모델은 `apps/web/lib/credit-cost.ts`의 `FLAT_USD`에 하드코딩:
`seedream-5-pro` $0.0675, `qwen-image-2-pro` $0.075, `redesign-openai` $0.165, `redesign-google` $0.13

**크기별 단가표** (`GPT25_MAX`, `GPT_T2I`, `GPT_I2I`):

| 크기 | 픽셀 | GPT25_MAX |
|---|---|---|
| 1024×768 | 0.79M | $0.14445 |
| 1024×1024 | 1.05M | $0.21072 |
| 1024×1536 | 1.57M | $0.16464 |
| 1920×1080 | 2.07M | $0.15840 |
| 2560×1440 | 3.69M | $0.22110 |
| 3840×2160 | 8.29M | $0.40026 |

단가는 픽셀 수에 **선형이 아니다.** 8배 픽셀에 1.9배 값이다.

### 2.4 회원이 고를 수 있는 크기

`packages/sns-core/src/ratios.ts`

| id | 이름 | 픽셀 |
|---|---|---|
| `4:5` | 인스타그램 피드 | 1088×1360 |
| `1:1` | 정사각형 | 1088×1088 |
| `9:16` | 스토리·릴스 | 1152×2048 |
| `16:9` | 가로 배너 | 2048×1152 |
| `2:3` | 포스터 세로 | 1024×1536 |
| `3:4` | 포스터 세로(넓은) | 1152×1536 |
| `a4-draft` | A4 비율 시안 | 1088×1536 |
| **`a4-print`** | **A4 인쇄용 (약 290dpi)** | **2400×3392 (8.14M)** |
| `match-source` | 첨부한 그림과 같은 비율 | 가변 |

상세페이지(PDP)가 쓰는 크기: `1536×1536`, `1536×2048`, `1536×2752`, `2048×1536`, `2752×1536`

### 2.5 `priceCoverage` — 단가표에 없는 크기 처리

`packages/sns-core/src/models.ts`

```
요청 픽셀 <= 매칭된 행의 픽셀 × 2  →  그 행의 값
그렇지 않으면                     →  표에서 가장 비싼 값 ($0.40026)
```

**이것이 안전장치이지 실제 청구액이 아니라는 점이 이 설계에서 중요하다.** §3.2 참조.

### 2.6 DB 구조

정본 마이그레이션은 **번호가 붙은 파일**이다. 저장소에 있는 한글 이름 파일
(`적용할-마이그레이션-*.sql` 등)은 대시보드 붙여넣기용 사본으로 보이며 정본이 아니다.

`202609180001_pdp_jobs.sql`은 **커밋되지 않은 제안**이므로 현재 상태가 아니다.

#### `public.profiles`
```
id, email, email_confirmed_at,
role     text  ('member' | 'admin'),
status   text  ('pending' | 'active' | 'suspended'),
monthly_quota integer  default 100  check (0 <= x <= 10000),
approved_at, approved_by, approval_notified_at, created_at, updated_at
```

#### `public.generation_events` (사용량 장부)
```
id, user_id, request_id, team_id,
operation  text  check in ('pdp_analyze','pdp_image','redesign_generate','redesign_edit',
                           'poster_image','sns_image','ad_export'),
period_start    date      -- KST 월초
requested_units integer   check (0 <= x <= max_reserve_units())   -- 현재 60
consumed_units  integer   check (0 <= x <= requested_units)
status          text      ('reserved' | 'succeeded' | 'failed')
error_code, expires_at, completed_at, created_at,
model           text      -- 원가 계산용
billable_images integer   -- fal이 실제로 만든 장수 (회원 차감과 다를 수 있음)
llm_usd         numeric(12,6)
unique (user_id, request_id)
```

#### 인덱스 (4개)
| 인덱스 | 컬럼 | 용도 |
|---|---|---|
| `generation_events_user_period_idx` | (user_id, period_start, status) | 회원별 이번 달 사용량 |
| `generation_events_created_idx` | (created_at desc) | 기간 범위 |
| `generation_events_model_created_idx` | (model, created_at desc) | 모델별 (실제로는 거의 못 씀) |
| `generation_events_team_period_idx` | (team_id, period_start) | 팀 크레딧 |

#### 그 밖
- `model_prices (model, label, unit_cost_usd, note, updated_at)` — 관리자가 화면에서 수정
- `app_settings (key, value)` — `usd_krw` = 1380, `ai_badge`
- `teams (id, name, monthly_quota default 0, ...)` — 0은 "아직 안 정했다"
- `team_members (user_id PK, team_id, role)` — **한 사람은 한 팀에만**

### 2.7 차감의 심장 — DB 함수 2개

정본은 `supabase/migrations/202609140001_ad_export_operation.sql`이다.

#### `reserve_generation(p_user_id, p_request_id, p_operation, p_units, p_analysis_limit)`

순서대로 검사한다:
1. operation 화이트리스트 · `0 <= p_units <= max_reserve_units()` (60)
2. `profiles` 행 조회 (`for update`)
3. 팀 조회 → `effective_quota(user, team, personal_quota, period)` = `min(개인, 팀한도 − 팀원사용)`
4. 이메일 미인증 / status ≠ active 거부
5. **만료된 예약 정리** (`expires_at <= now()` → `failed`, `reservation_expired`)
6. 중복 요청 (`request_id`) → `duplicate_request`
7. `pdp_analyze`면 시간당 분석 횟수 제한 (기본 10, `ANALYZE_HOURLY_LIMIT`)
8. `p_units > 0`이면 **동시 1건 제한** (`concurrent_limit`)
9. `사용 + 예약 + 요청 > quota` → `quota_exceeded` 또는 `team_quota_exceeded`
10. 통과하면 `generation_events`에 `reserved` 행 삽입, **만료 10분**

#### `finalize_generation(p_user_id, p_request_id, p_success, p_consumed_units, p_error_code)`

```
consumed_units = least(greatest(p_consumed_units, 0), requested_units)
```
**확정값이 예약값보다 크면 조용히 잘린다.** 그래서 과다청구는 구조적으로 불가능하고,
위험은 언제나 **과소청구 방향**이다.

#### 기간 기준
`date_trunc('month', now() at time zone 'Asia/Seoul')` — **KST 월초 고정.**
달이 바뀌면 `period_start`가 바뀌어 저절로 0부터 시작한다.
→ 우연히도 사용자가 말한 **"월 구독은 이월 없이 소멸"과 같은 동작**이다.

### 2.8 차감 경로 조사 (보완: 직접 예약/확정 18개 라우트)

호출 진입점은 `apps/web/lib/membership/api.ts`의
`reserveAiUsage`(:53) / `finalizeAiUsage`(:143) / `settleAiUsage`(:158) 뿐이다.
`settleAiUsage`는 `finalizeAiUsage`를 try/catch로 감싸 **던지지 않게만** 한 래퍼다.

| 경로 | operation | 예약 계산 | 확정 계산 | 비고 |
|---|---|---|---|---|
| `api/poster/projects/[id]/plan/route.ts:125` | poster_image | `creditUnits(llmCostUsd({planCalls:1, visionReads}))` | 계량기 실측 usd → `creditUnits` | 그림 없음 |
| `api/poster/projects/[id]/generate/route.ts:176` | poster_image | `creditUnits(estimatePosterCost().totalUsd)` | **status 라우트에서** `creditUnits(unitUsd × savedCount)` | 예약id를 project.data에 저장 |
| `api/poster/projects/[id]/edit/route.ts:97` | poster_image | 위와 동일 (변형 1장) | status 라우트에서 동일 | |
| `api/poster/projects/[id]/status/route.ts:175` | (확정만) | — | `creditUnits(unitUsd × savedCount)` | fal 거절이면 0장 |
| `api/poster/projects/[id]/stop/route.ts:40` | (확정만) | — | 무조건 0, success=false | |
| `api/characters/route.ts:151` (candidates) | pdp_image | `characterCreditCost(...)` | ⚠ **`candidates.length` 그대로** | **§3.1 버그** |
| `api/characters/route.ts:199` (create) | pdp_image | `characterCreditCost(...)` | ⚠ **`angleCount-1` 그대로** | **§3.1 버그** |
| `api/characters/views/route.ts:54` | pdp_image | `imageCreditUnits(model,1)` 또는 `creditUnits(maxImageUnitUsd())` | `imageCreditUnits(result.model,1)` | **정상 대조군** |
| `api/redesign/generate/route.ts:50` | redesign_generate | `imageCreditUnits(provider, requested)` | `imageCreditUnits(provider, consumed)` | **정상 대조군** |
| `api/redesign/edit-section/route.ts:18` | redesign_edit | `imageCreditUnits(provider,1)` | ⚠ **성공 시 `1` 고정** | **§3.1 버그** |
| `api/pdp/images/route.ts:75` | pdp_image | `imageCreditUnits(model,1)` | `imageCreditUnits(model,1)` | `billable_images`는 QA 재시도 포함 |
| `api/pdp/images/batch/route.ts:121` | pdp_image | `imageCreditUnits(model, sections.length)` — **배치 전체 1회** | `imageCreditUnits(model, succeeded)` | |
| `api/pdp/analyze/route.ts:23` | pdp_analyze | **0** | **0** | llm_usd만 기록 |
| `api/pdp/plan-from-text/route.ts:22` | pdp_analyze | **0** | **0** | ⚠ cost 인자 자체를 안 넘김 → **원가 장부에 안 남음** |
| `api/pdp/key-visual/route.ts:27` | pdp_image | ⚠ **하드코딩 `1`** | ⚠ **`1`** | **§3.1 버그** |
| `api/sns/layout/analyze/route.ts:39` | sns_image | **0** | `creditUnits(meter.usd)` | |
| `api/sns/projects/[id]/generate/route.ts:69` | sns_image | `creditUnits(estimate.usd + llmCostUsd({planCalls:1+n}))` — **전체 1회** | `lib/sns/settle.ts:64` | |
| `api/sns/projects/[id]/cards/[index]/route.ts:127` | sns_image | 카드 1장분 | 동일 settle | |
| `api/ad/export/route.ts:151` | ad_export | `adExportUnits(needsCutout?1:0)` | `adExportUnits(cutoutCalls)` | 컷아웃 없으면 0 |

**핵심 원칙: "요청 하나 = 예약 하나".** 여러 장을 병렬 생성해도 예약은 1회다.
`concurrent_limit`(동시 1건) 때문에 그렇게 짜여 있다.

**0 units 예약 경로 4곳**: `pdp/analyze`, `pdp/plan-from-text`, `sns/layout/analyze`,
`ad/export`(컷아웃 없을 때). 0이어도 예약은 거친다 — 정지 계정과 한도 초과는 막아야 하므로.

### 2.9 멱등 키 (`x-idempotency-key`)

**4곳에서 각자 생성한다** (공통 함수 하나가 아니다):

| 위치 | 재사용 |
|---|---|
| `apps/web/lib/billable-fetch.ts:21,29` | 이미 헤더 있으면 존중 |
| `apps/web/app/create/pdp-utils.ts:34` | 호출자가 미리 넣으면 존중 (`PdpEditor.tsx:1390`) |
| `apps/web/app/redesign/redesign-wizard.tsx:310,666` | 인라인, 자체 변수로 재사용 |
| `apps/web/app/ad/ad-export-client.tsx:300` | ⚠ 재사용 변수 없음 (다만 0장 확정이라 위험 낮음) |

서버 검증은 `reserveAiUsage`(`membership/api.ts:67`) 한 곳. UUID v4 정규식 + 없으면 400.

### 2.10 회원에게 보이는 곳

| 위치 | 무엇을 |
|---|---|
| `apps/web/app/_components/studio-actions.tsx` | **스튜디오 전 화면 상단바 배지** `{used}/{quota}장`, 툴팁에 예약 수 |
| `apps/web/app/settings/page.tsx` | 잔량 큰 카드 + 진행 막대 + 초기화일 |
| `apps/web/app/team/credit-tab.tsx` | 팀 잔량 막대, 팀원별 사용량·실제 천장 |
| `apps/web/lib/membership/api.ts:100-107` | **한도 초과 오류 문구 전부 (한 곳)** |
| `apps/web/app/guide/credits/page.tsx` | 가장 상세한 약속 문서. "한도를 늘리려면 **운영자에게 문의**" |
| `apps/web/app/_landing/credit-facts.ts` | 랜딩이 쓰는 숫자를 실제 함수로 계산 |

**생성 전 예상 차감량 미리보기 — 7곳이 각자 다른 파일로 계산:**

| 도구 | 계산 | 렌더 |
|---|---|---|
| 포스터 | `app/poster/plan-cost.ts` | `poster/new-client.tsx:818` |
| Easy | `app/easy/cost.ts` | `easy/easy-client.tsx:624` |
| 카드뉴스 | `app/sns/cost-estimate.ts` | `sns/_components/spec-picker.tsx:42,150` — ⚠ **달러 표시** |
| 상세페이지 섹션 | `lib/credit-cost.ts` | `create/SectionGallery.tsx:249` |
| 상세페이지 키비주얼 | 고정값 | `create/KeyVisualGate.tsx:34` |
| 상세페이지 모델 카드 | `model.creditWeight × sectionCount` | `create/ModelPicker.tsx:67` |
| 리디자인 | 고정 8장 | `redesign/redesign-results.tsx:176` |
| 캐릭터 | `creditCost` prop | `characters/CharacterStudio.tsx:494` |
| 광고 | `lib/ad/cost.ts` | `ad/ad-export-client.tsx:399,663` |

### 2.11 관리자 화면

`apps/web/app/admin/page.tsx` — **666줄. 한 파일에 전부 섞여 있다.**

**한 번 열 때 DB 왕복 약 21회:**
1. (순차) `profiles` select+count → `teamsOf()` 2단 → `listTeams()` 3단 → …
2. (병렬 A, 6개) 전체 회원수, 승인대기 수, `admin_usage_summary`, `admin_usage_daily(30)`, `admin_usage_top(10)`, `admin_member_usage(ids)`
3. (병렬 B, 8개) `usd_krw`, `admin_cost_summary`, `admin_cost_by_member`, `admin_cost_by_operation`, `admin_cost_by_model`, `admin_cost_daily`, `model_prices`, `ai_badge`
4. `listShowcaseForAdmin()` (실패 무시)

**회원 목록 기능:**

| 기능 | 상태 |
|---|---|
| 페이지네이션 | 고정 50개 (`PAGE_SIZE`) |
| 검색 | 이메일만, `ilike %q%` |
| 필터 | status만 |
| 정렬 | **`created_at desc` 고정, 사용자가 못 바꿈** |
| 일괄 작업 | **없음.** 전부 행 단위 form |
| 내보내기 | **없음** |

**`admin_*` RPC 9개와 성능:**

| 함수 | 인덱스 적합성 |
|---|---|
| `admin_cost_summary()` | ❌ **필터 없이 `generation_events` 전체 스캔. 매 로드마다.** 가장 위험 |
| `admin_usage_top(n)` | ❌ `(user_id,...)` 인덱스가 선두 컬럼 불일치 → 풀스캔 |
| `admin_usage_daily(n)` | ❌ `at time zone` 표현식 인덱스 없음 → 사실상 풀스캔 |
| `admin_usage_summary()` | 🟡 부분적 |
| `admin_cost_by_operation/model/daily(n)` | 🟡 30일치 전량 읽고 GROUP BY |
| `admin_member_usage(ids)`, `admin_cost_by_member(ids)` | ✅ user_id 인덱스로 커버 |

**권한 계층 6겹:**

| 계층 | 파일 |
|---|---|
| 미들웨어 | `apps/web/middleware.ts` → `canAccessPage(path, viewer, PAGE_ACCESS)` |
| 라우트 등록부 | `apps/web/lib/access/routes.ts` (`APP_ROUTES`) |
| 판단 함수 | `apps/web/lib/access/core.ts` |
| 레이아웃 문지기 | `apps/web/app/admin/layout.tsx` → `requireAdmin()` |
| 서버 액션 개별 | `apps/web/app/admin/actions.ts` → `requireAdminFor(userId)` + 소유자 보호 |
| RPC grant | 마이그레이션의 `revoke all … grant execute to service_role` |

`/team`은 **다른 패턴**이다 — 레이아웃 문지기 없이 액션마다 `canWriteTeam()`으로 판단.

### 2.12 인프라

- EC2 단일 호스트에 웹(Node) + 수집 워커(`apps/worker`, 5분 폴링) 상주
- **정기 실행(cron/systemd timer) 장치 없음.** 워커에 얹을 자리는 있다
- 배포는 GitHub Actions → 릴리스 자산 → scp → `deploy-release.sh` (`docs/DEPLOY.md`)
- 기능 플래그 선례: `AD_EXPORT=1`일 때만 `/ad`가 열린다
- **결제(PG) 라이브러리 의존성 0건.** Toss/PortOne/Iamport/Stripe 어느 것도 없음

### 2.13 과거 결정 (Obsidian 위키 + 코드 주석)

| 언제 | 결정 | 출처 |
|---|---|---|
| 2026-09-07 | 팀 크레딧: `min(개인, 팀 잔량)`. 팀 한도 0 = "안 정함" | `202609070005_team_credit.sql` |
| 2026-09-08 | **크레딧을 원가에 연동.** 1크레딧 = $0.05 | `decisions/2026-09-08-credit-follows-real-cost.md` |
| 2026-09-11 | 가입 기본 월 100크레딧 (5→30→100). 기존 회원은 소급 안 함 | `202609100005_signup_quota_100.sql` |
| 2026-09-11 | **가격은 마진율로 말한다. 목표 65~75%** (SaaS 통상 80~90%는 못 씀 — 장당 실비가 나감) | `decisions/2026-09-11-price-by-margin-not-markup.md` |
| 2026-09-11 | **모델명은 회원에게 안 보인다.** 성격 이름만 | 같은 문서 |
| 2026-09-17 | 회원 단위는 "장"이지 달러가 아니다 → 포스터·Easy에서 달러 제거 | 커밋 이력 |
| 미정 | **판매가 자체**. `docs/service-introduction.md` §4에 "비워둔 항목"으로 명시. `docs/landing.md`에 "가격과 월 한도는 의도적으로 비워 두었다"고 규칙으로 박제 | |

**가격 결정에 쓸 실사용 데이터가 없다** — 2026-09-11 기준 총 25건, 유효 사용자 3명, 전부 내부 테스트.

---

## 3. 조사에서 발견한 문제

### 3.1 🔴 과소청구 버그 4건

확정 단계에서 **원가 환산(`creditUnits` / `imageCreditUnits`)을 빠뜨리고 원본 이미지 장수를
그대로 넘기는** 지점이 3곳, 애초에 모델가를 안 보는 지점이 1곳 있다.

| 파일:줄 | 무슨 일 | 결과 |
|---|---|---|
| `apps/web/app/api/characters/route.ts:168` | 예약은 `characterCreditCost`(원가 환산), 확정은 `candidates.length` raw | 비싼 모델일수록 덜 깎임 |
| `apps/web/app/api/characters/route.ts:222` | 같은 패턴 (`angleCount-1`) | 같음 |
| `apps/web/app/api/redesign/edit-section/route.ts:26` | 예약 `imageCreditUnits(provider,1)` (= 4), 확정은 **항상 `1`** | 예약 4 → 확정 1 |
| `apps/web/app/api/pdp/key-visual/route.ts:27` | 예약·확정 둘 다 **하드코딩 `1`** | 모델가 무시 |

**대조군이 명확하다.** `api/characters/views/route.ts:54`와 `api/redesign/generate/route.ts:50`은
같은 계산을 올바르게 `imageCreditUnits`로 재환산한다. 즉 **실수다.**

`finalize_generation`이 `consumed_units`를 `requested_units` 이하로 클램프하므로
**과다청구는 구조적으로 불가능**하고, 오차는 언제나 과소청구 방향이다.

> **이 버그들은 §5의 설계(1장 = 1크레딧)를 채택하면 원인 자체가 사라진다.**
> "장수 → 원가 → 크레딧" 환산 단계가 없어지고 "장수 = 크레딧"이 되기 때문이다.

### 3.2 🟠 상세페이지 크기의 실제 원가가 측정된 적이 없다

`priceCoverage`는 단가표가 못 덮는 크기에 **표에서 가장 비싼 값($0.40026)**을 쓴다.
이건 우리를 보호하는 안전장치이지 fal이 실제로 청구한 금액이 아니다.

상세페이지가 쓰는 크기 대부분이 이 "모름" 구간에 걸린다:

| 크기 | 픽셀 | 매칭 행 | 덮나 | 적용 단가 |
|---|---|---|---|---|
| 1536×1536 | 2.36M | 1024×1024 (1.05M) | 2.36 > 2.10 → ❌ | **$0.40026** |
| 1536×2048 | 3.15M | 1024×1536 (1.57M) | 3.15 ≤ 3.15 → ✅ | $0.16464 |
| 1536×2752 | 4.23M | 1024×1536 (1.57M) | 4.23 > 3.15 → ❌ | **$0.40026** |

**부풀려진 값일 가능성이 높다.** 표를 보면 더 큰 2560×1440(3.69M)이 $0.22110이다.
2.36M짜리가 $0.40일 리가 없다.

영향 범위가 둘이다:
1. **이 설계** — 상세페이지를 "보통 크기"로 볼지 "인쇄용 큰 크기"로 볼지가 갈린다
2. **비용 전략실(cost-lab)** — 같은 함수를 입력으로 쓰므로 상세페이지 예상 지출이 최대 2배 부풀려 나올 수 있다

**조치: fal에 상세페이지 크기로 실제 1회 호출하여 청구액을 확인한다 (§8 0단계).**

### 3.3 🟡 관리자 화면 성능 병목

`admin_cost_summary()`가 **필터 없이 `generation_events` 전체를 스캔**하고,
`/admin`을 열 때마다 실행된다. 회원 수백 명·기록 수십만 건이 되면 이 함수 하나가
페이지 전체를 느리게 만든다.

`admin_usage_top`, `admin_usage_daily`도 인덱스가 안 맞아 사실상 풀스캔이다.

### 3.4 🟡 이용약관 초안과 새 모델의 충돌

`apps/web/app/_landing/legal/documents.ts` (시행일 2026-09-10 초안)

| 조 | 지금 적힌 것 | 새 모델 |
|---|---|---|
| 제4조 | "이 상품은 **일회성 충전 상품으로 자동 갱신되지 않습니다**" | 월 구독(자동 갱신) |
| 제6조 | "**유료 크레딧에는 별도의 유효기간을 두지 않습니다**" | 구매분 3개월 소멸 |
| 제6조 | 소비 순서: 무료 먼저 → 유료를 구매 순서대로 | §6.4에서 재정의 |
| 제7조 | 미사용 유료 크레딧 **잔액 환불**, 환불액 = 결제금액 × 미사용 비율 | 유지 |

**사용자 판단(2026-09-22 11:04): "약관은 무시하세요. 변경하면 됩니다. 임시로 작성해둔 것입니다."**

→ 약관 문구는 이 설계의 제약이 아니다. **다만 제7조의 "구매 건별 미사용 비율 환불"은
전자상거래법이 요구하는 구조**이므로, 데이터 구조는 그것을 지원해야 한다 (§6.2).

### 3.5 🟢 부수 발견 (범위 밖이지만 함께 고칠 만한 것)

| 무엇 | 위치 |
|---|---|
| `/guide` 허브에 옛 숫자 "4.6배" (실제 5.4배) | `apps/web/app/guide/page.tsx:131` |
| `/sns`만 예상 비용을 **달러**로 표시 (나머지는 "장") | `apps/web/app/sns/_components/spec-picker.tsx` |
| `pdp/plan-from-text`가 LLM 원가를 장부에 안 남김 | `apps/web/app/api/pdp/plan-from-text/route.ts:22` |
| 비용 RPC 4개에 `grant execute to service_role` 누락 (Supabase 기본 권한에 얹혀 동작 중) | `202607280005_cost_tracking.sql` |
| `ad-export-client.tsx`가 재시도 시 멱등 키를 새로 만듦 | `apps/web/app/ad/ad-export-client.tsx:300` |

---

## 4. 결정 사항과 그 경위

이 절은 **왜 그렇게 정했는지**를 남긴다. 결론만 보면 §5로 가면 된다.

### 4.1 결정 1 — 크레딧 단위: 원가 연동 → **1장 = 1크레딧**

**선택지였던 것:**

| 안 | 내용 | 마진 |
|---|---|---|
| A | 1크레딧 = 1장 (정액) | 45~95% (크기 따라 변동) |
| B | 지금 유지 (1크레딧 = $0.05) | 모델 무관 일정 |
| C | 모델 등급별 고정 크레딧 표 | 중간 |

**사용자 선택: A.**

**이 결정을 지지하는 조사 결과:**

원가 연동은 **"우리가 원가를 정확히 안다"는 전제** 위에 선다. 이 저장소에서 그 전제가
**세 번 깨졌다**:

| 언제 | 무슨 일 |
|---|---|
| 2026-09-11 | 리디자인 원가 $0.19가 한 번도 검증 안 된 값이었음. 실제로는 `quality:"low"`로 호출 중이라 훨씬 쌌음. "가장 비싼 도구"인 줄 알았는데 가장 쌌음 (`errors/unverified-price-hardened-into-billing.md`) |
| 2026-09-10 | 원가 장부가 **1/3만** 기록. 포스터·카드뉴스가 한 줄도 없었음 (`errors/ledger-recorded-charges-not-costs.md`) |
| 2026-09-22 (오늘) | 확정 단계 환산 누락 **4곳** 발견 (§3.1) |

원가 연동에서 원가가 틀리면 **회원에게 직접 잘못 청구된다.**
장수 기준에서 원가가 틀리면 **우리 마진만 흔들리고, 그건 관리자 화면 숫자로 보인다.**

또한 이 저장소는 지난 3주간 모델·단가가 계속 바뀌었다 (gpt-image-2.5 도입,
qwen 단가 정정, 리디자인 모델 3회 교체). 원가 연동이면 **같은 작업이 어제 5크레딧,
오늘 4크레딧**이 된다. 회원에게는 고장으로 보인다.

### 4.2 결정 2 — 모델 등급을 두지 **않는다**

사용자가 처음에는 "표준 모델 1크레딧, 상위 모델 2크레딧"을 원했다(11:10).
그러나 실제 원가를 확인한 결과 **근거가 없었다**:

| 방식 | 원가 (1024×1024) |
|---|---|
| 표준형 | $0.21072 (291원) |
| 정밀형 | $0.211~0.219 (291~302원) |
| 정밀형 플러스 | $0.21072 (291원) |

**4% 차이다.** 모델 등급은 원가가 아니라 순수 상품 전략이 된다.
사용자의 최우선 요구가 "회원이 헷갈리지 않는 것"(11:18)이므로 **뺐다.**

**실제 원가 차이는 모델이 아니라 크기에서 난다** (보통 54~302원 vs 인쇄용 552원).

> 상품 전략으로서의 모델 등급은 **나중에 얹을 수 있다.** 지금 빼는 것이
> 되돌리기 쉽다 (등급을 없애는 것보다 넣는 것이 쉽다).

### 4.3 결정 3 — 오해를 "설명"이 아니라 "환산"으로 막는다

사용자 우려(11:18):
- "100크레딧 샀는데 20장만 생성되네?" → **결정 1로 사라진다** (100크레딧 = 100장)
- "100크레딧이면 상세페이지 100장 만들겠네?" → **남는다.** 상세페이지 1개 = 이미지 여러 장

다른 AI 서비스 조사 (방식만, 금액은 자주 바뀌므로 제외. 2026-05 기준 지식이라 최신 확인 필요):

| 서비스 | 파는 단위 | 모델·품질 차이 |
|---|---|---|
| ChatGPT | 구독 정액 + 시간당 횟수 | 크레딧 없음 |
| Midjourney | 구독 + 빠른 GPU 시간(분) | 시간으로 흡수 — **가장 이해하기 어려운 방식** |
| Adobe Firefly | 구독 + 월 생성 크레딧 | **기능별 소모표 공개.** 소진 후 차단 아닌 감속 |
| Canva | 구독 + 월 AI 크레딧 | 기능당 1크레딧 고정 |
| Leonardo.ai | 토큰 | **설정을 바꾸면 그 자리에서 실시간 표시** |
| Runway | 크레딧 | 영상 1초당 |

**공통점 셋:**
1. "구독 + 월 크레딧"이 사실상 표준이다
2. **아무도 "크레딧이 무엇인지" 이해시키려 하지 않는다.** 대신 "지금 이걸 하면 얼마"를 그 자리에 띄운다
3. 예외는 최대한 적게 둔다

→ **§5.3의 "작업 개수 환산"과 §7.1의 네 자리 표시**가 여기서 나왔다.

### 4.4 결정 4 — 결제(PG)는 2단계로 미룬다

**사용자 선택 (11:00):** 1단계는 장부·구독 플랜·만료·관리자 화면·회원 잔액 화면까지.
지급은 **관리자가 손으로** (계좌이체 받고 입력). PG는 그다음.

근거: 돈이 오가는 자리가 한꺼번에 둘(장부 + 결제)이면 위험하다.
회원 수가 적은 지금이 이렇게 할 수 있는 유일한 시기다.
(사용자 기록: "위험한 변경은 단계로 나누고 매 단계 독립 리뷰·뮤테이션 검증")

---

## 5. 설계 — 크레딧 표

### 5.1 규칙 (회원이 외울 것은 이 한 줄)

```
   이미지 1장 = 1크레딧

   예외는 하나뿐:  인쇄용 큰 크기 = 2크레딧
```

### 5.2 마진 검증 — 비용 예산 화면에서 판단

크레딧당 판매가 1,000원과 환율 1,380원은 **상품 설정이 아닌 비교 가정**이다. 소비자가격에 VAT 10%가 포함되고 PG 수수료가 총 결제액의 3.3%라면 순매출은 909.09원, 수수료는 33원이다.

| 결과물 | 이미지 원가 | 순매출 대비 마진 (이미지·PG만 차감) |
|---|---:|---:|
| 표준형 정사각 1장 ($0.21072) | 290.79원 | 64.38% |
| 원가 $0.25인 1장 | 345원 | 58.42% |
| 인쇄용 2크레딧, 원가 $0.40026 | 552.36원 | 65.99% |

LLM·실패·서비스 재시도·EC2·Supabase·전송·운영 비용은 위 비율에서 추가로 빠진다. 표준형에 글 비용 11원을 추가하면 63.17%다. 따라서 과거의 “전부 70% 이상, 목표 충족” 주장은 폐기한다. 최종 카드 하나에 그림 슬롯이 여러 개 있으면 그 전체 원가를 분모가 아닌 비용에 합산한다.

### 5.3 "인쇄용 큰 크기"의 정의

**픽셀 수로 가른다. 모델이나 도구로 가르지 않는다.**

```
   요청 픽셀 수 >= 6,000,000  →  2크레딧
   그 미만                    →  1크레딧
```

근거: 단가표에서 값이 튀는 지점이 3.69M($0.221)과 8.29M($0.400) 사이다.
600만을 문턱으로 잡으면 `a4-print`(8.14M)만 걸리고 나머지는 전부 1크레딧이다.

**§3.2의 실측 결과에 따라 이 문턱을 조정한다.** 상세페이지 크기(최대 4.23M)는
현재 기준으로 **1크레딧**이며, 이것이 실측과 맞는지 확인이 필요하다.

문턱 값은 **한 곳에만 둔다** — `packages/shared/src/credit-policy.ts`.
`sns-core`, `poster-core`, `credit-cost.ts` 어디서도 따로 적지 않는다.

### 5.4 원가 상한은 검증 상태와 분리한다

`IMAGE_CREDIT_POLICY.costCeilingVerified=false`다. $0.25/$0.50은 수익성을 보장하는 확정 상한이 아니다. 코드 단가표와 운영 DB `model_prices`, 실제 fal 청구는 서로 다른 자료다. 관리자 DB 가격 변경은 코드 테스트를 실행하지 않으므로 “DB를 고치면 빌드가 자동 차단된다”는 옛 문구는 폐기한다.

이 구현은 새 단가를 강제로 낮추거나 크기별 제공사 가격을 꾸며 넣지 않는다. 예산 화면에는 단가 출처/확인 날짜와 가정/실측 여부를 남기고, 실제 결제 플랜 활성화 전 대표 크기·내부 재시도·슬롯 합성까지 유료 실측한다. 서버 추천도 RAM/CPU/동시작업 가정에 따른 예상이며 성능 보장이 아니다.

### 5.5 작업 개수 환산

정본은 `packages/shared/src/credit-policy.ts`의 `WORK_CREDIT_PRESETS`와 `workCreditExamples`다. 상세페이지 **8섹션+대표1**은 9크레딧, 카드뉴스 **8장 구성 예시**는 8크레딧, 포스터 1장은 1크레딧이다. 이는 AI가 정하는 가변 구성의 실제 기본값이라고 주장하지 않는다. 예를 들어 84크레딧이면 각각만 만들 때 상세페이지 9회, 카드뉴스 10회, 포스터 84장이다. 인쇄용 크기와 생성 직전 실제 구성은 별도 quote로 확정한다.

---

## 6. 구현 데이터 구조와 차감 경로

SQL 전문의 정본은 다음 두 마이그레이션이다. 문서에 별도의 실행 가능한 사본을 두지 않는다.

- `supabase/migrations/202609220001_credit_ledger_v2.sql`: 장부·구독·관리자 처리·팀 정책
- `supabase/migrations/202609220002_credit_compatibility.sql`: 구·신 경로 분기, 옛 서버의 새 계정 과금 차단, 프로젝트 쓰기 권한

### 6.1 표와 책임

| 표 | 책임 |
|---|---|
| `credit_accounts` | 명시적 정책 전환, 환산 비율, 원래 월 한도/사용/잔액 snapshot |
| `credit_grants` | 구독·구매·추가 지급 lot, 만료, 사용·예약 잔액, 지급/회수 actor |
| `credit_holds` | 요청별 확보 lot와 수량; 만료를 지나도 진행 중 권리 보존 |
| `credit_consumptions` | 확정 소비 명세; 사용자/요청/lot 유일 |
| `credit_jobs` | 소유자·프로젝트·공급자 작업·엔드포인트의 변경 불가능 연결 |
| `subscription_plans` | 월 지급량/가격/사용 여부; 자동 활성 상품 없음 |
| `user_subscriptions` | 상품·구독 상태·시작/해지; 이것만으로 지급하지 않음 |
| `subscription_periods` | 관리자가 납부 확인한 월별 이용권과 금액/수량 snapshot |
| `credit_admin_events` | 지급·회수·수납·구독 변경·정산·정책 전환 감사 이력 |

기존 `generation_events`에는 `pricing_policy`, 서버가 만든 `credit_quote`, `credit_phase`를 추가한다. `monthly_quota`는 덮어쓰지 않는다. 기존 이벤트는 `cost-v1`로 보존한다.

### 6.2 예약·확정

1. 인증된 서버가 실제 크기/최종 결과 수로 `creditImagePlan` 또는 `freeCreditPlan`을 만든다. 클라이언트가 units를 지정하지 않는다.
2. `reserveAiUsage`는 `CREDIT_LEDGER=1`일 때 `credit_reserve_dispatch`를 호출한다. 전환한 계정만 v2로, 나머지는 기존 DB 함수로 간다. 크기 미확인 quote는 전환 계정에서 차단한다.
3. v2는 공통 transaction advisory lock을 먼저 잡고, 납부한 현재 이용권만 lazy 지급한다. 가용 lot 잔액과 팀 한도를 확인하고 만료가 빠른 lot부터 예약한다. 이때 이미 소비된 값을 다시 차감하지 않는다.
4. 외부 생성 직전 `markCreditStarted`를 남긴다. 포스터 제출 뒤 공급자 작업을 `credit_jobs`로 연결한다. SNS 흐름의 예약 연결은 서버 소유 저장소가 쓴다. authenticated의 poster/sns 프로젝트 직접 INSERT/UPDATE 권한을 제거하고 기존 소유자 검증 서버 경로만 service role로 쓴다.
5. 확정은 quote 내에서 실제 전달한 위치/개수만 소비한다. 이벤트·hold·lot·소비 명세를 한 트랜잭션으로 닫는다. 같은 요청 재정산은 처음 결과를 반환한다.
6. 이미 시작한 작업이 중지/통신 장애로 불확실하면 `needs_review`로 유지한다. TTL만으로 풀지 않는다. 관리자에게 제공사/저장 이력 확인 근거와 실제 전달 위치를 받아 정산한다. 장부 오류로 전달 결과나 예약 연결을 지우지 않는다.

기획·분석·단순 광고 내보내기(배경 제거 포함)는 v2 회원 차감 0이다. 제공사 비용은 별도로 남긴다. 무료 요청도 시간당 제한을 적용한다. SNS는 완성 카드 수와 이번 작업의 내부 슬롯 호출 수를 각각 기록한다.

### 6.3 구독·구매·조회

- 구독은 KST 달력월 기준이며 이월하지 않는다. `credit_admin_confirm_period`로 납부 확인된 기간만 발급한다. 미래 월은 시작 전 지급하지 않는다.
- 구매는 지급 시각에서 KST 달력 3개월 뒤 만료한다. 말일은 해당 월 마지막 날로 조정한다. 회수는 삭제 대신 사유와 actor를 기록하고, 처리 중 hold가 있으면 거절한다.
- `credit_summary`는 납부 이용권 lazy 발급 후 잔액을 읽는다. 회원 헤더/설정/생성 응답은 모두 같은 정규화 함수를 사용한다.
- 목록은 `credit_admin_members`에서 전체 집계→검색/상태/팀/상품/잔액/만료 필터→정렬→페이지 순서로 실행한다. CSV는 현재 페이지라는 범위를 표시한다.
- 일괄 수동 지급은 단일 DB 트랜잭션이다. 동일 action/source key 재시도는 중복 지급하지 않는다.

### 6.4 팀과 이행

팀 한도는 개인 지갑과 별도의 천장이다. 확정 사용·예약·전환 시의 기존 사용을 합산한다. 같은 팀의 다른 회원이 동시에 요청해도 한도를 넘지 않는다. 팀은 전원을 함께 환산해야 하며 구·신 단위 회원을 한 팀에 섞지 못한다. 한도 환산 결과 0이 되어 기존의 “제한 없음”으로 바뀌는 전환도 거절한다. 아무 회원/작업/한도가 없는 새 빈 팀만 첫 회원의 정책을 따른다.

전환은 관리자 화면에서 대상·기존 몇 크레딧을 새 1크레딧으로 볼지·근거를 직접 확인한다. 남은 구단위는 내림 환산한 3개월 추가 지급으로, 이미 쓴 양은 올림 환산한 당월 시작 사용량으로 보존한다. 진행 중 옛 예약은 정산 전 전환할 수 없다. 만료 처리된 옛 작업도 별도 확인을 요구한다.

---

## 7. 구현 화면

### 7.1 회원

- 상단: 전환한 계정은 “사용 가능 N크레딧”, 옛 계정은 기존 “사용/월 한도”를 표시한다. `CreditPolicyProvider`는 서버 사용량의 계정별 정책을 전달하고 생성 후 사용량 이벤트로 갱신한다.
- 계정: 가용 잔액, 구독/구매/추가 지급, 각 가장 가까운 만료일, 처리 중 예약분, 이번 달 사용량, 작업 개수 예시를 표시한다.
- 이미지/Easy: 공통 크기 판정으로 일반 1/인쇄 2를 미리 표시하고 기획 무료를 안내한다. 크기를 모르는 경우 확정 숫자를 꾸며 내지 않는다.
- 상세페이지/캐릭터: 새 정책의 최종 이미지 수로 차감을 안내한다. 카드뉴스: 완성 카드 수로 표시하고 내부 슬롯 호출은 회사 원가로 남긴다.
- 크레딧 설명서: 계정 정책에 맞는 설명을 낸다. 공개 랜딩의 기존 가격 표현은 아직 운영에 활성화한 상품이 아니므로 새 정책 판매 문구로 일괄 변경하지 않는다.

### 7.2 관리자 `/admin/members`

`page.tsx`는 인증·검색·DB 조회, `members-client.tsx`는 선택/지급/구독/정산/이력, `actions.ts`는 입력 검증·관리자/소유자 보호·RPC 호출을 담당한다. 기존 `/admin` 권한 경로가 하위 경로에도 적용되고 페이지·서버 액션에서 다시 `requireAdmin`을 검사한다.

| 기능 | 현재 구현 |
|---|---|
| 목록 | 이메일 검색, 상태·팀·상품·잔액·7일 내 만료 필터 |
| 정렬 | 가입일·이메일·잔액·사용량·만료일, 전체 집계 후 정렬 |
| 페이지 | 50/100/200명, 현재 페이지 CSV (CSV 수식 입력 방지) |
| 일괄 | 선택 회원 크레딧 지급, 명시적 단위 전환; 지급은 단일 DB 트랜잭션 |
| 상세 | 구독 상품/상태, 납부한 월별 이용권, 지급·회수·관리자 변경 이력 |
| 정산 | 미완료 요청의 실제 전달 위치 선택, 확인 근거를 남겨 확정/반환 |
| 확인 | 대상 수·1명당 지급량/수령액·환산 비율을 제출 전 표시 |
| 재시도 | 실패한 변경은 같은 source/action key로 재시도 |

기존 승인/정지/팀 배정은 기존 관리자 기능을 유지한다. 새 페이지에서 비용 집계 RPC 9개를 실행하지 않으므로 회원 잔액을 볼 때 전체 비용 대시보드를 다시 읽지 않는다. 과거 누적 사용량은 전환 기간에 구·신 단위가 함께 들어갈 수 있음을 기존 대시보드에 명시한다. 전환 계정은 옛 월 한도 수정 액션을 막고 새 지급/회수로 안내한다.

DB 연결을 끄거나 로컬 인증 우회로 실행한 관리 화면은 명시적인 미리보기이며 변경 버튼이 비활성이다. 운영에서 실패한 조회를 0원/0명 실데이터처럼 숨기지 않고 오류를 표시한다.

### 7.3 비용 예산 `/admin/cost-lab`

통합 요약의 구·신 정책 전환은 **비교 시나리오만 바꾼다**. 운영 회원 정책을 변경하지 않는다. API·저장·전송·EC2·Supabase 총비용과 무료 혜택 종료, 회원 증가, 사양 추천을 같은 시나리오에서 확인한다. 자세한 입력은 접어서 단순 요약과 함께 사용한다. 계획 저장/불러오기/독립 HTML 내보내기에도 정책과 단가 snapshot을 보존한다.

---

## 8. 적용 순서와 되돌리기

### 8.1 로컬 구현·검증

공통 정책, 예산 비교, DB 장부와 분기, 18개 직접 과금 경로, 회원 안내, 관리자 페이지를 함께 구현한다. 정책을 먼저 바꿔 옛 장부로 소비하는 중간 단계는 두지 않는다. `pnpm test:credit-db`는 운영 접속 정보를 읽지 않고 임시 PostgreSQL을 생성한다.

### 8.2 운영 활성화 전 확인

1. 상세페이지 대표 크기/최대 크기, 카드 슬롯 합성, 서비스 재시도의 실제 제공사 원가 확인. 판매가·구독 상품·무료 지급량·기존 환산 비율 결정.
2. 운영과 동등한 별도 DB에 001→002 적용. 기존 월 한도 계정과 전환 시험 계정의 생성·중지·부분 성공·재로그인·팀·관리자 권한을 검증.
3. 새 서버 코드 배포 준비. 002는 프로젝트 쓰기 권한을 바꾸므로 서버 소유 저장소 변경과 같은 릴리스로 적용. 구버전 서버와 새 계정의 혼용을 허용하지 않음.
4. `CREDIT_LEDGER=1`을 켜도 계정을 자동 전환하지 않는다. 한정된 시험 계정에 명시적 환산을 실행한 후 회원 안내와 차감/원가/저장을 확인.
5. 확인된 범위만 확대. PG/자동 청구는 후속 작업이며 현재 구현은 관리자의 수납 확인 방식.

### 8.3 되돌리기

계정 전환 전에만 기능 플래그를 끄고 기존 경로로 돌아갈 수 있다. SQL은 additive로 남겨도 된다. 프로젝트 쓰기 ACL은 새 서버 구현과 함께 유지한다.

계정 전환·구매·소비 이후에는 플래그만 끄거나 함수를 옛 버전으로 바꾸지 않는다. 옛 함수는 전환 계정의 차감을 거절한다. 문제가 있으면 신규 생성/지급을 제한하고 현재 장부·이미 지급한 권리를 보존한 채 수정한다. 데이터 역환산은 자동 rollback SQL로 제공하지 않는다.

---

## 9. 미해결 항목 · 가정 · 리뷰 관점

### 9.1 사용자가 정해야 하는 것 (아직 안 정해짐)

| # | 항목 | 지금 가정한 값 | 왜 필요한가 |
|---|---|---|---|
| 1 | **크레딧당 판매가** | 1,000원 (월 10만원 = 100크레딧에서 추정) | §5.2 마진 전부, §5.4 상한 |
| 2 | **구독 플랜 구성** | 미정 | `subscription_plans` 초기 행 |
| 3 | **무료 가입자 기본 지급량** | 현재 100 (뜻이 5배 커짐) | §6.4 명시적 이행 환산 |
| 4 | **기존 회원 이행 환산** | 미정 | 1크레딧의 뜻이 바뀐다 |
| 5 | **구독 갱신 시점** | KST 매월 1일, 납부 확인분만 지급 | 결제일 기준 상품은 별도 설계 필요 |
| 6 | **구매분 만료 기준** | 구매 시각 + 3개월 | "구매월 말 + 3개월"일 수도 |
| 7 | **`WORK_PRESETS`의 기준값** | 상세페이지 9 / 카드뉴스 8 / 포스터 1 | §5.5 환산 표시 |
| 8 | **인쇄용 픽셀 문턱** | 600만 | 0단계 실측 후 확정 |

### 9.2 이 설계가 명시적으로 **하지 않는** 것

- 팀 지갑 (팀이 크레딧 묶음을 갖는 구조) — §6.10
- 모델 등급별 차등 크레딧 — §4.2에서 뺐다
- 크레딧 소진 후 "감속" (Firefly 방식) — 지금처럼 차단한다
- 만료된 묶음의 청소·아카이빙 — 계산에서 빠지므로 급하지 않다
- `pdp/plan-from-text`의 원가 기록 누락 수정 — §3.5, 별건
- PG 결제·자동 청구와 운영 자동 업그레이드 — 현재 범위 밖. 비용 전략실의 구·신 정책 비교는 이번 구현에 포함.

### 9.3 ⚠ 다른 작업과의 충돌 (중요)

**통합 반영:** 사용자 추가 지시로 `/admin/cost-lab`(비용 전략실)과 이번 크레딧 구현을 같은 공통 정책으로 연결했다.
설계 문서: `docs/superpowers/specs/2026-09-22-cost-lab-growth-infrastructure-design.md`

그 문서의 결정 3은 이렇게 적혀 있다:

> "기본은 **현재 서비스 차감 기준**. 제안 요금/충전형 크레딧을 몰래 가져오지 않는다."

**그런데 이 설계가 그 '현재 차감 기준'을 바꾼다.**

| | cost-lab이 쓰는 기준 | 이 설계 |
|---|---|---|
| 100크레딧으로 표준형 | 20장 | **100장** |
| 100명이 100크레딧 전액 사용 시 이미지 API 원가 | $421.44 (2,000장) | **$2,107.20 (10,000장)** |

**5배 차이다.** cost-lab을 현재 기준으로만 완성하면 완성되자마자 틀린 답을 낸다.

**요청: cost-lab이 두 기준을 전환해서 비교할 수 있게 만들 것.**
그래야 §9.1의 1번(판매가)과 8번(픽셀 문턱)을 근거를 갖고 정할 수 있다.

또한 **§3.2(상세페이지 원가 과대 추정)가 cost-lab의 입력에도 영향을 준다.**

### 9.4 Codex에게 요청하는 리뷰 관점

아래는 최초 리뷰 요청 기록이다. 독립 확인 결과와 반례는 `docs/bugs/2026-09-22-credit-subscription-design-review.md`, 반영한 구현 계약은 이 문서 §6~8을 따른다.

우선순위 순이다.

**① §3.1 버그 4건이 실제 버그인지 독립 확인**
`apps/web/app/api/characters/route.ts:168,222`, `api/redesign/edit-section/route.ts:26`,
`api/pdp/key-visual/route.ts:27`을 직접 읽고, 대조군(`characters/views/route.ts:54`,
`redesign/generate/route.ts:50`)과 비교해 달라. **조사 에이전트의 보고이므로 독립 검증이 필요하다.**

**② §6.7의 `reserve_generation` 변경이 이중 차감을 일으키지 않는지**
잔액에 이미 확정분이 반영되어 있으므로 `v_used`를 더하면 안 된다.
`v_reserved`(유효 예약)만 더하는 것이 맞는지 확인해 달라.
특히 **예약이 만료되는 순간과 확정되는 순간 사이의 경쟁 상태**를 봐 달라.

**③ §6.5 `consume_credits`의 잠금 순서**
`for update`로 여러 묶음을 잠그는데, 두 요청이 동시에 오면 교착(deadlock)이 날 수 있는지.
`order by`가 고정되어 있으므로 안전하다고 보지만 확인이 필요하다.

**④ §6.6 lazy 발급이 `reserve_generation`(plpgsql, 쓰기) 안에서 안전한지**
`ensure_subscription_grant`가 `profiles ... for update` **앞**에 와야 하는지 뒤여야 하는지.

**⑤ §6.9 이행 계획의 구멍**
1크레딧의 뜻이 5배 바뀌는데, 1단계와 2단계 사이에 회원이 겪는 일이 자연스러운가.
1단계에서 `monthly_quota`를 5배로 올리면 그 달에 5배를 쓸 수 있게 된다 — 의도한 것인가.

**⑥ §5.4 등급 상한 테스트의 실효성**
`model_prices`는 **DB에 있고 관리자가 화면에서 고친다.** 테스트는 코드만 본다.
DB 값이 바뀌었을 때 테스트가 못 잡는 구멍이 있는지, 있다면 어떻게 막을지.

**⑦ 놓친 차감 경로**
§2.8의 직접 경로가 전부인지. `apps/worker`나 다른 곳에서 크레딧을 건드리는 길이 있는지.

**⑧ 단계 경계**
§8의 1~4단계가 정말 따로 배포·되돌리기 가능한지. 특히 1단계(계산 교체)와
2단계(장부 도입) 사이에 반쯤 적용된 상태가 생기지 않는지.

### 9.5 검증 기준 (구현 시)

이 저장소의 관례를 따른다.

- 순수 함수(`credit.ts`, `credit-preview.ts`)는 **TDD로 먼저 테스트**
- DB 함수는 **뮤테이션 검증** — 함수를 일부러 망가뜨렸을 때 테스트가 깨지는지 확인
- 예약·확정의 **경쟁 상태**를 테스트로 잠근다 (동시 요청, 만료 직전 확정)
- 이행은 기존 상태 snapshot과 적용 이력, 실패 시 생성 제한 절차를 남긴다. 소비 이후 자동 역환산은 제공하지 않는다.
- 배포 전 `pnpm typecheck`, `pnpm lint`, `pnpm test` 전량 통과 + 결과 수치 보고

---

## 부록 A. 조사 방법과 신뢰도

이 문서의 §2는 4개 영역을 병렬 조사한 결과를 합친 것이다.

| 영역 | 무엇을 조사 | 신뢰도 |
|---|---|---|
| 차감 경로 | 18개 직접 예약/확정 라우트 (Codex 보완) | 🟡 에이전트 보고. **§9.4-①로 독립 검증 필요** |
| 회원 노출면 | `app/` 전체 (admin 제외) | 🟡 같음 |
| 관리자 화면·RPC | `app/admin/**`, `admin_*` 함수 | 🟡 같음 |
| 과거 결정 | `docs/`, Obsidian 위키, git log | 🟡 같음 |
| DB 함수 정본 | 직접 확인 | 🟢 이 세션에서 파일을 직접 읽음 |
| 모델 단가·크기 | 직접 확인 | 🟢 같음 |
| 마진 계산 | 직접 계산 | 🟢 같음 (환율·판매가는 가정) |

**커밋 상태 주의:**
- `202609180001_pdp_jobs.sql` — **미커밋 제안.** 현재 시스템이 아니다
- `적용할-마이그레이션-*.sql`, `2단계-마이그레이션.sql` 등 한글 파일 — 대시보드 붙여넣기용 사본으로 보이며 정본이 아니다
- 정본은 **번호가 붙고 커밋된** 마이그레이션이다

## 부록 B. 이 설계가 바꾸는 파일 (예상)

아래 목록은 최초 설계의 추정 이력이다. 실제 정본은 §6의 마이그레이션과 공통 정책, `apps/web/lib/membership/credit-ledger.ts`, `/admin/members`, 비용 전략실 소스다.

```
   신규
     supabase/migrations/2026MMDD0001_credit_ledger.sql
     packages/shared/src/credit-preview.ts
     apps/web/lib/admin/members.ts
     apps/web/app/admin/members/**            (7개 파일)

   변경 (큼)
     packages/shared/src/credit.ts            1장=1크레딧, 픽셀 문턱
     apps/web/lib/credit-cost.ts              장수 기준으로
     apps/web/lib/membership/api.ts           UsageSummary 구조, 오류 문구
     apps/web/lib/membership/types.ts         타입
     apps/web/app/admin/page.tsx              회원 목록 분리 (666 → 약 300줄)
     apps/web/app/admin/actions.ts            회원 액션 분리

   변경 (작음, 계산식 교체)
     apps/web/app/api/{poster,characters,redesign,pdp,sns,ad}/**   17개 라우트
     apps/web/app/{poster/plan-cost,easy/cost,sns/cost-estimate}.ts
     apps/web/lib/ad/cost.ts
     apps/web/lib/sns/settle.ts

   변경 (문구)
     apps/web/app/settings/page.tsx
     apps/web/app/_components/studio-actions.tsx
     apps/web/app/guide/**                    (8개 페이지)
     apps/web/app/_landing/credit-facts.ts    (대부분 불필요해짐)
     apps/web/app/_landing/legal/documents.ts (4단계에서)
```
