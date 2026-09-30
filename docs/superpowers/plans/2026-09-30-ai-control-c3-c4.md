# AI 사용 통제 C3·C4 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회사 키로 AI 공급자를 부를 때마다 `ai_cost_events` 에 비용 한 줄을 남기고(C3), 관리자 시스템 화면에서 그 표를 한국 시각으로 모아 보면서 「AI 전체 멈춤」 스위치로 바로 결정하게 한다(C4).

**Architecture:** 새 표 `ai_cost_events` 와 쓰는 함수 `ai_cost_record` 를 더한다(그림 값은 DB 가 `model_prices` 로 매긴다). 앱은 `lib/llm/meter.ts` 의 AsyncLocalStorage 에 「누구의 무슨 작업인가」를 싣고 — 라우트 입구가 `withLlmMeter` 로 열고, `reserveAiUsage` 가 성공하면 채운다 — 글 모델은 `recordLlmUsage` 한 곳에서, 그림은 fal 제출 자리에서, 꾸러미(`redesign-core`·`ingest-core`)는 필수 콜백으로 한 줄씩 적는다. 카드뉴스 상태 조회는 스위치가 켜져 있으면 기존 중지 경로를 탄다. 관리자 화면은 새 RPC 둘(`admin_ai_cost_report`·`admin_set_ai_paused`)만 쓴다.

**Tech Stack:** PostgreSQL(Supabase, plpgsql·sql 함수) · Next.js App Router 라우트·서버 액션·서버 컴포넌트(TypeScript) · `node:async_hooks` AsyncLocalStorage · vitest · node:test + 일회용 로컬 PostgreSQL(`scripts/lib/test-credit-postgres.mjs`) · `@fixup/ui`(shadcn 기반)

**Spec:** `docs/superpowers/specs/2026-09-30-ai-usage-control-design.md` (승인됨, 개정 1). 이 계획은 §3.3·§3.4·§4·§5·§6·§7 중 C3·C4 몫을 구현한다. C1·C2 는 머지·배포 끝(`42cc5854`, 기록 `.superpowers/sdd/2026-09-30-ai-control-c1-c2/progress.md`). C5(비회원 모달·`/demo` 삭제)는 이 계획 밖이다.

**가지:** `feat/ai-cost-ledger`(`.worktrees/ai-control`, master `42cc5854` 에서). **작업 시작 전(매 Task):** 설계 문서의 해당 절과 고칠 파일의 **현재 내용**을 다시 연다(사용자 규칙 `design-recheck`). 앞 Task 가 같은 파일을 바꿨을 수 있다.

**이 계획의 코드는 검증했다.** 계획을 쓰는 동안 같은 커밋(`42cc5854`)의 일회용 워크트리에 전부 넣어 돌렸다 — `apps/web` 전체 vitest 5,580 통과(38 건너뜀), `pnpm -r typecheck` 오류 0, `pnpm lint` 오류 0, 새 PG 시험 15/15, 필수 콜백 타입 시험은 콜백 하나를 선택으로 바꾸면 `TS2578` 로 빨개지는 것까지 확인. 그래도 **각 Task 의 「실패 확인」 단계는 건너뛰지 않는다**(사용자 규칙 `verification`).

## Global Constraints

- **공유 DB**: detail-page-studio 가 같은 Supabase 를 본다. 더하는 것은 표 `ai_cost_events` 와 함수 `ai_cost_record`·`admin_ai_cost_report`·`admin_set_ai_paused` 뿐이다. `admin_cost_summary/by_member/by_operation/by_model/daily`·`reserve_generation`·`credit_reserve`·`credit_reserve_dispatch`·`generation_events` 는 **다시 정의하지도, 칸을 바꾸지도 않는다**(설계 §3.4·§7).
- **스위치 저장**: `app_settings` 키 `ai_paused`, 값 **정확히 `'1'`/`'0'`**. `'1'` 만 멈춤이다(`credit_reserve` 가 `value='1'` 로 본다, `202609300001:60`).
- **스위치 감사**: 바꿀 때마다 `credit_admin_events` 한 줄 — `action` `ai_pause`/`ai_resume`, `target_ids='{}'`. 새 표 없음(설계 §3.3).
- **막는 자리는 둘**: `credit_reserve`(C1 에서 끝남)와 **카드뉴스 상태 조회 라우트**. 상태 조회는 켜져 있으면 다음 장을 제출하지 않고 **기존 중지 경로**(`stopQueuedGeneration` + `settleSnsReservation`)를 탄다. 기록 도우미 안의 두 번째 겹·스위치 캐시는 **만들지 않는다**(설계 §3.3·§4·§8 I-2).
- **자동 멈춤·하루 지출 상한은 없다**(D2, 설계 §4).
- **문맥**: `lib/llm/meter.ts` 의 AsyncLocalStorage 에 `{userId, requestId, operation}` 을 싣는다. 공급자 생성 함수의 인자는 바꾸지 않는다(설계 §3.4).
- **글 AI 는 한 곳에서**: `recordLlmUsage` 가 계량기 합산과 함께 한 줄을 쓴다. 모듈마다 따로 감싸지 않는다. 계량기가 없어도 버리지 않고 적는다(`operation='unbound'`).
- **그림은 제출 자리에서**: fal 큐는 제출 시점에 적고, fal 요청 id 는 `unique` 다. 상태 조회에서 적지 않는다.
- **꾸러미는 필수 콜백으로**: 선택 인자면 안 넘긴 자리가 조용히 0원이 된다. 단 수집 워커 코드는 바꾸지 않는다(설계 §4 — 운영에서 masked).
- **금액**: 글 AI = `packages/shared/src/llm-price.ts` × 토큰 · 그림 = `model_prices` × 장 수 · Apify = 실행 1회 추정(`estimate`) · 웹검색 = 도구 호출 단가 + 토큰. STT(`YOUTUBE_STT_SERVICE_URL`)는 **운영에 설정돼 있지 않으면 제외**, STT 단가는 두지 않는다(설계 §3.4·§4).
- **쓰기 실패는 호출을 막지 않는다**(경고 로그만).
- **관리자 화면**: 한국 시각 — 오늘·이번 달·최근 30일 일별, 공급자별·작업별. 스위치를 같은 카드 위에 둔다. 집계는 새 RPC 로만. 회원별 나눔·「추정 비율」은 보이지 않는다(설계 §4). 화면 문구에 「공급자 청구서와 1원 단위로 같지는 않다」를 적는다.
- **옛 장부 그대로**: `generation_events` 원가 칸은 손대지 않는다. 화면의 총 비용 기준은 새 표. 회원 목록의 비용 칸은 **「옛 기준」**으로 표시한다(설계 §3.4).
- **UI**: `@fixup/ui` 의 기존 컴포넌트(`Card`·`Badge`·`Button`)와 `app/admin/confirm-submit-button.tsx` 만 쓴다. 숫자 표 + 스위치, 최소한으로.
- **배포 순서**: 마이그레이션(C3 `202609300002` → C4 `202609300003`) **먼저**, 그다음 앱(설계 §6, `docs/DEPLOY.md` 기본 순서와 같다). 운영 반영은 사용자만 한다(Task 11).
- **사용자 것을 묻지 않고 지우지 않는다**(`CLAUDE.md`): 릴리스·아티팩트·서버 파일·DB 행·표.

## Review Focus

1. **카드뉴스를 만드는 도중 운영자가 멈춤을 켬** — 이미 받아 둔 카드는 남고, 못 만든 카드에는 「운영자가 AI 사용을 멈춰…」가 적히며, 받은 만큼만 정산되고 폴링이 끝나야 한다(흐름이 active 로 남아 폴링이 계속 실패하면 안 된다). → Task 7 의 `받아 둔 카드는 남기고, 못 만든 카드에는 멈춘 까닭을 적는다`·`다음 장을 안 보내고 중지 길을 탄다`.
2. **Supabase 가 느리거나 죽은 채로 생성 요청이 옴** — 비용 쓰기 때문에 응답이 3초 넘게 늦거나 생성이 실패하면 안 된다. → Task 2 의 `느린 쓰기를 한도까지만 기다린다`·`쓰기가 실패해도 호출은 막지 않는다`.
3. **쉬운 만들기처럼 한 요청 안에서 다른 라우트를 부름**(판정 → 포스터 기획·생성) — 안쪽 호출은 안쪽 작업 키(`poster:plan`)로 적히고, 바깥 문맥(`easy:decide`)은 망가지지 않아야 한다. → Task 2 의 `겹쳐 열면 바깥 문맥을 물려받고, 안쪽에서 바꿔도 바깥은 그대로다`.
4. **로컬 개발(Supabase 를 일부러 비움, `LOCAL_STORE=1`)** — 비용 쓰기가 조용히 건너뛰어야 하고 경고로 로그를 덮으면 안 된다(그리고 절대 운영 DB 에 쓰면 안 된다). → Task 2 의 `Supabase 가 비어 있으면(로컬·시험) 아무것도 안 하고 경고도 안 한다`.
5. **한국 자정 전후·월초의 호출** — 한국 0시~9시 호출이 「오늘」, 한국 8/31 23:50 은 「지난달」로 잡혀야 한다(UTC 로 자르면 틀린다). → Task 9 의 `today follows the Korean clock, not UTC`.

## 파일 지도

| 파일 | 할 일 | Task |
|---|---|---|
| `supabase/migrations/202609300002_ai_cost_events.sql` | 새로 — 표 + `ai_cost_record` | 1 |
| `scripts/tests/ai-cost-events.test.mjs` | 새로 — 실제 PostgreSQL | 1 |
| `apps/web/lib/membership/__tests__/ai-cost-migration.test.ts` | 새로(1), C4 절 추가(9) — 정적 SQL | 1·9 |
| `package.json` | `test:credit-db` 에 새 시험 둘 | 1·9 |
| `apps/web/lib/ai-cost/keys.ts` · `write.ts` | 새로 — 작업 키·공급자·한 줄 쓰기 | 2 |
| `apps/web/lib/llm/meter.ts` | 문맥·`bindAiCaller`·`recordAiCost`·`recordLlmUsage` 한 줄 | 2 |
| `apps/web/lib/ai-cost/__tests__/keys-write.test.ts` · `lib/llm/__tests__/meter-cost.test.ts` | 새로 | 2 |
| `apps/web/lib/membership/api.ts` | 예약 성공 시 문맥 채우기 | 3 |
| 라우트 15곳(Task 3 표) | 입구를 `withLlmMeter` 로 감싸기, 예외 셋은 `bindAiCaller` | 3 |
| `apps/web/app/api/__tests__/paid-route-settle-contract.test.ts` · `lib/membership/__tests__/reserve-binds-caller.test.ts` | 계약 넓히기 · 새로 | 3 |
| `apps/web/lib/fal/queue.ts` · `lib/pdp/fal.ts` · `lib/redesign/image-generator.ts` · `lib/ad/background.ts` | 그림 제출 자리에서 한 줄 | 4 |
| `apps/web/lib/ai-cost/__tests__/image-submit-cost.test.ts` | 새로 | 4 |
| `packages/redesign-core/src/{usage,generate,edit-section,transcribe,rag,knowledge,index}.ts` | 필수 콜백 | 5 |
| `packages/redesign-core/src/usage-callbacks.test.ts` · `generate.failure.test.ts` | 새로 · 도우미 고치기 | 5 |
| `apps/web/lib/ai-cost/package-usage.ts` | 새로(5), Apify·조사 추가(6) | 5·6 |
| `apps/web/app/api/redesign/{generate,edit-section,transcribe-strips,knowledge}/route.ts` · `cs/ask/route.ts` · `scripts/index-guide.mjs` | 콜백 넘기기 | 5 |
| `packages/shared/src/llm-price.ts` | 임베딩 단가 한 줄 | 5 |
| `apps/web/lib/ai-cost/__tests__/required-callbacks.test.ts` | 새로(5), ingest 줄 추가(6) — 타입 시험 | 5·6 |
| `packages/ingest-core/src/adapters/{topic,youtube-apify,youtube}.ts` · `__tests__/youtube-apify.test.ts` | 필수 콜백 | 6 |
| `packages/shared/src/provider-price.ts` · `index.ts` | 새로 — 웹검색·Apify 호출 단가 | 6 |
| `apps/web/lib/sns/source-adapters.ts` · `lib/sns/__tests__/source-adapters-cost.test.ts` | 콜백 연결 · 새로 | 6 |
| `apps/web/lib/ai-control/pause.ts` · `__tests__/pause.test.ts` | 새로 — 스위치 읽기 | 7 |
| `apps/web/lib/sns/queued-flow.ts` · `app/api/sns/projects/[id]/status/route.ts` · `app/api/sns/__tests__/status-ai-paused.test.ts` | 멈춤이면 중지 경로 | 7 |
| `apps/web/lib/__tests__/ai-cost-call-sites.test.ts` | 새로 — 공급자 호출 파일 목록 | 8 |
| `supabase/migrations/202609300003_ai_cost_admin.sql` · `scripts/tests/ai-cost-admin.test.mjs` | 새로 — 보고·스위치 RPC | 9 |
| `apps/web/lib/ai-control/report.ts` · `__tests__/report.test.ts` | 새로 — 보고 읽기 | 10 |
| `apps/web/app/admin/system/{ai-labels.ts,ai-control-actions.ts,ai-usage-panel.tsx,page.tsx}` | 새로·연결 | 10 |
| `apps/web/app/admin/{admin-shared.tsx,CostPanel.tsx,member-list/member-table.tsx}` | 알림·「옛 기준」 | 10 |
| `apps/web/app/admin/__tests__/{ai-usage-panel.test.tsx,ai-control-actions.test.ts}` | 새로 | 10 |

## 검증 명령(모든 Task 공통)

```bash
# 저장소 뿌리에서
cd apps/web && npx tsc --noEmit && cd ../..                    # 타입: 오류 0
cd apps/web && npx vitest run <그 Task 의 시험 파일들> && cd ../..
pnpm test:credit-db                                            # 실제 PostgreSQL(윈도우는 C:/Program Files/PostgreSQL/17/bin, 없으면 TEST_PG_BIN)
pnpm -r typecheck                                              # 꾸러미를 건드린 Task(5·6)는 반드시 — 수집 워커도 여기서 같이 본다
pnpm lint                                                      # = pnpm --filter @fixup/web lint, 오류 0(기존 경고 둘은 그대로)
```

각 Task 끝의 「전체」 단계에서는 `cd apps/web && npx vitest run` 을 통째로 돌려 **실패 0** 을 본다(계획 작성 시점 기준 5,5xx 통과 · 38 건너뜀). 윈도우 작업 폴더는 `core.autocrlf=true` 라 편집기가 LF 로 저장해도 커밋은 정상이다(`LF will be replaced by CRLF` 경고는 무시).

로컬 화면으로는 이 변경을 볼 수 없다 — 로컬은 Supabase 를 비워 두어(`CLAUDE.md`) 비용 쓰기가 건너뛰고, 관리자 화면의 보고는 「아직 집계할 수 없습니다」로 나온다. 확인은 시험과 배포 서버에서 한다.

---

### Task 1: 비용 표 `ai_cost_events` 와 쓰는 함수 `ai_cost_record` (C3 SQL)

**Files:**
- Create: `supabase/migrations/202609300002_ai_cost_events.sql`
- Create: `scripts/tests/ai-cost-events.test.mjs`
- Create: `apps/web/lib/membership/__tests__/ai-cost-migration.test.ts`
- Modify: `package.json:15` (`test:credit-db`)

**Interfaces:**
- Consumes: `public.model_prices(model text primary key, unit_cost_usd numeric)` (202607280005), 시험 도구 `testPostgres().migrate(extra)`.
- Produces: `public.ai_cost_record(p_user uuid, p_request uuid, p_operation text, p_provider text, p_model text, p_input_tokens integer, p_output_tokens integer, p_images integer, p_usd numeric, p_basis text, p_failed boolean, p_fal_request_id text) returns void` — `service_role` 만. `p_basis='image_unit'` 이면 `p_usd` 를 무시하고 `model_prices` 로 매긴다(없는 모델은 표의 최댓값 + `usd_basis='estimate'`). 그 밖의 근거는 `p_usd` 가 null 이면 `usd_required` 예외. `provider` 는 `anthropic|openai|google|fal|apify|other`. 같은 `fal_request_id` 는 한 줄.

- [ ] **Step 1: 실제 PostgreSQL 시험을 쓴다**

`scripts/tests/ai-cost-events.test.mjs`:

```js
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { testPostgres } from '../lib/test-credit-postgres.mjs';

/*
  202609300002 — AI 호출마다 비용 한 줄(설계 2026-09-30 §3.4 · C3).

  앱은 공급자를 부를 때마다 `ai_cost_record` 를 부른다. 그림(`image_unit`)은 여기서 `model_prices` 로
  값을 매기고, fal 요청 id 가 같으면 한 번만 적는다. 정적 시험(`ai-cost-migration.test.ts`)은 글을 읽고,
  이 파일은 실제로 돌린다.
*/
const MIGRATION = '202609300002_ai_cost_events.sql';
const USER = '90000000-0000-4000-8000-000000000001';
const REQ = '91000000-0000-4000-8000-000000000001';
const SIGNATURE = 'public.ai_cost_record(uuid,uuid,text,text,text,integer,integer,integer,numeric,text,boolean,text)';
let db;
const json = async (q) => JSON.parse(await db.sql(q));

/** 한 줄 쓰기. 인자 순서는 함수 정의 그대로다. */
const record = ({ operation = 'cs:ask', provider = 'anthropic', model = 'claude-sonnet-5', input = 0, output = 0,
  images = 0, usd = 'null', basis = 'tokens', failed = false, fal = null } = {}) =>
  db.sql(`select ai_cost_record('${USER}','${REQ}','${operation}','${provider}','${model}',${input},${output},${images},${usd},'${basis}',${failed},${fal === null ? 'null' : `'${fal}'`});`);
const row = (where) => json(`select to_jsonb(e) from (select usd::float8 usd, usd_basis, images, input_tokens, output_tokens from ai_cost_events where ${where} order by id desc limit 1) e;`);

before(async () => {
  db = await testPostgres();
  // 새 파일은 커밋 전이라 git 목록에 없을 수 있다. 이름으로 함께 깐다.
  await db.migrate([MIGRATION]);
});
after(async () => { await db?.close(); });

test('text rows keep the amount the app computed', async () => {
  await record({ input: 1000, output: 200, usd: 0.004 });
  assert.deepEqual(await row(`operation='cs:ask'`), { usd: 0.004, usd_basis: 'tokens', images: 0, input_tokens: 1000, output_tokens: 200 });
});

test('image rows are priced from model_prices at write time', async () => {
  await record({ provider: 'fal', model: 'nano-banana-pro', images: 2, basis: 'image_unit', fal: 'fal-a' });
  const unit = Number(await db.sql(`select unit_cost_usd from model_prices where model='nano-banana-pro';`));
  assert.deepEqual(await row(`fal_request_id='fal-a'`), { usd: Number((unit * 2).toFixed(6)), usd_basis: 'image_unit', images: 2, input_tokens: 0, output_tokens: 0 });
});

test('an unknown image model is priced at the most expensive row and marked estimate', async () => {
  await record({ provider: 'fal', model: 'brand-new-model', images: 1, basis: 'image_unit', fal: 'fal-b' });
  const max = Number(await db.sql(`select max(unit_cost_usd) from model_prices;`));
  const got = await row(`fal_request_id='fal-b'`);
  assert.equal(got.usd, max);
  assert.equal(got.usd_basis, 'estimate');
});

test('the same fal request is written once', async () => {
  await record({ provider: 'fal', model: 'nano-banana-pro', images: 1, basis: 'image_unit', fal: 'fal-c' });
  await record({ provider: 'fal', model: 'nano-banana-pro', images: 1, basis: 'image_unit', fal: 'fal-c' });
  assert.equal(await db.sql(`select count(*) from ai_cost_events where fal_request_id='fal-c';`), '1');
});

test('rows without a fal id never collide', async () => {
  const before = Number(await db.sql(`select count(*) from ai_cost_events where fal_request_id is null;`));
  await record({ usd: 0.001 });
  await record({ usd: 0.001 });
  assert.equal(Number(await db.sql(`select count(*) from ai_cost_events where fal_request_id is null;`)), before + 2);
});

test('a non-image row without an amount is refused', async () => {
  await assert.rejects(record({ usd: 'null', basis: 'tokens' }), /usd_required/);
});

test('an unknown provider is refused by the table', async () => {
  await assert.rejects(record({ provider: 'mystery', usd: 0.1 }), /ai_cost_events_provider_check/);
});

test('members cannot read the table or call the writer', async () => {
  assert.equal(await db.sql(`select has_table_privilege('anon','public.ai_cost_events','select');`), 'f');
  assert.equal(await db.sql(`select has_table_privilege('authenticated','public.ai_cost_events','insert');`), 'f');
  assert.equal(await db.sql(`select has_function_privilege('authenticated','${SIGNATURE}','execute');`), 'f');
  assert.equal(await db.sql(`select has_function_privilege('service_role','${SIGNATURE}','execute');`), 't');
  assert.equal(await db.sql(`select relrowsecurity from pg_class where oid='public.ai_cost_events'::regclass;`), 't');
});
```

- [ ] **Step 2: 정적 SQL 시험을 쓴다(C3 몫)**

`apps/web/lib/membership/__tests__/ai-cost-migration.test.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **AI 비용 표·보고·스위치 마이그레이션은 새것만 더한다**(설계 2026-09-30 §3.3·§3.4·§5·§7).
 *
 * 같은 Supabase 를 detail-page-studio 가 본다. 그쪽은 `admin_cost_*` 를 그대로 부르고 예약은
 * `reserve_generation` 을 부른다. 이 파일들이 그것들을 다시 정의하면 남의 제품이 깨진다.
 * 동작은 `scripts/tests/ai-cost-events.test.mjs`·`ai-cost-admin.test.mjs`(실제 PostgreSQL)가 본다.
 */

const migrationsDir = fileURLToPath(new URL("../../../../../supabase/migrations/", import.meta.url));
const C3 = "202609300002_ai_cost_events.sql";

/** 주석을 걷어낸다. 이 저장소의 SQL 은 설명이 길어 단어가 코드로 오인된다. */
function code(name: string): string {
  return readFileSync(path.join(migrationsDir, name), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*--.*$/gm, "");
}

const 정의한함수 = (sql: string) =>
  [...sql.matchAll(/create\s+or\s+replace\s+function\s+public\.(\w+)\s*\(/gi)].map((match) => match[1]!.toLowerCase());

describe("새것만 더한다", () => {
  it("C3 는 ai_cost_record 하나만 정의한다", () => {
    expect(existsSync(path.join(migrationsDir, C3))).toBe(true);
    expect(정의한함수(code(C3))).toEqual(["ai_cost_record"]);
  });

  it("C3 는 기존 표를 바꾸지 않는다(다른 표 alter·drop 없음)", () => {
    const sql = code(C3);
    expect(sql).not.toMatch(/\balter\s+table\s+(?!public\.ai_cost_events\b)/i);
    expect(sql).not.toMatch(/\bdrop\s+(table|function|index)\b/i);
  });
});

describe("비용 표", () => {
  const sql = code(C3);

  it("회원은 못 읽는다 — RLS 를 켜고 anon·authenticated 권한을 거둔다", () => {
    expect(sql).toMatch(/alter\s+table\s+public\.ai_cost_events\s+enable\s+row\s+level\s+security/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+table\s+public\.ai_cost_events\s+from\s+public,\s*anon,\s*authenticated/i);
  });

  it("fal 요청 id 는 unique — 같은 제출이 두 번 적히지 않는다", () => {
    expect(sql).toMatch(/fal_request_id\s+text\s+unique/i);
    expect(sql).toMatch(/on\s+conflict\s*\(\s*fal_request_id\s*\)\s+do\s+nothing/i);
  });

  it("그림 값은 기존 model_prices 로 매긴다", () => {
    expect(sql).toMatch(/from\s+model_prices\s+where\s+model\s*=\s*p_model/i);
  });

  it("쓰는 함수는 서비스 권한만 부른다", () => {
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\.ai_cost_record\([^)]*\)\s+from\s+public,\s*anon,\s*authenticated/i);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.ai_cost_record\([^)]*\)\s+to\s+service_role/i);
  });
});
```

- [ ] **Step 3: 두 시험이 실패하는지 본다**

Run: `node --test scripts/tests/ai-cost-events.test.mjs`
Expected: FAIL — `Migration 202609300002_ai_cost_events.sql: ENOENT`.
Run: `cd apps/web && npx vitest run lib/membership/__tests__/ai-cost-migration.test.ts`
Expected: FAIL — `ENOENT … 202609300002_ai_cost_events.sql`.

- [ ] **Step 4: 마이그레이션을 쓴다**

`supabase/migrations/202609300002_ai_cost_events.sql`:

```sql
-- AI 호출마다 비용 한 줄 (설계 2026-09-30 §3.4 · C3).
--
-- 지금 원가는 요청 끝에 `generation_events.llm_usd` + `billable_images × model_prices` 로 적는다.
-- 계량기 밖 호출(카드뉴스 상태 조회의 검수·웹검색 조사·Apify·임베딩)과 여러 단계 작업은 빠진다.
-- 여기서는 **공급자를 부를 때마다 한 줄**을 남길 자리와, 그 줄을 쓰는 함수 하나를 더한다.
--
-- ⚠ 공유 DB — detail-page-studio 가 같은 Supabase 를 본다. **새 표·새 함수만 더한다.**
--   기존 표·함수(`generation_events`·`model_prices`·`admin_cost_*`·`reserve_generation`·`credit_*`)는
--   다시 정의하지 않는다.
-- ⚠ 순서 — **이 파일 먼저, 그다음 앱**(docs/DEPLOY.md 기본 순서). 앱이 먼저 나가면 쓰기가
--   「함수 없음」으로 실패하고 경고만 남는다(호출은 안 막는다). 그동안의 비용이 빠질 뿐이다.

create table if not exists public.ai_cost_events (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  -- 회원을 지워도 회사가 낸 돈은 남아야 한다. 그래서 profiles 에 묶지 않는다.
  user_id         uuid,
  -- 예약의 요청 식별자(x-idempotency-key). 관리자 지식 올리기처럼 예약 없는 자리는 비운다.
  request_id      uuid,
  -- 작업 키. 예약의 resource 에서 id 를 뺀 것(`sns:plan`, `poster:review`, `cs:ask` …).
  operation       text not null check (char_length(operation) between 1 and 80),
  provider        text not null check (provider in ('anthropic','openai','google','fal','apify','other')),
  model           text not null check (char_length(model) between 1 and 200),
  input_tokens    integer not null default 0 check (input_tokens >= 0),
  output_tokens   integer not null default 0 check (output_tokens >= 0),
  images          integer not null default 0 check (images between 0 and 100),
  usd             numeric(12, 6) not null check (usd >= 0),
  usd_basis       text not null check (usd_basis in ('tokens','image_unit','provider_reported','estimate')),
  failed          boolean not null default false,
  -- fal 은 제출하면 과금이 끝난다. 같은 제출이 두 번 적히지 않게 막는다. 없으면 null(여럿 허용).
  fal_request_id  text unique
);

create index if not exists ai_cost_events_created_idx on public.ai_cost_events (created_at desc);

alter table public.ai_cost_events enable row level security;
revoke all on table public.ai_cost_events from public, anon, authenticated;

-- ── 한 줄 쓰기 ───────────────────────────────────────────────────
--
-- 그림(`image_unit`)은 **여기서** 값을 매긴다 — 단가는 관리자가 고치는 `model_prices` 에 있다.
-- 단가가 없는 모델이면 표에서 가장 비싼 값으로 잡고 근거를 `estimate` 로 남긴다
-- (적게 잡는 쪽이 위험하다 — `credit-cost.ts` 의 `imageUnitUsd` 와 같은 판단).
-- 글 모델·웹검색·Apify 는 앱이 금액을 계산해 넘긴다.

create or replace function public.ai_cost_record(
  p_user uuid,
  p_request uuid,
  p_operation text,
  p_provider text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_images integer,
  p_usd numeric,
  p_basis text,
  p_failed boolean,
  p_fal_request_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usd numeric := p_usd;
  v_basis text := p_basis;
  v_unit numeric;
begin
  if p_basis = 'image_unit' then
    select unit_cost_usd into v_unit from model_prices where model = p_model;
    if v_unit is null then
      select max(unit_cost_usd) into v_unit from model_prices;
      v_basis := 'estimate';
    end if;
    v_usd := coalesce(v_unit, 0) * greatest(coalesce(p_images, 0), 0);
  elsif v_usd is null then
    raise exception 'ai_cost_record: usd_required for basis %', p_basis;
  end if;

  insert into ai_cost_events(
    user_id, request_id, operation, provider, model,
    input_tokens, output_tokens, images, usd, usd_basis, failed, fal_request_id
  ) values (
    p_user, p_request, p_operation, p_provider, p_model,
    greatest(coalesce(p_input_tokens, 0), 0), greatest(coalesce(p_output_tokens, 0), 0),
    greatest(coalesce(p_images, 0), 0), round(v_usd, 6), v_basis, coalesce(p_failed, false),
    nullif(btrim(coalesce(p_fal_request_id, '')), '')
  )
  on conflict (fal_request_id) do nothing;
end $$;

revoke all on function public.ai_cost_record(uuid,uuid,text,text,text,integer,integer,integer,numeric,text,boolean,text) from public, anon, authenticated;
grant execute on function public.ai_cost_record(uuid,uuid,text,text,text,integer,integer,integer,numeric,text,boolean,text) to service_role;

-- ── 하나인지 센다(42725 교훈) ──────────────────────────────────────
do $$
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'ai_cost_record') <> 1 then
    raise exception 'ai_cost_record 가 하나가 아닙니다';
  end if;
  raise notice 'ai_cost_events 표와 ai_cost_record 함수 하나를 만들었습니다.';
end $$;

-- 확인(적용 뒤, 읽기만):
--   select to_regclass('public.ai_cost_events');
--   select has_table_privilege('anon', 'public.ai_cost_events', 'select');   -- false
--   select has_function_privilege('authenticated',
--     'public.ai_cost_record(uuid,uuid,text,text,text,integer,integer,integer,numeric,text,boolean,text)', 'execute'); -- false
```

- [ ] **Step 5: `test:credit-db` 에 넣는다**

`package.json:15` 의 끝 `scripts/tests/ai-usage-control.test.mjs"` 를 다음으로 바꾼다:

```json
scripts/tests/ai-usage-control.test.mjs scripts/tests/ai-cost-events.test.mjs"
```

- [ ] **Step 6: 통과를 본다**

Run: `node --test scripts/tests/ai-cost-events.test.mjs` → Expected: `ℹ pass 8 · ℹ fail 0`.
Run: `cd apps/web && npx vitest run lib/membership/__tests__/ai-cost-migration.test.ts lib/membership/__tests__/sql-function-unique.test.ts` → Expected: 전부 PASS.
Run: `pnpm test:credit-db` → Expected: 실패 0(기존 파일 포함).

- [ ] **Step 7: 커밋**

```bash
git add supabase/migrations/202609300002_ai_cost_events.sql scripts/tests/ai-cost-events.test.mjs apps/web/lib/membership/__tests__/ai-cost-migration.test.ts package.json
git commit -m "feat(ai-cost): AI 호출마다 비용 한 줄을 남길 표를 더한다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 한 줄 쓰기와 요청 문맥 — `recordLlmUsage` 한 곳에서

**Files:**
- Create: `apps/web/lib/ai-cost/keys.ts`
- Create: `apps/web/lib/ai-cost/write.ts`
- Modify: `apps/web/lib/llm/meter.ts:1-47` (머리 주석·`Meter`·`withLlmMeter`·`recordLlmUsage`), `:58-62` (`readLlmMeter`)
- Test: `apps/web/lib/ai-cost/__tests__/keys-write.test.ts`, `apps/web/lib/llm/__tests__/meter-cost.test.ts`

**Interfaces:**
- Consumes: `llmUsdFromTokens` (`@fixup/shared`), RPC `ai_cost_record`(Task 1, 인자 이름 `p_user … p_fal_request_id`).
- Produces (다음 Task 들이 쓴다):
  - `lib/ai-cost/keys.ts`: `costOperationKey(operation: string, resource?: string): string` · `providerOfModel(model: string): AiCostProvider` · `type AiCostProvider = "anthropic" | "openai" | "google" | "fal" | "apify" | "other"` · `isUuid(value)`
  - `lib/ai-cost/write.ts`: `interface AiCaller { userId: string | null; requestId: string | null; operation: string }` · `interface AiCostEntry { provider; model; inputTokens?; outputTokens?; images?; usd?: number; basis: AiCostBasis; failed?: boolean; falRequestId?: string | null }` · `type AiCostBasis = "tokens" | "image_unit" | "provider_reported" | "estimate"` · `interface AiCostRow`(RPC 인자) · `toAiCostRow` · `writeAiCostRow(caller, entry): Promise<void>`(던지지 않음) · `replaceAiCostWriterForTest(next | null)` · `flushAiCostWrites(pending, timeoutMs = 3000)` · `UNBOUND_OPERATION = "unbound"`
  - `lib/llm/meter.ts`: `withLlmMeter(run)`(겹치면 바깥 문맥을 물려받고, 끝나기 전 쓰기를 3초까지 기다림) · `bindAiCaller(caller: AiCaller): void` · `currentAiCaller(): AiCaller | undefined` · `recordAiCost(entry: AiCostEntry): void` · `recordLlmUsage`(기존 인자 그대로, 이제 한 줄도 씀) · `export type { AiCaller, AiCostEntry }`

**정한 것(설계가 계획에 맡긴 것, §7 「응답을 기다리지 않으면 재시작 때 줄이 빠질 수 있다 — 계획에서 정한다」):** 쓰기는 **부른 순간 시작**하고, 라우트 입구의 `withLlmMeter` 가 끝나기 전에 **최대 3초** 기다린다. 기다리는 까닭은 응답 직후 배포 재시작에 줄이 사라지지 않게, 한도를 두는 까닭은 장부 때문에 사용자가 기다리지 않게. 계량기 밖이면 기다릴 곳이 없으므로 그냥 흘려보낸다(경고는 실패할 때만).

- [ ] **Step 1: 실패하는 시험 둘을 쓴다**

`apps/web/lib/ai-cost/__tests__/keys-write.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { costOperationKey, providerOfModel } from "../keys";
import { flushAiCostWrites, replaceAiCostWriterForTest, toAiCostRow, writeAiCostRow } from "../write";

/**
 * 비용 한 줄의 **이름표와 모양**(설계 2026-09-30 §3.1·§3.4).
 *
 * 작업 칸은 기능별 비용을 가르는 유일한 자리다 — C2 가 새 작업 이름 대신 resource 로
 * 갔기 때문이다. 여기서 id 를 안 떼면 프로젝트마다 다른 줄이 되어 합계가 흩어진다.
 */

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("작업 키", () => {
  it.each([
    ["sns_image", `sns:${ID}:plan`, "sns:plan"],
    ["sns_image", `sns:${ID}:caption`, "sns:caption"],
    ["sns_image", `sns:${ID}`, "sns"],
    ["sns_image", "sns:layout-analysis", "sns:layout-analysis"],
    ["poster_image", `poster:${ID}:review`, "poster:review"],
    ["poster_image", "easy:decide", "easy:decide"],
    ["ad_export", "ad:export:cutout", "ad:export:cutout"],
    ["cs_ask", "cs:ask", "cs:ask"],
  ])("%s + %s → %s", (operation, resource, key) => {
    expect(costOperationKey(operation, resource)).toBe(key);
  });

  it("resource 가 없거나 주소면 작업 이름을 쓴다", () => {
    expect(costOperationKey("poster_image")).toBe("poster_image");
    expect(costOperationKey("poster_image", `/api/poster/projects/${ID}/generate`)).toBe("poster_image");
  });
});

describe("공급자", () => {
  it.each([
    ["claude-sonnet-5", "anthropic"],
    ["gpt-5.6-sol", "openai"],
    ["text-embedding-3-small", "openai"],
    ["gemini-3.1-pro-preview", "google"],
    ["mystery-model", "other"],
  ])("%s → %s", (model, provider) => {
    expect(providerOfModel(model)).toBe(provider);
  });
});

describe("한 줄의 모양", () => {
  it("uuid 가 아닌 회원·요청 값은 비운다 — 로컬 우회 계정(`local-dev`)이 표를 깨지 않게", () => {
    const row = toAiCostRow({ userId: "dev", requestId: "local-dev", operation: "cs:ask" }, { provider: "anthropic", model: "m", usd: 0.1, basis: "tokens" });
    expect(row.p_user).toBeNull();
    expect(row.p_request).toBeNull();
  });

  it("음수·소수 토큰과 100 을 넘는 그림 수를 표가 받는 범위로 자른다", () => {
    const row = toAiCostRow(undefined, { provider: "fal", model: "m", inputTokens: -5, outputTokens: 2.6, images: 500, basis: "image_unit" });
    expect(row).toMatchObject({ p_input_tokens: 0, p_output_tokens: 3, p_images: 100, p_usd: null, p_operation: "unbound" });
  });
});

describe("쓰기가 실패하면", () => {
  afterEach(() => replaceAiCostWriterForTest(null));

  it("던지지 않고 경고 한 줄을 남긴다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    replaceAiCostWriterForTest(async () => { throw new Error("rpc 실패"); });
    await expect(writeAiCostRow(undefined, { provider: "openai", model: "m", usd: 1, basis: "tokens" })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("[ai-cost] 비용 한 줄을 적지 못했습니다", expect.objectContaining({ message: "rpc 실패" }));
    warn.mockRestore();
  });

  it("Supabase 가 비어 있으면(로컬·시험) 아무것도 안 하고 경고도 안 한다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const saved = process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
    await writeAiCostRow(undefined, { provider: "openai", model: "m", usd: 1, basis: "tokens" });
    expect(warn).not.toHaveBeenCalled();
    if (saved !== undefined) process.env.SUPABASE_SECRET_KEY = saved;
    warn.mockRestore();
  });
});

describe("기다리기", () => {
  it("느린 쓰기를 한도까지만 기다린다", async () => {
    const 영영 = new Promise<void>(() => undefined);
    const 시작 = Date.now();
    await flushAiCostWrites([영영], 30);
    expect(Date.now() - 시작).toBeLessThan(1000);
  });
});
```

`apps/web/lib/llm/__tests__/meter-cost.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { llmUsdFromTokens } from "@fixup/shared";
import { bindAiCaller, currentAiCaller, readLlmMeter, recordAiCost, recordFrom, recordLlmUsage, withLlmMeter } from "../meter";
import { replaceAiCostWriterForTest, type AiCostRow } from "../../ai-cost/write";

/**
 * **공급자를 부를 때마다 비용 한 줄**(설계 2026-09-30 §3.4·§5).
 *
 * 글 모델은 `recordLlmUsage` 한 곳에서 적는다 — 모듈 열한 곳을 따로 감싸지 않는다.
 * 계량기가 없어도 버리지 않는다. 쓰기가 실패해도 호출은 막지 않는다.
 */

const USER = "11111111-1111-4111-8111-111111111111";
const REQUEST = "22222222-2222-4222-8222-222222222222";
let rows: AiCostRow[] = [];

beforeEach(() => {
  rows = [];
  replaceAiCostWriterForTest(async (row) => { rows.push(row); });
});
afterEach(() => replaceAiCostWriterForTest(null));

describe("글 모델", () => {
  it("부를 때마다 한 줄 — 누구의 무슨 작업인지와 금액을 싣는다", async () => {
    await withLlmMeter(async () => {
      bindAiCaller({ userId: USER, requestId: REQUEST, operation: "cs:ask" });
      recordFrom("claude-sonnet-5", { usage: { input_tokens: 1200, output_tokens: 300 } });
      recordLlmUsage("gpt-5.6-sol", 100, 50);
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      p_user: USER, p_request: REQUEST, p_operation: "cs:ask",
      p_provider: "anthropic", p_model: "claude-sonnet-5",
      p_input_tokens: 1200, p_output_tokens: 300, p_images: 0,
      p_usd: llmUsdFromTokens("claude-sonnet-5", 1200, 300), p_basis: "tokens",
      p_failed: false, p_fal_request_id: null,
    });
    expect(rows[1]!.p_provider).toBe("openai");
  });

  it("계량기 합산과 같은 금액을 적는다 — 두 벌로 세지 않는다", async () => {
    const 읽은값 = await withLlmMeter(async () => {
      recordLlmUsage("claude-sonnet-5", 5000, 700);
      return readLlmMeter();
    });
    expect(rows[0]!.p_usd).toBe(읽은값.usd);
  });

  it("**계량기 밖에서도 적는다** — 문맥 없음(unbound)으로", async () => {
    recordLlmUsage("claude-sonnet-5", 10, 10);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.p_operation).toBe("unbound");
    expect(rows[0]!.p_user).toBeNull();
  });
});

describe("쓰기", () => {
  it("**요청이 끝나기 전에 쓰기를 기다린다** — 응답 뒤 재시작에 줄이 사라지지 않게", async () => {
    let 끝남 = false;
    replaceAiCostWriterForTest(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      끝남 = true;
    });
    await withLlmMeter(async () => { recordLlmUsage("claude-sonnet-5", 1, 1); });
    expect(끝남).toBe(true);
  });

  it("**쓰기가 실패해도 호출은 막지 않는다**", async () => {
    replaceAiCostWriterForTest(async () => { throw new Error("DB 가 죽었다"); });
    const 값 = await withLlmMeter(async () => {
      recordLlmUsage("claude-sonnet-5", 1, 1);
      return "결과";
    });
    expect(값).toBe("결과");
  });

  it("그림 한 줄은 금액을 비워 보낸다 — DB 가 model_prices 로 매긴다", async () => {
    await withLlmMeter(async () => {
      recordAiCost({ provider: "fal", model: "nano-banana-pro", images: 2, basis: "image_unit", falRequestId: "fal-1" });
    });
    expect(rows[0]).toMatchObject({ p_provider: "fal", p_images: 2, p_usd: null, p_basis: "image_unit", p_fal_request_id: "fal-1" });
  });
});

describe("문맥", () => {
  it("겹쳐 열면 바깥 문맥을 물려받고, 안쪽에서 바꿔도 바깥은 그대로다", async () => {
    await withLlmMeter(async () => {
      bindAiCaller({ userId: USER, requestId: REQUEST, operation: "easy:decide" });
      await withLlmMeter(async () => {
        expect(currentAiCaller()?.operation).toBe("easy:decide");
        bindAiCaller({ userId: USER, requestId: REQUEST, operation: "poster:plan" });
        recordLlmUsage("claude-sonnet-5", 1, 1);
      });
      expect(currentAiCaller()?.operation).toBe("easy:decide");
    });
    expect(rows[0]!.p_operation).toBe("poster:plan");
  });

  it("요청끼리 문맥이 섞이지 않는다", async () => {
    await Promise.all([
      withLlmMeter(async () => {
        bindAiCaller({ userId: USER, requestId: null, operation: "sns:plan" });
        await new Promise((resolve) => setTimeout(resolve, 5));
        recordLlmUsage("claude-sonnet-5", 1, 1);
      }),
      withLlmMeter(async () => {
        bindAiCaller({ userId: USER, requestId: null, operation: "cs:ask" });
        recordLlmUsage("claude-sonnet-5", 1, 1);
      }),
    ]);
    expect(rows.map((row) => row.p_operation).sort()).toEqual(["cs:ask", "sns:plan"]);
  });
});
```

- [ ] **Step 2: 실패를 본다**

Run: `cd apps/web && npx vitest run lib/ai-cost lib/llm/__tests__/meter-cost.test.ts`
Expected: FAIL — `Failed to resolve import "../keys"` / `"../../ai-cost/write"`.

- [ ] **Step 3: `lib/ai-cost/keys.ts` 를 쓴다**

```ts
/**
 * 비용 한 줄에 붙이는 **이름표**(설계 2026-09-30 §3.4).
 *
 * ── 작업 키 ────────────────────────────────────────────────
 *
 * C2 는 새 작업 이름을 만들지 않고 **기존 이름 + resource** 로 갔다(§3.1). 그래서
 * `generation_events.operation` 만으로는 카드뉴스 그림(`sns_image` + `sns:{id}`)과
 * 카드뉴스 기획(`sns_image` + `sns:{id}:plan`)이 한 칸에 섞인다. 「기능별 비용은
 * `ai_cost_events` 의 작업 칸으로 나눈다」(§3.1)는 약속을 지키려고, 작업 칸에는
 * **resource 에서 id 를 뺀 것**을 적는다 — `sns`, `sns:plan`, `poster:review`, `cs:ask`.
 *
 * resource 가 없거나 주소(`/api/…`, 크기를 몰라 예약 계획이 빠진 경우)면 작업 이름을 쓴다.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function costOperationKey(operation: string, resource?: string): string {
  if (!resource || resource.startsWith("/")) return operation;
  const kept = resource.split(":").filter((part) => part.length > 0 && !UUID.test(part));
  return kept.length > 0 ? kept.join(":").slice(0, 80) : operation;
}

export type AiCostProvider = "anthropic" | "openai" | "google" | "fal" | "apify" | "other";

/**
 * 글 모델 이름으로 공급자를 가른다. **모르면 `other`** — 지어내지 않는다.
 * 화면이 「기타」로 모아 보여 주면 누군가 새 모델을 들인 줄 안다.
 */
export function providerOfModel(model: string): AiCostProvider {
  const id = model.trim().toLowerCase();
  if (id.startsWith("claude")) return "anthropic";
  if (id.startsWith("gemini")) return "google";
  if (/^(gpt|o\d|text-embedding)/.test(id)) return "openai";
  return "other";
}

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID.test(value);
}
```

- [ ] **Step 4: `lib/ai-cost/write.ts` 를 쓴다**

```ts
import { isUuid, type AiCostProvider } from "./keys";

/**
 * **공급자를 한 번 부를 때마다 한 줄**을 적는다(설계 2026-09-30 §3.4).
 *
 * ── 누가 부르나 ────────────────────────────────────────────
 *
 * 직접 부르지 않는다. `lib/llm/meter.ts` 의 `recordLlmUsage`(글 모델)와 `recordAiCost`
 * (그림·웹검색·Apify)가 부른다. 거기서 요청 문맥(누가·어느 요청·무슨 작업)을 붙여 넘긴다.
 *
 * ── 실패하면 ──────────────────────────────────────────────
 *
 * **던지지 않는다.** 경고 한 줄만 남긴다(§3.4 「쓰기 실패는 호출을 막지 않는다」).
 * 장부 한 줄 때문에 이미 돈이 나간 결과를 사용자가 못 보면 더 나쁘다.
 *
 * ── Supabase 가 없으면 ─────────────────────────────────────
 *
 * 조용히 건너뛴다. 로컬은 일부러 Supabase 를 비워 둔다(`CLAUDE.md` 「로컬 확인」) — 그 값을
 * 채우면 로컬이 운영 DB 에 쓰게 된다. 시험도 같은 이유로 비어 있다.
 */

export type AiCostBasis = "tokens" | "image_unit" | "provider_reported" | "estimate";

/** 누구의 무슨 호출인가. 라우트 입구가 채운다(`bindAiCaller`). */
export interface AiCaller {
  userId: string | null;
  requestId: string | null;
  operation: string;
}

export interface AiCostEntry {
  provider: AiCostProvider;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  images?: number;
  /** `image_unit` 이면 비운다 — DB 가 `model_prices` 로 매긴다. 나머지는 반드시 준다. */
  usd?: number;
  basis: AiCostBasis;
  failed?: boolean;
  falRequestId?: string | null;
}

/** `ai_cost_record` 의 인자 그대로. */
export interface AiCostRow {
  p_user: string | null;
  p_request: string | null;
  p_operation: string;
  p_provider: AiCostProvider;
  p_model: string;
  p_input_tokens: number;
  p_output_tokens: number;
  p_images: number;
  p_usd: number | null;
  p_basis: AiCostBasis;
  p_failed: boolean;
  p_fal_request_id: string | null;
}

/** 문맥 없이 적힌 줄. 화면에 「문맥 없음」으로 보여 빠진 입구를 찾게 한다. */
export const UNBOUND_OPERATION = "unbound";

const count = (value: number | undefined, max: number) =>
  Number.isFinite(value) ? Math.min(Math.max(Math.round(value as number), 0), max) : 0;

export function toAiCostRow(caller: AiCaller | undefined, entry: AiCostEntry): AiCostRow {
  return {
    p_user: isUuid(caller?.userId) ? caller!.userId : null,
    p_request: isUuid(caller?.requestId) ? caller!.requestId : null,
    p_operation: (caller?.operation || UNBOUND_OPERATION).slice(0, 80),
    p_provider: entry.provider,
    p_model: (entry.model || "unknown").slice(0, 200),
    p_input_tokens: count(entry.inputTokens, 2_000_000_000),
    p_output_tokens: count(entry.outputTokens, 2_000_000_000),
    p_images: count(entry.images, 100),
    p_usd: entry.basis === "image_unit" ? null : Math.max(0, Number((entry.usd ?? 0).toFixed(6))),
    p_basis: entry.basis,
    p_failed: entry.failed === true,
    p_fal_request_id: entry.falRequestId?.trim() || null,
  };
}

export type AiCostWriter = (row: AiCostRow) => Promise<void>;

async function supabaseWriter(row: AiCostRow): Promise<void> {
  if (!process.env.SUPABASE_SECRET_KEY) return;
  // 부를 때 불러온다. 이 모듈은 계량기(`meter.ts`)가 쓰고, 계량기는 시험·로컬 어디서나 불린다.
  const { createSupabaseAdminClient } = await import("../supabase/admin");
  const { error } = await createSupabaseAdminClient().rpc("ai_cost_record", row);
  if (error) throw new Error(error.message);
}

let writer: AiCostWriter = supabaseWriter;

/** 시험 전용. `null` 이면 원래 쓰기로 돌아간다. */
export function replaceAiCostWriterForTest(next: AiCostWriter | null): void {
  writer = next ?? supabaseWriter;
}

export async function writeAiCostRow(caller: AiCaller | undefined, entry: AiCostEntry): Promise<void> {
  const row = toAiCostRow(caller, entry);
  try {
    await writer(row);
  } catch (error) {
    console.warn("[ai-cost] 비용 한 줄을 적지 못했습니다", {
      operation: row.p_operation,
      provider: row.p_provider,
      model: row.p_model,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * 요청이 끝나기 전에 쓰기를 기다린다. **오래 붙잡지 않는다** — DB 가 느려도 응답은 나간다.
 *
 * 기다리는 이유: 응답을 보낸 직후 배포로 프로세스가 내려가면 아직 안 끝난 쓰기가
 * 사라진다(설계 §7). 한도를 두는 이유: 장부 때문에 사용자가 기다리면 안 된다.
 */
export async function flushAiCostWrites(pending: readonly Promise<void>[], timeoutMs = 3000): Promise<void> {
  if (pending.length === 0) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
    timer.unref?.();
  });
  try {
    await Promise.race([Promise.allSettled(pending).then(() => undefined), limit]);
  } finally {
    clearTimeout(timer);
  }
}
```

`supabase/admin` 을 **정적으로 import 하지 않는 까닭**: 그 모듈은 `server-only` 를 끌고 오고, `meter.ts` 는 `server-only` 를 흉내 내지 않는 시험(`lib/llm/__tests__/meter.test.ts` 등)에서도 불린다.

- [ ] **Step 5: `lib/llm/meter.ts` 를 고친다**

1-47줄(첫 `import` 부터 `recordLlmUsage` 가 끝나는 `}` 까지)을 통째로 다음으로 바꾼다. 48줄 이후(`LlmMeterReading`·`readLlmMeter`·`llmSettleCost`·`tokensFrom`·`recordFrom`·`metered`)는 그대로 둔다.

```ts
import { AsyncLocalStorage } from "node:async_hooks";
import { llmUsdFromTokens } from "@fixup/shared";
import { providerOfModel } from "../ai-cost/keys";
import { flushAiCostWrites, writeAiCostRow, type AiCaller, type AiCostEntry } from "../ai-cost/write";

export type { AiCaller, AiCostEntry } from "../ai-cost/write";

/**
 * 이 요청에서 글 모델에 **실제로 쓴 돈**을 모은다.
 *
 * ── 왜 인자로 안 넘기나 ────────────────────────────────────────
 *
 * 글 모델 호출은 열한 군데에 흩어져 있고, 대부분 서너 겹 아래에서 일어난다
 * (라우트 → 서비스 → 제공자). 토큰을 위로 되돌리려면 그 사이의 모든
 * 시그니처와 반환형을 고쳐야 하고, **한 곳만 빠뜨려도 그 경로는 조용히 0원**이
 * 된다. 값을 못 세는 것보다 **못 센 줄 모르는 것**이 나쁘다.
 *
 * 그래서 요청 단위 저장소에 담는다. 호출하는 쪽은 자기가 계량되는 줄 몰라도
 * 되고, 라우트는 끝에서 한 번 읽는다.
 *
 * ── 호출마다 한 줄(설계 2026-09-30 §3.4) ─────────────────────────
 *
 * 같은 저장소에 **누구의 무슨 호출인가**(`AiCaller`)도 싣는다. 라우트 입구가
 * `withLlmMeter` 로 저장소를 열고, 예약(`reserveAiUsage`)이 성공하면 `bindAiCaller` 로
 * 채운다. 그러면 `recordLlmUsage`·`recordAiCost` 가 공급자를 부를 때마다
 * `ai_cost_events` 에 한 줄을 쓴다 — 공급자 생성 함수의 인자는 그대로다.
 *
 * ── 계량기가 없으면 ────────────────────────────────────────────
 *
 * 합산은 **조용히 버린다.** 아직 감싸지 않은 경로에서 호출이 터지면 안 된다. 대신
 * `readLlmMeter` 가 `metered: false` 를 함께 돌려주므로, 값이 0인 것과 **계량기가 없어서
 * 0인 것**을 구별할 수 있다. **비용 한 줄은 버리지 않는다** — 문맥 없이(`unbound`) 적는다.
 */

interface Meter {
  usd: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
  caller?: AiCaller;
  /** 이 요청에서 시작한 비용 쓰기. 끝나기 전에 기다린다(`flushAiCostWrites`). */
  pending: Promise<void>[];
}

const storage = new AsyncLocalStorage<Meter>();

/**
 * 이 안에서 일어난 글 모델 호출을 모으고, 비용 쓰기를 끝까지 기다린다.
 *
 * **겹쳐 열면 바깥의 문맥을 물려받는다.** 쉬운 만들기는 안쪽에서 포스터 라우트를 부르고,
 * 칸 읽기는 라우트 안에서 계량기를 한 번 더 연다. 합산은 안쪽 것이 따로 세지만, 누구의
 * 호출인지는 같다.
 */
export async function withLlmMeter<T>(run: () => Promise<T>): Promise<T> {
  const outer = storage.getStore();
  const meter: Meter = { usd: 0, inputTokens: 0, outputTokens: 0, calls: 0, caller: outer?.caller, pending: [] };
  try {
    return await storage.run(meter, run);
  } finally {
    await flushAiCostWrites(meter.pending);
  }
}

/**
 * **이 요청이 누구의 무슨 작업인가.** 예약이 성공하면 `reserveAiUsage` 가 부른다.
 * 예약하지 않는 세 자리(카드뉴스·포스터 상태 조회, 관리자 지식 올리기)는 라우트가 직접 부른다.
 * 저장소가 없으면 아무것도 안 한다 — 그 길의 비용은 `unbound` 로 적힌다.
 */
export function bindAiCaller(caller: AiCaller): void {
  const meter = storage.getStore();
  if (meter) meter.caller = { ...caller };
}

export function currentAiCaller(): AiCaller | undefined {
  return storage.getStore()?.caller;
}

/** 비용 한 줄. 그림·웹검색·Apify 자리가 부른다. 글 모델은 `recordLlmUsage` 가 대신 부른다. */
export function recordAiCost(entry: AiCostEntry): void {
  const meter = storage.getStore();
  const write = writeAiCostRow(meter?.caller, entry);
  if (meter) meter.pending.push(write);
}

/** 호출 한 번을 적는다. 제공자가 부른다. **비용 한 줄도 여기서 쓴다** — 모듈마다 따로 감싸지 않는다. */
export function recordLlmUsage(model: string, inputTokens: number, outputTokens: number): void {
  const usd = llmUsdFromTokens(model, inputTokens, outputTokens);
  recordAiCost({ provider: providerOfModel(model), model, inputTokens, outputTokens, usd, basis: "tokens" });

  const meter = storage.getStore();
  if (!meter) return;

  meter.usd = Number((meter.usd + usd).toFixed(6));
  meter.inputTokens += Math.max(0, inputTokens);
  meter.outputTokens += Math.max(0, outputTokens);
  meter.calls += 1;
}
```

그리고 `readLlmMeter` 의 마지막 줄(옛 61줄)

```ts
  return { metered: true, ...meter };
```

을 다음으로 바꾼다 — 저장소에 `caller`·`pending` 이 생겼으므로 펼치면 읽은 값에 딸려 나간다:

```ts
  return { metered: true, usd: meter.usd, inputTokens: meter.inputTokens, outputTokens: meter.outputTokens, calls: meter.calls };
```

- [ ] **Step 6: 통과를 본다**

Run: `cd apps/web && npx vitest run lib/ai-cost lib/llm`
Expected: 4 files PASS(기존 `meter.test.ts`·`structured.test.ts` 포함).
Run: `cd apps/web && npx tsc --noEmit` → 오류 0.

- [ ] **Step 7: 전체와 커밋**

Run: `cd apps/web && npx vitest run` → 실패 0.

```bash
git add apps/web/lib/ai-cost apps/web/lib/llm/meter.ts apps/web/lib/llm/__tests__/meter-cost.test.ts
git commit -m "feat(ai-cost): 글 모델 호출마다 비용 한 줄을 계량기 한 곳에서 쓴다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 문맥을 채운다 — 예약이 채우고, 공급자를 부르는 라우트는 입구에서 계량기를 연다

**Files:**
- Modify: `apps/web/lib/membership/api.ts:14` (import 두 줄), `:95-97` (`reserveAiUsage` 안의 로컬 우회 분기 — 22줄의 같은 모양은 `authenticateApiMember` 것이라 건드리지 않는다), `:201` (성공 반환 직전)
- Modify: 라우트 15곳(아래 표) — 입구 감싸기
- Modify: `apps/web/app/api/sns/projects/[id]/status/route.ts`·`poster/projects/[id]/status/route.ts`·`redesign/knowledge/route.ts` — `bindAiCaller`
- Modify: `apps/web/app/api/__tests__/paid-route-settle-contract.test.ts` (끝에 describe 하나)
- Test: `apps/web/lib/membership/__tests__/reserve-binds-caller.test.ts`

**Interfaces:**
- Consumes: `bindAiCaller`·`withLlmMeter`(Task 2), `costOperationKey`(Task 2).
- Produces: 예약에 성공한 모든 요청의 비용 줄이 `{ userId, requestId(=x-idempotency-key), operation(=작업 키) }` 를 가진다. 예외 길의 작업 키: 카드뉴스 상태 조회 `sns`(만들기 예약과 같은 키), 포스터 상태 조회 `poster`, 관리자 지식 올리기 `admin:knowledge`.

감쌀 라우트(모두 지금 입구에 `withLlmMeter` 가 없다. 이미 입구에서 여는 11곳 — `cs/ask`·`easy/generate`·`pdp/analyze`·`pdp/plan-from-text`·`pdp/style-references`·`poster/…/plan`·`poster/…/review`·`redesign/generate`·`redesign/transcribe-strips`·`sns/…/plan`·`sns/…/caption` — 은 그대로 둔다. `sns/layout/analyze` 는 입구가 아니라 안쪽에서 계량기를 열므로 이 표에 들어간다):

| 라우트(`apps/web/app/api/…/route.ts`) | 감쌀 함수 | 시그니처 |
|---|---|---|
| `ad/export` | `POST` | `(request: Request)` |
| `characters` | `POST` | `(req: Request)` |
| `characters/views` | `POST` | `(req: Request)` |
| `pdp/images/batch` | `POST` | `(req: Request)` |
| `pdp/images` | `POST` | `(req: Request)` |
| `pdp/key-visual` | `POST` | `(req: Request)` |
| `poster/projects/[id]/edit` | `POST` | `(request: Request, context: Context)` |
| `poster/projects/[id]/generate` | `POST` | `(request: Request, context: Context)` |
| `poster/projects/[id]/status` | `POST` | `(request: Request, context: Context)` |
| `redesign/edit-section` | `POST` | `(req: Request)` |
| `redesign/knowledge` | `POST` | `(req: Request)` |
| `sns/projects/[id]/cards/[index]` | `POST`(PATCH 는 공급자를 안 부른다) | `(request: Request, context: Context)` |
| `sns/projects/[id]/generate` | `POST` | `(request: Request, context: Context)` |
| `sns/projects/[id]/status` | `POST` | `(_request: Request, context: Context)` |
| `sns/layout/analyze` | `POST` | `(request: Request)` |

바꾸는 모양은 모두 같다(예: `ad/export`):

```ts
// 옛
export async function POST(request: Request) {
// 새
export async function POST(request: Request) {
  return withLlmMeter(() => handlePost(request));
}

async function handlePost(request: Request) {
```

그리고 그 파일의 `…/lib/membership/api"` import 바로 아래에 같은 깊이로 `import { withLlmMeter } from "…/lib/llm/meter";` 를 더한다(예외 셋은 `import { bindAiCaller, withLlmMeter } …`). `sns/layout/analyze` 는 이미 `readLlmMeter, withLlmMeter` 를 import 하므로 import 는 그대로 둔다.

- [ ] **Step 1: 실패하는 시험 둘을 쓴다**

`apps/web/lib/membership/__tests__/reserve-binds-caller.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **예약이 성공하면 그 요청의 비용 문맥을 채운다**(설계 2026-09-30 §3.4).
 *
 * 공급자 생성 함수의 인자는 안 바꾼다. 대신 라우트 입구의 계량기 저장소에 「누구의
 * 무슨 작업인가」를 싣고, 뒤에서 공급자를 부를 때마다 그것을 붙여 한 줄씩 적는다.
 * 회원이 부르는 유료 AI 는 모두 여기(`reserveAiUsage`)를 지나므로 한 곳에서 채운다.
 */
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ reply: {} as Record<string, unknown> }));

vi.mock("../../supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "0f8fad5b-d9cb-469f-a165-70867728950e" } }, error: null }) },
    from: () => {
      const profile = { id: "0f8fad5b-d9cb-469f-a165-70867728950e", email_confirmed_at: "2026-01-01", status: "active", role: "member" };
      const self: Record<string, unknown> = {
        select: () => self, eq: () => self,
        single: async () => ({ data: profile }),
        maybeSingle: async () => ({ data: profile }),
      };
      return self;
    },
  }),
}));
vi.mock("../../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async () => ({ data: state.reply, error: null }),
    from: () => ({ update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }),
  }),
}));
vi.mock("../../dev-auth", () => ({ isLocalAuthBypass: false, devMemberProfile: { id: "dev" }, devUsageSummary: {} }));
vi.mock("../../access/core", () => ({ hasFullScope: () => true, viewerFrom: () => ({}) }));

const { reserveAiUsage } = await import("../api");
const { currentAiCaller, withLlmMeter } = await import("../../llm/meter");

const USER = "0f8fad5b-d9cb-469f-a165-70867728950e";
const REQUEST = "33333333-3333-4333-8333-333333333333";
const PROJECT = "44444444-4444-4444-8444-444444444444";
const req = () => new Request("http://local/api/x", { headers: { "x-idempotency-key": REQUEST } });
const usage = { pricing_policy: "image-v2", balance: 5, available: 5, reserved: 0, used: 0 };

beforeEach(() => { process.env.CREDIT_LEDGER = "1"; });

describe("예약이 성공하면", () => {
  it("회원·요청·작업 키를 문맥에 싣는다 — 작업 키는 resource 에서 id 를 뺀 것", async () => {
    state.reply = { allowed: true, usage };
    const caller = await withLlmMeter(async () => {
      const result = await reserveAiUsage(req(), "sns_image", 0, { outputs: [], resource: `sns:${PROJECT}:plan` });
      expect(result.ok).toBe(true);
      return currentAiCaller();
    });
    expect(caller).toEqual({ userId: USER, requestId: REQUEST, operation: "sns:plan" });
  });
});

describe("예약이 거절되면", () => {
  it("문맥을 채우지 않는다 — 거절된 요청은 공급자를 안 부른다", async () => {
    state.reply = { allowed: false, reason: "ai_paused", usage };
    const caller = await withLlmMeter(async () => {
      await reserveAiUsage(req(), "sns_image", 0, { outputs: [], resource: `sns:${PROJECT}:plan` });
      return currentAiCaller();
    });
    expect(caller).toBeUndefined();
  });
});
```

`apps/web/app/api/__tests__/paid-route-settle-contract.test.ts` 의 **맨 끝**에 붙인다(파일 안의 `부르는길`·`끝부분` 을 그대로 쓴다):

```ts

/* ── 공급자를 부르는 길은 비용 문맥을 연다(설계 2026-09-30 §3.4·§5) ──────── */

/**
 * **호출마다 한 줄**은 라우트 입구가 계량기 저장소를 열어야 「누구의 무슨 작업」이 붙는다.
 * 안 열면 그 길의 비용은 `unbound`(문맥 없음)로 적힌다 — 돈은 잡히지만 누구 것인지 모른다.
 *
 * 예약하는 길은 `reserveAiUsage` 가 문맥을 채운다. 예약하지 않는 예외 길(설계 §3.1)은
 * 라우트가 `bindAiCaller` 를 직접 부른다. `pdp/validate-key` 는 공급자를 부르지 않는다.
 */
describe("공급자를 부르는 길은 비용 문맥을 연다", () => {
  const 문맥예외 = new Set(["pdp/validate-key/route.ts"]);

  it("**입구에서 계량기를 연다**", () => {
    const 안여는것 = 부르는길
      .filter((file) => !문맥예외.has(끝부분(file)))
      // 안쪽에서만 여는 것(칸 읽기의 옛 모양)은 모자란다 — 예약이 그보다 먼저 와서 문맥을 못 싣는다.
      .filter((file) => !/return\s+withLlmMeter\(/.test(readFileSync(file, "utf8")))
      .map(끝부분);

    expect(안여는것, `계량기 없이 공급자를 부르는 길: ${안여는것.join(", ")}`).toEqual([]);
  });

  it("**예약하지 않는 길은 문맥을 직접 채운다**", () => {
    const 안채우는것 = 부르는길
      .filter((file) => !문맥예외.has(끝부분(file)))
      .filter((file) => !readFileSync(file, "utf8").includes("reserveAiUsage("))
      .filter((file) => !readFileSync(file, "utf8").includes("bindAiCaller("))
      .map(끝부분);

    expect(안채우는것, `문맥 없이 공급자를 부르는 길: ${안채우는것.join(", ")}`).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패를 본다**

Run: `cd apps/web && npx vitest run lib/membership/__tests__/reserve-binds-caller.test.ts app/api/__tests__/paid-route-settle-contract.test.ts`
Expected: FAIL — 첫 시험은 `caller` 가 `undefined`, 계약 시험은 `계량기 없이 공급자를 부르는 길: ad/export/route.ts, pdp/images/batch/route.ts, …, sns/layout/analyze/route.ts, …`(칸 읽기는 안쪽에서만 열어 걸린다) 와 `문맥 없이 공급자를 부르는 길: poster/projects/[id]/status/route.ts, redesign/knowledge/route.ts, sns/projects/[id]/status/route.ts`.

- [ ] **Step 3: `reserveAiUsage` 가 문맥을 채운다**

`apps/web/lib/membership/api.ts` 의 `import { CS_EMAIL } from "../cs/contact";` 바로 아래에:

```ts
import { bindAiCaller } from "../llm/meter";
import { costOperationKey } from "../ai-cost/keys";
```

로컬 우회 분기를

```ts
  if (isLocalAuthBypass) {
    return { ok: true, userId: devMemberProfile.id, requestId: "local-dev", usage: devUsageSummary };
  }
```

에서

```ts
  if (isLocalAuthBypass) {
    bindAiCaller({ userId: devMemberProfile.id, requestId: null, operation: costOperationKey(operation, creditPlan?.resource) });
    return { ok: true, userId: devMemberProfile.id, requestId: "local-dev", usage: devUsageSummary };
  }
```

로, 함수 끝의 성공 반환

```ts
  return { ok: true, userId: auth.member.userId, requestId, usage };
}
```

을 다음으로 바꾼다(거절 분기들은 그 전에 `return` 하므로 거절된 요청은 문맥을 안 채운다):

```ts
  /*
    **이 요청이 누구의 무슨 작업인가**(설계 2026-09-30 §3.4). 라우트 입구의 `withLlmMeter` 가
    연 저장소에 싣는다. 뒤에서 공급자를 부를 때마다 `ai_cost_events` 에 한 줄씩 적힌다.
    작업 칸은 resource 에서 id 를 뺀 것 — C2 가 기능을 resource 로 갈랐다(§3.1).
  */
  bindAiCaller({ userId: auth.member.userId, requestId, operation: costOperationKey(operation, creditPlan?.resource) });
  return { ok: true, userId: auth.member.userId, requestId, usage };
}
```

- [ ] **Step 4: 라우트 입구를 감싼다**

위 표의 15곳 중 14곳은 손으로 고쳐도 되고, 아래 스크립트로 한 번에 고쳐도 된다(저장소 뿌리에서, 찾을 글이 정확히 한 번 나오지 않으면 멈춘다). `sns/layout/analyze` 는 import 가 이미 있으므로 스크립트 뒤에 손으로 감싼다.

```bash
cd apps/web/app/api && node - <<'EOF'
const fs = require('fs');
const routes = [
  ['ad/export', '(request: Request)', '(request)'],
  ['characters', '(req: Request)', '(req)'],
  ['characters/views', '(req: Request)', '(req)'],
  ['pdp/images/batch', '(req: Request)', '(req)'],
  ['pdp/images', '(req: Request)', '(req)'],
  ['pdp/key-visual', '(req: Request)', '(req)'],
  ['poster/projects/[id]/edit', '(request: Request, context: Context)', '(request, context)'],
  ['poster/projects/[id]/generate', '(request: Request, context: Context)', '(request, context)'],
  ['poster/projects/[id]/status', '(request: Request, context: Context)', '(request, context)'],
  ['redesign/edit-section', '(req: Request)', '(req)'],
  ['redesign/knowledge', '(req: Request)', '(req)'],
  ['sns/projects/[id]/cards/[index]', '(request: Request, context: Context)', '(request, context)'],
  ['sns/projects/[id]/generate', '(request: Request, context: Context)', '(request, context)'],
  ['sns/projects/[id]/status', '(_request: Request, context: Context)', '(_request, context)'],
];
const bind = new Set(['poster/projects/[id]/status', 'redesign/knowledge', 'sns/projects/[id]/status']);
for (const [dir, sig, args] of routes) {
  const f = `${dir}/route.ts`;
  let s = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  const m = s.match(/^import \{[^}]*\} from "((?:\.\.\/)+)lib\/membership\/api";$/m);
  if (!m) throw new Error('membership/api import 없음: ' + f);
  s = s.replace(m[0], `${m[0]}\nimport { ${bind.has(dir) ? 'bindAiCaller, withLlmMeter' : 'withLlmMeter'} } from "${m[1]}lib/llm/meter";`);
  const head = `export async function POST${sig} {`;
  if (s.split(head).length !== 2) throw new Error('POST 머리가 한 번이 아님: ' + f);
  s = s.replace(head, `${head}\n  return withLlmMeter(() => handlePost${args});\n}\n\nasync function handlePost${sig} {`);
  fs.writeFileSync(f, s);
}
console.log('14곳 감쌈');
EOF
cd ../../../..
```

`apps/web/app/api/sns/layout/analyze/route.ts` 는 손으로:

```ts
// 옛
export async function POST(request: Request) {
// 새
export async function POST(request: Request) {
  return withLlmMeter(() => handlePost(request));
}

async function handlePost(request: Request) {
```

(안쪽 77줄의 `withLlmMeter(() => withIssueFallback(…))` 는 그대로 둔다. 겹친 계량기는 바깥 문맥을 물려받으므로 비용 줄은 `sns:layout-analysis` 로 적힌다. 이 라우트의 `readLlmMeter()` 가 안쪽 계량기 **밖**에서 읽어 옛 장부의 `llm_usd` 가 늘 0 인 것은 C1·C2 기록에 적힌 기존 문제다 — 이 계획은 고치지 않는다.)

- [ ] **Step 5: 예외 셋이 문맥을 채운다**

`apps/web/app/api/sns/projects/[id]/status/route.ts` — 404 반환 줄 바로 아래(「도는 중이 아니어도 열쇠가 남아 있으면」 주석 위)에:

```ts
      if (!project?.data.flow) return Response.json({ ok: false, message: "생성 흐름을 찾을 수 없습니다." }, { status: 404 });
      /*
        **예약 없이 이어 가는 길이다**(설계 §3.1 예외 1). 다음 장 제출·검수의 비용이 이 작업의
        몫으로 적히게, 만들기 요청이 잡아 둔 예약 열쇠와 같은 작업 키(`sns`)로 문맥을 채운다.
      */
      bindAiCaller({ userId: auth.member.userId, requestId: project.data.flow.generation?.reservationId ?? null, operation: "sns" });
```

`apps/web/app/api/poster/projects/[id]/status/route.ts` — `handlePost` 의 인증 두 줄 바로 아래에:

```ts
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  // 결과를 받아 오기만 한다 — 값은 제출 때 이미 적혔다(설계 §3.4). 그래도 문맥은 채워 둔다.
  bindAiCaller({ userId: auth.member.userId, requestId: null, operation: "poster" });
```

`apps/web/app/api/redesign/knowledge/route.ts` — `handlePost` 의 인증 두 줄 바로 아래에:

```ts
  const auth = await authenticateApiAdmin();
  if (!auth.ok) return auth.response;
  // 관리자 전용이라 예약하지 않는다(설계 §3.1 예외 2). 비용 기록만 한다.
  bindAiCaller({ userId: auth.member.userId, requestId: null, operation: "admin:knowledge" });
```

- [ ] **Step 6: 통과를 본다**

Run: `cd apps/web && npx vitest run lib/membership/__tests__/reserve-binds-caller.test.ts app/api/__tests__/paid-route-settle-contract.test.ts lib/membership/__tests__/ai-control-reasons.test.ts app/api/sns`
Expected: PASS(계약 시험 17개).
Run: `cd apps/web && npx tsc --noEmit` → 0.

- [ ] **Step 7: 뮤테이션 확인 — 시험이 정말 잡는가**

`reserveAiUsage` 의 성공 반환 앞 `bindAiCaller(…)` 줄을 잠깐 지우고 `reserve-binds-caller.test.ts` 를 돌린다 → FAIL. `ad/export/route.ts` 의 `return withLlmMeter(…)` 를 옛 모양으로 되돌리고 계약 시험을 돌린다 → FAIL(`ad/export/route.ts`). `sns/layout/analyze/route.ts` 의 바깥 감싸기를 빼고 계약 시험을 돌린다 → FAIL(`sns/layout/analyze/route.ts`). 셋 다 되돌린다.

- [ ] **Step 8: 전체와 커밋**

Run: `cd apps/web && npx vitest run` → 실패 0(라우트 시험들이 `POST` 를 직접 부르므로 감싸기가 동작을 바꾸지 않았는지 여기서 본다).

```bash
git add apps/web/lib/membership/api.ts apps/web/lib/membership/__tests__/reserve-binds-caller.test.ts apps/web/app/api
git commit -m "feat(ai-cost): 예약이 비용 문맥을 채우고, 공급자를 부르는 라우트는 입구에서 계량기를 연다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 그림은 제출하는 자리에서 한 줄

**Files:**
- Modify: `apps/web/lib/fal/queue.ts` (import, 모델 id 찾기·장 수, `submitJob`)
- Modify: `apps/web/lib/pdp/fal.ts` (import, `response.ok` 직후)
- Modify: `apps/web/lib/redesign/image-generator.ts` (import, `response.ok` 직후)
- Modify: `apps/web/lib/ad/background.ts` (import, `FalSubscriber` 옵션, `subscribe` 호출)
- Test: `apps/web/lib/ai-cost/__tests__/image-submit-cost.test.ts`

**Interfaces:**
- Consumes: `recordAiCost`(Task 2), `IMAGE_MODELS`(`@fixup/sns-core`, 모델마다 `t2i.endpoint`·`i2i.endpoint`).
- Produces: `falModelIdFor(endpoint: string): string`(`lib/fal/queue.ts`, 모르면 엔드포인트 그대로) · `FalSubscriber.subscribe` 옵션에 `onEnqueue?: (requestId: string) => void`.

**정한 것:** 큐 제출(`submitJob`)은 인자를 바꾸지 않는다 — 모델 id 는 엔드포인트로 `IMAGE_MODELS` 에서 찾고(엔드포인트는 모델마다 다르다), 장 수는 `input.num_images`(포스터 변형 수, 카드뉴스 1). 동기 `fal.run`(상세페이지·캐릭터·리디자인)은 **`response.ok` 를 본 그 자리**에서 적는다(아래에서 응답을 못 읽어도 값은 나갔다) — 요청 id 는 헤더 `x-fal-request-id` 가 있으면 싣고 없으면 비운다. 배경 제거는 `fal.subscribe` 의 `onEnqueue`(fal 이 요청을 받은 순간)에 적는다 — 결과를 기다리다 시간이 넘어 끊어도 이미 적혀 있다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/lib/ai-cost/__tests__/image-submit-cost.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **그림은 제출하는 자리에서 한 줄**(설계 2026-09-30 §3.4·§5).
 *
 * fal 큐는 제출하면 과금이 끝난다. 상태 조회는 여러 번 오거나 아예 안 올 수 있어
 * 거기서 적으면 두 번 적히거나 빠진다. 동기 호출(상세페이지·리디자인)은 받은 자리에서,
 * 배경 제거는 fal 이 요청을 받은 순간(`onEnqueue`)에 적는다.
 */
vi.mock("server-only", () => ({}));
vi.mock("../../fal/upload", () => ({ createFalUploader: () => ({ uploadReference: async () => "https://fal/ref.png" }) }));

const { replaceAiCostWriterForTest } = await import("../write");
const { bindAiCaller, withLlmMeter } = await import("../../llm/meter");
const { createFalQueueClient, falModelIdFor } = await import("../../fal/queue");
const { createPdpImageGenerator } = await import("../../pdp/fal");
const { removeBackground } = await import("../../ad/background");
const { createRedesignImageGenerator } = await import("../../redesign/image-generator");

type Row = Record<string, unknown>;
let rows: Row[] = [];
const USER = "0f8fad5b-d9cb-469f-a165-70867728950e";

beforeEach(() => {
  rows = [];
  replaceAiCostWriterForTest(async (row) => { rows.push(row as unknown as Row); });
});
afterEach(() => {
  replaceAiCostWriterForTest(null);
  vi.unstubAllGlobals();
});

describe("fal 큐(포스터·카드뉴스)", () => {
  const queueWith = (submit: () => Promise<unknown>) =>
    createFalQueueClient("key", () => ({ queue: { submit, status: vi.fn(), result: vi.fn() } } as never));

  it("제출에 한 줄 — 모델 id·요청 장수·fal 요청 id·작업 문맥을 싣는다", async () => {
    const queue = queueWith(async () => ({ request_id: "fal-9" }));
    await withLlmMeter(async () => {
      bindAiCaller({ userId: USER, requestId: null, operation: "poster" });
      await queue.submitJob("fal-ai/nano-banana-pro/edit", { prompt: "x", num_images: 3 });
    });
    expect(rows).toEqual([expect.objectContaining({
      p_user: USER, p_operation: "poster", p_provider: "fal", p_model: "nano-banana-pro",
      p_images: 3, p_usd: null, p_basis: "image_unit", p_fal_request_id: "fal-9",
    })]);
  });

  it("제출이 실패하면 적지 않는다 — 과금되지 않았다", async () => {
    const queue = queueWith(async () => { throw new Error("429"); });
    await withLlmMeter(async () => {
      await expect(queue.submitJob("fal-ai/nano-banana-pro", { prompt: "x" })).rejects.toThrow();
    });
    expect(rows).toEqual([]);
  });

  it("상태·결과 조회는 적지 않는다", async () => {
    const status = vi.fn(async () => ({ status: "COMPLETED" }));
    const result = vi.fn(async () => ({ data: { images: [] } }));
    const queue = createFalQueueClient("key", () => ({ queue: { submit: vi.fn(), status, result } } as never));
    await withLlmMeter(async () => {
      await queue.jobStatus("fal-ai/nano-banana-pro", "fal-1");
      await queue.jobResult("fal-ai/nano-banana-pro", "fal-1");
    });
    expect(rows).toEqual([]);
  });

  it("엔드포인트로 단가표의 모델 id 를 찾는다. 모르면 그대로 둔다", () => {
    expect(falModelIdFor("openai/gpt-image-2.5/flare/edit")).toBe("gpt-image-2.5-flare");
    expect(falModelIdFor("fal-ai/nano-banana-2")).toBe("nano-banana-2");
    expect(falModelIdFor("someone/new-model")).toBe("someone/new-model");
  });
});

describe("상세페이지·캐릭터(동기 fal)", () => {
  it("받은 자리에서 한 줄 — 응답 헤더의 요청 id 를 싣는다", async () => {
    vi.stubGlobal("fetch", async (url: string) => String(url).startsWith("https://fal.run")
      ? new Response(JSON.stringify({ images: [{ url: "https://cdn/x.png", content_type: "image/png" }] }), { headers: { "x-fal-request-id": "sync-1" } })
      : new Response(new Uint8Array([1, 2, 3])));
    await withLlmMeter(async () => {
      await createPdpImageGenerator({ FAL_KEY: "k" })("nano-banana", { prompt: "p", systemPrompt: "s", aspectRatio: "3:4", references: [] });
    });
    expect(rows).toEqual([expect.objectContaining({ p_provider: "fal", p_model: "nano-banana", p_images: 1, p_fal_request_id: "sync-1" })]);
  });

  it("fal 이 거절하면 적지 않는다", async () => {
    vi.stubGlobal("fetch", async () => new Response("busy", { status: 429 }));
    await withLlmMeter(async () => {
      await expect(createPdpImageGenerator({ FAL_KEY: "k" })("nano-banana", { prompt: "p", systemPrompt: "s", aspectRatio: "3:4", references: [] })).rejects.toThrow();
    });
    expect(rows).toEqual([]);
  });
});

describe("리디자인(동기 fal)", () => {
  it("받은 자리에서 한 줄 — 실제로 그린 모델 id 로", async () => {
    vi.stubGlobal("fetch", async (url: string) => String(url).startsWith("https://fal.run")
      ? new Response(JSON.stringify({ images: [{ url: "https://cdn/r.png" }] }), { headers: { "x-fal-request-id": "rd-1" } })
      : new Response(new Uint8Array([1]), { headers: { "content-type": "image/png" } }));
    await withLlmMeter(async () => {
      await createRedesignImageGenerator({ FAL_KEY: "k" })({ prompt: "p", references: [], size: "1152x2048" });
    });
    expect(rows).toEqual([expect.objectContaining({ p_model: "gpt-image-2.5-flare", p_images: 1, p_fal_request_id: "rd-1" })]);
  });
});

describe("광고 배경 제거", () => {
  it("fal 이 요청을 받은 순간 한 줄 — 결과를 기다리다 시간이 넘어도 이미 적혀 있다", async () => {
    const fal = {
      subscribe: async (_endpoint: string, options: { onEnqueue?: (id: string) => void }) => {
        options.onEnqueue?.("bg-1");
        return { data: { image: { url: "https://fal/cut.png" } } };
      },
    };
    await withLlmMeter(async () => { await removeBackground("https://fal/m.png", fal as never); });
    expect(rows).toEqual([expect.objectContaining({ p_model: "fal-ai/birefnet/v2", p_images: 1, p_fal_request_id: "bg-1" })]);
  });
});
```

- [ ] **Step 2: 실패를 본다**

Run: `cd apps/web && npx vitest run lib/ai-cost/__tests__/image-submit-cost.test.ts`
Expected: FAIL — `falModelIdFor is not a function`(import 가 undefined), 나머지는 `rows` 가 `[]`.

- [ ] **Step 3: 큐 제출(`lib/fal/queue.ts`)**

첫 줄 import 아래에:

```ts
import { createFalClient, type FalClient } from "@fal-ai/client";
import { IMAGE_MODELS } from "@fixup/sns-core";
import { recordAiCost } from "../llm/meter";
```

`type FalClientFactory = …;` 줄 아래에:

```ts

/**
 * 엔드포인트 → 단가표(`model_prices`)의 모델 id. 모르는 엔드포인트면 그대로 넘긴다 —
 * DB 가 「단가 없음」으로 보고 가장 비싼 값으로 잡는다(`estimate`).
 */
export function falModelIdFor(endpoint: string): string {
  return IMAGE_MODELS.find((model) => model.t2i.endpoint === endpoint || model.i2i.endpoint === endpoint)?.id ?? endpoint;
}

/** 이번 제출이 요청한 장수. 포스터는 변형 수(`num_images`), 카드뉴스는 1. */
function requestedImages(input: Record<string, unknown>): number {
  const count = Number(input.num_images);
  return Number.isInteger(count) && count > 0 ? Math.min(count, 100) : 1;
}
```

`submitJob` 안:

```ts
      const submitted = await client.queue.submit(endpoint as never, { input } as never);
      /*
        **제출하는 자리에서 적는다**(설계 §3.4). fal 큐는 제출하면 과금이 끝난다
        (`lib/poster/flow.ts` 「이 줄부터는 돈이 이미 나갔다」). 상태 조회는 여러 번 오거나
        아예 안 올 수 있어 거기서 적지 않는다. 요청 id 가 표에서 unique 라 두 번 안 적힌다.
      */
      recordAiCost({
        provider: "fal",
        model: falModelIdFor(endpoint),
        images: requestedImages(input),
        basis: "image_unit",
        falRequestId: submitted.request_id,
      });
      return { requestId: submitted.request_id };
```

- [ ] **Step 4: 동기 fal 둘**

`apps/web/lib/pdp/fal.ts` — `} from "@fixup/pdp-core";` 아래에 `import { recordAiCost } from "../llm/meter";`. 그리고

```ts
    const text = await response.text();
    if (!response.ok) {
      throw new PdpServiceError(
```

를

```ts
    const text = await response.text();
    if (response.ok) {
      /*
        **받은 그 자리에서 적는다**(설계 §3.4). 아래에서 응답을 못 읽어도 값은 이미 나갔다.
        동기 호출이라 한 요청에 한 번뿐이다 — fal 요청 id 는 헤더에 있으면 싣는다.
      */
      recordAiCost({
        provider: "fal",
        model,
        images: 1,
        basis: "image_unit",
        falRequestId: response.headers.get("x-fal-request-id"),
      });
    }
    if (!response.ok) {
      throw new PdpServiceError(
```

로. `apps/web/lib/redesign/image-generator.ts` — `import { createFalUploader } from "../fal/upload";` 아래에 `import { recordAiCost } from "../llm/meter";`. 그리고

```ts
    const text = await response.text();
    if (!response.ok) {
      throw new RedesignFalError(
```

를

```ts
    const text = await response.text();
    if (response.ok) {
      // 받은 그 자리에서 적는다(설계 §3.4). 아래에서 내려받기가 실패해도 값은 이미 나갔다.
      recordAiCost({
        provider: "fal",
        model: model.id,
        images: 1,
        basis: "image_unit",
        falRequestId: response.headers.get("x-fal-request-id"),
      });
    }
    if (!response.ok) {
      throw new RedesignFalError(
```

로.

- [ ] **Step 5: 배경 제거(`lib/ad/background.ts`)**

첫 줄 아래에 `import { recordAiCost } from "../llm/meter";`. `FalSubscriber` 의 옵션 타입

```ts
    options: { input: Record<string, unknown>; abortSignal?: AbortSignal },
```

을

```ts
    options: {
      input: Record<string, unknown>;
      abortSignal?: AbortSignal;
      /** fal 이 요청을 받은 순간. **여기서 비용을 적는다** — 제출하면 과금이 끝난다(설계 §3.4). */
      onEnqueue?: (requestId: string) => void;
    },
```

로, `removeBackground` 의 호출

```ts
        input: { image_url: imageUrl },
        abortSignal: controller.signal,
      }),
```

을

```ts
        input: { image_url: imageUrl },
        abortSignal: controller.signal,
        onEnqueue: (requestId) => recordAiCost({
          provider: "fal",
          model: BACKGROUND_REMOVAL_ENDPOINT,
          images: 1,
          basis: "image_unit",
          falRequestId: requestId,
        }),
      }),
```

로 바꾼다(`@fal-ai/client` 1.10.1 의 `subscribe` 옵션에 `onEnqueue?: (requestId: string) => void` 가 있다 — `src/queue.d.ts:40`). 단가표 키 `fal-ai/birefnet/v2` 는 엔드포인트와 같다(202609140001).

- [ ] **Step 6: 통과를 본다**

Run: `cd apps/web && npx vitest run lib/ai-cost lib/fal lib/pdp/__tests__/fal.test.ts lib/__tests__/ad-background.test.ts app/api/ad`
Expected: PASS.

- [ ] **Step 7: 전체와 커밋**

Run: `cd apps/web && npx tsc --noEmit && npx vitest run` → 0 · 실패 0.

```bash
git add apps/web/lib/fal/queue.ts apps/web/lib/pdp/fal.ts apps/web/lib/redesign/image-generator.ts apps/web/lib/ad/background.ts apps/web/lib/ai-cost/__tests__/image-submit-cost.test.ts
git commit -m "feat(ai-cost): 그림은 fal 에 제출하는 자리에서 한 줄씩 적는다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `redesign-core` 의 비용 콜백을 필수로 — 리디자인·임베딩·지식 올리기

**Files:**
- Modify: `packages/redesign-core/src/usage.ts` (그림 알림 타입·함수)
- Modify: `packages/redesign-core/src/generate.ts:17` (import), `:188` (`onUsage` 필수·`onImageUsage` 추가), `:407-412` (지식 찾기에 `onUsage`), `:458` (옛 길 그림 알림), `:539-548` (`buildKnowledgeContext` 인자), `:560` (`retrieveKnowledge` 옵션)
- Modify: `packages/redesign-core/src/edit-section.ts:35` (import), `:54-55` (`onImageUsage`), `:105` (옛 길 그림 알림)
- Modify: `packages/redesign-core/src/transcribe.ts:27` (`onUsage` 필수)
- Modify: `packages/redesign-core/src/rag.ts` (import, `indexKnowledgeDocument`·`RetrieveKnowledgeOptions`·`retrieveKnowledge`·`embedText`)
- Modify: `packages/redesign-core/src/knowledge.ts` (`IndexKnowledgeInput.onUsage`, 넘기기)
- Modify: `packages/redesign-core/src/index.ts:74` (내보내기)
- Modify: `packages/redesign-core/src/generate.failure.test.ts:39-46` (입력 도우미)
- Create: `packages/redesign-core/src/usage-callbacks.test.ts`
- Create: `apps/web/lib/ai-cost/package-usage.ts`
- Modify: `apps/web/app/api/redesign/generate/route.ts:11,198` · `redesign/transcribe-strips/route.ts:5,91` · `redesign/edit-section/route.ts` · `redesign/knowledge/route.ts` · `cs/ask/route.ts:5,100`
- Modify: `scripts/index-guide.mjs:154-162`
- Modify: `packages/shared/src/llm-price.ts:56` (임베딩 단가 한 줄)
- Create: `apps/web/lib/ai-cost/__tests__/required-callbacks.test.ts`

**Interfaces:**
- Consumes: `recordLlmUsage`·`recordAiCost`(Task 2).
- Produces:
  - `@fixup/redesign-core`: `type ImageUsage = { provider: "openai" | "google"; images: number }` · `type ImageUsageReporter = (usage: ImageUsage) => void` · `reportImageUsage(onImageUsage, provider)` · `GenerateSectionsInput.onUsage`(필수)·`.onImageUsage`(필수) · `EditSectionInput.onImageUsage`(필수) · `TranscribeStripsInput.onUsage`(필수) · `retrieveKnowledge(query: string, limit: number, options: { kind?; minSimilarity?; onUsage: UsageReporter })` · `indexKnowledgeDocument({ name, text, kind?, onUsage })` · `IndexKnowledgeInput.onUsage`(필수)
  - `apps/web/lib/ai-cost/package-usage.ts`: `recordPackageLlmUsage(usage: LlmUsage): void` · `recordRedesignDirectImage(usage: ImageUsage): void`(단가표 키 `redesign-openai`/`redesign-google`)

**정한 것:** 리디자인의 주된 그림 길은 앱이 넘긴 `generateImage`(fal)라 Task 4 에서 이미 적힌다. 꾸러미가 업체를 **직접** 부르는 것은 fal 키가 없을 때의 옛 길뿐이다 — 그 길에만 `onImageUsage` 를 부른다. 콜백은 **타입으로 필수**, 실행 중에는 `reportUsage`·`reportImageUsage` 가 함수인지 한 번 더 본다(시험들이 `as never` 로 넘기는 입력이 있다). 임베딩 모델 `text-embedding-3-small` 이 단가표에 없으면 「아는 것 중 가장 비싼 값」($10/100만)으로 잡혀 500배로 보이므로 단가표에 한 줄 더한다(OpenAI 공표 $0.02/100만 입력 — Task 11 Step 1 에서 공식 가격표로 대조).

- [ ] **Step 1: 실패하는 시험 둘을 쓴다**

`packages/redesign-core/src/usage-callbacks.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * **이 꾸러미가 업체를 부르는 자리는 모두 부르는 쪽에 알린다**(설계 2026-09-30 §3.4).
 *
 * 꾸러미는 DB 를 모른다. 그래서 값은 콜백으로 넘기고, 어디에 적을지는 앱이 정한다.
 * 콜백은 **필수 인자**다 — 선택이면 안 넘긴 자리가 조용히 0원이 된다. 여기서는 콜백이
 * 실제로 불리는지를 본다(필수인지는 앱의 타입 시험이 본다).
 */

vi.mock("@neondatabase/serverless", () => ({
  // 태그 템플릿으로 불린다. 문서 한 줄(id)을 돌려준다 — 넣기가 그 id 를 읽는다.
  neon: () => async () => [{ id: "doc-1" }],
}));
vi.mock("openai", () => ({
  default: class {
    embeddings = {
      create: async () => ({ data: [{ embedding: [0.1, 0.2] }], usage: { prompt_tokens: 7, total_tokens: 7 } }),
    };
  },
}));

const { editSection } = await import("./edit-section");
const { retrieveKnowledge, indexKnowledgeDocument } = await import("./rag");

const 그림 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("그림 — 옛 길(업체 직접 호출)", () => {
  it("통로 없이 고치면 그림 한 장을 알린다", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ data: [{ b64_json: "QUFB" }] }), { status: 200 }));
    const 받은것: unknown[] = [];
    await editSection({
      imageUrl: 그림, request: "밝게", openaiKey: "sk-test",
      onImageUsage: (usage) => 받은것.push(usage),
    });
    expect(받은것).toEqual([{ provider: "openai", images: 1 }]);
  });

  it("통로(fal)로 고치면 알리지 않는다 — 앱이 제 자리에서 적는다", async () => {
    const 받은것: unknown[] = [];
    await editSection({
      imageUrl: 그림, request: "밝게", openaiKey: "sk-test",
      generateImage: async () => ({ buffer: Buffer.from("A"), mimeType: "image/png" }),
      onImageUsage: (usage) => 받은것.push(usage),
    });
    expect(받은것).toEqual([]);
  });
});

describe("임베딩", () => {
  it("질문을 찾을 때 임베딩 토큰을 알린다", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://test");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const 받은것: unknown[] = [];
    await retrieveKnowledge("크레딧이 뭔가요", 3, { kind: "guide", onUsage: (usage) => 받은것.push(usage) });
    expect(받은것).toEqual([{ model: "text-embedding-3-small", inputTokens: 7, outputTokens: 0 }]);
  });

  it("지식을 올릴 때 조각마다 알린다", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://test");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const 받은것: unknown[] = [];
    const text = `# 하나\n${"가".repeat(200)}\n# 둘\n${"나".repeat(200)}`;
    const result = await indexKnowledgeDocument({ name: "안내", text, kind: "guide", onUsage: (usage) => 받은것.push(usage) });
    // 조각은 120자 이상만 남는다(`chunkText`). 두 절이 두 조각 → 임베딩 두 번.
    expect(result.chunks).toBe(2);
    expect(받은것).toHaveLength(2);
  });
});
```

`apps/web/lib/ai-cost/__tests__/required-callbacks.test.ts`(Task 6 이 ingest 줄을 더한다):

```ts
import { describe, expect, it } from "vitest";
import type * as RedesignCore from "@fixup/redesign-core";

/**
 * **꾸러미의 비용 콜백은 필수 인자다**(설계 2026-09-30 §3.4·§5 「패키지 콜백이 필수 인자다(타입)」).
 *
 * 선택이면 안 넘긴 자리가 조용히 0원이 된다(`lib/llm/meter.ts` 첫 주석). 이 파일은 **타입 검사로**
 * 그것을 막는다 — 아래 `@ts-expect-error` 가 붙은 줄은 콜백을 빼먹은 호출이다. 누가 콜백을 다시
 * 선택으로 바꾸면 그 줄이 오류가 아니게 되고, `npx tsc --noEmit` 이 「쓸모없는 @ts-expect-error」로
 * 빨개진다.
 *
 * 함수는 **정의만 하고 부르지 않는다** — 업체를 부르면 안 된다. 꾸러미도 타입으로만 들여온다
 * (`ingest-core` 는 불러오기만 해도 jsdom·playwright 를 끌고 온다).
 */

declare const redesign: typeof RedesignCore;

const 빠뜨린호출들 = () => [
  // @ts-expect-error onUsage·onImageUsage 가 없다
  redesign.generateSections({ files: [] }),
  // @ts-expect-error onImageUsage 가 없다
  redesign.editSection({ imageUrl: "", request: "" }),
  // @ts-expect-error onUsage 가 없다
  redesign.transcribeStrips({ strips: [], batchIndex: 0, batchCount: 1 }),
  // @ts-expect-error 옵션(onUsage)이 없다
  redesign.retrieveKnowledge("질문", 3),
  // @ts-expect-error onUsage 가 없다
  redesign.indexKnowledgeDocument({ name: "n", text: "t" }),
  // @ts-expect-error onUsage 가 없다
  redesign.indexKnowledge({ name: "n", text: "t" }),
];

describe("꾸러미 비용 콜백", () => {
  it("빠뜨린 호출은 타입 검사가 막는다 — 이 시험의 몸은 tsc 다", () => {
    expect(typeof 빠뜨린호출들).toBe("function");
  });
});
```

- [ ] **Step 2: 실패를 본다**

Run: `cd packages/redesign-core && npx vitest run src/usage-callbacks.test.ts`
Expected: FAIL — 첫 시험 `받은것` 이 `[]`, 임베딩 시험도 `[]`.
Run: `cd apps/web && npx tsc --noEmit`
Expected: `required-callbacks.test.ts … error TS2578: Unused '@ts-expect-error' directive.` 여섯 줄(지금은 모두 선택 인자라 오류가 안 난다).

- [ ] **Step 3: `usage.ts` — 그림 알림**

`export type UsageReporter = (usage: LlmUsage) => void;` 바로 아래에:

```ts

/**
 * **그림을 직접 만든 것을 알린다**(설계 2026-09-30 §3.4).
 *
 * 주된 길은 앱이 넘긴 `generateImage`(fal)라 앱이 제 자리에서 적는다. 이 꾸러미가 업체를
 * 직접 부르는 것은 그 통로가 없을 때(fal 키 없음)의 옛 길뿐이다 — 그 길도 값이 나간다.
 */
export type ImageUsage = { provider: "openai" | "google"; images: number };
export type ImageUsageReporter = (usage: ImageUsage) => void;

export function reportImageUsage(onImageUsage: ImageUsageReporter | undefined, provider: ImageUsage["provider"]): void {
  if (typeof onImageUsage === "function") onImageUsage({ provider, images: 1 });
}
```

- [ ] **Step 4: `generate.ts`**

1. `import { reportUsage } from "./usage.js";` → `import { reportImageUsage, reportUsage, type ImageUsageReporter } from "./usage.js";`
2. `GenerateSectionsInput` 의 `onUsage?: (usage: { model: string; inputTokens: number; outputTokens: number }) => void;` 를 다음으로:

```ts
  onUsage: (usage: { model: string; inputTokens: number; outputTokens: number }) => void;
  /**
   * **옛 길(업체 직접 호출)로 그린 그림을 알린다.** `generateImage` 를 넘기면 안 불린다 —
   * 그 통로는 앱이 제 자리에서 적는다. 필수다: 선택이면 안 넘긴 자리가 조용히 0원이 된다
   * (설계 2026-09-30 §3.4).
   */
  onImageUsage: ImageUsageReporter;
```

3. `generateSections` 안 지식 찾기 호출의 `fallbackText: knowledgeText` 를 `fallbackText: knowledgeText,` + 다음 줄 `onUsage: input.onUsage` 로.
4. 섹션 그림 만들기의 마지막 갈래 줄 바로 아래에 한 줄:

```ts
          : await generateOpenAIImage({ apiKey, prompt: section.promptText, references: drawReferences, size: sizeForRatio(ratio) });
      if (!input.generateImage) reportImageUsage(input.onImageUsage, provider);
```

5. `buildKnowledgeContext` 의 인자:

```ts
async function buildKnowledgeContext({
  requestText,
  rolloutRequest,
  channel,
  fallbackText,
  onUsage
}: {
  requestText: string;
  rolloutRequest: string;
  channel: string;
  fallbackText: string;
  onUsage: GenerateSectionsInput["onUsage"];
}) {
```

6. 그 안의 `const chunks = await retrieveKnowledge(query, 8);` → `const chunks = await retrieveKnowledge(query, 8, { onUsage });`

- [ ] **Step 5: `edit-section.ts`·`transcribe.ts`**

`edit-section.ts`: `import type { RedesignImageGenerator } from "./generate";` 아래에 `import { reportImageUsage, type ImageUsageReporter } from "./usage.js";`. `EditSectionInput` 의 `generateImage?: RedesignImageGenerator;` 아래(닫는 `};` 앞)에:

```ts
  /** 옛 길(업체 직접 호출)로 고친 그림을 알린다. 필수다(설계 2026-09-30 §3.4). */
  onImageUsage: ImageUsageReporter;
```

`editSection` 의 `: await editWithOpenAI({ apiKey, prompt, image });` 바로 아래에:

```ts
  if (!input.generateImage) reportImageUsage(input.onImageUsage, provider);
```

`transcribe.ts:27`: `  onUsage?: UsageReporter;` → `  onUsage: UsageReporter;` (안쪽 `callOpenAiReading`·`callGoogleReading` 의 `onUsage?` 는 그대로 — 받은 값을 넘길 뿐이다).

- [ ] **Step 6: `rag.ts`·`knowledge.ts`·`index.ts`**

`rag.ts`: `import { createHash } from "node:crypto";` 아래에 `import { reportUsage, type UsageReporter } from "./usage.js";`.

`indexKnowledgeDocument` 인자:

```ts
export async function indexKnowledgeDocument({
  name,
  text,
  kind,
  onUsage,
}: {
  name: string;
  text: string;
  kind?: KnowledgeKind;
  /** 임베딩 토큰을 알린다. 필수다(설계 2026-09-30 §3.4) — 조각마다 한 번 부른다. */
  onUsage: UsageReporter;
}) {
```

그 안의 `const embedding = await embedText(openai, chunk.content);` → `const embedding = await embedText(openai, chunk.content, onUsage);`

`RetrieveKnowledgeOptions` 끝(`minSimilarity?: number;` 아래)에:

```ts
  /** 질문을 임베딩한 토큰을 알린다. 필수다(설계 2026-09-30 §3.4). */
  onUsage: UsageReporter;
```

`retrieveKnowledge` 의 인자 `limit = 8,` · `options: RetrieveKnowledgeOptions = {},` → `limit: number,` · `options: RetrieveKnowledgeOptions,` 그리고 `const embedding = await embedText(openai, query.slice(0, 8000));` → `const embedding = await embedText(openai, query.slice(0, 8000), options.onUsage);`

`embedText` 를 통째로:

```ts
async function embedText(openai: OpenAI, input: string, onUsage: UsageReporter) {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input,
    dimensions: EMBEDDING_DIMENSIONS
  });
  // 임베딩 응답은 `usage.prompt_tokens` 만 준다. 출력 토큰은 0 이다.
  reportUsage(onUsage, EMBEDDING_MODEL, response);
  return response.data[0].embedding;
}
```

`knowledge.ts`: `import { RedesignError } from "./errors.js";` 아래에 `import type { UsageReporter } from "./usage.js";`. `IndexKnowledgeInput` 의 `kind?: string;` 아래에:

```ts
  /** 임베딩 토큰을 알린다. 필수다(설계 2026-09-30 §3.4) — 관리자 지식 올리기도 값이 나간다. */
  onUsage: UsageReporter;
```

`indexKnowledgeDocument({ … kind: normalizeKnowledgeKind(input.kind), })` 안에 `onUsage: input.onUsage,` 를 더한다.

`index.ts:74`: `export { reportUsage, type LlmUsage, type UsageReporter } from "./usage.js";` → `export { reportImageUsage, reportUsage, type ImageUsage, type ImageUsageReporter, type LlmUsage, type UsageReporter } from "./usage.js";`

`generate.failure.test.ts` 의 `입력` 도우미(39-46줄)에 두 줄:

```ts
function 입력(count: number) {
  return {
    files: [{ name: "원본.png", type: "image/png", buffer: PNG }],
    model: "openai",
    openaiKey: "시험용-키",
    count,
    onUsage: () => undefined,
    onImageUsage: () => undefined,
  };
}
```

Run: `cd packages/redesign-core && npx tsc --noEmit -p . && npx vitest run` → 오류 0 · 전부 PASS.

- [ ] **Step 7: 앱이 콜백을 넘긴다**

`apps/web/lib/ai-cost/package-usage.ts`(새로, Task 6 이 뒤에 둘을 더한다):

```ts
import type { ImageUsage, LlmUsage } from "@fixup/redesign-core";
import { recordAiCost, recordLlmUsage } from "../llm/meter";

/**
 * 꾸러미가 알린 값을 **앱의 한 줄**로 옮긴다(설계 2026-09-30 §3.4 「패키지는 콜백으로」).
 *
 * 꾸러미는 DB 를 모른다. 콜백이 필수 인자라 넘기는 자리는 빠질 수 없고, 넘기는 값은
 * 여기 것 중 하나다 — 자리마다 화살표 함수를 새로 쓰면 한 곳만 금액을 틀리게 옮긴다.
 */

/** 글 모델·임베딩 토큰. 계량기 합산과 비용 한 줄을 함께 남긴다. */
export function recordPackageLlmUsage(usage: LlmUsage): void {
  recordLlmUsage(usage.model, usage.inputTokens, usage.outputTokens);
}

/**
 * 리디자인이 **fal 없이 업체를 직접 불러** 그린 그림. 단가표의 이름은 `redesign-openai`·
 * `redesign-google` 이다(`model_prices`, `credit-cost.ts` 의 `FLAT_USD`).
 */
export function recordRedesignDirectImage(usage: ImageUsage): void {
  recordAiCost({
    provider: usage.provider,
    model: usage.provider === "google" ? "redesign-google" : "redesign-openai",
    images: usage.images,
    basis: "image_unit",
  });
}
```

라우트:

- `app/api/redesign/generate/route.ts`: import `readLlmMeter, recordLlmUsage, withLlmMeter` → `readLlmMeter, withLlmMeter`, 그 아래에 `import { recordPackageLlmUsage, recordRedesignDirectImage } from "../../../../lib/ai-cost/package-usage";`. `generateSections({…})` 의 `onUsage: (usage) => recordLlmUsage(usage.model, usage.inputTokens, usage.outputTokens),` → `onUsage: recordPackageLlmUsage,` + 다음 줄 `onImageUsage: recordRedesignDirectImage,`
- `app/api/redesign/transcribe-strips/route.ts`: import 를 같은 식으로 바꾸고(`recordPackageLlmUsage` 만), `onUsage: (usage) => recordLlmUsage(…),` → `onUsage: recordPackageLlmUsage,`
- `app/api/redesign/edit-section/route.ts`: `import { withLlmMeter } from "../../../../lib/llm/meter";` 아래에 `import { recordRedesignDirectImage } from "../../../../lib/ai-cost/package-usage";`. `editSection({ …body, openaiKey, googleKey, generateImage, })` 의 `generateImage,` 아래에 `onImageUsage: recordRedesignDirectImage,`
- `app/api/redesign/knowledge/route.ts`: meter import 아래에 `import { recordPackageLlmUsage } from "../../../../lib/ai-cost/package-usage";`. `indexKnowledge({ … adminKey: process.env.KNOWLEDGE_ADMIN_KEY || "" })` → `… adminKey: process.env.KNOWLEDGE_ADMIN_KEY || "", onUsage: recordPackageLlmUsage })`
- `app/api/cs/ask/route.ts`: meter import 아래에 `import { recordPackageLlmUsage } from "../../../../lib/ai-cost/package-usage";`. `await retrieveKnowledge(plan.query, 조각수, { kind: "guide" })` → `await retrieveKnowledge(plan.query, 조각수, { kind: "guide", onUsage: recordPackageLlmUsage })`

`scripts/index-guide.mjs`(운영 앱 밖에서 도는 운영자 도구 — 표에 안 적히므로 센 값을 화면에 찍는다):

```js
  let 조각 = 0;
  // 운영 앱 밖에서 돌므로 ai_cost_events 에는 안 적힌다(설계 2026-09-30 §3.4). 대신 여기서 센다.
  let 임베딩토큰 = 0;
  const onUsage = (usage) => { 임베딩토큰 += usage.inputTokens; };
  for (const 문서 of 문서들) {
    const result = await indexKnowledgeDocument({ name: 문서.name, text: 문서.text, kind: "guide", onUsage });
```

그리고 마지막 `console.log(\`\n설명서 ${문서들.length}쪽 · 조각 ${조각}개를 넣었습니다.\`);` → `console.log(\`\n설명서 ${문서들.length}쪽 · 조각 ${조각}개를 넣었습니다. 임베딩 토큰 ${임베딩토큰}개.\`);`

`packages/shared/src/llm-price.ts` — `LLM_PRICES` 의 `"gpt-5.6-luna": …,` 아래(닫는 `};` 앞)에:

```ts
  // 임베딩(지식 찾기·올리기, `redesign-core/rag.ts`). 출력 토큰이 없다(설계 2026-09-30 §3.4).
  // 표에 없으면 「아는 것 중 가장 비싼 값」($10/100만)으로 잡혀 500배 비싸게 보인다.
  "text-embedding-3-small": { inputPerMillion: 0.02, outputPerMillion: 0 },
```

- [ ] **Step 8: 통과를 본다**

Run: `cd packages/redesign-core && npx vitest run` → PASS(`usage-callbacks.test.ts` 4개 포함).
Run: `cd packages/shared && npx vitest run` → PASS(`priceOf` 의 「가장 비싼 값」은 출력 단가 0 인 새 줄로 안 바뀐다).
Run: `cd apps/web && npx tsc --noEmit` → **오류 0**(여섯 `@ts-expect-error` 가 이제 실제 오류를 덮는다).
Run: `pnpm -r typecheck` → 오류 0. `cd apps/web && npx vitest run lib/cs app/api/cs app/api/redesign lib/ai-cost` → PASS.

- [ ] **Step 9: 뮤테이션 확인**

`packages/redesign-core/src/transcribe.ts:27` 을 잠깐 `onUsage?: UsageReporter;` 로 되돌리고 `cd apps/web && npx tsc --noEmit` → `required-callbacks.test.ts(…): error TS2578: Unused '@ts-expect-error' directive.` 가 나와야 한다. 되돌린다.

- [ ] **Step 10: 전체와 커밋**

Run: `cd apps/web && npx vitest run` → 실패 0.

```bash
git add packages/redesign-core packages/shared/src/llm-price.ts apps/web/lib/ai-cost apps/web/app/api/redesign apps/web/app/api/cs/ask/route.ts scripts/index-guide.mjs
git commit -m "feat(ai-cost): 리디자인·임베딩·지식 올리기의 비용 콜백을 필수로 받는다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `ingest-core` 의 비용 콜백 — 카드뉴스 주제 조사(웹검색)와 Apify

**Files:**
- Modify: `packages/ingest-core/src/adapters/topic.ts:58-61` (`recordUsage` 필수), `:219-222` (`ingestTopic` 의 `researcher` 필수)
- Modify: `packages/ingest-core/src/adapters/youtube-apify.ts` (`ApifyRunRecorder`, `deps.onRun` 필수, 부른 뒤 알림)
- Modify: `packages/ingest-core/src/adapters/youtube.ts:4,64,70` (`onApifyRun`, 기록 없는 호출 경고)
- Modify: `packages/ingest-core/src/__tests__/youtube-apify.test.ts` (기존 다섯 호출에 `onRun`, 새 describe)
- Create: `packages/shared/src/provider-price.ts` · Modify: `packages/shared/src/index.ts:49`
- Modify: `apps/web/lib/ai-cost/package-usage.ts` (import 넓히기, 둘 더하기)
- Modify: `apps/web/lib/sns/source-adapters.ts`
- Modify: `apps/web/lib/ai-cost/__tests__/required-callbacks.test.ts` (ingest 두 줄)
- Create: `apps/web/lib/sns/__tests__/source-adapters-cost.test.ts`

**Interfaces:**
- Consumes: `recordAiCost`·`tokensFrom`(Task 2 · 기존 `meter.ts`), `TopicUsageRecorder`(기존 `topic.ts:13`).
- Produces: `type ApifyRunRecorder = (run: { actor: string; failed: boolean }) => void` · `fetchApifyTranscript(url, deps: { onRun: ApifyRunRecorder; fetchImpl?; environment? })` · `ingestYoutube({ …, onApifyRun?: ApifyRunRecorder })` · `createOpenAITopicResearcher(environment, recordUsage)`(둘째 인자 필수) · `ingestTopic({ id, topic, researcher })`(`researcher` 필수) · `WEB_SEARCH_CALL_USD = 0.01` · `APIFY_YOUTUBE_RUN_ESTIMATE_USD = 0.01` · `recordTopicResearch: TopicUsageRecorder` · `recordApifyRun: ApifyRunRecorder`.

**지금 사실(확인함):** 회원 라우트 `POST /api/sns/projects/[id]/plan` 이 `createSourceAdapters()` 로 ①주제 조사(`OPENAI_API_KEY` 가 있으면 웹검색 도구로 OpenAI Responses 호출)와 ②유튜브 주소 수집(`ingestYoutube` → 직접 자막 → `APIFY_TOKEN` 이 있으면 Apify → `YOUTUBE_STT_SERVICE_URL` 이 있으면 외부 STT)을 부른다. 운영 서버에 두 값이 설정돼 있는지는 저장소로 알 수 없다 — Task 11 Step 2 에서 읽기만 해서 확인한다. **STT 는 기록하지 않는다**(설계 §3.4: 운영에 설정돼 있지 않으면 제외, §4: STT 단가를 두지 않음). 설정돼 있으면 Task 11 에서 멈추고 사용자에게 묻는다.

**정한 것:** 설계는 「콜백은 필수」이면서 「워커 코드는 바꾸지 않는다」이다. 워커(`apps/worker/src/index.ts:45`)와 `youtube-channel.ts:98` 은 `ingestYoutube({ id, url })` 로 부른다. 그래서 **Apify 를 실제로 부르는 함수(`fetchApifyTranscript`)의 `onRun` 을 필수**로 하고, 입구(`ingestYoutube`)의 `onApifyRun` 은 선택으로 두되 **안 넘기면 부를 때마다 경고**를 남긴다(조용히 0원이 되지 않는다). 앱의 연결(`source-adapters.ts`)은 시험으로 못 박는다. 동기 실행(`run-sync-get-dataset-items`)은 자막 줄만 돌려주고 사용 금액을 안 주므로 Apify 는 늘 「실행 1회 추정」(`estimate`)이다. 조사 비용은 새 표에만 적고 계량기 합산(옛 장부의 `llm_usd`)에는 넣지 않는다 — 옛 장부 숫자가 이번 변경으로 바뀌지 않게.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/lib/sns/__tests__/source-adapters-cost.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APIFY_YOUTUBE_RUN_ESTIMATE_USD, WEB_SEARCH_CALL_USD, llmUsdFromTokens } from "@fixup/shared";

/**
 * **카드뉴스 기획의 웹검색 조사·Apify 도 한 줄씩 적는다**(설계 2026-09-30 §3.4).
 *
 * 둘 다 `ingest-core` 안에서 업체를 부른다. 꾸러미는 DB 를 모르므로 앱이 콜백을 넘긴다 —
 * 그 연결이 여기(`source-adapters.ts`) 하나다. 빠지면 조사·자막 값이 장부 밖으로 샌다.
 */

vi.mock("@fixup/ingest-core/src/adapters/topic", () => ({
  TopicResearchNotConfiguredError: class extends Error {},
  createOpenAITopicResearcher: (_env: unknown, record: (input: unknown) => void) => async () => {
    record({ provider: "openai", feature: "research", model: "gpt-5.6-sol", usage: { input_tokens: 2000, output_tokens: 500 }, toolCalls: 3, topic: "t" });
    return { text: "조사", citations: [] };
  },
}));
vi.mock("@fixup/ingest-core/src/adapters/youtube", () => ({
  ingestYoutube: async (input: { onApifyRun?: (run: { actor: string; failed: boolean }) => void }) => {
    input.onApifyRun?.({ actor: "automation-lab~youtube-transcript", failed: false });
    return { id: "sns", segments: [] };
  },
}));

const { replaceAiCostWriterForTest } = await import("../../ai-cost/write");
const { withLlmMeter } = await import("../../llm/meter");
const { createSourceAdapters } = await import("../source-adapters");

let rows: Array<Record<string, unknown>> = [];
beforeEach(() => {
  rows = [];
  replaceAiCostWriterForTest(async (row) => { rows.push(row as unknown as Record<string, unknown>); });
});
afterEach(() => replaceAiCostWriterForTest(null));

describe("카드뉴스 자료 모으기", () => {
  it("주제 조사 한 번 — 토큰 값 + 웹검색 횟수 × 단가", async () => {
    await withLlmMeter(async () => {
      await createSourceAdapters({ OPENAI_API_KEY: "k" }).research("주제");
    });
    expect(rows).toEqual([expect.objectContaining({
      p_provider: "openai", p_model: "gpt-5.6-sol", p_input_tokens: 2000, p_output_tokens: 500, p_basis: "tokens",
      p_usd: Number((llmUsdFromTokens("gpt-5.6-sol", 2000, 500) + 3 * WEB_SEARCH_CALL_USD).toFixed(6)),
    })]);
  });

  it("유튜브가 Apify 로 넘어가면 한 줄 — 금액은 실행 1회 추정", async () => {
    await withLlmMeter(async () => {
      await createSourceAdapters({}).ingestYoutube({ id: "sns", url: "https://youtu.be/iP5RUzXhWoc" });
    });
    expect(rows).toEqual([expect.objectContaining({
      p_provider: "apify", p_model: "automation-lab~youtube-transcript", p_usd: APIFY_YOUTUBE_RUN_ESTIMATE_USD, p_basis: "estimate", p_failed: false,
    })]);
  });
});
```

`packages/ingest-core/src/__tests__/youtube-apify.test.ts` 의 `describe("자막 → apify → 음성 인식 순서", () => {` **바로 앞**에:

```ts
describe("apify 비용 알림(설계 2026-09-30 §3.4)", () => {
  it("액터를 돌리면 알린다 — 동기 실행은 금액을 안 주므로 실행 사실만", async () => {
    const 받은것: unknown[] = [];
    await fetchApifyTranscript(URL, {
      onRun: (run) => 받은것.push(run),
      fetchImpl: fakeFetch(ACTOR_RESPONSE) as unknown as typeof fetch,
      environment: { APIFY_TOKEN: "k" },
    });
    expect(받은것).toEqual([{ actor: "automation-lab~youtube-transcript", failed: false }]);
  });

  it("액터가 실패해도 알린다 — 돌았으면 값이 나갔을 수 있다", async () => {
    const 받은것: unknown[] = [];
    await expect(fetchApifyTranscript(URL, {
      onRun: (run) => 받은것.push(run),
      fetchImpl: vi.fn(async () => new Response("x", { status: 500 })) as unknown as typeof fetch,
      environment: { APIFY_TOKEN: "k" },
    })).rejects.toThrow(/500/);
    expect(받은것).toEqual([{ actor: "automation-lab~youtube-transcript", failed: true }]);
  });

  it("토큰이 없으면 부르지도 알리지도 않는다", async () => {
    const 받은것: unknown[] = [];
    await expect(fetchApifyTranscript(URL, { onRun: (run) => 받은것.push(run), environment: {} })).rejects.toThrow();
    expect(받은것).toEqual([]);
  });
});

```

같은 파일의 기존 `fetchApifyTranscript(URL, {` 다섯 곳은 모두 `fetchApifyTranscript(URL, {` 다음 줄에 `      onRun: () => undefined,` 를 더한다(46·61·72·76·83줄).

`apps/web/lib/ai-cost/__tests__/required-callbacks.test.ts` — `import type * as RedesignCore …` 아래에 `import type * as IngestCore from "@fixup/ingest-core";`, `declare const redesign …` 아래에 `declare const ingest: typeof IngestCore;`, 배열 끝(`];` 앞)에:

```ts
  // @ts-expect-error recordUsage 가 없다
  ingest.createOpenAITopicResearcher({ OPENAI_API_KEY: "k" }),
  // @ts-expect-error onRun 이 없다
  ingest.fetchApifyTranscript("https://youtu.be/x", {}),
```

- [ ] **Step 2: 실패를 본다**

Run: `cd apps/web && npx vitest run lib/sns/__tests__/source-adapters-cost.test.ts`
Expected: FAIL — `Failed to resolve import`/`APIFY_YOUTUBE_RUN_ESTIMATE_USD` 가 undefined, `rows` 가 `[]`.
Run: `cd packages/ingest-core && npx vitest run src/__tests__/youtube-apify.test.ts` → FAIL(`받은것` 이 `[]`).
Run: `cd apps/web && npx tsc --noEmit` → `TS2578` 두 줄.

- [ ] **Step 3: 호출 단가**

`packages/shared/src/provider-price.ts`:

```ts
/**
 * 토큰도 그림도 아닌 **호출 단가**(설계 2026-09-30 §3.4).
 *
 * 글 모델 토큰 단가는 `llm-price.ts`, 그림 단가는 DB `model_prices` 에 있다. 여기는 둘 다 아닌 것 —
 * 호출 한 번에 붙는 값이다. 값이 바뀌면 **여기만** 고친다.
 */

/**
 * OpenAI 웹검색 도구 한 번(카드뉴스 주제 조사, `ingest-core/topic.ts`). 공표 단가 $10/1,000회.
 * 검색 결과로 들어온 글은 토큰으로 따로 센다.
 */
export const WEB_SEARCH_CALL_USD = 0.01;

/**
 * Apify 유튜브 자막 액터 한 번 실행의 **추정값**(`ingest-core/youtube-apify.ts`).
 * 동기 실행 응답에는 사용 금액이 없어 실행 1회로 어림한다 — 그래서 근거는 `estimate` 다.
 */
export const APIFY_YOUTUBE_RUN_ESTIMATE_USD = 0.01;
```

`packages/shared/src/index.ts:49` 의 `export * from "./llm-price";` 아래에 `export * from "./provider-price";`.

(두 값은 계획 작성 시점의 어림이다. **Task 11 Step 1 에서 공식 가격표·Apify 콘솔로 대조**하고, 다르면 이 파일만 고친다.)

- [ ] **Step 4: `ingest-core` 를 고친다**

`topic.ts` — `createOpenAITopicResearcher` 의 둘째 인자:

```ts
  /**
   * 조사 한 번의 토큰·웹검색 횟수를 알린다. **필수다**(설계 2026-09-30 §3.4) — 기본값을 두면
   * 안 넘긴 자리가 조용히 0원이 된다.
   */
  recordUsage: TopicUsageRecorder,
): TopicResearcher {
```

(옛: `recordUsage: TopicUsageRecorder = () => undefined,`). `ingestTopic` 은 `researcher?: TopicResearcher` → `researcher: TopicResearcher`, 몸의 `const result = await (input.researcher ?? createOpenAITopicResearcher())(topic);` → `const result = await input.researcher(topic);` (부르는 곳은 시험뿐이고 모두 `researcher` 를 넘긴다).

`youtube-apify.ts` — `export interface ApifyTranscriptResult {` 바로 앞에:

```ts
/**
 * 액터를 한 번 돌렸다는 알림(설계 2026-09-30 §3.4).
 *
 * 동기 실행(`run-sync-get-dataset-items`)은 자막 줄만 돌려주고 **사용 금액을 안 준다.** 그래서
 * 금액은 부르는 쪽이 「실행 1회 추정」으로 매긴다. 실패해도 액터는 돌았으므로 알린다.
 */
export type ApifyRunRecorder = (run: { actor: string; failed: boolean }) => void;

```

`fetchApifyTranscript` 의 둘째 인자:

```ts
  /** `onRun` 은 필수다 — 기본값을 두면 안 넘긴 자리가 조용히 0원이 된다(설계 §3.4). */
  deps: { onRun: ApifyRunRecorder; fetchImpl?: typeof fetch; environment?: Record<string, string | undefined> },
): Promise<ApifyTranscriptResult> {
```

(옛: `deps: { fetchImpl?: …; environment?: … } = {},`). 그리고 `// 응답 본문에 계정 정보가 섞일 수 있어 상태 코드만 알린다.` 주석 **바로 앞**에:

```ts
  deps.onRun({ actor: apifyActorId(environment), failed: !response.ok });

```

`youtube.ts` — 4줄 import 에 `type ApifyRunRecorder` 를 더한다:

```ts
import { fetchApifyTranscript, isApifyConfigured, type ApifyRunRecorder, type ApifyTranscriptResult } from "./youtube-apify";
```

`export async function ingestYoutube(` **바로 앞**에:

```ts
/**
 * 비용 기록 없이 Apify 를 불렀다. **조용히 넘기지 않는다** — 앱은 `onApifyRun` 을 넘긴다
 * (`apps/web/lib/sns/source-adapters.ts`). 넘기지 않는 것은 운영에서 멈춰 둔 수집 워커뿐이다.
 */
const warnUnrecordedApifyRun: ApifyRunRecorder = (run) => {
  console.warn("[ingest] Apify 를 비용 기록 없이 불렀습니다", run);
};

```

`ingestYoutube` 의 인자 타입 끝 `fetchApify?: ApifyTranscriptFetcher }` → `fetchApify?: ApifyTranscriptFetcher; onApifyRun?: ApifyRunRecorder }`, 그리고 70줄

```ts
  const apifyFetcher = input.fetchApify ?? (isApifyConfigured() ? fetchApifyTranscript : undefined);
```

을

```ts
  const onRun = input.onApifyRun ?? warnUnrecordedApifyRun;
  const apifyFetcher = input.fetchApify ?? (isApifyConfigured() ? (url: string) => fetchApifyTranscript(url, { onRun }) : undefined);
```

로.

- [ ] **Step 5: 앱이 콜백을 넘긴다**

`apps/web/lib/ai-cost/package-usage.ts` 의 import 두 줄을:

```ts
import type { ImageUsage, LlmUsage } from "@fixup/redesign-core";
import type { ApifyRunRecorder, TopicUsageRecorder } from "@fixup/ingest-core";
import { APIFY_YOUTUBE_RUN_ESTIMATE_USD, WEB_SEARCH_CALL_USD, llmUsdFromTokens } from "@fixup/shared";
import { recordAiCost, recordLlmUsage, tokensFrom } from "../llm/meter";
```

로 바꾸고(`ingest-core` 는 **타입만** 들여온다 — 값을 들이면 jsdom·playwright 가 딸려 온다), 파일 끝에:

```ts

/**
 * 카드뉴스 주제 조사 한 번 — 토큰 값 + 웹검색 횟수 × 호출 단가.
 *
 * 계량기 합산(`readLlmMeter`)에는 안 넣는다. 지금까지 기획 정산의 `llm_usd` 에 안 들어가던
 * 값이라, 넣으면 옛 장부의 숫자가 이번 변경으로 바뀐다. 이 값은 새 표에만 적힌다.
 */
export const recordTopicResearch: TopicUsageRecorder = (research) => {
  const tokens = tokensFrom({ usage: research.usage }) ?? { input: 0, output: 0 };
  const usd = llmUsdFromTokens(research.model, tokens.input, tokens.output) + research.toolCalls * WEB_SEARCH_CALL_USD;
  recordAiCost({
    provider: "openai",
    model: research.model,
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    usd,
    basis: "tokens",
  });
};

/** Apify 액터 한 번 — 동기 실행은 금액을 안 주므로 실행 1회 추정(`estimate`). */
export const recordApifyRun: ApifyRunRecorder = (run) => {
  recordAiCost({
    provider: "apify",
    model: run.actor,
    usd: APIFY_YOUTUBE_RUN_ESTIMATE_USD,
    basis: "estimate",
    failed: run.failed,
  });
};
```

`apps/web/lib/sns/source-adapters.ts`:

```ts
import type { SourceResolverDependencies } from "./source-resolver";
import { recordApifyRun, recordTopicResearch } from "../ai-cost/package-usage";
```

`return ingestYoutube(input);` →

```ts
      // Apify 로 넘어가면 값이 나간다. 그 한 줄을 적는다(설계 2026-09-30 §3.4).
      return ingestYoutube({ ...input, onApifyRun: recordApifyRun });
```

`createOpenAITopicResearcher({ … OPENAI_RESEARCH_MODEL: environment.OPENAI_RESEARCH_MODEL, });` 의 닫는 `});` → `}, recordTopicResearch);`

- [ ] **Step 6: 통과를 본다**

Run: `cd packages/ingest-core && npx tsc --noEmit -p . && npx vitest run` → 0 · PASS.
Run: `cd apps/web && npx tsc --noEmit && npx vitest run lib/sns lib/ai-cost` → 0 · PASS.
Run: `pnpm -r typecheck` → 오류 0(**`apps/worker` 가 바뀌지 않은 채 통과하는지** 여기서 본다).

- [ ] **Step 7: 전체와 커밋**

Run: `cd apps/web && npx vitest run` → 실패 0.

```bash
git add packages/ingest-core packages/shared/src/provider-price.ts packages/shared/src/index.ts apps/web/lib/ai-cost apps/web/lib/sns/source-adapters.ts apps/web/lib/sns/__tests__/source-adapters-cost.test.ts
git commit -m "feat(ai-cost): 카드뉴스 주제 조사·Apify 도 호출마다 한 줄씩 적는다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 카드뉴스 상태 조회 — 멈춤이면 기존 중지 경로를 탄다

**Files:**
- Create: `apps/web/lib/ai-control/pause.ts`
- Modify: `apps/web/lib/sns/queued-flow.ts:566-575` (`stopQueuedGeneration` 에 까닭 인자)
- Modify: `apps/web/app/api/sns/projects/[id]/status/route.ts` (import, 제공자 만들기 직전)
- Test: `apps/web/lib/ai-control/__tests__/pause.test.ts`, `apps/web/app/api/sns/__tests__/status-ai-paused.test.ts`

**Interfaces:**
- Consumes: `app_settings`(key `ai_paused`), `stopQueuedGeneration`·`settleSnsReservation`(기존).
- Produces: `AI_PAUSED_SETTING_KEY = "ai_paused"` · `aiPausedFrom(value: unknown): boolean`(정확히 `"1"` 만 참) · `isAiPaused(): Promise<boolean>`(못 읽으면 `false` + 경고) · `STOPPED_BY_PERSON` · `STOPPED_BY_AI_PAUSE` · `stopQueuedGeneration(flow, stoppedAt, reason = STOPPED_BY_PERSON)` · 상태 조회 응답에 `paused: true`(멈춤으로 끝났을 때).

**정한 것:** 스위치를 **못 읽으면 멈추지 않은 것**으로 본다. 이 값을 읽는 곳은 이미 예약을 지나 도는 카드뉴스 상태 조회뿐이고, 새 요청은 `credit_reserve` 가 같은 DB 에서 막는다 — DB 가 잠깐 흔들렸다고 돈 낸 작업을 끊지 않는다. 멈춤 검사는 「도는 중이 아니면 마무리」 갈래 **뒤**, 제공자를 만들기 **앞**에 둔다(끝난 흐름의 정산은 멈춤과 무관하게 해야 한다). 이미 fal 에 보낸 한 장은 값이 나갔지만 결과를 받지 않는다 — 사이드바 중지와 같다(설계 §3.3 「받아 둔 카드는 남고, 받은 만큼만 정산」).

- [ ] **Step 1: 실패하는 시험 둘을 쓴다**

`apps/web/lib/ai-control/__tests__/pause.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **멈춤 스위치 읽기**(설계 2026-09-30 §3.3). `credit_reserve` 와 같게 **정확히 `'1'` 만** 멈춤이다.
 */
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ value: null as unknown, error: null as null | { message: string }, throws: false }));
vi.mock("../../local-store", () => ({ isLocalStoreEnabled: () => false }));
vi.mock("../../supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    if (state.throws) throw new Error("SUPABASE_SECRET_KEY가 설정되지 않았습니다.");
    const self: Record<string, unknown> = {
      select: () => self,
      eq: () => self,
      maybeSingle: async () => ({ data: state.value === null ? null : { value: state.value }, error: state.error }),
    };
    return { from: () => self };
  },
}));

const { aiPausedFrom, isAiPaused } = await import("../pause");

beforeEach(() => { state.value = null; state.error = null; state.throws = false; });

describe("값", () => {
  it.each([["1", true], ["0", false], [" 1", false], ["true", false], [null, false], [1, false]])("%j → %s", (value, expected) => {
    expect(aiPausedFrom(value)).toBe(expected);
  });
});

describe("읽기", () => {
  it("'1' 이면 멈춤", async () => {
    state.value = "1";
    expect(await isAiPaused()).toBe(true);
  });

  it("줄이 없으면 멈추지 않음", async () => {
    expect(await isAiPaused()).toBe(false);
  });

  it("**못 읽으면 멈추지 않은 것으로 본다** — 이미 돈 낸 작업을 DB 흔들림으로 끊지 않는다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    state.error = { message: "timeout" };
    expect(await isAiPaused()).toBe(false);
    state.error = null;
    state.throws = true;
    expect(await isAiPaused()).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
```

`apps/web/app/api/sns/__tests__/status-ai-paused.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **운영자가 멈추면 카드뉴스 상태 조회가 다음 장을 안 보낸다**(설계 2026-09-30 §3.3·§5).
 *
 * 카드뉴스는 예약을 한 번 잡고 상태 조회가 한 장씩 보낸다 — 새 요청이 아니라서 `credit_reserve`
 * 의 멈춤 검사를 다시 안 지난다. 그래서 여기서 스위치를 읽고, 켜져 있으면 사이드바 「중지」와
 * 같은 길(`stopQueuedGeneration` + `settleSnsReservation`)을 탄다. 받아 둔 카드는 남는다.
 */
vi.mock("server-only", () => ({}));

const order: string[] = [];
let paused = false;
let saved: { status: string; flow: { cards: Array<{ index: number; status: string; error?: string }> } } | undefined;

const flow = () => ({
  cards: [
    { index: 1, kind: "generated", status: "done" },
    { index: 2, kind: "generated", status: "pending" },
  ],
  costs: [],
  generation: { selectedCardIndexes: [1, 2], reservationId: "33333333-3333-4333-8333-333333333333" },
});

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "u1", profile: { role: "member" } } }),
}));
vi.mock("../../../../lib/ai-control/pause", () => ({ isAiPaused: async () => paused }));
vi.mock("../../../../lib/sns/project-lock", () => ({ withSnsProjectLock: async (_id: string, run: () => Promise<Response>) => run() }));
vi.mock("../../../../lib/sns-flow-store", () => ({
  snsFlowStoreForUser: async () => ({
    get: async () => ({ id: "p1", modelId: "nano-banana-pro", data: { flow: flow() } }),
    save: async (_id: string, next: unknown, status: string) => {
      order.push("save");
      saved = { status, flow: next as never };
      return { id: "p1", status, data: { flow: next } };
    },
  }),
  snsWriteDenied: () => undefined,
}));
vi.mock("../../../../lib/sns-generation-store", () => ({ snsSubmittedGenerationRequestStoreForUser: () => ({}) }));
vi.mock("../../../../lib/sns/settle", () => ({
  settleSnsReservation: async (_user: string, next: unknown) => { order.push("settle"); return next; },
}));
vi.mock("../../../../lib/sns/providers", () => ({
  createSnsGenerationProviders: () => { order.push("providers"); return {}; },
  SnsProviderConfigurationError: class extends Error { status = 503; },
}));
vi.mock("../../../../lib/sns/runtime", () => ({
  refreshProjectAssetUrls: async (value: unknown) => value,
  createQueuedGenerationDependencies: async () => ({}),
}));
vi.mock("../../../../lib/sns/queued-flow", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../lib/sns/queued-flow")>()),
  pollQueuedFlow: async (_project: unknown, current: unknown) => { order.push("poll"); return current; },
}));

const { POST } = await import("../projects/[id]/status/route");
const call = () => POST(new Request("http://local/api/sns/projects/p1/status", { method: "POST" }), { params: Promise.resolve({ id: "p1" }) });

beforeEach(() => {
  order.length = 0;
  saved = undefined;
});

describe("멈춤이 켜져 있으면", () => {
  beforeEach(() => { paused = true; });

  it("다음 장을 안 보내고 중지 길을 탄다 — 정산하고 끝난 흐름으로 저장", async () => {
    const response = await call();
    const body = await response.json();

    expect(order).toEqual(["settle", "save"]);
    expect(body).toMatchObject({ ok: true, active: false, paused: true });
    expect(saved?.status).toBe("ready");
  });

  it("받아 둔 카드는 남기고, 못 만든 카드에는 멈춘 까닭을 적는다", async () => {
    await call();
    expect(saved?.flow.cards).toEqual([
      expect.objectContaining({ index: 1, status: "done" }),
      expect.objectContaining({ index: 2, status: "failed", error: expect.stringContaining("운영자가 AI 사용을 멈춰") }),
    ]);
  });
});

describe("멈춤이 꺼져 있으면", () => {
  it("지금처럼 다음 장을 본다", async () => {
    paused = false;
    await call();
    expect(order).toContain("poll");
    expect(order).not.toContain("settle");
  });
});
```

- [ ] **Step 2: 실패를 본다**

Run: `cd apps/web && npx vitest run lib/ai-control app/api/sns/__tests__/status-ai-paused.test.ts`
Expected: FAIL — `Failed to resolve import "../pause"`, 상태 조회 시험은 `order` 에 `providers`·`poll` 이 들어 있다.

- [ ] **Step 3: 스위치 읽기(`lib/ai-control/pause.ts`)**

```ts
import { isLocalStoreEnabled } from "../local-store";
import { createSupabaseAdminClient } from "../supabase/admin";

/**
 * **「AI 전체 멈춤」 스위치를 읽는다**(설계 2026-09-30 §3.3).
 *
 * 값은 `app_settings.ai_paused` 에 **정확히 `'1'`/`'0'`** 으로 둔다. `credit_reserve`
 * (202609300001)가 `value='1'` 만 멈춤으로 보므로 여기서도 그렇게만 본다 — 둘이 다르게 읽으면
 * 예약은 막혔는데 카드뉴스는 계속 도는 날이 생긴다.
 *
 * ── 못 읽으면 ──────────────────────────────────────────────
 *
 * **멈추지 않은 것으로 본다**(경고 한 줄). 이 값을 읽는 곳은 이미 예약을 지나 도는 카드뉴스
 * 상태 조회뿐이다. DB 가 잠깐 흔들렸다고 사용자가 돈 낸 작업을 끊으면 안 된다 — 새 요청은
 * 어차피 `credit_reserve` 가 같은 DB 에서 막는다.
 */

export const AI_PAUSED_SETTING_KEY = "ai_paused";

export function aiPausedFrom(value: unknown): boolean {
  return value === "1";
}

export async function isAiPaused(): Promise<boolean> {
  if (isLocalStoreEnabled()) return false;
  try {
    const { data, error } = await createSupabaseAdminClient()
      .from("app_settings")
      .select("value")
      .eq("key", AI_PAUSED_SETTING_KEY)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return aiPausedFrom(data?.value);
  } catch (error) {
    console.warn("[ai-control] 멈춤 스위치를 읽지 못해 켜진 것으로 봅니다", {
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
```

- [ ] **Step 4: 중지에 까닭을 싣는다(`lib/sns/queued-flow.ts`)**

```ts
export function stopQueuedGeneration(flow: SnsFlowState, stoppedAt: string): SnsFlowState {
  const next = structuredClone(flow);
  next.cards = next.cards.map((card) => (
    card.status === "pending" || card.status === "generating"
      ? { ...card, status: "failed" as const, error: "사람이 중지했습니다. 필요하면 이 카드만 다시 만드세요." }
      : card
  ));
```

를

```ts
/** 사이드바 「중지」로 멈춘 카드. */
export const STOPPED_BY_PERSON = "사람이 중지했습니다. 필요하면 이 카드만 다시 만드세요.";
/** 운영자가 「AI 전체 멈춤」을 켜서 멈춘 카드(설계 2026-09-30 §3.3). */
export const STOPPED_BY_AI_PAUSE = "운영자가 AI 사용을 멈춰 이 카드를 만들지 않았습니다. 다시 켜진 뒤 이 카드만 다시 만드세요.";

export function stopQueuedGeneration(flow: SnsFlowState, stoppedAt: string, reason: string = STOPPED_BY_PERSON): SnsFlowState {
  const next = structuredClone(flow);
  next.cards = next.cards.map((card) => (
    card.status === "pending" || card.status === "generating"
      ? { ...card, status: "failed" as const, error: reason }
      : card
  ));
```

로(사이드바 중지 `stop/route.ts:27` 는 인자를 안 넘기므로 문구가 그대로다).

- [ ] **Step 5: 상태 조회가 멈춤을 본다**

`apps/web/app/api/sns/projects/[id]/status/route.ts` 의 import

```ts
import { hasActiveQueuedGeneration, pollQueuedFlow } from "../../../../../../lib/sns/queued-flow";
```

를

```ts
import { hasActiveQueuedGeneration, pollQueuedFlow, stopQueuedGeneration, STOPPED_BY_AI_PAUSE } from "../../../../../../lib/sns/queued-flow";
import { isAiPaused } from "../../../../../../lib/ai-control/pause";
```

로, 그리고

```ts
      const providers = createSnsGenerationProviders();
      project = await refreshProjectAssetUrls(project);
```

앞에:

```ts
      /*
        **운영자가 멈췄으면 다음 장을 보내지 않는다**(설계 2026-09-30 §3.3). 사이드바 「중지」와
        **같은 길**을 탄다 — 받아 둔 카드는 남고, 받은 만큼만 정산한다. 제출 자리에서 던지면 흐름이
        active 로 남아 폴링이 계속 실패하고 예약이 만료되므로 그렇게 하지 않는다.
        이미 fal 에 보낸 한 장은 값이 나갔지만 결과를 받지 않는다 — 중지와 같다.
      */
      if (await isAiPaused()) {
        const stopped = stopQueuedGeneration(project.data.flow, new Date().toISOString(), STOPPED_BY_AI_PAUSE);
        const settled = await settleSnsReservation(auth.member.userId, stopped, project.modelId);
        return Response.json({ ok: true, project: await store.save(id, settled, "ready"), active: false, paused: true });
      }
```

(화면 `app/sns/[id]/project-client.tsx` 는 `active: false` 를 받으면 폴링을 멈추고 카드의 `error` 를 보인다 — 새 칸 `paused` 는 읽지 않아도 된다.)

- [ ] **Step 6: 통과를 본다**

Run: `cd apps/web && npx vitest run lib/ai-control app/api/sns lib/__tests__/sns-queued-flow.test.ts`
Expected: PASS(기존 `sns-credit-wiring.test.ts` 의 상태 조회 글 검사 포함).

- [ ] **Step 7: 뮤테이션 확인**

`if (await isAiPaused()) { … }` 블록을 잠깐 지우고 `status-ai-paused.test.ts` 를 돌린다 → FAIL(`order` 에 `providers`). 되돌린다.

- [ ] **Step 8: 전체와 커밋**

Run: `cd apps/web && npx tsc --noEmit && npx vitest run` → 0 · 실패 0.

```bash
git add apps/web/lib/ai-control apps/web/lib/sns/queued-flow.ts "apps/web/app/api/sns/projects/[id]/status/route.ts" apps/web/app/api/sns/__tests__/status-ai-paused.test.ts
git commit -m "feat(ai-control): 운영자가 멈추면 카드뉴스가 다음 장을 보내지 않고 중지 길을 탄다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 공급자를 부르는 파일 목록 시험 — 새 자리가 생기면 빨개진다

**Files:**
- Create: `apps/web/lib/__tests__/ai-cost-call-sites.test.ts`

**Interfaces:**
- Consumes: Task 2·4·5·6 이 남긴 표지(`recordFrom(`·`recordAiCost(`·`reportUsage(`·`reportImageUsage(`·`recordUsage(`·`onRun(`)와 `meter.ts` 의 `recordLlmUsage` → `recordAiCost(`.
- Produces: 없음(계약 시험).

**범위:** `apps/web` 과 `packages/*` 의 시험 아닌 `.ts/.tsx/.mjs` 파일 중 업체 SDK 를 import 하거나(`@anthropic-ai/sdk`·`openai`·`@google/genai`·`@google/generative-ai`·`@fal-ai/client`·`apify-client`) 업체 주소를 직접 적었거나(`api.openai.com`·`api.anthropic.com`·`generativelanguage.googleapis.com`·`fal.run`·`queue.fal.run`·`api.apify.com`) 외부 STT(`YOUTUBE_STT_SERVICE_URL`)를 읽는 파일. 계획 작성 시점에 정확히 19개다(기록 15 + 예외 4). `apps/worker` 는 운영에서 멈춰 두었고 설계 §4 가 손대지 않기로 해 빼고, `scripts/index-guide.mjs` 는 운영 앱 밖의 운영자 도구라 뺀다.

- [ ] **Step 1: 시험을 쓴다**

```ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **공급자를 부르는 파일은 모두 알려진 목록에 있고, 목록의 파일은 비용을 적는다**
 * (설계 2026-09-30 §5 「SDK 를 부르는 파일 목록이 알려진 목록과 같다(새 자리가 생기면 빨개진다)」).
 *
 * ── 무엇을 「공급자를 부른다」로 보나 ──────────────────────────
 *
 * 업체 SDK 를 import 하거나(`@anthropic-ai/sdk`·`openai`·`@google/genai`·`@fal-ai/client`) 업체
 * 주소를 직접 적은 파일(`api.openai.com`·`generativelanguage.googleapis.com`·`fal.run`·`api.apify.com`)
 * 그리고 외부 STT(`YOUTUBE_STT_SERVICE_URL`). `apps/web` 과 `packages/*` 의 시험 아닌 파일만 본다.
 * 수집 워커(`apps/worker`)는 운영에서 멈춰 두었고 설계 §4 가 손대지 않기로 했다.
 *
 * ── 표 ─────────────────────────────────────────────────────
 *
 * 알려진 파일마다 **비용을 적는 표지**(그 파일에 있어야 할 글)를 둔다. 표지가 없는 것은
 * 예외이고, 예외에는 까닭을 적는다.
 */

const root = join(__dirname, "..", "..", "..", "..");

const SDK_IMPORT = /from\s+["'](@anthropic-ai\/sdk|openai|@google\/genai|@google\/generative-ai|@fal-ai\/client|apify-client)["']/;
const PROVIDER_HOST = /https:\/\/(api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|fal\.run|queue\.fal\.run|api\.apify\.com)/;
const STT = /YOUTUBE_STT_SERVICE_URL/;

/** 파일 → 비용을 적는 표지. 이 글이 파일에 없으면 빨개진다. */
const 기록하는파일: Record<string, RegExp> = {
  "apps/web/lib/llm/structured.ts": /recordFrom\(/,
  "apps/web/lib/sns/providers.ts": /recordFrom\(/,
  "apps/web/lib/poster/providers.ts": /recordFrom\(/,
  "apps/web/lib/pdp/providers.ts": /recordFrom\(/,
  "apps/web/lib/layout/analyze-provider.ts": /recordFrom\(/,
  "apps/web/lib/fal/queue.ts": /recordAiCost\(/,
  "apps/web/lib/pdp/fal.ts": /recordAiCost\(/,
  "apps/web/lib/redesign/image-generator.ts": /recordAiCost\(/,
  "apps/web/lib/ad/background.ts": /recordAiCost\(/,
  "packages/redesign-core/src/generate.ts": /reportUsage\([\s\S]*reportImageUsage\(|reportImageUsage\([\s\S]*reportUsage\(/,
  "packages/redesign-core/src/edit-section.ts": /reportImageUsage\(/,
  "packages/redesign-core/src/transcribe.ts": /reportUsage\(/,
  "packages/redesign-core/src/rag.ts": /reportUsage\(/,
  "packages/ingest-core/src/adapters/topic.ts": /recordUsage\(/,
  "packages/ingest-core/src/adapters/youtube-apify.ts": /onRun\(/,
};

/** 공급자 모듈을 import 하지만 비용을 여기서 안 적는 파일. 까닭이 곧 확인할 곳이다. */
const 예외: Record<string, string> = {
  "apps/web/lib/cs/provider.ts": "클라이언트만 만든다 — 호출은 `llm/structured.ts` 가 하고 거기서 적는다",
  "apps/web/lib/easy/chat-provider.ts": "클라이언트만 만든다 — 호출은 `llm/structured.ts` 가 하고 거기서 적는다",
  "apps/web/lib/fal/upload.ts": "참고 그림을 fal 저장소에 올린다 — 모델 호출이 아니라 값이 없다",
  "packages/ingest-core/src/adapters/youtube-worker.ts": "외부 STT — 설계 §3.4: 운영에 설정돼 있지 않으면 제외(배포 확인 항목)",
};

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
      const full = join(current, name);
      if (statSync(full).isDirectory()) {
        if (name === "__tests__") continue;
        walk(full);
      } else if (/\.(ts|tsx|mjs)$/.test(name) && !/\.test\.(ts|tsx|mjs)$/.test(name)) {
        found.push(full);
      }
    }
  };
  walk(dir);
  return found;
}

const 부르는파일 = [join(root, "apps", "web"), join(root, "packages")]
  .flatMap(sourceFiles)
  .filter((file) => {
    const source = readFileSync(file, "utf8");
    return SDK_IMPORT.test(source) || PROVIDER_HOST.test(source) || STT.test(source);
  })
  .map((file) => relative(root, file).replace(/\\/g, "/"))
  .sort();

describe("공급자를 부르는 파일", () => {
  it("**셀 파일이 있다** — 못 찾으면 아래 검사가 전부 조용히 통과한다", () => {
    expect(부르는파일.length).toBeGreaterThanOrEqual(15);
  });

  it("**알려진 목록과 같다** — 새 자리가 생기면 여기가 빨개진다", () => {
    expect(부르는파일).toEqual([...Object.keys(기록하는파일), ...Object.keys(예외)].sort());
  });

  it.each(Object.entries(기록하는파일))("%s 는 비용을 적는다", (file, 표지) => {
    expect(readFileSync(join(root, file), "utf8")).toMatch(표지);
  });

  it("글 모델 한 줄은 계량기 한 곳에서 쓴다 — 모듈마다 따로 감싸지 않는다", () => {
    const meter = readFileSync(join(root, "apps/web/lib/llm/meter.ts"), "utf8");
    expect(meter).toMatch(/export function recordLlmUsage[\s\S]{0,400}recordAiCost\(/);
  });
});
```

- [ ] **Step 2: 돌린다**

Run: `cd apps/web && npx vitest run lib/__tests__/ai-cost-call-sites.test.ts`
Expected: PASS(18개). 앞 Task 들이 모두 끝났으므로 처음부터 초록이다 — 그래서 다음 단계의 뮤테이션이 이 시험의 「실패 확인」이다.

- [ ] **Step 3: 뮤테이션 확인 — 두 가지**

① `apps/web/lib/fal/queue.ts` 의 `recordAiCost({ … });` 호출을 잠깐 지운다 → `apps/web/lib/fal/queue.ts 는 비용을 적는다` FAIL. 되돌린다.
② 아무 `apps/web/lib/**` 파일(예: `lib/cost.ts`) 맨 위에 `import OpenAI from "openai";` 를 잠깐 넣는다 → `알려진 목록과 같다` FAIL(`apps/web/lib/cost.ts` 가 더 나옴). 되돌린다.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/lib/__tests__/ai-cost-call-sites.test.ts
git commit -m "test(ai-cost): 공급자를 부르는 파일이 모두 비용을 적는지 목록으로 고정한다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 관리자 보고·스위치 RPC (C4 SQL)

**Files:**
- Create: `supabase/migrations/202609300003_ai_cost_admin.sql`
- Create: `scripts/tests/ai-cost-admin.test.mjs`
- Modify: `apps/web/lib/membership/__tests__/ai-cost-migration.test.ts` (끝에 C4 절)
- Modify: `package.json:15`

**Interfaces:**
- Consumes: `ai_cost_events`(Task 1), `app_settings(key,value,updated_at)`, `credit_admin_events(id,actor_id,action,target_ids,reason,input,result)`, `profiles(id,role,status)`.
- Produces:
  - `public.admin_ai_cost_report(p_days integer default 30, p_now timestamptz default now()) returns jsonb` — `{ days, today_usd, month_usd, window_usd, daily: [{day:'YYYY-MM-DD', usd, calls}] (창의 날마다 한 줄, 오래된 것부터), by_provider: [{key, usd, calls, images}] (금액 큰 순), by_operation: [같은 모양] }`. 날짜 경계는 모두 `Asia/Seoul`. 창 = 한국 오늘을 끝으로 `p_days` 일(1~366). 공급자별·작업별은 그 창 안.
  - `public.admin_set_ai_paused(p_actor uuid, p_paused boolean, p_reason text) returns jsonb` — `{ paused, changed }`. 활성 관리자·빈 아닌 까닭만. 같은 값이면 아무것도 안 적고 `changed:false`. 바뀌면 `app_settings.ai_paused` 를 `'1'`/`'0'` 으로, `credit_admin_events` 에 `ai_pause`/`ai_resume` 한 줄(`target_ids='{}'`).
  - 둘 다 `service_role` 만.

**정한 것:** 보고는 **새 RPC 하나**가 jsonb 로 전부 돌려준다(화면 한 번에 왕복 하나). 시험이 시각을 고정할 수 있게 `p_now` 를 받는다(앱은 안 넘긴다). 스위치는 값 쓰기와 감사 한 줄을 **한 트랜잭션**으로 하려고 DB 함수로 둔다 — 앱에서 둘을 따로 쓰면 하나만 남는 날이 생긴다.

- [ ] **Step 1: 실제 PostgreSQL 시험을 쓴다**

`scripts/tests/ai-cost-admin.test.mjs`:

```js
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { testPostgres } from '../lib/test-credit-postgres.mjs';

/*
  202609300003 — 관리자 AI 비용 보고와 「AI 전체 멈춤」 스위치(설계 2026-09-30 §3.3·§3.4 · C4).

  보고는 **한국 시각**으로 자른다(한국 0시~9시 호출이 「오늘」). 스위치는 정확히 '1'/'0' 을 쓰고,
  바뀔 때마다 `credit_admin_events` 에 한 줄을 남기며, 실제로 `credit_reserve` 를 멈춘다.
*/
const MIGRATIONS = ['202609300002_ai_cost_events.sql', '202609300003_ai_cost_admin.sql'];
const ADMIN = '92000000-0000-4000-8000-000000000001';
const MEMBER = '92000000-0000-4000-8000-000000000002';
let db;
const json = async (q) => JSON.parse(await db.sql(q));
const report = (now, days = 30) => json(`select admin_ai_cost_report(${days}, '${now}'::timestamptz);`);

before(async () => {
  db = await testPostgres();
  await db.migrate(MIGRATIONS);
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values('${ADMIN}','a@example.invalid',now()),('${MEMBER}','m@example.invalid',now());
    update profiles set status='active',role='admin' where id='${ADMIN}';
    update profiles set status='active' where id='${MEMBER}';
    select credit_admin_grant('${MEMBER}','bonus',100,0,now()+interval '3 months','g-${MEMBER}','fixture','${ADMIN}');
    insert into ai_cost_events(created_at,operation,provider,model,usd,usd_basis) values
      ('2026-09-30 00:30:00+09','cs:ask','anthropic','claude-sonnet-5',1,'tokens'),
      ('2026-09-29 23:30:00+09','sns:plan','openai','gpt-5.6-sol',2,'tokens'),
      ('2026-09-01 00:10:00+09','poster','fal','nano-banana-pro',4,'image_unit'),
      ('2026-08-31 23:50:00+09','poster','fal','nano-banana-pro',8,'image_unit');`);
});
after(async () => { await db?.close(); });

test('today follows the Korean clock, not UTC', async () => {
  const r = await report('2026-09-30 08:00:00+09');
  assert.equal(r.today_usd, 1);             // UTC 로 자르면 3 — 한국 9/29 23:30 도 「오늘」이 된다
  assert.equal(r.month_usd, 1 + 2 + 4);     // 한국 8/31 23:50 은 지난달
  assert.equal(r.window_usd, 7);            // 30일 창은 한국 9/1~9/30
  assert.equal(r.daily.length, 30);
  assert.deepEqual(r.daily.at(-1), { day: '2026-09-30', usd: 1, calls: 1 });
  assert.deepEqual(r.daily.at(-2), { day: '2026-09-29', usd: 2, calls: 1 });
  assert.equal(r.daily[0].day, '2026-09-01');
});

test('breaks down by provider and by operation over the window', async () => {
  const r = await report('2026-09-30 08:00:00+09');
  assert.deepEqual(r.by_provider.map((x) => [x.key, x.usd, x.calls]), [['fal', 4, 1], ['openai', 2, 1], ['anthropic', 1, 1]]);
  assert.deepEqual(r.by_operation.map((x) => [x.key, x.usd]), [['poster', 4], ['sns:plan', 2], ['cs:ask', 1]]);
});

test('rows after the report time are not counted', async () => {
  const r = await report('2026-09-29 12:00:00+09');
  assert.equal(r.today_usd, 0);
  assert.equal(r.window_usd, 12);           // 한국 8/31~9/29 창: 8 + 4
});

test('a short window still gives a full calendar and zeros', async () => {
  const r = await report('2026-10-20 08:00:00+09', 7);
  assert.equal(r.today_usd, 0);
  assert.equal(r.daily.length, 7);
  assert.deepEqual(r.by_provider, []);
});

test('the switch writes exactly 1 or 0 and leaves one audit row per change', async () => {
  assert.deepEqual(await json(`select admin_set_ai_paused('${ADMIN}', true, '시험');`), { paused: true, changed: true });
  assert.equal(await db.sql(`select value from app_settings where key='ai_paused';`), '1');
  assert.deepEqual(await json(`select admin_set_ai_paused('${ADMIN}', true, '시험');`), { paused: true, changed: false });
  assert.deepEqual(await json(`select admin_set_ai_paused('${ADMIN}', false, '시험');`), { paused: false, changed: true });
  assert.equal(await db.sql(`select value from app_settings where key='ai_paused';`), '0');
  const events = await json(`select jsonb_agg(jsonb_build_object('action',action,'targets',target_ids)) from credit_admin_events where actor_id='${ADMIN}' and action in ('ai_pause','ai_resume');`);
  assert.deepEqual(events.map((e) => e.action).sort(), ['ai_pause', 'ai_resume']);
  assert.ok(events.every((e) => Array.isArray(e.targets) && e.targets.length === 0));
});

test('the switch really stops credit_reserve', async () => {
  await json(`select admin_set_ai_paused('${ADMIN}', true, '시험');`);
  const refused = await json(`select credit_reserve('${MEMBER}', gen_random_uuid(), 'pdp_analyze', array[]::integer[], 'pdp:analyze', 60);`);
  assert.equal(refused.reason, 'ai_paused');
  await json(`select admin_set_ai_paused('${ADMIN}', false, '시험');`);
  const allowed = await json(`select credit_reserve('${MEMBER}', gen_random_uuid(), 'pdp_analyze', array[]::integer[], 'pdp:analyze', 60);`);
  assert.equal(allowed.allowed, true, JSON.stringify(allowed));
});

test('only an active admin can flip the switch, with a reason', async () => {
  await assert.rejects(db.sql(`select admin_set_ai_paused('${MEMBER}', true, '시험');`), /admin_required/);
  await assert.rejects(db.sql(`select admin_set_ai_paused('${ADMIN}', true, '  ');`), /reason_required/);
  assert.equal(await db.sql(`select has_function_privilege('authenticated','public.admin_set_ai_paused(uuid,boolean,text)','execute');`), 'f');
  assert.equal(await db.sql(`select has_function_privilege('anon','public.admin_ai_cost_report(integer,timestamptz)','execute');`), 'f');
  assert.equal(await db.sql(`select has_function_privilege('service_role','public.admin_ai_cost_report(integer,timestamptz)','execute');`), 't');
});
```

`apps/web/lib/membership/__tests__/ai-cost-migration.test.ts` 의 **맨 끝**에:

```ts

/* ── C4(202609300003) ─────────────────────────────────────── */

const C4 = "202609300003_ai_cost_admin.sql";

describe("C4 도 새것만 더한다", () => {
  it("보고와 스위치 둘만 정의한다", () => {
    expect(existsSync(path.join(migrationsDir, C4))).toBe(true);
    expect(정의한함수(code(C4)).sort()).toEqual(["admin_ai_cost_report", "admin_set_ai_paused"]);
  });

  it("기존 표를 바꾸지 않는다(alter·drop 없음)", () => {
    const sql = code(C4);
    expect(sql).not.toMatch(/\balter\s+table\b/i);
    expect(sql).not.toMatch(/\bdrop\s+(table|function|index)\b/i);
  });
});

describe("보고와 스위치", () => {
  const sql = existsSync(path.join(migrationsDir, C4)) ? code(C4) : "";

  it("오늘·이번 달은 한국 시각으로 자른다", () => {
    expect(sql).toMatch(/date_trunc\('day',\s*p_now\s+at\s+time\s+zone\s+'Asia\/Seoul'\)/i);
    expect(sql).toMatch(/date_trunc\('month',\s*p_now\s+at\s+time\s+zone\s+'Asia\/Seoul'\)/i);
  });

  it("스위치는 정확히 '1'/'0' 을 쓰고, 감사 한 줄의 action 은 ai_pause/ai_resume, 대상은 빈 배열", () => {
    expect(sql).toMatch(/case\s+when\s+p_paused\s+then\s+'1'\s+else\s+'0'\s+end/i);
    expect(sql).toMatch(/case\s+when\s+p_paused\s+then\s+'ai_pause'\s+else\s+'ai_resume'\s+end/i);
    expect(sql).toMatch(/'\{\}'::uuid\[\]/);
  });

  it("두 함수 모두 서비스 권한만 부른다", () => {
    for (const signature of ["admin_ai_cost_report\\(integer,\\s*timestamptz\\)", "admin_set_ai_paused\\(uuid,\\s*boolean,\\s*text\\)"]) {
      expect(sql).toMatch(new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${signature}\\s+from\\s+public,\\s*anon,\\s*authenticated`, "i"));
      expect(sql).toMatch(new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${signature}\\s+to\\s+service_role`, "i"));
    }
  });
});
```

- [ ] **Step 2: 실패를 본다**

Run: `node --test scripts/tests/ai-cost-admin.test.mjs` → FAIL(`Migration 202609300003_ai_cost_admin.sql: ENOENT`).
Run: `cd apps/web && npx vitest run lib/membership/__tests__/ai-cost-migration.test.ts` → FAIL(C4 절).

- [ ] **Step 3: 마이그레이션을 쓴다**

`supabase/migrations/202609300003_ai_cost_admin.sql`:

```sql
-- 관리자 AI 비용 화면과 「AI 전체 멈춤」 스위치 (설계 2026-09-30 §3.3·§3.4 · C4).
--
-- ⚠ 공유 DB — detail-page-studio 가 기존 `admin_cost_summary/by_member/by_operation/by_model/daily`
--   를 그대로 부른다. **그 함수들은 고치지 않는다.** 이 파일은 새 함수 둘만 더한다.
-- ⚠ 순서 — 202609300002(ai_cost_events) 뒤, 앱보다 먼저.
--
-- 「오늘」「이번 달」은 **한국 시각**이다. 기존 `admin_cost_*` 는 DB 시각(UTC)으로 잘라
-- 한국 0시~9시 호출이 「어제」로 잡힌다(202609100004).

create or replace function public.admin_ai_cost_report(
  p_days integer default 30,
  p_now timestamptz default now()
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      least(greatest(coalesce(p_days, 30), 1), 366) as days,
      date_trunc('day', p_now at time zone 'Asia/Seoul') as today_local,
      date_trunc('day', p_now at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' as today_start,
      date_trunc('month', p_now at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' as month_start
  ),
  win as (
    select b.*, (b.today_local - make_interval(days => b.days - 1)) at time zone 'Asia/Seoul' as window_start
    from bounds b
  ),
  picked as (
    select e.created_at, e.provider, e.operation, e.usd, e.images
    from ai_cost_events e, win w
    where e.created_at >= least(w.window_start, w.month_start) and e.created_at <= p_now
  ),
  calendar as (
    select g::date as day
    from win w, generate_series(w.today_local - make_interval(days => w.days - 1), w.today_local, interval '1 day') g
  ),
  per_day as (
    select (r.created_at at time zone 'Asia/Seoul')::date as day, sum(r.usd) as usd, count(*) as calls
    from picked r, win w where r.created_at >= w.window_start group by 1
  )
  select jsonb_build_object(
    'days', (select days from win),
    'today_usd', coalesce((select sum(r.usd) from picked r, win w where r.created_at >= w.today_start), 0),
    'month_usd', coalesce((select sum(r.usd) from picked r, win w where r.created_at >= w.month_start), 0),
    'window_usd', coalesce((select sum(r.usd) from picked r, win w where r.created_at >= w.window_start), 0),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'usd', coalesce(p.usd, 0), 'calls', coalesce(p.calls, 0)) order by d.day)
      from calendar d left join per_day p on p.day = d.day), '[]'::jsonb),
    'by_provider', coalesce((
      select jsonb_agg(jsonb_build_object('key', x.provider, 'usd', x.usd, 'calls', x.calls, 'images', x.images) order by x.usd desc, x.provider)
      from (select r.provider, sum(r.usd) as usd, count(*) as calls, sum(r.images) as images
              from picked r, win w where r.created_at >= w.window_start group by r.provider) x), '[]'::jsonb),
    'by_operation', coalesce((
      select jsonb_agg(jsonb_build_object('key', x.operation, 'usd', x.usd, 'calls', x.calls, 'images', x.images) order by x.usd desc, x.operation)
      from (select r.operation, sum(r.usd) as usd, count(*) as calls, sum(r.images) as images
              from picked r, win w where r.created_at >= w.window_start group by r.operation) x), '[]'::jsonb)
  );
$$;

revoke all on function public.admin_ai_cost_report(integer, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_ai_cost_report(integer, timestamptz) to service_role;

-- ── AI 전체 멈춤 스위치 ────────────────────────────────────────────
--
-- 값은 **정확히 '1'/'0'** 만 쓴다. `credit_reserve`(202609300001)는 `value='1'` 만 멈춤으로 본다.
-- 바꿀 때마다 `credit_admin_events` 에 한 줄(action `ai_pause`/`ai_resume`, target_ids '{}') — 새 표 없음.
-- 같은 값으로 다시 누르면 아무것도 안 적는다.

create or replace function public.admin_set_ai_paused(
  p_actor uuid,
  p_paused boolean,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
  v_new text;
begin
  if p_paused is null then raise exception 'admin_set_ai_paused: paused_required'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'admin_set_ai_paused: reason_required'; end if;
  if not exists (select 1 from profiles where id = p_actor and role = 'admin' and status = 'active') then
    raise exception 'admin_set_ai_paused: admin_required';
  end if;

  v_new := case when p_paused then '1' else '0' end;
  select value into v_old from app_settings where key = 'ai_paused' for update;
  if coalesce(v_old, '0') = v_new then
    return jsonb_build_object('paused', p_paused, 'changed', false);
  end if;

  insert into app_settings(key, value, updated_at) values ('ai_paused', v_new, now())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;

  insert into credit_admin_events(id, actor_id, action, target_ids, reason, input, result)
  values (gen_random_uuid(), p_actor, case when p_paused then 'ai_pause' else 'ai_resume' end,
          '{}'::uuid[], p_reason, jsonb_build_object('paused', p_paused, 'previous', v_old),
          jsonb_build_object('value', v_new));

  return jsonb_build_object('paused', p_paused, 'changed', true);
end $$;

revoke all on function public.admin_set_ai_paused(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_set_ai_paused(uuid, boolean, text) to service_role;

do $$
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('admin_ai_cost_report', 'admin_set_ai_paused')) <> 2 then
    raise exception 'admin_ai_cost_report·admin_set_ai_paused 가 하나씩이 아닙니다';
  end if;
  raise notice 'AI 비용 보고·멈춤 스위치 함수를 하나씩 만들었습니다.';
end $$;
```

- [ ] **Step 4: `test:credit-db` 에 넣는다**

`package.json:15` 끝의 `scripts/tests/ai-cost-events.test.mjs"` → `scripts/tests/ai-cost-events.test.mjs scripts/tests/ai-cost-admin.test.mjs"`

- [ ] **Step 5: 통과를 본다**

Run: `node --test scripts/tests/ai-cost-admin.test.mjs` → `ℹ pass 7 · ℹ fail 0`.
Run: `cd apps/web && npx vitest run lib/membership/__tests__/ai-cost-migration.test.ts lib/membership/__tests__/sql-function-unique.test.ts` → PASS.
Run: `pnpm test:credit-db` → 실패 0.

- [ ] **Step 6: 뮤테이션 확인**

보고의 `'Asia/Seoul'` 세 곳(`today_local`·`today_start` 줄)을 잠깐 `'UTC'` 로 바꾸고 `node --test scripts/tests/ai-cost-admin.test.mjs` → `today follows the Korean clock` FAIL(3 ≠ 1). 되돌린다.

- [ ] **Step 7: 커밋**

```bash
git add supabase/migrations/202609300003_ai_cost_admin.sql scripts/tests/ai-cost-admin.test.mjs apps/web/lib/membership/__tests__/ai-cost-migration.test.ts package.json
git commit -m "feat(ai-control): 관리자 AI 비용 보고(한국 시각)와 멈춤 스위치 RPC 를 더한다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 관리자 화면 — AI 사용 비용 + 전체 멈춤 스위치

**Files:**
- Create: `apps/web/lib/ai-control/report.ts` · Test: `apps/web/lib/ai-control/__tests__/report.test.ts`
- Create: `apps/web/app/admin/system/ai-labels.ts`
- Create: `apps/web/app/admin/system/ai-control-actions.ts` · Test: `apps/web/app/admin/__tests__/ai-control-actions.test.ts`
- Create: `apps/web/app/admin/system/ai-usage-panel.tsx` · Test: `apps/web/app/admin/__tests__/ai-usage-panel.test.tsx`
- Modify: `apps/web/app/admin/system/page.tsx` (import, 읽기, 패널 자리)
- Modify: `apps/web/app/admin/admin-shared.tsx` (알림 표)
- Modify: `apps/web/app/admin/CostPanel.tsx` (「옛 기준」 한 줄)
- Modify: `apps/web/app/admin/member-list/member-table.tsx:88,115,224` (「옛 기준」)

**Interfaces:**
- Consumes: RPC `admin_ai_cost_report`·`admin_set_ai_paused`(Task 9), `AI_PAUSED_SETTING_KEY`·`aiPausedFrom`(Task 7), `formatKrw`·`formatUsd`(`lib/cost.ts`), `requireAdmin`(`lib/membership/server.ts` — `{ user: { id } }` 를 돌려준다), `ConfirmSubmitButton`(`app/admin/confirm-submit-button.tsx`).
- Produces: `AiCostReport`·`AiCostSlice`·`parseAiCostReport(raw)`·`getAiCostReport(days = 30): Promise<AiCostReport | null>`·`readAiPausedForAdmin(): Promise<boolean>` · `setAiPausedAction(formData)`(`paused` = `"1"`|`"0"`, 끝나면 `/admin/system?notice=ai_paused|ai_resumed`) · `AiUsagePanel({ report, paused, usdKrw })` · `aiProviderLabel`·`aiOperationLabel`.

**정한 것:** 이름표는 `app/admin/system/ai-labels.ts` 에 둔다 — 「회원 화면에 업체 이름(Anthropic 등)이 없다」 시험(`lib/__tests__/model-name.test.ts`)이 `admin` 폴더만 비켜 가고, 「화면 문구에 줄표가 없다」 시험(`app/__tests__/ui-text-dash.test.ts`)이 `lib`·`app` 문자열을 모두 보므로 이름표 문자열에 `—` 를 쓰지 않는다(계획 작성 중 두 시험이 실제로 잡았다). 보고를 못 읽으면(마이그레이션 전) 패널은 「아직 집계할 수 없습니다」로 열리고, **스위치 상태를 못 읽으면 던진다** — 모르는 채 「켜짐」으로 보이면 멈추려고 누른 단추가 반대로 동작한다. 패널은 문의함 바로 아래(화면 위쪽)에 둔다. `CostPanel`(옛 장부)은 단가·환율 고치는 칸이 있어 그대로 두고 「옛 기준」 한 줄만 붙인다.

- [ ] **Step 1: 실패하는 시험 셋을 쓴다**

`apps/web/lib/ai-control/__tests__/report.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

/** RPC 의 jsonb → 화면 모양. 모르는 칸은 0 — 없는 숫자를 지어내지 않는다. */
vi.mock("server-only", () => ({}));
vi.mock("../../supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }));

const { parseAiCostReport } = await import("../report");

describe("AI 비용 보고 읽기", () => {
  it("DB 가 준 칸을 옮긴다(numeric 은 문자열로 올 수 있다)", () => {
    const report = parseAiCostReport({
      days: 30, today_usd: "1.5", month_usd: 7, window_usd: 9,
      daily: [{ day: "2026-09-30", usd: "1.5", calls: 2 }],
      by_provider: [{ key: "fal", usd: "4", calls: 1, images: 2 }],
      by_operation: [{ key: "sns:plan", usd: 2, calls: 1, images: 0 }],
    });
    expect(report).toEqual({
      days: 30, todayUsd: 1.5, monthUsd: 7, windowUsd: 9,
      daily: [{ day: "2026-09-30", usd: 1.5, calls: 2 }],
      byProvider: [{ key: "fal", usd: 4, calls: 1, images: 2 }],
      byOperation: [{ key: "sns:plan", usd: 2, calls: 1, images: 0 }],
    });
  });

  it("비었거나 이상한 값은 0·빈 목록", () => {
    expect(parseAiCostReport(null)).toEqual({ days: 0, todayUsd: 0, monthUsd: 0, windowUsd: 0, daily: [], byProvider: [], byOperation: [] });
    expect(parseAiCostReport({ today_usd: "abc" }).todayUsd).toBe(0);
  });
});
```

`apps/web/app/admin/__tests__/ai-control-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **멈춤 스위치를 바꾸는 문**(설계 2026-09-30 §3.3).
 *
 * 서버 액션은 주소만 알면 직접 부를 수 있다 — 관리자인지 여기서 다시 본다. 값은 **정확히
 * '1'/'0'** 만 받는다(`credit_reserve` 가 `'1'` 만 멈춤으로 본다). 값 쓰기와 감사 한 줄은 DB 함수
 * 하나가 한 트랜잭션으로 한다.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const redirected: string[] = [];
vi.mock("next/navigation", () => ({ redirect: (to: string) => { redirected.push(to); } }));

let 관리자다 = true;
vi.mock("../../../lib/membership/server", () => ({
  requireAdmin: async () => {
    if (!관리자다) throw new Error("관리자 권한이 필요합니다.");
    return { user: { id: "admin-1" }, profile: { email: "admin@example.com" } };
  },
}));

const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
let rpcError: { message: string } | null = null;
vi.mock("../../../lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return { data: {}, error: rpcError };
    },
  }),
}));

const { setAiPausedAction } = await import("../system/ai-control-actions");
const 누른다 = (paused: string) => {
  const form = new FormData();
  form.set("paused", paused);
  return setAiPausedAction(form);
};

beforeEach(() => {
  calls.length = 0;
  redirected.length = 0;
  rpcError = null;
  관리자다 = true;
});

describe("스위치 바꾸기", () => {
  it("'1' 이면 멈춘다 — 누가 왜 눌렀는지 함께 보낸다", async () => {
    await 누른다("1");
    expect(calls).toEqual([{ fn: "admin_set_ai_paused", args: { p_actor: "admin-1", p_paused: true, p_reason: "관리자 화면에서 AI 전체 멈춤" } }]);
    expect(redirected).toEqual(["/admin/system?notice=ai_paused"]);
  });

  it("'0' 이면 다시 켠다", async () => {
    await 누른다("0");
    expect(calls[0]!.args.p_paused).toBe(false);
    expect(redirected).toEqual(["/admin/system?notice=ai_resumed"]);
  });

  it.each(["", "true", "on", "2"])("모르는 값 %j 는 DB 에 안 보낸다", async (value) => {
    await expect(누른다(value)).rejects.toThrow("올바르지 않은 값");
    expect(calls).toEqual([]);
  });

  it("관리자가 아니면 막는다", async () => {
    관리자다 = false;
    await expect(누른다("1")).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it("DB 가 거절하면 알린다 — 바뀐 줄 알고 넘어가지 않게", async () => {
    rpcError = { message: "admin_required" };
    await expect(누른다("1")).rejects.toThrow("AI 멈춤 스위치를 바꾸지 못했습니다");
    expect(redirected).toEqual([]);
  });
});
```

`apps/web/app/admin/__tests__/ai-usage-panel.test.tsx`:

```tsx
import React from "react";
import { readFileSync } from "node:fs";
import { create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

/**
 * **관리자 AI 사용 비용 + 전체 멈춤 스위치**(설계 2026-09-30 §3.3·§3.4 · C4).
 *
 * 보고 바로 결정하도록 숫자와 스위치가 한 카드에 있다. 여기서는 화면이 **무엇을 말하는지**를 본다 —
 * 멈춤 상태, 누르면 보낼 값, 한계 문구(청구서와 1원 단위로 같지 않다), 이름표, 「옛 기준」.
 */
vi.mock("server-only", () => ({}));
vi.mock("../system/ai-control-actions", () => ({ setAiPausedAction: vi.fn() }));
// `useFormStatus` 는 시험 렌더러에 없다. 단추 모양만 남긴다 — 확인 창은 그 컴포넌트의 몫이다.
vi.mock("../confirm-submit-button", () => ({
  ConfirmSubmitButton: ({ children }: { children: React.ReactNode }) => React.createElement("button", { type: "submit" }, children),
}));

const { AiUsagePanel } = await import("../system/ai-usage-panel");
type Props = Parameters<typeof AiUsagePanel>[0];
type Report = NonNullable<Props["report"]>;

const 보고: Report = {
  days: 30,
  todayUsd: 1,
  monthUsd: 7,
  windowUsd: 7,
  daily: [{ day: "2026-09-29", usd: 2, calls: 1 }, { day: "2026-09-30", usd: 1, calls: 1 }],
  byProvider: [{ key: "fal", usd: 4, calls: 1, images: 2 }, { key: "anthropic", usd: 1, calls: 1, images: 0 }],
  byOperation: [{ key: "sns:plan", usd: 2, calls: 1, images: 0 }, { key: "새-기능", usd: 1, calls: 1, images: 0 }],
};

const 나무 = (props: Props) => create(React.createElement(AiUsagePanel, props)).toJSON();

function 글(props: Props): string {
  const 편다 = (node: unknown): string => {
    if (node === null || node === undefined) return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(편다).join(" ");
    return 편다((node as { children?: unknown }).children);
  };
  return 편다(나무(props));
}

/** 숨은 칸 `paused` 가 보낼 값. 스위치를 누르면 이 값으로 바뀐다. */
function 보낼값(props: Props): string | undefined {
  let found: string | undefined;
  const 훑는다 = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(훑는다); return; }
    const el = node as { type?: string; props?: { name?: string; value?: string }; children?: unknown };
    if (el.type === "input" && el.props?.name === "paused") found = el.props.value;
    훑는다(el.children);
  };
  훑는다(나무(props));
  return found;
}

describe("스위치", () => {
  it("켜져 있으면 「AI 전체 멈춤」을 내고, 누르면 '1' 을 보낸다", () => {
    expect(글({ report: 보고, paused: false, usdKrw: 1000 })).toContain("AI 전체 멈춤");
    expect(보낼값({ report: 보고, paused: false, usdKrw: 1000 })).toBe("1");
  });

  it("멈춰 있으면 그렇다고 보이고, 누르면 '0' 을 보낸다", () => {
    const 보인것 = 글({ report: 보고, paused: true, usdKrw: 1000 });
    expect(보인것).toContain("AI 멈춤");
    expect(보인것).toContain("AI 다시 켜기");
    expect(보낼값({ report: 보고, paused: true, usdKrw: 1000 })).toBe("0");
  });

  it("이미 도는 그림은 끝까지 돌 수 있다고 적는다(설계 §3.3)", () => {
    expect(글({ report: 보고, paused: false, usdKrw: 1000 })).toContain("이미 제출돼 도는 그림은 끝까지 돌 수 있습니다");
  });
});

describe("숫자", () => {
  it("오늘·이번 달·최근 30일을 원화로 보인다", () => {
    const 보인것 = 글({ report: 보고, paused: false, usdKrw: 1000 });
    expect(보인것).toContain("1,000원");
    expect(보인것).toContain("7,000원");
  });

  it("공급자·작업에 이름표를 달고, 모르는 작업은 키 그대로 보인다", () => {
    const 보인것 = 글({ report: 보고, paused: false, usdKrw: 1000 });
    expect(보인것).toContain("fal (그림)");
    expect(보인것).toContain("카드뉴스 · 기획·원고");
    expect(보인것).toContain("새-기능");
  });

  it("청구서와 1원 단위로 같지 않다고 밝힌다(설계 §3.4)", () => {
    expect(글({ report: 보고, paused: false, usdKrw: 1000 })).toContain("1원 단위로 같지는 않습니다");
  });

  it("보고를 못 읽으면 화면은 열리고 준비 전이라고 말한다", () => {
    expect(글({ report: null, paused: false, usdKrw: 1000 })).toContain("아직 집계할 수 없습니다");
  });
});

describe("옛 장부는 「옛 기준」으로 보인다(설계 §3.4)", () => {
  const 읽는다 = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

  it("시스템 화면에서 새 패널이 옛 비용 패널보다 위에 있다", () => {
    const page = 읽는다("system/page.tsx");
    expect(page.indexOf("<AiUsagePanel")).toBeGreaterThan(-1);
    expect(page.indexOf("<AiUsagePanel")).toBeLessThan(page.indexOf("<CostPanel"));
  });

  it("옛 비용 패널과 회원 목록의 비용 칸에 「옛 기준」을 적는다", () => {
    expect(읽는다("CostPanel.tsx")).toContain("옛 기준");
    expect(읽는다("member-list/member-table.tsx")).toContain("비용(옛 기준)");
  });
});
```

- [ ] **Step 2: 실패를 본다**

Run: `cd apps/web && npx vitest run lib/ai-control/__tests__/report.test.ts app/admin/__tests__/ai-control-actions.test.ts app/admin/__tests__/ai-usage-panel.test.tsx`
Expected: FAIL — `Failed to resolve import "../report"` · `"../system/ai-control-actions"` · `"../system/ai-usage-panel"`.

- [ ] **Step 3: 보고 읽기(`lib/ai-control/report.ts`)**

```ts
import { createSupabaseAdminClient } from "../supabase/admin";
import { AI_PAUSED_SETTING_KEY, aiPausedFrom } from "./pause";

/**
 * **AI 전체 비용 보고**(설계 2026-09-30 §3.4 · C4). `ai_cost_events` 를 한국 시각으로 모은다.
 *
 * 집계는 새 RPC `admin_ai_cost_report` 하나로만 한다. 기존 `admin_cost_*` 는 같은 DB 를 보는
 * detail-page-studio 가 부르므로 건드리지 않는다.
 */

export interface AiCostSlice {
  key: string;
  usd: number;
  calls: number;
  images: number;
}

export interface AiCostReport {
  days: number;
  todayUsd: number;
  monthUsd: number;
  windowUsd: number;
  daily: Array<{ day: string; usd: number; calls: number }>;
  byProvider: AiCostSlice[];
  byOperation: AiCostSlice[];
}

const n = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const slices = (value: unknown): AiCostSlice[] =>
  (Array.isArray(value) ? value : []).map((row: Record<string, unknown>) => ({
    key: String(row.key ?? ""),
    usd: n(row.usd),
    calls: n(row.calls),
    images: n(row.images),
  }));

/** RPC 가 준 jsonb 를 화면이 쓰는 모양으로. 모르는 칸은 0 으로 둔다 — 없는 숫자를 지어내지 않는다. */
export function parseAiCostReport(raw: unknown): AiCostReport {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    days: n(row.days),
    todayUsd: n(row.today_usd),
    monthUsd: n(row.month_usd),
    windowUsd: n(row.window_usd),
    daily: (Array.isArray(row.daily) ? row.daily : []).map((day: Record<string, unknown>) => ({
      day: String(day.day ?? ""),
      usd: n(day.usd),
      calls: n(day.calls),
    })),
    byProvider: slices(row.by_provider),
    byOperation: slices(row.by_operation),
  };
}

/**
 * 못 읽으면 `null` — 화면은 「아직 준비 전」으로 보인다. 마이그레이션 전 서버에는 함수가 없다.
 * 던지지 않는 이유: 이 표 하나 때문에 시스템 관리 탭 전체(문의함·플랜)가 500 이 되면 안 된다.
 */
export async function getAiCostReport(days = 30): Promise<AiCostReport | null> {
  try {
    const { data, error } = await createSupabaseAdminClient().rpc("admin_ai_cost_report", { p_days: days });
    if (error) throw new Error(error.message);
    return parseAiCostReport(data);
  } catch (error) {
    console.warn("[ai-control] AI 비용 보고를 읽지 못했습니다", { message: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

/**
 * 관리자 화면에 보일 스위치 상태. **못 읽으면 던진다** — 멈췄는지 모르는 채 「켜짐」이라고
 * 보이면 관리자가 멈추려고 누른 단추가 반대로 동작한다.
 */
export async function readAiPausedForAdmin(): Promise<boolean> {
  const { data, error } = await createSupabaseAdminClient()
    .from("app_settings")
    .select("value")
    .eq("key", AI_PAUSED_SETTING_KEY)
    .maybeSingle();
  if (error) throw new Error(`AI 멈춤 스위치를 읽지 못했습니다: ${error.message}`);
  return aiPausedFrom(data?.value);
}
```

- [ ] **Step 4: 이름표(`app/admin/system/ai-labels.ts`)**

```ts
/**
 * 비용 표의 **이름표**(관리자 화면 전용 — 회원 화면에 업체 이름을 안 내는 시험(`model-name.test.ts`)이
 * `admin` 폴더만 비켜 간다). 모르는 키는 그대로 보인다 — 지어낸 이름으로 덮으면 새 기능이 어디서
 * 돈을 쓰는지 못 알아본다.
 */

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: "Anthropic (글)",
  openai: "OpenAI (글·웹검색·임베딩)",
  google: "Google (글)",
  fal: "fal (그림)",
  apify: "Apify (유튜브 자막)",
  other: "기타",
};

/** 작업 키 = 예약 resource 에서 id 를 뺀 것(`lib/ai-cost/keys.ts`). */
const OPERATION_LABEL: Record<string, string> = {
  "sns": "카드뉴스 · 그림",
  "sns:plan": "카드뉴스 · 기획·원고",
  "sns:caption": "카드뉴스 · 게시글 문구",
  "sns:layout-analysis": "카드뉴스 · 칸 읽기",
  "poster": "포스터 · 그림",
  "poster:plan": "포스터 · 기획",
  "poster:review": "포스터 · 검수",
  "easy:decide": "쉬운 만들기 · 판정",
  "cs:ask": "AI 도우미",
  "pdp:analyze": "상세페이지 · 분석",
  "pdp:plan": "상세페이지 · 글로 기획",
  "pdp:style-reference": "상세페이지 · 참고 그림 분석",
  "pdp:image": "상세페이지 · 그림",
  "pdp:batch": "상세페이지 · 여러 장",
  "pdp:key-visual": "상세페이지 · 대표 그림",
  "character:candidates": "캐릭터 · 후보",
  "character:angles": "캐릭터 · 각도",
  "character:view": "캐릭터 · 한 장",
  "redesign:transcribe": "리디자인 · 읽기",
  "redesign:generate": "리디자인 · 만들기",
  "redesign:edit": "리디자인 · 고치기",
  "ad:export": "광고 내보내기",
  "ad:export:cutout": "광고 내보내기 · 배경 제거",
  "admin:knowledge": "관리자 · 지식 올리기",
  "unbound": "문맥 없음(입구 확인 필요)",
};

export const aiProviderLabel = (key: string) => PROVIDER_LABEL[key] ?? key;
export const aiOperationLabel = (key: string) => OPERATION_LABEL[key] ?? key;
```

- [ ] **Step 5: 스위치 액션(`app/admin/system/ai-control-actions.ts`)**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "../../../lib/membership/server";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";

/**
 * **AI 전체 멈춤 스위치를 바꾼다**(설계 2026-09-30 §3.3).
 *
 * 값 쓰기와 감사 한 줄(`credit_admin_events`, `ai_pause`/`ai_resume`)은 DB 함수
 * `admin_set_ai_paused` 가 한 트랜잭션으로 한다 — 둘을 앱에서 따로 쓰면 하나만 남는 날이 생긴다.
 * 그 함수도 관리자인지 다시 본다. 서버 액션은 **주소만 알면 직접 부를 수 있다**(`actions.ts` 의 같은 판단).
 */
export async function setAiPausedAction(formData: FormData) {
  const membership = await requireAdmin();
  const next = String(formData.get("paused") || "");
  if (next !== "1" && next !== "0") throw new Error("올바르지 않은 값입니다.");

  const { error } = await createSupabaseAdminClient().rpc("admin_set_ai_paused", {
    p_actor: membership.user.id,
    p_paused: next === "1",
    p_reason: next === "1" ? "관리자 화면에서 AI 전체 멈춤" : "관리자 화면에서 AI 다시 켜기",
  });
  if (error) throw new Error(`AI 멈춤 스위치를 바꾸지 못했습니다: ${error.message}`);

  revalidatePath("/admin/system");
  redirect(`/admin/system?notice=${next === "1" ? "ai_paused" : "ai_resumed"}`);
}
```

- [ ] **Step 6: 패널(`app/admin/system/ai-usage-panel.tsx`)**

```tsx
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@fixup/ui";
import { formatKrw, formatUsd } from "../../../lib/cost";
import { aiOperationLabel, aiProviderLabel } from "./ai-labels";
import type { AiCostReport, AiCostSlice } from "../../../lib/ai-control/report";
import { ConfirmSubmitButton } from "../confirm-submit-button";
import { setAiPausedAction } from "./ai-control-actions";

/**
 * **AI 사용 비용 + 전체 멈춤 스위치**(설계 2026-09-30 §3.3·§3.4 · C4).
 *
 * 보고 바로 결정하도록 숫자와 스위치를 한 카드에 둔다. 숫자는 `ai_cost_events`(호출마다 한 줄)를
 * **한국 시각**으로 모은 것이다. 자동으로 멈추는 것은 없다(D2) — 사람만 누른다.
 */
export function AiUsagePanel({ report, paused, usdKrw }: { report: AiCostReport | null; paused: boolean; usdKrw: number }) {
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 space-y-1.5">
          <CardTitle>AI 사용 비용</CardTitle>
          <CardDescription>
            공급자를 부를 때마다 한 줄씩 적은 값을 한국 시각으로 모았습니다. 단가표가 맞아야 맞으며,
            공급자 청구서와 1원 단위로 같지는 않습니다.
          </CardDescription>
        </div>
        <PauseSwitch paused={paused} />
      </CardHeader>
      <CardContent className="space-y-5">
        {report ? <Numbers report={report} usdKrw={usdKrw} /> : (
          <p className="text-sm text-muted-foreground">아직 집계할 수 없습니다. 비용 표 마이그레이션이 적용됐는지 확인해 주세요.</p>
        )}
      </CardContent>
    </Card>
  );
}

function PauseSwitch({ paused }: { paused: boolean }) {
  return (
    <div className="flex flex-col items-end gap-2">
      <Badge variant={paused ? "destructive" : "secondary"}>{paused ? "AI 멈춤" : "AI 켜짐"}</Badge>
      <form action={setAiPausedAction}>
        <input type="hidden" name="paused" value={paused ? "0" : "1"} />
        <ConfirmSubmitButton
          variant={paused ? "default" : "destructive"}
          confirmMessage={paused
            ? "AI 사용을 다시 켭니다. 회원이 바로 쓸 수 있게 됩니다."
            : "모든 회원(관리자 포함)의 AI 사용을 멈춥니다. 이미 제출돼 도는 그림은 끝까지 돌 수 있습니다. 멈출까요?"}
        >
          {paused ? "AI 다시 켜기" : "AI 전체 멈춤"}
        </ConfirmSubmitButton>
      </form>
      <p className="max-w-xs text-right text-xs text-muted-foreground">
        멈추면 새 요청은 모두 거절되고, 카드뉴스는 다음 장을 보내지 않습니다. 이미 제출돼 도는 그림은 끝까지 돌 수 있습니다.
      </p>
    </div>
  );
}

function Numbers({ report, usdKrw }: { report: AiCostReport; usdKrw: number }) {
  const money = (usd: number) => `${formatKrw(usd, usdKrw)} (${formatUsd(usd)})`;
  return (
    <>
      <dl className="grid gap-3 sm:grid-cols-3">
        {[["오늘", report.todayUsd], ["이번 달", report.monthUsd], [`최근 ${report.days}일`, report.windowUsd]].map(([label, usd]) => (
          <div key={String(label)} className="rounded-lg border p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold">{money(Number(usd))}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-4 xl:grid-cols-2">
        <SliceTable title={`공급자별 (최근 ${report.days}일)`} rows={report.byProvider} label={aiProviderLabel} money={money} />
        <SliceTable title={`작업별 (최근 ${report.days}일)`} rows={report.byOperation} label={aiOperationLabel} money={money} />
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-medium">일별 (최근 {report.days}일)</summary>
        <table className="mt-2 w-full text-sm">
          <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-3 font-medium">날짜</th><th className="py-1 pr-3 font-medium">비용</th><th className="py-1 font-medium">호출</th></tr></thead>
          <tbody>
            {[...report.daily].reverse().map((day) => (
              <tr key={day.day} className="border-t"><td className="py-1 pr-3">{day.day}</td><td className="py-1 pr-3">{money(day.usd)}</td><td className="py-1">{day.calls.toLocaleString("ko-KR")}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}

function SliceTable({ title, rows, label, money }: { title: string; rows: AiCostSlice[]; label: (key: string) => string; money: (usd: number) => string }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      {rows.length ? (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-3 font-medium">구분</th><th className="py-1 pr-3 font-medium">비용</th><th className="py-1 pr-3 font-medium">호출</th><th className="py-1 font-medium">그림</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t">
                <td className="py-1 pr-3">{label(row.key)}</td>
                <td className="py-1 pr-3">{money(row.usd)}</td>
                <td className="py-1 pr-3">{row.calls.toLocaleString("ko-KR")}</td>
                <td className="py-1">{row.images.toLocaleString("ko-KR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="text-sm text-muted-foreground">기록이 없습니다.</p>}
    </div>
  );
}
```

- [ ] **Step 7: 시스템 화면·알림·「옛 기준」을 잇는다**

`app/admin/system/page.tsx` — `import type { CreditPlan } from "../member-list/types";` 아래에:

```ts
import { AiUsagePanel } from "./ai-usage-panel";
import { getAiCostReport, readAiPausedForAdmin } from "../../../lib/ai-control/report";
```

`if (failed) throw failed;` 아래에:

```ts
  /*
    **AI 사용 비용과 멈춤 스위치**(설계 2026-09-30 §3.3·§3.4). 보고는 못 읽어도 화면을 연다(null) —
    스위치 상태는 못 읽으면 던진다: 모르는 채 「켜짐」이라고 보이면 누른 단추가 반대로 동작한다.
  */
  const [aiReport, aiPaused] = await Promise.all([getAiCostReport(30), readAiPausedForAdmin()]);
```

`<InquiryPanel rows={inquiries} />` 아래에:

```tsx
      <AiUsagePanel report={aiReport} paused={aiPaused} usdKrw={usdKrw} />
```

`app/admin/admin-shared.tsx` — `/** 처리하지 못한 일.` 주석 바로 앞에:

```ts
/** AI 전체 멈춤 스위치 알림(설계 2026-09-30 §3.3). */
const AI_CONTROL_NOTICE: Record<string, string> = {
  ai_paused: "AI 사용을 멈췄습니다. 새 요청은 모두 거절되고, 카드뉴스는 다음 장을 보내지 않습니다. 이미 제출돼 도는 그림은 끝까지 돌 수 있습니다.",
  ai_resumed: "AI 사용을 다시 켰습니다.",
};

```

그리고 `AdminNotice` 의 `const message = TEAM_NOTICE[notice] ?? SHOWCASE_NOTICE[notice] ?? (notice === "approved"` → `const message = TEAM_NOTICE[notice] ?? SHOWCASE_NOTICE[notice] ?? AI_CONTROL_NOTICE[notice] ?? (notice === "approved"`.

`app/admin/CostPanel.tsx` — `return (` 안 첫 `<div className="space-y-4">` 바로 아래(네 칸 격자 `<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">` 앞)에:

```tsx
      {/*
        **옛 기준**(설계 2026-09-30 §3.4). 이 숫자는 요청 끝에 모아 적는 그림 장부라 예약 없는 호출과
        글 AI 일부가 빠진다. 총 비용은 위 「AI 사용 비용」이 기준이다. 단가·환율 고치는 칸은 여기 그대로다.
      */}
      <p className="text-sm text-muted-foreground">
        아래 숫자는 <strong>옛 기준</strong>(그림 장부)입니다. 전체 AI 비용은 위 「AI 사용 비용」을 보세요.
      </p>
```

`app/admin/member-list/member-table.tsx` — 세 곳(설계는 `app/admin/page.tsx:68` 을 가리키지만 그 줄은 값을 읽는 자리이고, 칸 이름은 여기서 그린다):

- 88줄 머리칸 `"이번 달", "비용", "관리"]` → `"이번 달", "비용(옛 기준)", "관리"]`
- 115줄 CSV 머리 `"플랜 상태", "이번 달 비용", "누적 비용"]` → `"플랜 상태", "이번 달 비용(옛 기준)", "누적 비용(옛 기준)"]`
- 224줄 모바일 `["비용", <CostCell key="k" row={row} />],` → `["비용(옛 기준)", <CostCell key="k" row={row} />],`

- [ ] **Step 8: 통과를 본다**

Run: `cd apps/web && npx vitest run lib/ai-control app/admin app/__tests__/ui-text-dash.test.ts lib/__tests__/model-name.test.ts`
Expected: PASS(패널 9 · 액션 8 · 보고 2 · 기존 관리자 시험 · 줄표 · 모델 이름).
Run: `cd apps/web && npx tsc --noEmit && cd ../.. && pnpm lint` → 0 · 오류 0.

- [ ] **Step 9: 전체와 커밋**

Run: `cd apps/web && npx vitest run` → 실패 0.

```bash
git add apps/web/lib/ai-control apps/web/app/admin
git commit -m "feat(ai-control): 관리자 화면에 AI 사용 비용(한국 시각)과 전체 멈춤 스위치를 둔다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 운영 반영 — 마이그레이션 둘 먼저, 그다음 앱 (**사용자 필요**)

이 Task 는 운영 서버·운영 DB 를 만진다. **실행자(에이전트)는 명령을 준비해 사용자에게 보여 주고, 사용자가 직접 돌리거나 승인한 뒤에만 한다.** 하나라도 어긋나면 멈추고 사용자에게 묻는다. 운영 환경변수 값은 **큰따옴표로 감싸져 있다** — 아래 `grep` 은 따옴표가 있어도 없어도 맞게 적었다.

**Files:** 없음(코드 변경 없음). 사용자 바탕화면에 붙여 넣을 SQL 파일 넷을 만든다.

- [ ] **Step 1: 단가 셋을 공식 자료로 대조한다(사용자와 함께)**

이 계획이 새로 적은 값은 셋이다. 공식 가격표·콘솔로 대조하고, 다르면 **배포 전에** 그 파일만 고쳐 커밋한다(시험은 표에서 값을 읽으므로 고쳐도 안 깨진다).

| 값 | 파일 | 계획 값 | 대조할 곳 |
|---|---|---|---|
| 임베딩 `text-embedding-3-small` | `packages/shared/src/llm-price.ts` | 입력 $0.02/100만 | OpenAI 가격표 |
| 웹검색 도구 1회 `WEB_SEARCH_CALL_USD` | `packages/shared/src/provider-price.ts` | $0.01 | OpenAI 가격표(웹검색 도구, 조사 모델 `gpt-5.6-sol` 기준) |
| Apify 자막 1회 `APIFY_YOUTUBE_RUN_ESTIMATE_USD` | 같은 파일 | $0.01 | Apify 콘솔의 `automation-lab~youtube-transcript` 실행 비용 |

- [ ] **Step 2: 다른 터미널·운영 환경 확인(읽기만)**

```bash
git fetch -q origin
git log --oneline 42cc5854..origin/master
git diff --name-only 42cc5854..origin/master -- supabase/migrations/
```

Expected: 이 가지 밖의 머지·마이그레이션이 없다. 있으면 멈추고 사용자에게 묻는다(메모리 「배포 전 다른 터미널 확인」).

서버 환경(값은 보지 않고 **있는지만**):

```bash
ssh -i <키> ubuntu@<호스트> "sudo grep -cE '^YOUTUBE_STT_SERVICE_URL=\"?[^\"[:space:]]+' /etc/fixup-image-agent/app.env; sudo grep -cE '^APIFY_TOKEN=\"?[^\"[:space:]]+' /etc/fixup-image-agent/app.env; sudo grep -cE '^OPENAI_API_KEY=\"?[^\"[:space:]]+' /etc/fixup-image-agent/app.env"
```

Expected: 첫 줄 `0`(STT 가 비어 있다 — 설계 §3.4 대로 제외해도 된다). **`1` 이면 멈추고 사용자에게 묻는다** — 외부 STT 가 카드뉴스 유튜브 수집에서 불리는데 이 계획은 그 비용을 적지 않는다. 둘째 줄이 `1` 이면 Apify 가 회원 라우트(카드뉴스 기획)에서 불릴 수 있다 — 이번 변경으로 한 줄씩 적힌다(추정값). 셋째 줄은 `1`(주제 조사·임베딩이 도는 조건).

- [ ] **Step 3: 바탕화면 SQL 파일을 만든다**

저장소 뿌리에서:

```bash
DESK="/c/Users/PC/Desktop"
cp supabase/migrations/202609300002_ai_cost_events.sql "$DESK/C3-1-비용표-마이그레이션.sql"
cp supabase/migrations/202609300003_ai_cost_admin.sql "$DESK/C4-1-보고스위치-마이그레이션.sql"
cat > "$DESK/C3C4-0-적용전확인.sql" <<'EOF'
-- 읽기만 한다. 결과를 에이전트에게 보여 주세요.
-- ① 이름이 겹치는 것이 없어야 한다(같은 DB 를 다른 제품이 쓴다) — 세 줄 모두 비어 있거나 null
select to_regclass('public.ai_cost_events') as 표;
select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('ai_cost_record', 'admin_ai_cost_report', 'admin_set_ai_paused');
-- ② 멈춤 값 — 없거나 '0' 이어야 한다
select key, value from app_settings where key = 'ai_paused';
-- ③ 그림 단가표 — 아래 모델이 모두 있어야 한다(없는 모델은 가장 비싼 값으로 잡힌다)
select model, unit_cost_usd from model_prices
 where model in ('gpt-image-2.5-flare','gpt-image-2.5-sunburst','gpt-image-2','nano-banana-pro','nano-banana-2','nano-banana',
                 'seedream-5-pro','qwen-image-2-pro','fal-ai/birefnet/v2','redesign-openai','redesign-google')
 order by model;
-- ④ 감사 표의 칸 — id, actor_id, action, target_ids, reason, input, result, created_at
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'credit_admin_events' order by ordinal_position;
-- ⑤ 관리자 두 계정이 active 이고 role='admin' 이어야 스위치를 누를 수 있다
select email, role, status from profiles where role = 'admin';
EOF
cat > "$DESK/C3C4-2-적용후확인.sql" <<'EOF'
-- 읽기만 한다.
select to_regclass('public.ai_cost_events');                                   -- ai_cost_events
select relrowsecurity from pg_class where oid = 'public.ai_cost_events'::regclass;  -- true
select has_table_privilege('anon', 'public.ai_cost_events', 'select');        -- false
select has_function_privilege('authenticated',
  'public.ai_cost_record(uuid,uuid,text,text,text,integer,integer,integer,numeric,text,boolean,text)', 'execute'); -- false
select has_function_privilege('authenticated', 'public.admin_set_ai_paused(uuid,boolean,text)', 'execute');      -- false
select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('ai_cost_record', 'admin_ai_cost_report', 'admin_set_ai_paused'); -- 세 줄
select admin_ai_cost_report(30) ->> 'days';                                    -- 30
EOF
ls -la "$DESK"/C3*.sql "$DESK"/C4*.sql
```

Expected: 파일 넷. **①**의 세 줄 중 하나라도 무엇이 나오면(이름이 이미 있다) 멈춘다 — 다른 제품이 같은 이름을 쓰고 있을 수 있다.

- [ ] **Step 4: 사용자가 `C3C4-0-적용전확인.sql` 을 운영 SQL 편집기에서 돌린다**

Expected: ① 비어 있음 ② 없거나 `'0'` ③ 열한 줄 ④ 칸 여덟 ⑤ 두 계정 `admin`·`active`. 어긋나면 멈춘다.

- [ ] **Step 5: `begin … rollback` 으로 미리 돌려 본다(사용자)**

SQL 편집기에 다음을 **한 번에** 붙인다(①② 자리에 바탕화면 파일 두 개의 내용을 차례로 붙인다):

```sql
begin;

-- ① 여기에 C3-1-비용표-마이그레이션.sql 전체
-- ② 여기에 C4-1-보고스위치-마이그레이션.sql 전체

do $$
declare
  v_admin uuid; r jsonb;
begin
  select id into v_admin from profiles where role = 'admin' and status = 'active' limit 1;
  if v_admin is null then raise exception '활성 관리자를 못 찾았습니다'; end if;

  perform ai_cost_record(v_admin, null, 'dryrun', 'fal', 'nano-banana-pro', 0, 0, 1, null, 'image_unit', false, 'dryrun-fal-1');
  perform ai_cost_record(v_admin, null, 'dryrun', 'fal', 'nano-banana-pro', 0, 0, 1, null, 'image_unit', false, 'dryrun-fal-1');
  if (select count(*) from ai_cost_events where fal_request_id = 'dryrun-fal-1') <> 1 then raise exception '같은 fal 요청이 두 번 적혔습니다'; end if;
  if (select usd from ai_cost_events where fal_request_id = 'dryrun-fal-1')
     <> (select unit_cost_usd from model_prices where model = 'nano-banana-pro') then raise exception '그림 값이 단가표와 다릅니다'; end if;

  r := admin_ai_cost_report(30);
  if (r ->> 'days')::integer <> 30 or jsonb_array_length(r -> 'daily') <> 30 then raise exception '보고 모양이 다릅니다 %', r; end if;

  r := admin_set_ai_paused(v_admin, true, 'dryrun');
  if (select value from app_settings where key = 'ai_paused') <> '1' then raise exception '멈춤이 안 적혔습니다'; end if;
  r := admin_set_ai_paused(v_admin, false, 'dryrun');
  if (select value from app_settings where key = 'ai_paused') <> '0' then raise exception '다시 켜기가 안 적혔습니다'; end if;

  raise notice 'C3·C4 미리 돌리기 끝 — 모두 설계대로입니다. 이 트랜잭션은 되돌립니다.';
end $$;

rollback;
```

Expected: 마이그레이션의 NOTICE 둘과 마지막 NOTICE 한 줄. 예외가 나면 적용하지 않고 그 줄을 에이전트에게 보인다. (`rollback` 이라 멈춤 스위치·감사 줄·비용 줄은 하나도 남지 않는다.)

- [ ] **Step 6: 마이그레이션 둘을 적용한다(사용자)**

`C3-1-비용표-마이그레이션.sql` → NOTICE `ai_cost_events 표와 ai_cost_record 함수 하나를 만들었습니다.` 확인 → `C4-1-보고스위치-마이그레이션.sql` → NOTICE `AI 비용 보고·멈춤 스위치 함수를 하나씩 만들었습니다.` 확인 → `C3C4-2-적용후확인.sql` 의 주석대로인지 본다.

이 시점의 동작: 지금 도는 앱은 새 표를 모른다 — 아무것도 바뀌지 않는다(새 것만 더했다).

- [ ] **Step 7: 앱을 배포한다**

`docs/DEPLOY.md` 의 「매 배포」를 **그대로** 따른다(머지 → 릴리스 자산 → `gh release download` → `scp` → `deploy-release.sh`). Windows·EC2 에서 빌드하지 않는다. 배포 뒤 확인:

```bash
systemctl is-active fixup-image-agent                                   # active
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/         # 200
sudo readlink -f /opt/fixup-image-agent/current                         # 새 릴리스 id
sudo grep -rq "ai_cost_record" /opt/fixup-image-agent/current/apps/web/.next && echo 반영됨
sudo grep -rq "AI 사용 비용" /opt/fixup-image-agent/current/apps/web/.next && echo 반영됨
sudo grep -rq "운영자가 AI 사용을 멈춰 이 카드를 만들지 않았습니다" /opt/fixup-image-agent/current/apps/web/.next && echo 반영됨
```

**셋 다 「반영됨」이어야 한다.**

- [ ] **Step 8: 실제로 적히는지 본다(사용자)**

관리자 계정으로 화면 왼쪽 아래 도우미에게 한 번 묻는다. 그다음 SQL 편집기에서:

```sql
select created_at at time zone 'Asia/Seoul' as 한국시각, operation, provider, model, usd, usd_basis, user_id is not null as 회원있음
  from ai_cost_events order by id desc limit 5;
```

Expected: `cs:ask` 줄이 둘 이상(판정 한 번 + 답 한 번, 임베딩 한 번), `provider` 는 `anthropic`·`openai`, `회원있음` 이 true. `/admin/system` 을 열면 맨 위(문의함 아래)에 「AI 사용 비용」 카드와 「AI 켜짐」 배지가 보인다. **`operation='unbound'` 줄이 보이면** 문맥 없이 부른 길이 있다는 뜻이다 — 그 줄의 `model` 로 어느 길인지 찾아 에이전트에게 알린다.

스위치를 실제로 한 번 눌러 볼지는 **사용자가 정한다**(누르는 동안 모든 회원의 AI 가 멈춘다). 누른다면 한산한 시간에 「AI 전체 멈춤」 → 확인 → 곧바로 「AI 다시 켜기」, 그리고:

```sql
select created_at at time zone 'Asia/Seoul', action, target_ids, reason from credit_admin_events
 where action in ('ai_pause', 'ai_resume') order by created_at desc limit 2;
select value from app_settings where key = 'ai_paused';   -- '0'
```

- [ ] **Step 9: 되돌리기(문제가 생겼을 때만)**

앱: `sudo bash deploy/ec2/rollback-release.sh <이전 release-id>`(`docs/DEPLOY.md` 「되돌리기」). 옛 앱은 새 표·함수를 부르지 않으므로 DB 는 그대로 둬도 된다. **표·함수를 지우지 않는다** — 지우면 그동안 적힌 비용 줄이 사라진다. 지워야 한다면 사용자에게 먼저 묻는다(`CLAUDE.md`). 스위치가 켜진 채 문제가 나면 SQL 로 끈다:

```sql
update app_settings set value = '0', updated_at = now() where key = 'ai_paused';
```

---

## 자체 점검(설계 대조)

| 설계 요구 | Task |
|---|---|
| §3.3 저장 `app_settings.ai_paused` 정확히 `'1'`/`'0'` | 9(RPC `case … '1' else '0'`)·7(`aiPausedFrom` 은 `"1"` 만)·10(액션은 `"1"`/`"0"` 만) |
| §3.3 관리자 화면(시스템 설정)에 스위치 하나 | 10 |
| §3.3 감사 `credit_admin_events` `ai_pause`/`ai_resume`, `target_ids='{}'`, 새 표 없음 | 9 |
| §3.3 막는 자리 둘 — `credit_reserve`(C1 끝) + 카드뉴스 상태 조회 → 기존 중지 경로 | 7(9 의 PG 시험이 스위치 → `credit_reserve` 멈춤을 실제로 본다) |
| §3.3 포스터 상태 조회는 막을 것 없음 · 관리자도 멈춤 · 도는 그림은 끝까지 — 화면에 적음 | 10(패널 문구)·9(관리자 계정도 `credit_reserve` 가 멈춤 — C1) |
| §3.3/§4 두 번째 겹·스위치 캐시·자동 멈춤 없음 | Global Constraints, 7(매 요청 DB 를 읽음) |
| §3.4 새 표 `ai_cost_events`(서비스 권한만, RLS, anon·authenticated 회수) + 칸 목록 | 1 |
| §3.4 fal 요청 id unique | 1(PG 시험 `the same fal request is written once`) |
| §3.4 AsyncLocalStorage `{userId, requestId, operation}` in `meter.ts` · 라우트 입구 + 상태 조회가 채움 · 생성 함수 인자 불변 | 2·3 |
| §3.4 글 AI 는 `recordLlmUsage` 한 곳, 계량기 없어도 적음 | 2 |
| §3.4 그림 — `queue.ts`·`pdp/fal.ts`·`redesign/image-generator.ts`·`ad/background.ts`, 제출 시점 | 4 |
| §3.4 패키지는 필수 콜백 — redesign `generate`·`transcribe`(필수로)·그림·임베딩, ingest 웹검색·Apify(앱 연결은 `source-adapters.ts`), 관리자 지식 올리기 | 5·6(타입 시험 `required-callbacks.test.ts`) |
| §3.4 금액 — 단가표×토큰, `model_prices`×장, Apify 응답 금액 없으면 1회 추정, 웹검색 도구 단가+토큰, STT 미설정이면 제외 | 1(그림)·2(글)·6(Apify·웹검색)·11 Step 2(STT 확인) |
| §3.4 쓰기 실패는 호출을 막지 않음 | 2 |
| §3.4 관리자 비용 화면 — 한국 시각, 오늘·이번 달·30일 일별, 공급자별·작업별, 스위치 같이, 새 RPC 만, 기존 `admin_cost_*` 불변 | 9·10 |
| §3.4 `generation_events` 원가 칸 그대로 · 총 비용 기준은 새 표 · 회원 목록 비용 칸 「옛 기준」 | 10 |
| §3.4 정확도 한계 문구 | 10 |
| §4 회원별 나눔·「추정 비율」·STT 단가·워커 변경 없음 | 10(화면에 없음)·6(워커 불변, `pnpm -r typecheck`) |
| §5 비용 기록 시험 — 한 번에 한 줄·계량기 밖·쓰기 실패·fal 제출 한 줄·같은 id 한 줄·콜백 필수(타입)·SDK 파일 목록 | 2·4·1·5·6·8 |
| §5 비용 화면 한국 시각 경계 | 9 |
| §5 카드뉴스 상태 조회: 스위치가 켜지면 제출하지 않고 중지·정산 | 7 |
| §6 C3: 마이그레이션(새 표) → 앱 · C4: 마이그레이션(새 RPC) → 앱 | 11(둘 다 먼저, 그다음 앱 한 번) |
| §7 공유 DB·쓰기 지연·새 호출 자리 | Global Constraints · 2(3초 한도) · 8 |
| §8 I-2(두 번째 겹 삭제) · I-8(문맥·한 곳·필수 콜백) · I-9(제출 시점·unique) · I-10(새 RPC 만·「옛 기준」) | 7 · 2·5·6 · 1·4 · 9·10 |

**설계와 다르게 정한 것(계획 수준 해석, 리뷰에서 판단):**

1. C3 마이그레이션은 「새 표」에 더해 **쓰는 함수 `ai_cost_record` 하나**를 함께 만든다 — 그림 값을 관리자가 고치는 `model_prices` 로 쓰는 순간에 매기려면 DB 가 한 번에 읽고 써야 한다. 새것만 더하므로 공유 DB 위험은 같다.
2. 작업 칸(`operation`)은 `generation_events.operation` 이 아니라 **예약 resource 에서 id 를 뺀 키**다(`sns:plan` 등). C2 가 새 작업 이름 대신 resource 로 기능을 갈라, 작업 이름만으로는 §3.1 「기능별 비용은 작업 칸으로 나눈다」를 지킬 수 없다.
3. `ai_cost_events.user_id` 는 `profiles` 에 묶지 않는다 — 회원을 지워도 회사가 낸 돈은 남아야 하고, 묶으면 모르는 id 한 줄 때문에 쓰기가 실패한다.
4. Apify 입구(`ingestYoutube`)의 콜백은 선택으로 남기고 안 넘기면 경고한다 — 「콜백 필수」와 「워커 코드 불변」(§4)을 함께 지키는 자리. 실제로 부르는 함수(`fetchApifyTranscript`)의 콜백은 필수다.
5. 포스터 상태 조회는 적을 호출이 없지만(결과 받기는 과금 없음) 설계 문구대로 문맥을 채운다.
