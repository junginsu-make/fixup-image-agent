# AI 사용 통제와 비용 측정 — 설계

- 날짜: 2026-09-30
- 상태: 승인됨(2026-09-30 13:40, 개정 1)
- 가지: `feat/ai-usage-control` (`.worktrees/ai-control`)

## 1. 목적과 사용자 결정

회사 키로 부르는 AI(Anthropic·OpenAI·Google·fal·Apify·외부 STT)는 **쓴 만큼 회사가 낸다.** 유료 출시 전에
「누가 쓸 수 있는가」, 「관리자가 멈출 수 있는가」, 「얼마를 썼는지 정확히 보이는가」를 닫는다.

사용자가 정한 것(2026-09-30, 그대로 옮김):

| # | 결정 |
|---|---|
| D1 | 글 AI(LLM) 로 도는 기능은 **크레딧을 차감하지 않는다**(지금 그대로) |
| D2 | 관리자가 **시스템 전체 AI 사용을 멈출 수 있어야** 한다. **자동으로 멈추는 것은 없다** |
| D3 | 비회원은 **크레딧·비용이 드는 모든 것을 쓸 수 없다.** 사용설명서 말고는 접근이 안 되고, 접근하면 **회원가입 안내 모달**을 띄운다 |
| D4 | 가입 무료 크레딧은 **없다**(지금 그대로). 크레딧은 당분간 관리자가 손으로 준다 |
| D5 | 가입했지만 **크레딧이 없는 회원**도 비용이 드는 기능은 **전부 못 쓴다.** 화면 접근은 모두 된다 |
| D6 | **AI 도우미**(고객센터 봇)는 회원만. 크레딧이 없으면 **가입 후 통틀어 10회**까지 |
| D7 | 관리자 화면에서 **AI 전체 사용 비용을 정확히** 측정하고, 거기서 스위치로 결정한다 |
| D8 | **데모 페이지(`/demo`)는 쓰지 않는다 — 삭제**해 혼란을 없앤다 |

판매 채널에 맞춘 기능은 만들지 않는다. 구독은 관리자가 직접 배정한다(기존 기능).

## 2. 지금 사실 (2026-09-30, master `849b9cd0`)

- **회원 확인만 하고 예약 없이 유료 AI 를 부르는 회원용 라우트 4곳**: `POST /api/easy/generate` 의 판정 단계
  (`app/api/easy/generate/route.ts:148-162`), `POST /api/sns/projects/[id]/plan`(웹검색 조사·Apify·기획·원고,
  `lib/sns/source-adapters.ts`), `POST /api/sns/projects/[id]/caption`, `POST /api/poster/projects/[id]/review`.
  이 네 곳의 화면 호출은 요청 식별자(`x-idempotency-key`)를 안 붙인다 — `app/sns/new-client.tsx:246`,
  `app/sns/[id]/project-client.tsx:287, :350`, `app/poster/[id]/poster-client.tsx:717`
- 예약 없이 AI 를 부르는 **회원용이 아닌** 자리: 카드뉴스 상태 조회(이미 예약한 작업의 다음 장 제출·검수,
  `lib/sns/queued-flow.ts:193`), 관리자 지식 올리기(`app/api/redesign/knowledge/route.ts` → 임베딩 `rag.ts:332`),
  수집 워커(`apps/worker` → Apify). **워커는 운영에서 masked 다**(2026-09-29 확인,
  `/etc/systemd/system/fixup-image-agent-worker.service` → `/dev/null`). 배포 스크립트도 masked 면 건너뛴다
  (`deploy/ec2/deploy-release.sh:110-114`). 코드는 바꾸지 않는다
- **포스터 기획**은 예약보다 비전 읽기가 먼저다(`poster/projects/[id]/plan/route.ts:104-109` → `:126`).
  기획은 `referenceIds` 와 `preservedIds` 를 모두 읽고(`:90-91`), 중복 id 를 걸러내지 않아 같은 그림을 여러 번 읽는다
  (`lib/reference-images.ts:248`)
- **0크레딧 작업**(분석·기획·레이아웃·CS 등)은 `credit_reserve` 에서 `v_need=0` 이라 **잔액 0 인 계정도 통과**한다
  (`202609280001_cs_ask_operation.sql:264, :281`). 가입 즉시 active(`202609220005:40,50`)라 가입만 하면 쓸 수 있다
- **광고 내보내기**는 AI 없는 자르기·줄이기도 0크레딧으로 예약한다(`app/api/ad/export/route.ts:171-172`).
  돈이 드는 것은 배경 제거뿐이다
- CS 도우미의 시간당 한도가 **장부 경로에서 빠져 있다** — 앱은 `CS_ASK_HOURLY_LIMIT` 를 넘기지만
  `credit_reserve` 의 검사 목록은 `('pdp_analyze','reference_analyze','redesign_transcribe')` 뿐(`202609280001:270`)
- **AI 전체 정지 스위치가 없다.** 지금 급히 멈추려면 서버에서 키를 비우고 재시작해야 한다
- **비용 기록**: 요청 끝에 `generation_events.llm_usd` + `billable_images × model_prices` 로 적고 관리자 비용 화면이
  합산한다(`lib/cost.ts:89-142`, `admin_cost_summary`). **빠지는 비용**: 예약 없는 자리들, 계량기(`withLlmMeter`) 밖 호출은
  조용히 버려진다(`lib/llm/meter.ts:19-21, 40-41`) — 카드뉴스 상태 조회 중의 검수 글 AI, 웹검색 조사, Apify.
  「오늘」은 DB 시각(UTC) 기준(`202609100004_llm_cost.sql:44-48`, `date_trunc('day', now())`)이라 한국 시각과 9시간 어긋난다
- **공유 DB**: detail-page-studio 가 같은 Supabase 를 본다. 그쪽은 `admin_cost_summary/by_member/by_operation/by_model/daily`
  를 그대로 부르고(`Detail Page/apps/web/lib/cost.ts:89-142`), 예약은 `reserve_generation` 을 부른다. 장부로 옮긴 계정은
  `reserve_generation` 에서 `credit_ledger_required` 로 막힌다(`202609220002:16-20`)
- 비회원: AI API 는 모두 로그인 확인을 한다(401). 화면은 공개 목록(`middleware.ts:18-44` — `/`, `/about`, `/guide`,
  `/demo`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/confirm`, `/auth/signout`) 밖이면 `/login` 으로 넘긴다
- 기존 「DB 시험」은 SQL 파일 글을 읽는 **정적 시험**이다(`lib/membership/__tests__/analysis-quota-migration.test.ts`,
  `lib/teams/__tests__/reserve-operation-whitelist.test.ts`). 실제 Postgres 를 돌리는 시험도, 시험용 DB 서버도 없다

## 3. 설계

### 3.1 한 관문 — 회원이 부르는 유료 AI 는 예약을 거친다

**회원이 부르는 유료 AI 호출은 `reserveAiUsage`(→ `credit_reserve`) 를 먼저 통과한다.**
예외는 아래 셋뿐이고, 정적 시험에 이름으로 적는다.

- 예외 1: 카드뉴스·포스터 **상태 조회**. 이미 예약한 작업을 이어 간다(카드뉴스는 §3.3 의 스위치 확인을 한다)
- 예외 2: **관리자 지식 올리기**(`redesign/knowledge` POST). 관리자 전용이라 예약하지 않고 비용 기록(§3.4)만 한다.
  스위치로 멈추지 않는다 — 관리자가 직접 누르는 일이다
- 예외 3: `pdp/validate-key`. 공급자 모듈을 import 하지만 부르지 않는다

**예약 없는 4곳에 예약·정산을 붙인다.** 새 작업 이름은 만들지 않는다 — 이름을 새로 만들면 표 제약·함수
화이트리스트·타입 세 곳을 함께 넓혀야 하고, 빠뜨리면 전부 거절된다(2026-09-08 사고). 레이아웃 분석이 이미 쓰는 방식대로
**기존 이름 + `resource` 구분**으로 간다(`sns/layout/analyze/route.ts:40`). 모두 `freeCreditPlan`(0크레딧, D1)이고 옛 단위는 0 이다.

| 자리 | 작업 이름 | resource |
|---|---|---|
| 쉬운 만들기 판정 | `poster_image` | `easy:decide` |
| 카드뉴스 기획·원고 | `sns_image` | `sns:{id}:plan` |
| 카드뉴스 게시글 문구 | `sns_image` | `sns:{id}:caption` |
| 포스터 검수 | `poster_image` | `poster:{id}:review` |

- 기능별 비용은 `ai_cost_events` 의 작업 칸(§3.4)으로 나눈다. **그래서 마이그레이션이 필요 없다**
- 쉬운 만들기: 판정 예약은 `stepIdempotencyKey(key, "decide")` 로 따로 잡는다. 되묻기(`asked`)·대화(`talked`)를 포함한
  **모든 끝에서 닫는다.** 이미지 주문으로 이어지면 뒤 단계(기획·생성)는 지금처럼 각자 예약한다
- **화면 호출 네 곳을 `billableFetch`/`billableRequest` 로 바꾼다**(§2 의 네 줄). 안 바꾸면 예약이 요청 식별자 검사
  (`lib/membership/api.ts:83-86`)에서 400 을 낸다 — `easy-client.tsx:284-292` 가 같은 함정에 세 번 빠졌다고 적어 두었다
- 포스터 기획: 비전 읽기를 **예약 뒤로** 옮긴다(D5 — 크레딧 없는 회원이 거절되기 전에 돈이 나가면 안 된다). 읽을 목록
  (`referenceIds` + `preservedIds`)은 **중복만 걸러낸다.** 옛 경로의 예약 장수는 「읽을 그림 수」로 먼저 센다(`:124-125`)
- 광고 내보내기: 배경 제거가 섞일 때만 resource 를 `ad:export:cutout` 으로 넘긴다. 자르기·줄이기만이면 지금처럼 `ad:export`
- CS 시간당 한도는 **SQL 검사 목록에 `cs_ask` 를 넣어** 실제로 걸리게 한다(앱은 이미 값을 넘긴다). 다른 작업에 새 시간당 한도는 두지 않는다

### 3.2 크레딧이 없으면 막는다 (D5·D6)

`credit_reserve` 를 **인자·이름 그대로** 교체한다(42725 사고 방지, 끝에 함수 유일성 검사). 본문은 가장 최근 판
(`202609280001`)에서 옮긴다. `reserve_generation`·`credit_reserve_dispatch` 는 건드리지 않는다.

검사 순서(새 줄은 ★):

1. `credit_lock()` · 회원 상태(`inactive_member`) · 장부 계정(`credit_account_not_activated`) · 입력 검사(`:252-258`)
2. ★ **AI 멈춤**: `app_settings.ai_paused='1'` 이면 사유 `ai_paused`. 단 `ad_export` 이면서 `p_resource='ad:export'`(AI 없음)는 통과
3. 중복 요청(`duplicate_request`, `:260`)
4. ★ **크레딧 없음**: **살아 있는 덩어리(회수 안 됨·만료 전)에 쓸 수 있거나 잡힌 크레딧이 있는지**를 본다 —
   하나도 없으면 사유 `credits_required`. `credit_wallet_state` 의 `balance`(available+reserved)는 쓰지
   않는다 — 그 합은 만료·회수된 덩어리의 `reserved_units` 도 그대로 더해서, 덩어리가 만료된 뒤
   `needs_review` 등으로 못 푼 잡힌 크레딧만 남아도 0크레딧 회원을 통과시킨다(최종 리뷰 반영, §8).
   대신 `credit_grants` 에서 `revoked_at is null and expires_at>now() and granted_units>consumed_units`
   인 덩어리가 하나라도 있는지로 본다 — `available` 로 보지 않는 이유는 그대로다: 이미지 작업이 크레딧을
   전부 잡고 있는 동안 CS·문구가 막히면 안 된다. `v_need>0` 인 작업도 같은 사유로 막는다(잔액 0 에서
   「크레딧이 모자랍니다」와 문구가 갈리지 않게).
   예외 둘:
   - `ad_export` 이면서 `p_resource='ad:export'`(AI 없음)
   - `cs_ask` 이면서 그 회원의 셀 행이 **10건 미만**. 셀 행 = `operation='cs_ask' and coalesce(error_code,'') <> all(v_exempt_codes || 'invalid_request')`
     — 시간당 한도(`:272-274`)와 같은 규칙에 `invalid_request`(모델을 부르기 전 본문 오류)만 더 뺀다. `cs_failed` 는 센다
     (CS 라우트는 모든 예외를 `cs_failed` 로 닫아 제공사 오류를 따로 가를 수 없고, 모델 값이 이미 나갔을 수 있다)
5. 동시 실행(`:264`) · 시간당(`:270`, 목록에 `cs_ask` 추가) · 잔액(`:281`) · 팀 한도 — 지금 그대로

- 악용: 같은 요청 id 는 행을 넣기 전에 거절되고(`:260`), 동시 요청은 전역 잠금으로 줄을 선다(`:252`). 남는 길은 계정을 여럿
  만드는 것뿐이다(가입은 메일 인증·Turnstile, 한 번에 약 5원) — 받아들인다
- 크레딧이 1 이상이면 CS 10회와 무관하게 시간당 한도만 본다. 관리자(무제한 지급)는 잔액이 있으므로 통과한다
- 앱 문구·상태(`reserveAiUsage`):
  - `credits_required` → 403, 「크레딧이 없어 이 기능을 쓸 수 없습니다. 운영자에게 문의해 주세요(ai.dev@fixupworld.com).」
  - CS 10회 소진(같은 사유, 작업이 `cs_ask`) → 「무료 질문 10회를 모두 썼습니다. 크레딧을 받은 뒤 다시 이용해 주세요.」
  - `ai_paused` → 503, 「운영자가 AI 사용을 잠시 멈췄습니다. 잠시 후 다시 시도해 주세요.」
  - 둘 다 **다시 눌러도 안 풀리는 실패**로 표시한다(쉬운 만들기 화면의 `retryable`, `easy-client.tsx:324-331`)
  - 화면은 서버 문구를 그대로 보인다(각 제품 화면이 오류 문구를 보이는지 계획에서 확인)

### 3.3 관리자 「AI 전체 멈춤」 스위치 (D2)

- 저장: 기존 `app_settings` 표, 키 `ai_paused`(`'1'`/`'0'`). 관리자 화면(시스템 설정)에 스위치 하나.
  바꿀 때 `credit_admin_events` 에 한 줄(`action` `ai_pause`/`ai_resume`, `target_ids='{}'`) — 새 표 없음
- **막는 자리는 둘이다**
  1. `credit_reserve`(§3.2 의 2번): 새 요청은 모두 여기서 멈춘다
  2. **카드뉴스 상태 조회 라우트**: 요청마다 `ai_paused` 를 읽고, 켜져 있으면 다음 장을 제출하지 않고 **기존 중지 경로**를 탄다
     — `stopQueuedGeneration` + `settleSnsReservation`(`app/api/sns/projects/[id]/stop/route.ts:27-35` 와 같게).
     받아 둔 카드는 남고, 받은 만큼만 정산된다. 제출 단계에서 예외를 던지면 흐름이 active 로 남아 폴링이 계속
     실패하고 예약이 만료되므로(`lib/sns/queued-flow.ts:193`) 그 방식은 쓰지 않는다
- 포스터 상태 조회는 결과를 받아 오기만 하므로 막을 것이 없다. 한 요청 안에서 여러 번 부르는 생성(redesign·pdp 일괄)은
  첫 자리에서 이미 막힌다
- 관리자 계정도 예외 없이 멈춘다(「시스템 전체」). 이미 fal 에 제출돼 도는 그림은 끝까지 돌 수 있다 — 화면에 그렇게 적는다
- 자동 멈춤은 만들지 않는다(D2)

### 3.4 비용을 정확히 — 호출마다 한 줄 (D7)

**공급자를 부를 때마다 비용 한 줄을 남긴다.** 요청 끝에 모아 적는 지금 방식은 계량기 밖 호출과 여러 단계 작업을 놓친다.

- 새 표 `ai_cost_events`(서비스 권한만, RLS 켜고 anon·authenticated 회수): 시각, 회원, 요청 id(있으면), 작업, 공급자, 모델,
  입력·출력 토큰, 그림 수, **USD 금액**, 금액 근거(`tokens`/`image_unit`/`provider_reported`/`estimate`), 실패 여부,
  fal 요청 id(**unique**, 없으면 null)
- **누구의 무슨 호출인가**: `lib/llm/meter.ts:31` 의 AsyncLocalStorage 에 `{userId, requestId, operation}` 을 싣는다.
  라우트 입구(지금 `withLlmMeter` 자리)와 카드뉴스·포스터 상태 조회 라우트가 채운다. 공급자 생성 함수의 인자는 안 바꾼다
- **글 AI 는 한 곳에서**: 모든 계량 호출이 이미 지나가는 `recordLlmUsage`(`meter.ts:39`)가 계량기 합산과 함께 한 줄을 쓴다.
  모듈 열한 곳을 따로 감싸지 않는다. 계량기가 없어도(카드뉴스 상태 조회의 검수 등) 버리지 않고 적는다
- **그림**: 제출하는 자리에서 적는다 — `lib/fal/queue.ts:20-22`(포스터·카드뉴스의 실제 제출), `lib/pdp/fal.ts`,
  `lib/redesign/image-generator.ts`, `lib/ad/background.ts`. fal 큐 작업은 **제출 시점**에 적는다(`lib/poster/flow.ts:57`
  — 제출하면 과금이 끝난다). 상태 조회는 여러 번 오거나 아예 안 올 수 있어 거기서 적지 않는다. fal 요청 id 가 unique 라 두 번 적히지 않는다
- **패키지는 콜백으로**(패키지는 DB 를 모른다). 콜백은 **필수 인자**다 — 선택이면 안 넘긴 자리가 조용히 0원이 된다
  (`meter.ts:17-21` 이 경고하는 문제):
  - `packages/redesign-core`: `generate`·`transcribe` 는 이미 `onUsage` 가 있다(`generate.ts:188`, `transcribe.ts:27`) → 필수로.
    그림 호출(`generate.ts`·`edit-section.ts`)과 임베딩(`rag.ts:332`)에 새로 넣는다
  - `packages/ingest-core`: 웹검색 조사(`topic.ts`)·Apify(`youtube-apify.ts`) — 앱 쪽 연결은 `lib/sns/source-adapters.ts` 에서 한다
  - 관리자 지식 올리기(§3.1 예외 2)도 같은 콜백으로 적는다
- 금액 계산: 글 AI 는 기존 단가표(`packages/shared/src/llm-price.ts`) × 토큰, 그림은 기존 `model_prices` × 장 수,
  Apify 는 응답의 사용 금액(없으면 실행 1회 추정, `estimate`), 웹검색은 도구 호출 단가 + 토큰.
  STT(`YOUTUBE_STT_SERVICE_URL`)는 **운영에 설정돼 있지 않으면 제외**한다
- 쓰기 실패는 호출을 막지 않는다(경고 로그)
- 관리자 비용 화면: 이 표를 **한국 시각** 기준으로 합산 — 오늘·이번 달·최근 30일 일별, **공급자별·작업별** 나눔.
  화면 위에 §3.3 스위치를 같이 둔다(보고 바로 결정). 집계는 **새 RPC 로만** 한다.
  기존 `admin_cost_*` RPC 는 detail-page-studio 가 같이 쓰므로 **고치지 않는다**
- 기존 `generation_events` 원가 칸(크레딧 정산·낭비 분석)은 그대로 둔다. 화면의 「총 비용」은 새 표가 기준이다.
  회원 목록의 비용 칸(`app/admin/page.tsx:68`)은 옛 장부 그대로 두고 **「옛 기준」**으로 표시한다
- 정확도의 한계를 화면에 적는다: **공급자 청구서와 1원 단위로 같지는 않다**(단가표가 맞아야 맞는다). 청구서 대조는 이번 범위 밖

### 3.5 비회원 (D3·D8)

- 공개 화면: `/`(첫 화면), `/about`, `/guide/**`, `/login`, `/signup`, `/forgot-password`, `/reset-password`,
  `/auth/confirm`, `/auth/signout`
  - **사용자 확인 완료(2026-09-30 13:40): 비회원에게 `/`·`/about` 도 열어 둔다.** D3 는 「사용설명서 말고는」이지만, 모달이 뜰 자리(첫 화면)와 소개 화면은 연다
- **`/demo` 삭제**: `app/demo/page.tsx`, 공개 목록(`middleware.ts:37`), 머리·꼬리 링크(`app/_components/public-shell.tsx:72, :86`),
  관련 시험(`lib/__tests__/dev-auth.test.ts:14`). **이미지는 지우지 않는다** — `public/demo-sections/**`·`public/samples/**` 는
  첫 화면 슬라이드(`app/_landing/hero/slides.ts:23-33`)와 `app/api/sns/local-fake-flow.ts:124` 가 쓴다
- 비회원이 공개 목록 밖 화면을 열면 `/login` 대신 **첫 화면으로 보내고 회원가입 안내 모달**을 연다(`/?signup=required&next=…`).
  첫 화면은 이미 주소의 값을 읽는다(`app/page.tsx:29-34`).
  모달: 「회원가입이 필요합니다」 + [회원가입] [로그인] [닫기]. 로그인 뒤에는 `next` 로 돌아간다(`safeNext`, `lib/routes.ts:25`)
- 로그인 유지 시간이 지난 경우(`middleware.ts:107-140`)는 **지금 그대로** `/login?expired=1`
- `/demo` 를 지운 뒤: 비회원은 공개 목록 밖이므로 첫 화면 + 모달, 회원은 404
- API 는 지금처럼 401. 모달 컴포넌트는 `@fixup/ui` 의 Dialog 를 쓴다
- 참고(범위 밖): `safeNext` 는 `/\evil.com` 같은 주소를 걸러내지 못한다

## 4. 하지 않는 것

- 자동 멈춤, 하루 지출 상한(D2)
- 글 AI 에 크레딧 차감(D1), 가입 무료 크레딧(D4)
- 새 작업 이름, 입력 길이 상한, CS 밖의 새 시간당 한도, 포스터 참고 이미지 개수 상한(중복 제거만 한다)
- 계정별 하루 횟수(CS 10회 말고는 없다)
- 비용 화면의 회원별 나눔·「추정 비율」 표시, STT 단가 설정
- 공급자 호출 직전의 스위치 확인(두 번째 겹)·스위치 캐시
- `public/demo-sections/**` 등 이미지 삭제
- 워커 코드 변경(운영에서 masked)
- 공급자 청구서 자동 대조, 결제(페이먼트) 연동

## 5. 시험으로 고정할 것

- SQL(**정적 시험** — 마이그레이션 글을 읽는다. 기존 방식 그대로):
  `credit_reserve` 마지막 판에 `ai_paused`·`credits_required` 검사가 있고 순서가 §3.2 대로다 ·
  잔액 기준이 `balance` 다 · `cs_ask` 셀 행 규칙이 시간당 면제 목록 + `invalid_request` 다 · 시간당 목록에 `cs_ask` 가 있다 ·
  `ad:export` 예외가 두 검사에 모두 있다 · 인자 불변·함수 유일성(`sql-function-unique.test.ts`) ·
  `reserve_generation`·`credit_reserve_dispatch`·기존 `admin_cost_*` 는 새 마이그레이션에서 다시 정의하지 않는다
- SQL 동작은 운영 SQL 편집기에서 `begin; … rollback;` 으로 확인한다: 멈춤이면 거절 · 잔액 0 이면 0크레딧 거절 ·
  CS 는 10건까지 허용·11번째 거절 · `cs_failed` 는 세고 `invalid_request` 는 안 셈 · 잔액 1 이상이면 CS 10회 무관 ·
  AI 없는 광고 내보내기는 통과
- 라우트: 기존 `app/api/__tests__/paid-route-settle-contract.test.ts` 의 범위를 넓힌다(지금은 pdp·redesign 만) —
  공급자 모듈을 부르는 `app/api/**/route.ts` 는 `reserveAiUsage`·`settleAiUsage` 를 부른다, 예외는 §3.1 의 셋만 ·
  새 4곳의 화면 호출이 `billableFetch` 계열이다 · 쉬운 만들기 판정이 모든 끝에서 닫는다 · 포스터 기획이 예약 뒤에 읽는다·중복 제거
- 카드뉴스 상태 조회: 스위치가 켜지면 제출하지 않고 중지·정산한다
- 비용 기록: `recordLlmUsage` 한 번에 한 줄 · 계량기 밖에서도 적힌다 · 쓰기 실패가 호출을 막지 않음 ·
  fal 제출에 한 줄, 같은 요청 id 는 한 줄 · 패키지 콜백이 필수 인자다(타입) ·
  SDK 를 부르는 파일 목록이 알려진 목록과 같다(새 자리가 생기면 빨개진다)
- 비용 화면: 한국 시각 경계(한국 0시 ~ 9시 사이 호출이 「오늘」로 잡힘)
- 비회원: 공개 목록 밖 화면 → 첫 화면 + 모달, `/demo` 는 비회원 모달·회원 404, 공개 화면은 그대로, 만료 경로는 그대로
- 문구: 새 사유 두 개와 CS 10회 문구가 사용자 문구로 보인다

## 6. 단계 (각 단계는 따로 계획·독립 리뷰)

| 단계 | 내용 | 운영 반영 |
|---|---|---|
| C1+C2 | **한 번에 배포.** SQL: `ai_paused`·`credits_required`·CS 10회·CS 시간당 — `credit_reserve` 교체(같은 인자). 앱: 새 사유 문구·상태, 예약 없는 4곳 + 화면 호출 4곳 + 포스터 기획 순서·중복 제거 + 광고 내보내기 resource | **앱 먼저**(새 사유 문구는 SQL 전까지 쓰이지 않아 안전, 4곳은 기존 이름이라 지금 SQL 로 돈다) → 그다음 마이그레이션(칸·표 추가 없음, 함수 본문만) |
| C3 | 비용 기록: `ai_cost_events` + 문맥(AsyncLocalStorage) + `recordLlmUsage`·그림 제출·패키지 콜백 + 카드뉴스 상태 조회의 스위치 확인 | 마이그레이션(새 표) → 앱 |
| C4 | 관리자: 비용 화면(한국 시각·공급자별·작업별) + AI 전체 멈춤 스위치 | 마이그레이션(새 RPC 만) → 앱 |
| C5 | 비회원 모달 + `/demo` 삭제 | 앱 |

순서 이유: C1 만으로는 예약 없는 4곳이 크레딧 0 회원에게 열려 있다 — 그래서 C1·C2 를 함께 낸다. 둘을 함께 내야
가입만 한 계정의 무료 AI 가 끝난다. C3 은 가장 넓게 손대므로 그 뒤. C4 전에는 스위치를 SQL 로 켤 수 있다.

**C1 적용 전 확인 4가지**(하나라도 어긋나면 멈춘다):

1. 운영의 `pg_get_functiondef('public.credit_reserve(uuid,uuid,text,integer[],text,integer)'::regprocedure)` 가 저장소 판과 같다(42725 교훈)
2. `select count(*) from profiles p where p.status='active' and not exists(select 1 from credit_accounts a where a.user_id=p.id)` 가 0
   — 아니면 그 회원은 옛 경로(`202609220002:43`)로 가서 새 검사를 비껴간다
3. 서버의 `CREDIT_LEDGER=1` — 아니면 앱이 `reserve_generation` 을 부른다
4. 관리자 두 계정 모두 `credit_is_unlimited` 가 참 — 아니면 적용 즉시 자기들이 막힌다

## 7. 위험

| 위험 | 대응 |
|---|---|
| `credit_reserve` 교체가 기존 동작을 깬다 | 같은 인자·이름, 끝에 유일성 검사, 정적 시험 전체 + 새 정적 시험, 적용 전 4가지 확인(§6), 적용 후 `begin … rollback` 확인. 시험 서버 DB 는 없다 |
| 공유 DB 의 detail-page-studio 가 깨진다 | `reserve_generation`·기존 `admin_cost_*` 는 고치지 않는다. 새 표·새 RPC·`app_settings` 새 키만 더한다 |
| 크레딧 0 회원이 늘 쓰던 무료 기능이 갑자기 막혀 문의가 는다 | 문구에 연락처, 사용설명서·약관 문구 확인(「크레딧」 안내 절) |
| 새 4곳의 화면이 요청 식별자를 안 붙여 400 | 네 호출을 `billableFetch` 계열로(C2), 정적 시험 |
| 비용 기록 쓰기가 생성을 느리게 한다 | 호출당 DB 쓰기 1회, 실패는 경고만. 응답을 기다리지 않으면 재시작 때 줄이 빠질 수 있다 — 계획에서 정한다 |
| 공급자 호출 자리가 새로 생겨 기록을 안 거친다 | SDK 호출 파일 목록 정적 시험(§5), 패키지 콜백 필수 인자 |

## 8. 1차 리뷰 반영표 (2026-09-30)

| 지적 | 반영 |
|---|---|
| C-1 새 작업 이름은 마이그레이션 필요 | 기존 이름 + resource 구분(§3.1). C2 는 마이그레이션 없음 |
| C-2 `demo-sections` 삭제가 첫 화면을 깬다 | 이미지 삭제 제거. 페이지·링크·공개 목록·시험만(§3.5) |
| I-1 C1 만으로는 4곳이 열려 있다 | C1·C2 한 번에 배포(§6) |
| I-2 두 번째 겹이 카드뉴스를 멈춘 채 남긴다 | 두 번째 겹 삭제. 카드뉴스 상태 조회가 기존 중지 경로를 탄다(§3.3) |
| I-3 놓친 경로 | 워커 masked 를 사실로 적음(코드 변경 없음). 지식 올리기는 비용 기록만. 정적 시험 예외 셋. `lib/fal/queue.ts` 를 제출 자리로(§2·§3.1·§3.4) |
| I-4 화면 요청 식별자 | 네 호출을 `billableFetch` 계열로(§3.1) |
| I-5 광고 내보내기 자르기가 막힌다 | `ad:export:cutout` 구분, AI 없는 내보내기는 두 검사 예외(§3.1·§3.2) |
| I-6 잔액 기준·위치 | `balance` 기준, 중복 검사 뒤·동시 실행 앞, `v_need>0` 도 같은 사유(§3.2) |
| I-7 CS 셈 규칙 | 시간당 면제 목록 + `invalid_request` 제외, `cs_failed` 는 셈(§3.2) |
| I-8 호출 문맥 | AsyncLocalStorage + `recordLlmUsage` 한 곳 + 필수 콜백(§3.4) |
| I-9 fal 기록 시점 | 제출 시점, fal 요청 id unique(§3.4) |
| I-10 공유 DB | 새 RPC 만, 기존 RPC·`reserve_generation` 불변, 회원 목록 비용 칸 「옛 기준」 표시(§3.4·§7) |
| I-11 SQL 검증 방법 | 정적 시험 + 운영 `begin … rollback` + 적용 전 4가지 확인(§5·§6) |
| Minor | UTC 줄 번호, 공개 경로 정확히, `/demo` 비회원 기대값, 만료 경로 유지, `/`·`/about` 사용자 확인 표시, 기획 중복 제거는 두 목록 합쳐서, 앱 먼저 배포·상태 코드·`retryable`, 판정 키·모든 끝 정산, 기존 정산 계약 시험 확장, 감사 기록은 `credit_admin_events`, STT 는 설정돼 있을 때만 |
| 범위 밖 6가지 | 입력 길이 상한·새 시간당 한도(CS 고침만 남김)·참고 이미지 상한(중복 제거만)·이미지 삭제·두 번째 겹·회원별 나눔/추정 비율/STT 설정 삭제(§4) |
| 최종 전체 리뷰 잔액 기준(구현 뒤) | `credit_wallet_state` 의 `balance`(만료·회수된 덩어리의 잡힌 크레딧도 더함) 대신, 살아 있는 덩어리(회수 안 됨·만료 전)에 쓸 수 있거나 잡힌 크레딧이 있는지로(§3.2). `credit_reserve`·정적 시험·PG 시험 모두 갱신 |
