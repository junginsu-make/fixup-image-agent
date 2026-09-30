# AI 사용 통제 C1·C2 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 크레딧이 없거나 운영자가 AI 를 멈췄으면 회원이 부르는 모든 유료 AI 가 예약 단계에서 막히게 하고(C1), 지금 예약 없이 AI 를 부르는 네 길과 그 화면 호출을 같은 관문에 들인다(C2).

**Architecture:** DB 함수 `credit_reserve` 를 **인자·이름 그대로** 교체해 「AI 멈춤」·「크레딧 없음」·「CS 10회」·「CS 시간당」 검사를 넣는다(새 마이그레이션 하나, 칸·표 추가 없음). 앱은 새 거절 사유를 사람이 읽는 말·상태 코드로 옮기고, 예약 없던 네 라우트에 기존 작업 이름 + 제 `resource` 로 예약·정산을 붙이며, 화면 네 곳이 요청 식별자를 붙이게 한다. 포스터 기획은 비전 읽기를 예약 뒤로 옮기고 같은 그림을 한 번만 읽는다. 광고 내보내기는 배경 제거가 섞일 때만 `ad:export:cutout` 으로 표시한다.

**Tech Stack:** PostgreSQL(Supabase, plpgsql) · Next.js App Router 라우트(TypeScript) · vitest · node:test + 일회용 로컬 PostgreSQL(`scripts/lib/test-credit-postgres.mjs`)

**Spec:** `docs/superpowers/specs/2026-09-30-ai-usage-control-design.md` (승인됨, 개정 1). 이 계획은 §3.1·§3.2·§5·§6·§7·§8 중 C1·C2 몫을 구현한다. C3(비용 기록·카드뉴스 상태 조회의 스위치 확인)·C4(관리자 스위치 화면)·C5(비회원 모달·`/demo` 삭제)는 이 계획 밖이다.

**작업 시작 전(매 Task):** 설계 문서의 해당 절과 고칠 파일의 **현재 내용**을 다시 연다(사용자 규칙 `design-recheck`). 앞 Task 가 같은 파일을 바꿨을 수 있다.

## Global Constraints

- 새 작업 이름을 만들지 않는다. 네 자리의 작업 이름과 resource 는 이 표 그대로다(설계 §3.1):
  - 쉬운 만들기 판정 — `poster_image` — `easy:decide`
  - 카드뉴스 기획·원고 — `sns_image` — `sns:{id}:plan`
  - 카드뉴스 게시글 문구 — `sns_image` — `sns:{id}:caption`
  - 포스터 검수 — `poster_image` — `poster:{id}:review`
- 네 자리는 모두 `freeCreditPlan`(0크레딧, D1)이고 옛 단위(`units`)는 `0` 이다.
- 광고 내보내기 resource: 배경 제거가 섞일 때만 `ad:export:cutout`, 자르기·줄이기만이면 지금처럼 `ad:export`.
- `credit_reserve(uuid,uuid,text,integer[],text,integer)` 를 인자·이름 그대로 교체한다. `reserve_generation`·`credit_reserve_dispatch`·기존 `admin_cost_*` 는 새 마이그레이션에서 다시 정의하지 않는다. 칸·표를 더하지 않는다.
- 멈춤 저장: `app_settings` 키 `ai_paused`, 값 `'1'`/`'0'`. **행이 없거나 `'1'` 이 아니면 멈춘 것이 아니다.**
- 크레딧 없음 판단: `credit_wallet_state` 의 **`balance`(available+reserved)가 0 이하**. `available` 로 보지 않는다. `v_need>0` 인 작업도 같은 사유 `credits_required`.
- CS 10회 셀 행 = `operation='cs_ask' and coalesce(error_code,'') <> all(v_exempt_codes || 'invalid_request')` — 가입 후 통틀어(시간 조건 없음). `cs_failed` 는 센다.
- 검사 순서: 회원 상태·장부 계정·입력 → ★`ai_paused` → 중복 → ★`credits_required` → 동시 실행 → 시간당(`cs_ask` 추가) → 잔액 → 팀 한도.
- 사용자 문구(바꾸지 않는다):
  - `credits_required` → 403, 「크레딧이 없어 이 기능을 쓸 수 없습니다. 운영자에게 문의해 주세요(ai.dev@fixupworld.com).」
  - CS 10회 소진(같은 사유, 작업이 `cs_ask`) → 「무료 질문 10회를 모두 썼습니다. 크레딧을 받은 뒤 다시 이용해 주세요.」
  - `ai_paused` → 503, 「운영자가 AI 사용을 잠시 멈췄습니다. 잠시 후 다시 시도해 주세요.」
  - 둘 다 **다시 눌러도 안 풀리는 실패**(`retryable: false`).
- 배포 순서: **앱 먼저 → 그다음 마이그레이션**(설계 §6). `docs/DEPLOY.md` 의 기본 순서와 반대라 마이그레이션 첫머리에 ⚠ 로 적는다.
- 적용 전 확인 넷(설계 §6) 중 하나라도 어긋나면 멈춘다. 운영 반영은 사용자만 한다.
- 사용자 계정에 속한 것(릴리스·아티팩트·서버 파일·DB 행)을 묻지 않고 지우지 않는다(`CLAUDE.md`).

## Review Focus

1. **크레딧이 전부 만료된 회원**(지급 행은 있으나 `expires_at` 지남) — `balance` 가 0 이므로 `credits_required` 로 막혀야 한다. → Task 1 의 `expired credits are no balance`.
2. **이미지 작업이 크레딧을 몽땅 잡고 있는 회원**(`available=0`, `reserved>0`) — 그 사이 CS·게시글 문구·분석은 통과해야 한다. → Task 1 의 `credits held by a running image job still count as balance`.
3. **쉬운 만들기 도중 멈춤이 켜짐**(판정은 통과, 안쪽 기획이 503) — 화면이 「다시 시도」 단추를 내면 안 된다. 503 은 상태 코드만으로는 「잠시 뒤 다시」와 못 가른다. → Task 5 의 `안쪽 단계가 멈춤(503)으로 막히면 다시 시도를 안 낸다`.
4. **같은 그림을 「따라 만들기」와 「지키기」에 함께 붙인 포스터 기획** — 한 번만 읽고 예약 장수도 한 장으로 세야 한다. → Task 6 의 `uniqueById` 시험과 `예약 장수는 읽을 그림 수로 센다`.
5. **크레딧 0 회원의 상세페이지 일괄 만들기** — 전에는 `quota_exceeded` 로 멈췄는데 이제 사유가 `credits_required` 라, 목록에 안 넣으면 남은 섹션을 줄줄이 보내 같은 알림이 열 번 뜬다. → Task 2 의 `상세페이지 일괄 만들기` 시험.

## 파일 지도

| 파일 | 할 일 | Task |
|---|---|---|
| `supabase/migrations/202609300001_ai_usage_control.sql` | 새로 — `credit_reserve` 교체 + 유일성 검사 | 1 |
| `apps/web/lib/membership/__tests__/ai-usage-control-migration.test.ts` | 새로 — 정적 SQL 시험 | 1 |
| `scripts/tests/ai-usage-control.test.mjs` | 새로 — 실제 PostgreSQL 시험 | 1 |
| `package.json` | `test:credit-db` 에 새 시험 추가 | 1 |
| `apps/web/lib/membership/api.ts` | 새 사유 문구·상태·`retryable` | 2 |
| `apps/web/app/create/PdpEditor.tsx` | 일괄 만들기 멈춤 목록에 새 사유 둘 | 2 |
| `apps/web/lib/membership/__tests__/ai-control-reasons.test.ts` | 새로 | 2 |
| `apps/web/lib/llm/meter.ts` · `lib/llm/__tests__/meter.test.ts` | `llmSettleCost()` | 3 |
| `apps/web/app/api/sns/projects/[id]/plan/route.ts` · `caption/route.ts` | 예약·정산 | 3 |
| `apps/web/app/api/sns/__tests__/plan-caption-usage.test.ts` | 새로 | 3 |
| `apps/web/app/sns/new-client.tsx` · `app/sns/[id]/project-client.tsx` | 식별자 붙이기 | 3 |
| `apps/web/lib/__tests__/billable-new-routes.test.ts` | 새로(3), 포스터 줄 추가(4) | 3·4 |
| `apps/web/app/api/poster/projects/[id]/review/route.ts` · `__tests__/poster-review-route.test.ts` | 예약·정산 | 4 |
| `apps/web/app/poster/[id]/poster-client.tsx` | 검수 호출을 `billableRequest` 로 | 4 |
| `apps/web/app/api/easy/generate/route.ts` · `easy/__tests__/decide-usage.test.ts` | 판정 예약 | 5 |
| `apps/web/lib/poster/unique-by-id.ts` · `lib/poster/__tests__/unique-by-id.test.ts` | 새로 | 6 |
| `apps/web/app/api/poster/projects/[id]/plan/route.ts` | 예약을 읽기 앞으로, 중복 제거 | 6 |
| `apps/web/app/api/poster/__tests__/plan-people-wiring.test.ts` · `plan-reserve-order.test.ts` | 고치기·새로 | 6 |
| `apps/web/app/api/ad/export/route.ts` · `ad/__tests__/ad-export-route.test.ts` | resource 구분 | 7 |
| `apps/web/app/api/__tests__/paid-route-settle-contract.test.ts` | 계약 넓히기 | 8 |

## 검증 명령(모든 Task 공통)

```bash
# 저장소 뿌리에서
cd apps/web && npx tsc --noEmit && cd ../..          # 타입: 오류 0
cd apps/web && npx vitest run <그 Task 의 시험 파일들> && cd ../..
pnpm test:credit-db                                  # 실제 PostgreSQL(윈도우는 C:/Program Files/PostgreSQL/17/bin 필요, 없으면 TEST_PG_BIN)
pnpm lint                                            # = pnpm --filter @fixup/web lint
```

로컬 화면으로는 이 변경을 볼 수 없다 — 로컬은 인증 우회(`isLocalAuthBypass`)가 예약보다 먼저 지나가 예약이 돌지 않는다(`lib/membership/api.ts:79-81`). 확인은 시험과 배포 서버에서 한다(`CLAUDE.md`).

---

### Task 1: `credit_reserve` 교체 — 멈춤·크레딧 없음·CS 10회·CS 시간당 (C1 SQL)

**Files:**
- Create: `supabase/migrations/202609300001_ai_usage_control.sql`
- Create: `apps/web/lib/membership/__tests__/ai-usage-control-migration.test.ts`
- Create: `scripts/tests/ai-usage-control.test.mjs`
- Modify: `package.json:15` (`test:credit-db`)
- 본문 출처(바꾸지 않음): `supabase/migrations/202609280001_cs_ask_operation.sql:245-304` — 저장소에서 `credit_reserve` 를 마지막으로 정의한 판. `202609280003`·`202609290001` 은 본문을 안 바꿨다(확인함).

**Interfaces:**
- Consumes: 없음(첫 Task).
- Produces: `credit_reserve(...)` 가 돌려주는 jsonb 의 새 `reason` 두 값 — `'ai_paused'`, `'credits_required'`(둘 다 `usage` 를 싣는다). `app_settings` 키 `ai_paused`. 앱(Task 2)이 이 두 문자열을 그대로 쓴다.

- [ ] **Step 1: 정적 SQL 시험을 쓴다**

`apps/web/lib/membership/__tests__/ai-usage-control-migration.test.ts`:

```ts
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HOURLY_LIMITS } from "../hourly-limit";

/**
 * **크레딧이 없거나 운영자가 멈췄으면 AI 예약을 거절한다**(설계 2026-09-30 §3.2·§5).
 *
 * 이 시험은 마이그레이션 **글**을 읽는다. 실제로 돌려 보는 것은
 * `scripts/tests/ai-usage-control.test.mjs`(일회용 PostgreSQL)가 한다.
 *
 * 순서가 곧 규칙이다 — 멈춤이 중복보다 앞이어야 같은 열쇠로 다시 와도 멈춤을 말하고,
 * 크레딧 없음이 중복보다 뒤여야 이미 잡힌 요청에 「크레딧 없음」이라고 거짓말하지 않는다.
 */

const migrationsDir = fileURLToPath(new URL("../../../../../supabase/migrations/", import.meta.url));
const FILE = "202609300001_ai_usage_control.sql";

/** 주석을 걷어낸다. 이 저장소의 SQL 은 설명이 길어 단어가 코드로 오인된다. */
function code(name: string): string {
  return readFileSync(path.join(migrationsDir, name), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*--.*$/gm, "");
}

const ordered = readdirSync(migrationsDir).filter((name) => /^\d{12,14}_.*\.sql$/.test(name)).sort();

/** `credit_reserve` 를 마지막으로 정의한 본문. 그것이 운영에서 도는 동작이다. */
const latest = ordered
  .flatMap((file) =>
    [...code(file).matchAll(/create\s+or\s+replace\s+function\s+public\.credit_reserve\([\s\S]*?\$\$;/gi)]
      .map((match) => ({ file, body: match[0] })),
  )
  .at(-1);

const body = latest?.body ?? "";

function 자리(needle: string): number {
  const at = body.indexOf(needle);
  expect(at, `${needle} 을 찾지 못했다`).toBeGreaterThanOrEqual(0);
  return at;
}

describe("credit_reserve 마지막 판", () => {
  it("이 설계의 마이그레이션이 마지막으로 정의한다", () => {
    expect(latest?.file).toBe(FILE);
  });

  it("인자가 그대로다 — 하나라도 다르면 같은 이름 함수가 둘이 된다(42725)", () => {
    expect(body).toMatch(
      /^create or replace function public\.credit_reserve\(p_user uuid,p_request uuid,p_operation text,p_outputs integer\[\],p_resource text,p_analysis_limit integer default 10\)/,
    );
  });

  it("검사 순서가 설계 §3.2 와 같다", () => {
    const 순서 = [
      "'inactive_member'",
      "'credit_account_not_activated'",
      "'invalid_credit_quote'",
      "'ai_paused'",
      "'duplicate_request'",
      "'credits_required'",
      "'concurrent_limit'",
      "'analysis_rate_limit'",
      "'quota_exceeded'",
      "'team_quota_exceeded'",
    ].map(자리);
    expect(순서).toEqual([...순서].sort((a, b) => a - b));
  });

  it("멈춤은 app_settings 의 ai_paused 가 '1' 일 때만이다", () => {
    expect(body).toContain("exists(select 1 from app_settings where key='ai_paused' and value='1')");
  });

  it("크레딧 없음은 balance 로 본다 — available 로 보면 이미지가 잡은 동안 CS 가 막힌다", () => {
    expect(body).toContain("(v_state->>'balance')::integer<=0");
  });

  it("AI 없는 광고 내보내기는 멈춤·크레딧 없음 두 검사에서 모두 빠진다", () => {
    expect(body).toContain("v_no_ai boolean := p_operation='ad_export' and p_resource='ad:export';");
    expect(body).toMatch(/if not v_no_ai and exists\(select 1 from app_settings/);
    expect(body).toMatch(/if not v_no_ai and \(v_state->>'balance'\)/);
  });

  it("CS 셀 행은 시간당 면제 목록 + invalid_request 를 빼고, 기간 없이 센다", () => {
    const count = body.match(/select count\(\*\)::integer into v_cs_used[\s\S]*?;/);
    expect(count, "CS 를 세는 문장이 없다").toBeTruthy();
    expect(count![0]).toContain("operation='cs_ask'");
    expect(count![0]).toContain("coalesce(error_code,'') <> all (v_exempt_codes || array['invalid_request'])");
    expect(count![0], "「가입 후 통틀어」다 — 시간 조건이 붙으면 안 된다").not.toContain("interval");
    expect(body).toContain("if v_cs_used>=10 then");
  });

  it("시간당 한도를 두는 작업이 앱의 표와 같다 — cs_ask 가 장부 경로에서도 걸린다", () => {
    const branch = body.match(/if p_operation in \(([^)]*)\) then/);
    expect(branch, "시간당 갈래를 찾지 못했다").toBeTruthy();
    const counted = [...branch![1]!.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
    expect(counted.sort()).toEqual(Object.keys(HOURLY_LIMITS).sort());
  });
});

describe("이 마이그레이션이 건드리지 않는 것", () => {
  it("공유 DB 의 다른 함수를 다시 정의하지 않는다 — detail-page-studio 가 같이 쓴다", () => {
    expect(code(FILE)).not.toMatch(/function\s+public\.(reserve_generation|credit_reserve_dispatch|admin_cost_\w+)\s*\(/i);
  });

  it("칸·표를 더하지 않는다 — 함수 본문만 바꾼다", () => {
    expect(code(FILE)).not.toMatch(/\b(alter|create)\s+table\b/i);
  });
});
```

- [ ] **Step 2: 실제 PostgreSQL 시험을 쓴다**

`scripts/tests/ai-usage-control.test.mjs`:

```js
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testPostgres } from '../lib/test-credit-postgres.mjs';

/*
  202609300001 — AI 사용 통제 C1(설계 2026-09-30 §3.2·§5).

  크레딧이 없거나 운영자가 멈췄으면 AI 예약이 거절된다. 예외는 둘뿐이다 —
  AI 없는 광고 내보내기(`ad:export`)와, 크레딧 없는 회원의 도우미 물음 10회.
  정적 시험(`ai-usage-control-migration.test.ts`)은 글을 읽고, 이 파일은 실제로 돌린다.
*/
const MIGRATION = '202609300001_ai_usage_control.sql';
const admin = '90000000-0000-4000-8000-000000000001';
let db;
const json = async (q) => JSON.parse(await db.sql(q));

/** 회원 한 명. 가입 무료 크레딧이 없으므로(D4) 안 주면 0 이다. */
async function member(credits = 0) {
  const user = randomUUID();
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values('${user}','${user}@example.invalid',now());
    update profiles set status='active' where id='${user}';`);
  if (credits > 0) {
    await db.sql(`select credit_admin_grant('${user}','bonus',${credits},0,now()+interval '3 months','g-${randomUUID()}','fixture','${admin}');`);
  }
  return user;
}

/** 예약 한 번. 한도 값은 앱처럼 넘긴다(CS 60, `lib/membership/hourly-limit.ts`). */
function reserve(user, { operation = 'pdp_analyze', outputs = [], resource = 'test:free', request = randomUUID(), limit = 60 } = {}) {
  return json(`select credit_reserve('${user}','${request}','${operation}',array[${outputs.join(',')}]::integer[],'${resource}',${limit});`);
}
const setPause = (value) => db.sql(`insert into app_settings(key,value) values('ai_paused','${value}')
  on conflict (key) do update set value=excluded.value, updated_at=now();`);
const clearPause = () => db.sql(`delete from app_settings where key='ai_paused';`);

/** 도우미 물음을 n 번 잡는다. 모두 통과해야 한다. */
async function askTimes(user, n) {
  const requests = [];
  for (let i = 0; i < n; i += 1) {
    const request = randomUUID();
    const result = await reserve(user, { operation: 'cs_ask', resource: 'cs:ask', request });
    assert.equal(result.allowed, true, `${i + 1}번째 물음: ${JSON.stringify(result)}`);
    requests.push(request);
  }
  return requests;
}
/** 앱이 닫듯 닫는다. 실패 사유가 곧 셈 규칙의 입력이다. */
const close = (user, request, code) =>
  db.sql(`select credit_finalize('${user}','${request}',array[]::integer[],true,'${code}');`);

before(async () => {
  db = await testPostgres();
  // 새 파일은 커밋 전이라 git 목록에 없을 수 있다. 이름으로 함께 깐다.
  await db.migrate([MIGRATION]);
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values('${admin}','admin@example.invalid',now());
    update profiles set status='active',role='admin' where id='${admin}';`);
});
after(async () => { await db?.close(); });

test('credit_reserve is still one function with the same arguments', async () => {
  assert.equal(await db.sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='credit_reserve';`), '1');
  assert.equal(await db.sql(`select to_regprocedure('public.credit_reserve(uuid,uuid,text,integer[],text,integer)') is not null;`), 't');
});

test('the switch stops every AI reservation, administrators included', async () => {
  const rich = await member(100);
  await db.sql(`select credit_admin_grant('${admin}','bonus',1000,0,now()+interval '3 months','g-${randomUUID()}','fixture','${admin}');`);
  await setPause('1');
  try {
    for (const [user, operation, outputs, resource] of [
      [rich, 'poster_image', [1], 'poster:p1'],
      [rich, 'cs_ask', [], 'cs:ask'],
      [admin, 'pdp_analyze', [], 'pdp:analyze'],
    ]) {
      const result = await reserve(user, { operation, outputs, resource });
      assert.equal(result.allowed, false, JSON.stringify(result));
      assert.equal(result.reason, 'ai_paused');
    }
  } finally { await clearPause(); }
});

test('only the value 1 pauses; no row or 0 does not', async () => {
  const rich = await member(10);
  assert.equal((await reserve(rich)).allowed, true);
  await setPause('0');
  try { assert.equal((await reserve(rich)).allowed, true); } finally { await clearPause(); }
});

test('member checks run before the switch', async () => {
  const gone = await member(10);
  await db.sql(`update profiles set status='suspended' where id='${gone}';`);
  await setPause('1');
  try { assert.equal((await reserve(gone)).reason, 'inactive_member'); } finally { await clearPause(); }
});

test('the switch comes before duplicate detection', async () => {
  const rich = await member(10);
  const request = randomUUID();
  assert.equal((await reserve(rich, { request })).allowed, true);
  await setPause('1');
  try { assert.equal((await reserve(rich, { request })).reason, 'ai_paused'); } finally { await clearPause(); }
  assert.equal((await reserve(rich, { request })).reason, 'duplicate_request');
});

test('AI-free ad export passes the switch and an empty wallet; a cutout does not', async () => {
  const empty = await member(0);
  await setPause('1');
  try {
    assert.equal((await reserve(empty, { operation: 'ad_export', resource: 'ad:export' })).allowed, true);
    assert.equal((await reserve(empty, { operation: 'ad_export', resource: 'ad:export:cutout' })).reason, 'ai_paused');
  } finally { await clearPause(); }
  assert.equal((await reserve(empty, { operation: 'ad_export', resource: 'ad:export' })).allowed, true);
  assert.equal((await reserve(empty, { operation: 'ad_export', resource: 'ad:export:cutout' })).reason, 'credits_required');
});

test('an empty wallet refuses free AI work', async () => {
  const empty = await member(0);
  for (const [operation, resource] of [['pdp_analyze', 'pdp:analyze'], ['sns_image', 'sns:p1:plan'], ['poster_image', 'easy:decide']]) {
    const result = await reserve(empty, { operation, resource });
    assert.equal(result.reason, 'credits_required', `${operation}: ${JSON.stringify(result)}`);
  }
});

test('an empty wallet refuses image work with the same reason, not quota_exceeded', async () => {
  const empty = await member(0);
  const result = await reserve(empty, { operation: 'poster_image', outputs: [1], resource: 'poster:p1' });
  assert.equal(result.reason, 'credits_required');
});

test('the app path (dispatch) carries the new reason', async () => {
  const empty = await member(0);
  const result = await json(`select credit_reserve_dispatch('${empty}','${randomUUID()}','pdp_analyze',0,10,array[]::integer[],'pdp:analyze');`);
  assert.equal(result.reason, 'credits_required');
});

test('duplicate detection comes before the empty wallet', async () => {
  const empty = await member(0);
  const request = randomUUID();
  assert.equal((await reserve(empty, { operation: 'cs_ask', resource: 'cs:ask', request })).allowed, true);
  assert.equal((await reserve(empty, { request })).reason, 'duplicate_request');
});

test('credits held by a running image job still count as balance', async () => {
  const one = await member(1);
  assert.equal((await reserve(one, { operation: 'poster_image', outputs: [1], resource: 'poster:p1' })).allowed, true);
  const wallet = await json(`select credit_wallet_state('${one}');`);
  assert.equal(wallet.available, 0);
  assert.equal(wallet.balance, 1);
  assert.equal((await reserve(one, { operation: 'cs_ask', resource: 'cs:ask' })).allowed, true);
  assert.equal((await reserve(one, { operation: 'sns_image', resource: 'sns:p1:caption' })).allowed, true);
});

test('expired credits are no balance', async () => {
  const lapsed = await member(5);
  await db.sql(`update credit_grants set granted_at=now()-interval '2 days',expires_at=now()-interval '1 day' where user_id='${lapsed}';`);
  assert.equal((await reserve(lapsed)).reason, 'credits_required');
});

test('without credits the assistant answers ten times in a lifetime, not per hour', async () => {
  const empty = await member(0);
  await askTimes(empty, 10);
  // 한 시간 창 밖으로 밀어도 센다 — 「가입 후 통틀어」다.
  await db.sql(`update generation_events set created_at=now()-interval '2 days' where user_id='${empty}';`);
  assert.equal((await reserve(empty, { operation: 'cs_ask', resource: 'cs:ask' })).reason, 'credits_required');
});

test('a failed answer counts; a malformed question and exempt provider failures do not', async () => {
  const empty = await member(0);
  const asked = await askTimes(empty, 10);
  const next = () => reserve(empty, { operation: 'cs_ask', resource: 'cs:ask' });

  await close(empty, asked[0], 'cs_failed');
  assert.equal((await next()).reason, 'credits_required', 'cs_failed 는 모델 값이 나갔을 수 있어 센다');

  await close(empty, asked[1], 'invalid_request');
  assert.equal((await next()).allowed, true, '모델을 부르기 전 본문 오류는 안 센다');
  assert.equal((await next()).reason, 'credits_required');

  await close(empty, asked[2], 'AI_KEY_MISSING');
  assert.equal((await next()).allowed, true, '시간당 면제 목록의 실패도 안 센다');
  assert.equal((await next()).reason, 'credits_required');
});

test('with at least one credit the ten-question rule does not apply', async () => {
  const one = await member(1);
  await askTimes(one, 12);
});

test('the assistant hourly limit now applies on the ledger path', async () => {
  const rich = await member(10);
  for (let i = 0; i < 2; i += 1) {
    assert.equal((await reserve(rich, { operation: 'cs_ask', resource: 'cs:ask', limit: 2 })).allowed, true);
  }
  assert.equal((await reserve(rich, { operation: 'cs_ask', resource: 'cs:ask', limit: 2 })).reason, 'analysis_rate_limit');
});

test('a member session still cannot call it', async () => {
  const empty = await member(0);
  await assert.rejects(
    db.sql(`begin; set local role authenticated; select credit_reserve('${empty}','${randomUUID()}','cs_ask',array[]::integer[],'cs:ask',60); commit;`),
    /permission denied for function credit_reserve/,
  );
});
```

`package.json:15` 의 `test:credit-db` 끝에 새 파일을 붙인다:

```json
    "test:credit-db": "node --test scripts/tests/credit-ledger.test.mjs scripts/tests/credit-activate.test.mjs scripts/tests/credit-plan-delete.test.mjs scripts/tests/member-profile.test.mjs scripts/tests/reference-own-only.test.mjs scripts/tests/restart-orphans.test.mjs scripts/tests/ai-usage-control.test.mjs"
```

- [ ] **Step 3: 두 시험이 실패하는지 본다**

Run: `cd apps/web && npx vitest run lib/membership/__tests__/ai-usage-control-migration.test.ts`
Expected: FAIL — `readFileSync` 가 `202609300001_ai_usage_control.sql` 을 못 찾는다(ENOENT), 또는 `latest?.file` 이 `202609280001_cs_ask_operation.sql`.

Run: `node --test scripts/tests/ai-usage-control.test.mjs`
Expected: FAIL — `Migration 202609300001_ai_usage_control.sql: ENOENT`.

- [ ] **Step 4: 마이그레이션을 쓴다**

`supabase/migrations/202609300001_ai_usage_control.sql` — 본문은 `202609280001:245-304` 를 **글자 그대로** 옮기고 ★ 자리만 더했다. 주석 줄은 줄 첫머리에 `--` 로 둔다(정적 시험이 줄 첫머리 주석만 걷어낸다).

```sql
-- ════════════════════════════════════════════════════════════════════
--  AI 사용 통제 C1 — 멈춤 · 크레딧 없음 · CS 10회 · CS 시간당
--  (설계 docs/superpowers/specs/2026-09-30-ai-usage-control-design.md §3.2)
--
--  ⚠ **순서: 코드 배포를 먼저, 이 SQL 을 그다음에.** docs/DEPLOY.md 의 기본
--    순서(표부터)와 반대다. 이 파일은 칸·표를 더하지 않으므로 코드가 먼저
--    나가도 깨지는 것이 없다. 반대로 이 SQL 이 먼저면 옛 코드가 새 사유를 몰라
--    「요청을 처리할 수 없습니다」(409)만 보인다.
--
--  ⚠ 적용 전 확인 넷(설계 §6) — 하나라도 어긋나면 멈춘다.
--    1. 운영 credit_reserve 가 저장소 판(202609280001)과 같다
--    2. 장부 계정(credit_accounts) 없는 active 회원이 0 명
--    3. 서버 CREDIT_LEDGER=1
--    4. 관리자 두 계정이 모두 무제한(credit_is_unlimited)
--
--  ── 무엇을 바꾸나 ─────────────────────────────────────────────────
--
--  credit_reserve 하나만, **인자·이름 그대로** 교체한다. 인자가 하나라도
--  다르면 같은 이름 함수가 둘이 되어 모든 예약이 42725 로 막힌다(202609280003).
--  본문은 202609280001 판을 그대로 옮기고 ★ 자리만 더했다.
--
--    ★ AI 멈춤      app_settings.ai_paused='1' 이면 'ai_paused'. 관리자도 멈춘다
--    ★ 크레딧 없음  잔액(available+reserved)이 0 이하면 'credits_required'
--                   예외 — AI 없는 광고 내보내기(ad_export + 'ad:export')
--                        — CS 도우미(cs_ask)는 가입 후 통틀어 10건까지
--    ★ 시간당 한도 목록에 cs_ask (앱은 이미 CS_ASK_HOURLY_LIMIT 을 넘긴다)
--
--  공유 DB 의 다른 함수(옛 예약 함수·장부 분기 함수·비용 집계)는 건드리지
--  않는다 — detail-page-studio 가 같은 DB 를 쓴다.
--
--  여러 번 돌려도 같다.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.credit_reserve(p_user uuid,p_request uuid,p_operation text,p_outputs integer[],p_resource text,p_analysis_limit integer default 10)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p profiles%rowtype; g credit_grants%rowtype; v_need integer; v_left integer; v_take integer; v_team uuid; v_cap integer; v_team_used integer; v_state jsonb;
  v_analysis_limit integer := least(greatest(p_analysis_limit,1),1000); v_recent integer;
  -- 모델이 일한 흔적이 없는 실패. 202609200002 의 목록과 같아야 한다.
  v_exempt_codes text[] := array['AI_KEY_MISSING','AI_KEY_INVALID','AI_MODEL_ACCESS_DENIED','AI_QUOTA_EXCEEDED','AI_PROVIDER_UNAVAILABLE','INVALID_IMAGE_PAYLOAD','reservation_expired'];
  -- ★ AI 를 부르지 않는 단 하나의 예약 — 광고 내보내기의 자르기·줄이기(설계 §3.1).
  v_no_ai boolean := p_operation='ad_export' and p_resource='ad:export';
  -- ★ 크레딧 없는 회원이 가입 후 통틀어 쓴 도우미 물음 수(설계 §3.2).
  v_cs_used integer;
begin
  perform credit_lock();
  select * into p from profiles where id=p_user for update;
  if not found or p.status<>'active' or p.email_confirmed_at is null then return jsonb_build_object('allowed',false,'reason','inactive_member'); end if;
  if not exists(select 1 from credit_accounts where user_id=p_user) then return jsonb_build_object('allowed',false,'reason','credit_account_not_activated'); end if;
  if p_request is null or p_operation not in ('pdp_analyze','reference_analyze','redesign_transcribe','pdp_image','redesign_generate','redesign_edit','poster_image','sns_image','ad_export','cs_ask') or p_outputs is null or cardinality(p_outputs)>60 or exists(select 1 from unnest(p_outputs) u where u is null or u not in(1,2)) or length(trim(coalesce(p_resource,'')))=0 then raise exception 'invalid_credit_quote'; end if;
  select coalesce(sum(u),0)::integer into v_need from unnest(p_outputs) u;
  if v_need>max_reserve_units() then return jsonb_build_object('allowed',false,'reason','invalid_request'); end if;
  perform credit_ensure_paid_period(p_user); v_state:=credit_wallet_state(p_user);
  /*
    ★ **AI 멈춤**(설계 §3.2 의 2번, §3.3). 관리자도 예외가 없다 — 「시스템 전체」다.
    행이 없거나 값이 '1' 이 아니면 멈춘 것이 아니다. 스위치 화면은 C4 에서 붙는다.
    중복 검사보다 앞이다 — 같은 열쇠로 다시 와도 「멈췄다」를 말해야 한다.
  */
  if not v_no_ai and exists(select 1 from app_settings where key='ai_paused' and value='1') then return jsonb_build_object('allowed',false,'reason','ai_paused','usage',v_state); end if;
  if exists(select 1 from generation_events where user_id=p_user and request_id=p_request) then return jsonb_build_object('allowed',false,'reason','duplicate_request','usage',v_state); end if;
  /*
    ★ **크레딧이 없으면 AI 를 못 쓴다**(설계 §3.2 의 4번, D5·D6).

    `available` 이 아니라 `balance`(available+reserved)로 본다. 이미지 작업이
    크레딧을 전부 잡고 있는 동안 CS·게시글 문구가 막히면 안 된다.
    `v_need>0` 인 작업도 같은 사유다 — 잔액 0 에서 「크레딧이 모자랍니다」와
    문구가 갈리지 않게.

    CS 도우미는 크레딧이 없어도 가입 후 통틀어 10번까지 묻는다. 세는 규칙은
    시간당 한도와 같고 `invalid_request`(모델을 부르기 전 본문 오류)만 더 뺀다.
    `cs_failed` 는 센다 — CS 라우트는 모든 예외를 이것으로 닫아 제공사 오류를
    가를 수 없고, 모델 값이 이미 나갔을 수 있다.
  */
  if not v_no_ai and (v_state->>'balance')::integer<=0 then
    if p_operation='cs_ask' and v_need=0 then
      select count(*)::integer into v_cs_used from generation_events
        where user_id=p_user and operation='cs_ask'
          and coalesce(error_code,'') <> all (v_exempt_codes || array['invalid_request']);
      if v_cs_used>=10 then return jsonb_build_object('allowed',false,'reason','credits_required','usage',v_state); end if;
    else
      return jsonb_build_object('allowed',false,'reason','credits_required','usage',v_state);
    end if;
  end if;
  -- Holding credits and blocking the member are different decisions. A hold survives expiry and
  -- settlement review by design; the block must not, or an abandoned request locks the account
  -- until an administrator notices. Only a live, unreviewed request blocks the next one.
  if v_need>0 and exists(select 1 from generation_events where user_id=p_user and pricing_policy='image-v2' and status='reserved' and requested_units>0 and expires_at>now() and credit_phase is distinct from 'needs_review') then return jsonb_build_object('allowed',false,'reason','concurrent_limit','usage',v_state); end if;
  /*
    **시간당 한도는 작업 종류별로 센다.** 한도 값은 앱이 넣어 준다
    (`lib/membership/hourly-limit.ts`). 옛 경로와 같은 계약이라야 한다 — 정책
    스위치 하나로 회원이 다른 한도를 받으면 안 된다(202609200002).
    ★ cs_ask 를 더했다. 앱은 이미 CS_ASK_HOURLY_LIMIT 을 넘기고 있었는데 이
    목록에 없어 장부 경로에서는 걸리지 않았다(설계 §2).
  */
  if p_operation in ('pdp_analyze','reference_analyze','redesign_transcribe','cs_ask') then
    -- 값이 나간 시도만 센다. 아직 안 닫힌 행(error_code is null)은 센다.
    select count(*)::integer into v_recent from generation_events
      where user_id=p_user and operation=p_operation and created_at>now()-interval '1 hour'
        and coalesce(error_code,'') <> all (v_exempt_codes);
    if v_recent>=v_analysis_limit then return jsonb_build_object('allowed',false,'reason','analysis_rate_limit','usage',v_state); end if;
    -- 남용 천장. 면제받은 실패도 서버를 쓴다. 정상 사용은 여기 닿지 않는다.
    select count(*)::integer into v_recent from generation_events
      where user_id=p_user and operation=p_operation and created_at>now()-interval '1 hour';
    if v_recent>=v_analysis_limit*10 then return jsonb_build_object('allowed',false,'reason','analysis_abuse_limit','usage',v_state); end if;
  end if;
  if (v_state->>'available')::integer<v_need then return jsonb_build_object('allowed',false,'reason','quota_exceeded','usage',v_state); end if;
  select tm.team_id into v_team from team_members tm where tm.user_id=p_user;
  if v_team is not null then
    select monthly_quota into v_cap from teams where id=v_team and deleted_at is null;
    if v_cap>0 then
      select coalesce(sum(case when status='succeeded' then consumed_units when status='reserved' then requested_units else 0 end),0)::integer into v_team_used
        from generation_events where team_id=v_team and pricing_policy='image-v2' and period_start=credit_period_start();
      v_team_used:=v_team_used+coalesce((select case when credit_opening_period=credit_period_start() then credit_opening_used else 0 end from teams where id=v_team),0);
      if v_team_used+v_need>v_cap then return jsonb_build_object('allowed',false,'reason','team_quota_exceeded','usage',v_state); end if;
    end if;
  end if;
  insert into generation_events(user_id,request_id,operation,period_start,requested_units,expires_at,team_id,pricing_policy,credit_quote,credit_phase)
    values(p_user,p_request,p_operation,credit_period_start(),v_need,now()+interval '10 minutes',v_team,'image-v2',jsonb_build_object('policy','image-v2','version','2026-09-22.1','outputs',to_jsonb(p_outputs),'resource',p_resource),'reserved');
  v_left:=v_need;
  for g in select * from credit_grants where user_id=p_user and revoked_at is null and expires_at>now() and granted_units-consumed_units-reserved_units>0 order by expires_at,granted_at,id for update loop
    exit when v_left=0;
    v_take:=least(v_left,g.granted_units-g.consumed_units-g.reserved_units);
    update credit_grants set reserved_units=reserved_units+v_take where id=g.id;
    insert into credit_holds(user_id,request_id,grant_id,units) values(p_user,p_request,g.id,v_take);
    v_left:=v_left-v_take;
  end loop;
  if v_left<>0 then raise exception 'credit_reservation_invariant'; end if;
  return jsonb_build_object('allowed',true,'reason','ok','usage',credit_wallet_state(p_user),'policy','image-v2');
end $$;

-- 권한은 create or replace 가 지킨다. 읽는 사람을 위해 한 번 더 적는다(202609280003 과 같다).
revoke all on function public.credit_reserve(uuid,uuid,text,integer[],text,integer) from public, anon, authenticated;
grant execute on function public.credit_reserve(uuid,uuid,text,integer[],text,integer) to service_role;

-- ── 하나인지 센다(202609280003 부터의 규칙, sql-function-unique.test.ts) ──
do $$
declare v_몇 integer;
begin
  select count(*)::integer into v_몇
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'credit_reserve';
  if v_몇 <> 1 then
    raise exception 'credit_reserve 가 %개입니다. 하나여야 합니다 — 인자 목록이 어긋난 판이 생겼습니다(42725).', v_몇;
  end if;
  if to_regprocedure('public.credit_reserve(uuid,uuid,text,integer[],text,integer)') is null then
    raise exception '정본 credit_reserve(uuid,uuid,text,integer[],text,integer) 가 없습니다.';
  end if;
  raise notice 'credit_reserve 는 하나이고 인자도 그대로입니다.';
end $$;

-- ── 확인 ─────────────────────────────────────────────────────────────
--
-- select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--  where n.nspname='public' and p.proname='credit_reserve';
--   → 한 줄. credit_reserve(uuid,uuid,text,integer[],text,integer)
-- select key, value from app_settings where key='ai_paused';
--   → 없거나 '0' 이어야 한다. '1' 이면 모든 AI 가 멈춰 있다.
```

주의: `v_exempt_codes || 'invalid_request'`(설계의 표기)는 PostgreSQL 이 `'invalid_request'` 를 배열 글자로 읽으려다 `malformed array literal` 로 실패한다. 그래서 `|| array['invalid_request']` 로 쓴다. 뜻은 같다.

- [ ] **Step 5: 시험이 통과하는지 본다**

Run: `cd apps/web && npx vitest run lib/membership/__tests__/ai-usage-control-migration.test.ts lib/membership/__tests__/sql-function-unique.test.ts lib/teams/__tests__/reserve-operation-whitelist.test.ts lib/membership/__tests__/hourly-limit.test.ts lib/membership/__tests__/analysis-quota-migration.test.ts`
Expected: PASS(전부). `sql-function-unique` 는 새 파일이 `pg_proc`·`count(*)`·`raise exception` 을 가졌는지 본다. 화이트리스트 시험은 새 본문의 `p_operation not in (...)` 을 본다.

Run: `node --test scripts/tests/ai-usage-control.test.mjs`
Expected: `# pass 17`, `# fail 0`.

Run: `git add supabase/migrations/202609300001_ai_usage_control.sql && pnpm test:credit-db`
Expected: 모든 파일 PASS. `git add` 를 먼저 하는 까닭 — 다른 시험 파일(`restart-orphans` 등)은 `git ls-files` 로 마이그레이션을 고르므로, 새 파일이 목록에 들어가야 새 본문 위에서도 도는지 확인된다. `credit-activate`·`credit-ledger` 는 `202609220002` 까지만 까므로 이 파일과 무관하다(`credit-activate` 의 「크레딧 없어도 분석은 된다」는 옮기기 직후의 옛 세상을 시험하는 것이라 그대로 둔다).

Run: `cd apps/web && npx tsc --noEmit` → 오류 0. `pnpm lint` → 오류 0.

- [ ] **Step 6: 뮤테이션으로 시험이 잡는지 본다(빨강-초록)**

`202609300001_ai_usage_control.sql` 의 `(v_state->>'balance')::integer<=0` 을 `(v_state->>'available')::integer<=0` 으로 잠시 바꾼다.
Run: `node --test scripts/tests/ai-usage-control.test.mjs` → `credits held by a running image job still count as balance` 가 FAIL.
Run: `cd apps/web && npx vitest run lib/membership/__tests__/ai-usage-control-migration.test.ts` → `크레딧 없음은 balance 로 본다` 가 FAIL.
되돌리고(`git checkout -- supabase/migrations/202609300001_ai_usage_control.sql` 는 아직 커밋 전이므로 쓰지 말고 손으로 되돌린다) 두 명령이 다시 PASS 인지 본다.

- [ ] **Step 7: 커밋**

```bash
git add supabase/migrations/202609300001_ai_usage_control.sql apps/web/lib/membership/__tests__/ai-usage-control-migration.test.ts scripts/tests/ai-usage-control.test.mjs package.json
git commit -m "feat(credit): 크레딧이 없거나 멈췄으면 AI 예약을 거절한다

credit_reserve 를 인자 그대로 교체한다. ai_paused · credits_required(balance 기준) ·
CS 10회(가입 후 통틀어) · CS 시간당. AI 없는 광고 내보내기만 두 검사에서 뺀다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 새 거절 사유를 사람이 읽는 말·상태로 옮긴다

**Files:**
- Modify: `apps/web/lib/membership/api.ts:127-163` (거절 사유 표·상태), `:439-446` (`membershipApiError`)
- Modify: `apps/web/app/create/PdpEditor.tsx:1696-1707` (`stopBatch` 목록)
- Create: `apps/web/lib/membership/__tests__/ai-control-reasons.test.ts`

**Interfaces:**
- Consumes: Task 1 의 사유 문자열 `'credits_required'`, `'ai_paused'`.
- Produces:
  - `membershipApiError(status: number, code: string, message: string, usage?: UsageSummary, retryable?: boolean): Response` — `retryable` 을 주면 본문에 `retryable` 칸이 실리고, 안 주면 칸이 없다(옛 응답 그대로).
  - `reserveAiUsage` 거절 응답: `credits_required` → 403, `ai_paused` → 503, 둘 다 본문 `{ ok:false, code, message, error, usage, retryable:false }`. 다른 사유는 그대로(429/409, `retryable` 칸 없음).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/lib/membership/__tests__/ai-control-reasons.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerationOperation } from "../types";

/**
 * **크레딧 없음·AI 멈춤을 사용자가 읽는 말로 옮긴다**(설계 2026-09-30 §3.2).
 *
 * 둘 다 다시 눌러도 안 풀린다. 화면(쉬운 만들기)이 「다시 시도」를 안 내도록
 * `retryable: false` 를 싣는다. 옛 사유의 응답 모양은 바꾸지 않는다.
 */
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ reply: {} as Record<string, unknown> }));

vi.mock("../../supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
    from: () => {
      const self: Record<string, unknown> = {
        select: () => self, eq: () => self,
        single: async () => ({ data: { id: "u1", email_confirmed_at: "2026-01-01", status: "active", role: "member" } }),
        maybeSingle: async () => ({ data: { id: "u1", email_confirmed_at: "2026-01-01", status: "active", role: "member" } }),
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
vi.mock("../../dev-auth", () => ({ isLocalAuthBypass: false, devMemberProfile: { id: "u1" }, devUsageSummary: {} }));
vi.mock("../../access/core", () => ({ hasFullScope: () => true, viewerFrom: () => ({}) }));

const { reserveAiUsage } = await import("../api");
const REQUEST = "33333333-3333-4333-8333-333333333333";
const req = () => new Request("http://local/api/x", { headers: { "x-idempotency-key": REQUEST } });

async function refused(operation: GenerationOperation, reason: string) {
  state.reply = { allowed: false, reason, usage: { pricing_policy: "image-v2", balance: 0, available: 0, reserved: 0, used: 0 } };
  const result = await reserveAiUsage(req(), operation, 0, { outputs: [], resource: "test:free" });
  if (result.ok) throw new Error("거절돼야 한다");
  return { status: result.response.status, body: await result.response.json() };
}

beforeEach(() => { process.env.CREDIT_LEDGER = "1"; });

describe("크레딧이 없으면", () => {
  it("403 과 연락처가 든 말을 주고, 다시 눌러도 안 풀린다고 알린다", async () => {
    const { status, body } = await refused("pdp_analyze", "credits_required");
    expect(status).toBe(403);
    expect(body.code).toBe("credits_required");
    expect(body.message).toBe("크레딧이 없어 이 기능을 쓸 수 없습니다. 운영자에게 문의해 주세요(ai.dev@fixupworld.com).");
    expect(body.retryable).toBe(false);
  });

  it("도우미 물음이면 무료 10회를 다 썼다고 말한다", async () => {
    const { status, body } = await refused("cs_ask", "credits_required");
    expect(status).toBe(403);
    expect(body.message).toBe("무료 질문 10회를 모두 썼습니다. 크레딧을 받은 뒤 다시 이용해 주세요.");
    expect(body.retryable).toBe(false);
  });
});

describe("운영자가 멈췄으면", () => {
  it("503 과 멈춤 말을 주고, 다시 눌러도 안 풀린다고 알린다", async () => {
    const { status, body } = await refused("poster_image", "ai_paused");
    expect(status).toBe(503);
    expect(body.code).toBe("ai_paused");
    expect(body.message).toBe("운영자가 AI 사용을 잠시 멈췄습니다. 잠시 후 다시 시도해 주세요.");
    expect(body.retryable).toBe(false);
  });
});

describe("옛 사유는 그대로다", () => {
  it("크레딧 모자람은 429 이고 retryable 칸을 싣지 않는다", async () => {
    const { status, body } = await refused("poster_image", "quota_exceeded");
    expect(status).toBe(429);
    expect(body).not.toHaveProperty("retryable");
  });
});

describe("상세페이지 일괄 만들기", () => {
  /**
   * **남은 섹션을 줄줄이 보내지 않는다.** 크레딧 0 회원은 전에 `quota_exceeded` 로
   * 멈췄다. 이제 사유가 `credits_required` 라, 목록에 없으면 섹션마다 같은 알림이 뜬다.
   */
  it("크레딧 없음·멈춤이면 일괄을 멈춘다", () => {
    const editor = readFileSync(new URL("../../../app/create/PdpEditor.tsx", import.meta.url), "utf8");
    const list = editor.match(/stopBatch: \[([\s\S]*?)\]\.includes\(responseCode\)/);
    expect(list, "stopBatch 목록을 못 찾았다").toBeTruthy();
    expect(list![1]).toContain('"credits_required"');
    expect(list![1]).toContain('"ai_paused"');
  });
});
```

- [ ] **Step 2: 실패하는지 본다**

Run: `cd apps/web && npx vitest run lib/membership/__tests__/ai-control-reasons.test.ts`
Expected: FAIL — `credits_required` 가 409 에 「요청을 처리할 수 없습니다.」, `stopBatch` 목록에 `"credits_required"` 없음.

- [ ] **Step 3: `api.ts` 를 고친다**

`apps/web/lib/membership/api.ts` — `export async function reserveAiUsage` 바로 위(66줄 뒤)에 둔다:

```ts
/**
 * **크레딧이 없거나 운영자가 멈췄다**(설계 2026-09-30 §3.2). 문구는 설계 그대로다.
 * 크레딧은 당분간 관리자가 손으로 준다(D4) — 그래서 연락처를 싣는다.
 */
const CREDITS_REQUIRED_MESSAGE = "크레딧이 없어 이 기능을 쓸 수 없습니다. 운영자에게 문의해 주세요(ai.dev@fixupworld.com).";
const CS_FREE_USED_MESSAGE = "무료 질문 10회를 모두 썼습니다. 크레딧을 받은 뒤 다시 이용해 주세요.";
const AI_PAUSED_MESSAGE = "운영자가 AI 사용을 잠시 멈췄습니다. 잠시 후 다시 시도해 주세요.";

/**
 * **다시 눌러도 안 풀리는 거절.** 화면이 「다시 시도」를 안 내도록 본문에 적는다
 * (쉬운 만들기의 `retryable`, `app/easy/easy-client.tsx:324-333`). 멈춤(503)은 상태
 * 코드만으로는 「잠시 뒤 다시」와 가를 수 없어 코드가 아니라 본문으로 알린다.
 */
const NOT_RETRYABLE_REASONS = new Set(["credits_required", "ai_paused"]);
```

`messages` 표(128-144줄)의 `credit_ledger_required` 줄 뒤에 두 줄을 더한다:

```ts
      credit_ledger_required: "새 크레딧 처리가 준비 중입니다. 잠시 후 다시 시도해 주세요.",
      // CS 도우미는 크레딧이 없어도 가입 후 10번까지 묻는다 — 그 10번을 다 쓴 것이다.
      credits_required: operation === "cs_ask" ? CS_FREE_USED_MESSAGE : CREDITS_REQUIRED_MESSAGE,
      ai_paused: AI_PAUSED_MESSAGE,
    };
```

158-163줄(상태와 반환)을 이것으로 바꾼다:

```ts
    const status = row.reason === "ai_paused"
      ? 503
      : row.reason === "credits_required"
        ? 403
        : ["quota_exceeded", "team_quota_exceeded", "concurrent_limit", "analysis_rate_limit", "analysis_abuse_limit"]
          .includes(row.reason) ? 429 : 409;
    return {
      ok: false,
      response: membershipApiError(
        status, row.reason, message, usage,
        NOT_RETRYABLE_REASONS.has(row.reason) ? false : undefined,
      ),
    };
```

439-446줄 `membershipApiError` 를 이것으로 바꾼다:

```ts
export function membershipApiError(
  status: number,
  code: string,
  message: string,
  usage?: UsageSummary,
  retryable?: boolean,
) {
  // `retryable` 은 줄 때만 싣는다. 옛 응답 모양은 그대로 둔다.
  return Response.json(
    { ok: false, code, message, error: message, usage, ...(retryable === undefined ? {} : { retryable }) },
    { status },
  );
}
```

- [ ] **Step 4: `PdpEditor.tsx` 의 멈춤 목록에 두 사유를 더한다**

`apps/web/app/create/PdpEditor.tsx:1696-1707` 의 `stopBatch: [ … ]` 에서 `"team_quota_exceeded",` 줄 뒤에 넣는다:

```tsx
            "team_quota_exceeded",
            // 크레딧이 없거나 운영자가 멈췄다. 남은 섹션도 똑같이 막힌다(설계 2026-09-30 §3.2).
            "credits_required",
            "ai_paused",
```

- [ ] **Step 5: 통과하는지 본다**

Run: `cd apps/web && npx vitest run lib/membership/__tests__/ai-control-reasons.test.ts lib/membership/__tests__/boot-tag.test.ts lib/membership/__tests__/duplicate-request.test.ts app/create/__tests__/job-recovery.test.ts`
Expected: PASS.
Run: `cd apps/web && npx tsc --noEmit` → 오류 0. `pnpm lint` → 오류 0.

- [ ] **Step 6: 화면이 서버 문구를 그대로 보이는지 확인한 결과(설계 §3.2 「계획에서 확인」)**

코드를 읽어 확인했다. 이 Task 에서 고칠 것은 없다. 실행자는 아래 줄이 그대로인지만 다시 본다(`grep -n` 으로 줄 번호가 밀렸는지).

| 화면 | 근거 | 서버 문구를 보이나 |
|---|---|---|
| 쉬운 만들기 | `app/easy/easy-client.tsx:328-333` `body.message`, `retryable` | 예 |
| CS 도우미 | `app/_components/cs-panel.tsx:148-150` `body.message` | 예 |
| 카드뉴스 작업 화면(기획·문구) | `app/sns/[id]/project-client.tsx:60-66` `payload.message` | 예 |
| 카드뉴스 새로 만들기 직후 기획 | `app/sns/new-client.tsx:246-248` 응답을 버리고 작업 화면으로 넘어간다 | **아니오** — 작업 화면의 「기획·원고 만들기」를 누르면 그때 보인다. 이 계획은 동작을 안 바꾼다(보고 대상) |
| 포스터 검수·기획 | `app/poster/[id]/poster-client.tsx:646, 717-718` `body.message` | 예 |
| 상세페이지 | `app/create/PdpEditor.tsx:1690` `response.message` | 예 |
| 리디자인 | `app/redesign/redesign-wizard.tsx:320` `data.error`(=`membershipApiError` 의 `error` 칸) | 예 |
| 캐릭터·참고 이미지·칸 읽기 | `app/characters/CharacterStudio.tsx:333`, `app/create/StyleReferenceAttach.tsx:86`, `app/sns/layout/layout-client.tsx:235` | 예 |
| 광고 내보내기 | `app/ad/export-rules.ts:790` `failureMessage` 가 서버 문구를 먼저 쓴다 | 예 |

- [ ] **Step 7: 커밋**

```bash
git add apps/web/lib/membership/api.ts apps/web/app/create/PdpEditor.tsx apps/web/lib/membership/__tests__/ai-control-reasons.test.ts
git commit -m "feat(credit): 크레딧 없음·AI 멈춤을 사용자 말과 상태로 옮긴다

credits_required 403(CS 는 무료 10회 문구), ai_paused 503. 둘 다 retryable:false.
상세페이지 일괄 만들기는 두 사유에서 멈춘다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 카드뉴스 기획·게시글 문구가 예약을 거친다

**Files:**
- Modify: `apps/web/lib/llm/meter.ts` (끝에 `llmSettleCost` 추가), `apps/web/lib/llm/__tests__/meter.test.ts:3` (import) + 끝에 describe 추가
- Modify(전체 교체): `apps/web/app/api/sns/projects/[id]/plan/route.ts`, `apps/web/app/api/sns/projects/[id]/caption/route.ts`
- Create: `apps/web/app/api/sns/__tests__/plan-caption-usage.test.ts`
- Modify: `apps/web/app/sns/new-client.tsx:17-18`(import), `:246`; `apps/web/app/sns/[id]/project-client.tsx:287`, `:350`
- Create: `apps/web/lib/__tests__/billable-new-routes.test.ts`

**Interfaces:**
- Consumes: `reserveAiUsage(request, operation, units, plan)` · `settleAiUsage(reservation, success, units, errorCode?, cost?)` (`lib/membership/api.ts`, 기존), `freeCreditPlan(resource)` (`lib/membership/credit-ledger.ts:13`, 기존), `withLlmMeter`·`readLlmMeter` (`lib/llm/meter.ts`, 기존).
- Produces: `llmSettleCost(): { model: string; billableImages: number; llmUsd?: number }` (`lib/llm/meter.ts`) — Task 4·5 가 쓴다. 계량기 밖이거나 부른 것이 없으면 `llmUsd` 칸이 없다.

- [ ] **Step 1: `llmSettleCost` 시험을 쓴다**

`apps/web/lib/llm/__tests__/meter.test.ts:3` 의 import 를 바꾼다:

```ts
import { llmSettleCost, readLlmMeter, recordFrom, recordLlmUsage, tokensFrom, withLlmMeter } from "../meter";
```

파일 끝에 붙인다:

```ts
/**
 * **정산에 실을 원가**(설계 2026-09-30 §3.1). 0 을 적으면 「돈이 안 나갔다」가 되고
 * 되돌릴 근거가 없다(`finalizeAiUsage` 의 `cost_state`). 못 쟀으면 금액을 비운다.
 */
describe("정산에 실을 원가", () => {
  it("부른 것이 있으면 잰 금액을 싣는다", async () => {
    const cost = await withLlmMeter(async () => {
      recordLlmUsage("claude-sonnet-5", 1000, 100);
      return llmSettleCost();
    });
    expect(cost.model).toBe("");
    expect(cost.billableImages).toBe(0);
    expect(cost.llmUsd).toBeGreaterThan(0);
  });

  it("계량기 안이지만 부른 것이 없으면 금액을 비운다 — 0 과 모름을 가른다", async () => {
    const cost = await withLlmMeter(async () => llmSettleCost());
    expect(cost).not.toHaveProperty("llmUsd");
  });

  it("계량기 밖이면 금액을 비운다", () => {
    expect(llmSettleCost()).not.toHaveProperty("llmUsd");
  });
});
```

- [ ] **Step 2: 라우트 시험을 쓴다**

`apps/web/app/api/sns/__tests__/plan-caption-usage.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **카드뉴스 기획·게시글 문구도 예약을 거친다**(설계 2026-09-30 §3.1).
 *
 * 둘 다 회원 확인만 하고 예약 없이 웹검색 조사·Apify·글 모델을 불렀다. 그래서
 * 크레딧이 없어도, 운영자가 멈춰도 돌았다. 새 작업 이름은 안 만든다 —
 * `sns_image` + `sns:{id}:plan` / `sns:{id}:caption`, 0 크레딧이다.
 */
vi.mock("server-only", () => ({}));

const order: string[] = [];
const reserveCalls: Array<{ operation: string; units: number; resource?: string }> = [];
const settleCalls: Array<{ success: boolean; code?: string }> = [];
let reserveOk = true;
let project: Record<string, unknown> | undefined;
let providerThrows: Error | null = null;
let 정산결과: unknown = { remaining: 0 };

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "u1", profile: { role: "member" } } }),
  reserveAiUsage: async (_request: Request, operation: string, units: number, plan?: { resource: string }) => {
    order.push("reserve");
    reserveCalls.push({ operation, units, resource: plan?.resource });
    return reserveOk
      ? { ok: true as const, userId: "u1", requestId: "sns-request", usage: undefined }
      : {
          ok: false as const,
          response: Response.json({ ok: false, code: "credits_required", message: "크레딧이 없어 이 기능을 쓸 수 없습니다." }, { status: 403 }),
        };
  },
  settleAiUsage: async (_reservation: unknown, success: boolean, _units: number, code?: string) => {
    order.push("settle");
    settleCalls.push({ success, code });
    return 정산결과;
  },
}));

vi.mock("../../../../lib/sns-flow-store", () => ({
  snsFlowStoreForUser: async () => ({
    get: async () => project,
    save: async (id: string, flow: unknown, status: string) => {
      order.push("save");
      return { id, status, data: { flow } };
    },
  }),
  snsWriteDenied: () => undefined,
}));

vi.mock("../../../../lib/sns/actual-flow", () => ({
  createActualPlanningFlow: async () => {
    order.push("plan");
    if (providerThrows) throw providerThrows;
    return { cards: [] };
  },
}));

vi.mock("../../../../lib/sns/source-adapters", () => ({ createSourceAdapters: () => ({}) }));

vi.mock("../../../../lib/sns/providers", () => ({
  createSnsPlanningProviders: () => ({ captionPrimary: {}, captionBackup: undefined }),
  SnsProviderConfigurationError: class extends Error { status = 503; },
}));

vi.mock("../../../../lib/sns/runtime", () => ({
  replaceSnsCardRows: async () => undefined,
  refreshProjectAssetUrls: async (value: unknown) => value,
}));

vi.mock("@fixup/sns-core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@fixup/sns-core")>()),
  writeCaption: async () => {
    order.push("caption");
    if (providerThrows) throw providerThrows;
    return { caption: "게시글", issues: [] };
  },
}));

const planRoute = await import("../projects/[id]/plan/route");
const captionRoute = await import("../projects/[id]/caption/route");

type Route = { POST: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response> };
const post = (route: Route) =>
  route.POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: "p1" }) });

beforeEach(() => {
  order.length = 0;
  reserveCalls.length = 0;
  settleCalls.length = 0;
  reserveOk = true;
  providerThrows = null;
  정산결과 = { remaining: 0 };
  project = {
    id: "p1", title: "제목", toneNote: undefined, language: "ko", status: "ready",
    data: { flow: { cards: [{ copy: { headline: "머리", body: "본문" } }] } },
  };
});

describe.each([
  { name: "기획·원고", route: planRoute as Route, step: "plan", resource: "sns:p1:plan", failure: "sns_plan_failed" },
  { name: "게시글 문구", route: captionRoute as Route, step: "caption", resource: "sns:p1:caption", failure: "sns_caption_failed" },
])("카드뉴스 $name", ({ route, step, resource, failure }) => {
  it("부르기 전에 기존 작업 이름과 제 resource 로 자리를 잡는다", async () => {
    await post(route);
    expect(order.slice(0, 2)).toEqual(["reserve", step]);
    expect(reserveCalls).toEqual([{ operation: "sns_image", units: 0, resource }]);
  });

  it("자리를 못 잡으면 부르지 않고 그 거절을 그대로 돌려준다", async () => {
    reserveOk = false;
    const response = await post(route);
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("credits_required");
    expect(order).not.toContain(step);
  });

  it("없는 작업이면 자리를 잡지 않는다", async () => {
    project = undefined;
    const response = await post(route);
    expect(response.status).toBe(404);
    expect(reserveCalls).toEqual([]);
  });

  it("끝나면 성공으로 닫는다", async () => {
    const response = await post(route);
    expect(response.status).toBe(200);
    expect(settleCalls).toEqual([{ success: true, code: undefined }]);
  });

  it("부르다 실패해도 닫는다 — 안 닫으면 예약이 만료까지 남는다", async () => {
    providerThrows = new Error("모델이 죽었다");
    const response = await post(route);
    expect(response.status).toBe(500);
    expect(settleCalls).toEqual([{ success: false, code: failure }]);
  });

  it("정산이 못 닫혀도 결과는 돌려준다", async () => {
    정산결과 = undefined;
    const response = await post(route);
    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
  });
});
```

- [ ] **Step 3: 화면 호출 시험을 쓴다**

`apps/web/lib/__tests__/billable-new-routes.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **새로 예약을 붙인 주소는 화면이 요청 식별자를 붙여 불러야 한다**(설계 2026-09-30 §3.1).
 *
 * `billable-key-wiring.test.ts` 는 `[id]` 가 든 주소를 원문으로 못 짝지어 건너뛴다.
 * 그 주소들을 여기서 **부르는 자리째** 본다. 안 붙이면 운영에서 400 「요청 식별자가
 * 올바르지 않습니다」다 — 로컬은 인증 우회가 먼저 지나가 안 드러난다.
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("카드뉴스", () => {
  const created = read("../../app/sns/new-client.tsx");
  const project = read("../../app/sns/[id]/project-client.tsx");

  it("만들기 직후의 기획 요청이 식별자를 붙인다", () => {
    expect(created).toMatch(/billableFetch\(`\/api\/sns\/projects\/\$\{payload\.project\.id\}\/plan`\)/);
  });

  it("「기획·원고 만들기」가 식별자를 붙인다", () => {
    expect(project).toMatch(
      /request\(`\/api\/sns\/projects\/\$\{projectId\}\/plan`, \{[^}]*method: "POST"[^}]*headers: billableHeaders\(\)/,
    );
  });

  it("「게시글 문구」가 식별자를 붙인다", () => {
    expect(project).toMatch(
      /request\(`\/api\/sns\/projects\/\$\{projectId\}\/caption`, \{[^}]*method: "POST"[^}]*headers: billableHeaders\(\)/,
    );
  });
});
```

- [ ] **Step 4: 실패하는지 본다**

Run: `cd apps/web && npx vitest run lib/llm/__tests__/meter.test.ts app/api/sns/__tests__/plan-caption-usage.test.ts lib/__tests__/billable-new-routes.test.ts`
Expected: FAIL — `llmSettleCost` 가 없다, `reserveCalls` 가 비었다, 화면 호출 정규식 불일치.

- [ ] **Step 5: `llmSettleCost` 를 쓴다**

`apps/web/lib/llm/meter.ts` — `readLlmMeter`(58-62줄) 바로 뒤에 둔다:

```ts
/**
 * **정산에 실을 글 모델 원가**(설계 2026-09-30 §3.1).
 *
 * 못 쟀으면 금액을 비운다. 0 을 적으면 `finalizeAiUsage` 가 「정말 0원」으로
 * 남기고(`cost_state='recorded'`), 되돌릴 근거가 없다. 계량기 밖이거나 부른
 * 것이 없으면 `llmUsd` 를 빼서 「모름」으로 남긴다.
 */
export function llmSettleCost(): { model: string; billableImages: number; llmUsd?: number } {
  const meter = readLlmMeter();
  return {
    model: "",
    billableImages: 0,
    ...(meter.metered && meter.calls > 0 ? { llmUsd: meter.usd } : {}),
  };
}
```

- [ ] **Step 6: 기획 라우트를 교체한다**

`apps/web/app/api/sns/projects/[id]/plan/route.ts` 전체:

```ts
import { authenticateApiMember, reserveAiUsage, settleAiUsage } from "../../../../../../lib/membership/api";
import { freeCreditPlan } from "../../../../../../lib/membership/credit-ledger";
import { llmSettleCost, withLlmMeter } from "../../../../../../lib/llm/meter";
import { snsFlowStoreForUser, snsWriteDenied } from "../../../../../../lib/sns-flow-store";
import { createActualPlanningFlow } from "../../../../../../lib/sns/actual-flow";
import { createSourceAdapters } from "../../../../../../lib/sns/source-adapters";
import { createSnsPlanningProviders, SnsProviderConfigurationError } from "../../../../../../lib/sns/providers";
import { refreshProjectAssetUrls, replaceSnsCardRows } from "../../../../../../lib/sns/runtime";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    let project = await (await snsFlowStoreForUser(auth.member.userId)).get(id);
    if (!project) return Response.json({ ok: false, message: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    project = await refreshProjectAssetUrls(project);
    return Response.json({ ok: true, project });
  } catch (error) {
    // 남의 작업이라 못 고치는 것이면 500 이 아니라 403 으로 답한다.
    const denied = snsWriteDenied(error);
    if (denied) return denied;
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "프로젝트를 불러오지 못했습니다." }, { status: 500 });
  }
}

/**
 * 기획·원고를 만든다. **웹검색 조사·Apify·글 모델을 부르는, 값이 나가는 길이다.**
 *
 * 설계 2026-09-30 §3.1: 회원이 부르는 유료 AI 는 예약을 먼저 거친다. 새 작업
 * 이름을 만들지 않고 카드뉴스 칸(`sns_image`)에 `sns:{id}:plan` 으로 넣는다 —
 * 크레딧은 0 장이다(D1). 크레딧이 없거나 운영자가 멈췄으면 예약에서 막힌다.
 */
export async function POST(request: Request, context: Context) {
  // 이 요청에서 글 모델에 쓴 돈을 잰다. 정산에 싣는다.
  return withLlmMeter(() => plan(request, context));
}

async function plan(request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  /** `catch` 에서도 닫아야 하므로 밖에 둔다. 안 닫으면 예약이 만료까지 남는다. */
  let reservation: { userId: string; requestId: string } | null = null;
  try {
    const { id } = await context.params;
    const store = await snsFlowStoreForUser(auth.member.userId);
    const project = await store.get(id);
    if (!project) return Response.json({ ok: false, message: "프로젝트를 찾을 수 없습니다." }, { status: 404 });

    const reserved = await reserveAiUsage(request, "sns_image", 0, freeCreditPlan(`sns:${id}:plan`));
    if (!reserved.ok) return reserved.response;
    reservation = { userId: reserved.userId, requestId: reserved.requestId };

    const flow = await createActualPlanningFlow(project, createSnsPlanningProviders(), createSourceAdapters());
    await replaceSnsCardRows(auth.member.userId, id, flow);
    const saved = await store.save(id, flow, "copy_ready");
    await settleAiUsage(reservation, true, 0, undefined, llmSettleCost());
    return Response.json({ ok: true, project: saved });
  } catch (error) {
    // 실패해도 닫는다. 이미 부른 값은 원가로 남긴다.
    if (reservation) await settleAiUsage(reservation, false, 0, "sns_plan_failed", llmSettleCost());
    // 남의 작업이라 못 고치는 것이면 500 이 아니라 403 으로 답한다.
    const denied = snsWriteDenied(error);
    if (denied) return denied;
    const status = error instanceof SnsProviderConfigurationError ? error.status : 500;
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "기획과 원고를 만들지 못했습니다." }, { status });
  }
}
```

- [ ] **Step 7: 게시글 문구 라우트를 교체한다**

`apps/web/app/api/sns/projects/[id]/caption/route.ts` 전체:

```ts
import { writeCaption } from "@fixup/sns-core";
import { authenticateApiMember, reserveAiUsage, settleAiUsage } from "../../../../../../lib/membership/api";
import { freeCreditPlan } from "../../../../../../lib/membership/credit-ledger";
import { llmSettleCost, withLlmMeter } from "../../../../../../lib/llm/meter";
import { snsFlowStoreForUser, snsWriteDenied } from "../../../../../../lib/sns-flow-store";
import { createSnsPlanningProviders, SnsProviderConfigurationError } from "../../../../../../lib/sns/providers";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * 인스타그램에 붙일 게시글 문구를 쓴다.
 *
 * 카드가 다 나온 뒤에 부른다. 원고를 고치면 다시 부르면 된다 — 자동으로
 * 따라가게 만들면 고칠 때마다 모델을 부르게 되고, 그만큼 돈이 나간다.
 *
 * **예약을 먼저 거친다**(설계 2026-09-30 §3.1). `sns_image` + `sns:{id}:caption`,
 * 0 크레딧이다. 크레딧이 없거나 운영자가 멈췄으면 여기서 막힌다.
 */
export async function POST(request: Request, context: Context) {
  return withLlmMeter(() => caption(request, context));
}

async function caption(request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  let reservation: { userId: string; requestId: string } | null = null;
  try {
    const { id } = await context.params;
    const store = await snsFlowStoreForUser(auth.member.userId);
    const project = await store.get(id);
    if (!project?.data.flow) return Response.json({ ok: false, message: "결과를 찾을 수 없습니다." }, { status: 404 });

    const reserved = await reserveAiUsage(request, "sns_image", 0, freeCreditPlan(`sns:${id}:caption`));
    if (!reserved.ok) return reserved.response;
    reservation = { userId: reserved.userId, requestId: reserved.requestId };

    const providers = createSnsPlanningProviders();
    const result = await writeCaption(
      {
        title: project.title,
        cards: project.data.flow.cards.map((card) => card.copy),
        toneNote: project.toneNote,
        language: project.language,
      },
      providers.captionPrimary,
      providers.captionBackup,
    );

    const flow = { ...project.data.flow, caption: result.caption, captionIssues: result.issues };
    const saved = await store.save(id, flow, project.status);
    await settleAiUsage(reservation, true, 0, undefined, llmSettleCost());
    return Response.json({ ok: true, project: saved });
  } catch (error) {
    if (reservation) await settleAiUsage(reservation, false, 0, "sns_caption_failed", llmSettleCost());
    // 남의 작업이라 못 고치는 것이면 500 이 아니라 403 으로 답한다.
    const denied = snsWriteDenied(error);
    if (denied) return denied;
    const status = error instanceof SnsProviderConfigurationError ? error.status : 500;
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "게시글 문구를 만들지 못했습니다." },
      { status },
    );
  }
}
```

- [ ] **Step 8: 화면 호출을 고친다**

`apps/web/app/sns/new-client.tsx` — 17줄(`rerunStartStep` import) 뒤에 더한다:

```tsx
import { billableFetch } from "../../lib/billable-fetch";
```

246줄을 바꾼다:

```tsx
      // 기획은 값이 나가는 요청이다 — 식별자가 없으면 서버가 예약을 400 으로 거절한다.
      const planned = await billableFetch(`/api/sns/projects/${payload.project.id}/plan`);
```

`apps/web/app/sns/[id]/project-client.tsx:287` 을 바꾼다:

```tsx
      // 기획도 값이 나간다 — 열쇠 없이 보내면 서버가 예약을 거절한다.
      const saved = await request(`/api/sns/projects/${projectId}/plan`, { method: "POST", headers: billableHeaders() });
```

같은 파일 350줄을 바꾼다:

```tsx
      setProject(await request(`/api/sns/projects/${projectId}/caption`, { method: "POST", headers: billableHeaders() }));
```

(`billableHeaders` 는 이미 15줄에서 import 한다.)

- [ ] **Step 9: 통과하는지 본다**

Run: `cd apps/web && npx vitest run lib/llm/__tests__/meter.test.ts app/api/sns/__tests__/plan-caption-usage.test.ts lib/__tests__/billable-new-routes.test.ts lib/__tests__/billable-key-wiring.test.ts app/_components/__tests__/read-only-work.test.ts app/api/sns/__tests__/sns-credit-wiring.test.ts app/api/__tests__/credit-plan-contract.test.ts`
Expected: PASS.
Run: `cd apps/web && npx tsc --noEmit` → 오류 0. `pnpm lint` → 오류 0.

- [ ] **Step 10: 커밋**

```bash
git add apps/web/lib/llm/meter.ts apps/web/lib/llm/__tests__/meter.test.ts "apps/web/app/api/sns/projects/[id]/plan/route.ts" "apps/web/app/api/sns/projects/[id]/caption/route.ts" apps/web/app/api/sns/__tests__/plan-caption-usage.test.ts apps/web/app/sns/new-client.tsx "apps/web/app/sns/[id]/project-client.tsx" apps/web/lib/__tests__/billable-new-routes.test.ts
git commit -m "fix(sns): 카드뉴스 기획·게시글 문구가 예약을 거친다

sns_image + sns:{id}:plan / sns:{id}:caption, 0 크레딧. 모든 끝에서 닫는다.
화면 세 호출이 요청 식별자를 붙인다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 포스터 검수가 예약을 거친다

**Files:**
- Modify(전체 교체): `apps/web/app/api/poster/projects/[id]/review/route.ts`
- Modify(전체 교체): `apps/web/app/api/poster/__tests__/poster-review-route.test.ts`
- Modify: `apps/web/app/poster/[id]/poster-client.tsx:717`
- Modify: `apps/web/lib/__tests__/billable-new-routes.test.ts` (끝에 describe 추가)

**Interfaces:**
- Consumes: `llmSettleCost()` (Task 3), `reserveAiUsage`·`settleAiUsage`·`freeCreditPlan`(기존), `billableRequest(url, init?)` (`poster-client.tsx:145-153`, 기존 — 보기 전용이면 던지고 아니면 `billableFetch`).
- Produces: 없음.

- [ ] **Step 1: 시험을 교체한다**

`apps/web/app/api/poster/__tests__/poster-review-route.test.ts` 전체:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **검수도 돈이 드는 길이다 — 본인 그림만 본다**(2026-09-29 리뷰).
 *
 * 검수는 그림을 fal 에 올리고 검수 모델(LLM)을 부른다. 작업·그림 읽기는 팀이면
 * 팀원 것까지 열려 있는데(RLS), 결과 저장(`saveReview`)은 본인 것만 된다. 그래서
 * 팀원의 작업을 검수하면 **모델 값을 낸 뒤에야** 저장에서 막혔다. 그림을 본인 것만
 * 읽으면 돈이 나가기 전에 「먼저 변형 하나를 고르세요」로 멈춘다.
 *
 * **예약도 거친다**(설계 2026-09-30 §3.1). `poster_image` + `poster:{id}:review`,
 * 0 크레딧. 크레딧이 없거나 운영자가 멈췄으면 올리기 전에 막힌다.
 */

vi.mock("server-only", () => ({}));

const listOptions: unknown[] = [];
const uploads: string[] = [];
const order: string[] = [];
const reserveCalls: Array<{ operation: string; units: number; resource?: string }> = [];
const settleCalls: Array<{ success: boolean; code?: string }> = [];
let reserveOk = true;
let providerMissing = false;
let 정산결과: unknown = { remaining: 0 };
let ownImages: Array<{ id: string; selected: boolean; assetPath: string }> = [];
/** 팀 읽기 규칙으로 보이는 남의 그림 — 주인 조건을 안 걸면 이것이 나온다. */
const teammateImage = { id: "남의그림", selected: true, assetPath: "u2/poster/p1/req/0.png" };

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "u1", profile: { role: "member" } } }),
  reserveAiUsage: async (_request: Request, operation: string, units: number, plan?: { resource: string }) => {
    order.push("reserve");
    reserveCalls.push({ operation, units, resource: plan?.resource });
    return reserveOk
      ? { ok: true as const, userId: "u1", requestId: "review-request", usage: undefined }
      : {
          ok: false as const,
          response: Response.json({ ok: false, code: "credits_required", message: "크레딧이 없어 이 기능을 쓸 수 없습니다." }, { status: 403 }),
        };
  },
  settleAiUsage: async (_reservation: unknown, success: boolean, _units: number, code?: string) => {
    settleCalls.push({ success, code });
    return 정산결과;
  },
}));

vi.mock("../../../../lib/poster/stores", () => ({
  posterStoresForUser: () => ({
    projects: { get: async () => ({ id: "p1", data: { slots: {} } }) },
    images: {
      byProject: async (_projectId: string, options?: { ownOnly?: boolean }) => {
        listOptions.push(options);
        return options?.ownOnly ? ownImages : [...ownImages, teammateImage];
      },
      saveReview: async () => {},
    },
  }),
}));

vi.mock("../../../../lib/poster/asset-bytes", () => ({
  posterImageBytes: async (assetPath: string) => ({ bytes: Buffer.from(assetPath), contentType: "image/png" }),
}));

vi.mock("../../../../lib/poster/providers", () => {
  class PosterProviderConfigurationError extends Error { missing: string[] = ["FAL_KEY"]; }
  return {
    createPosterFalClients: () => {
      if (providerMissing) throw new PosterProviderConfigurationError("검수 설정이 없습니다.");
      return {
        uploader: {
          uploadReference: async (bytes: Buffer) => {
            order.push("upload");
            uploads.push(bytes.toString());
            return "https://fal/x.png";
          },
        },
      };
    },
    createPosterReviewProviders: () => ({ primary: {} }),
    PosterProviderConfigurationError,
  };
});

vi.mock("@fixup/poster-core", async () => {
  const real = await vi.importActual<typeof import("@fixup/poster-core")>("@fixup/poster-core");
  return {
    ...real,
    reviewPoster: async () => ({ status: "ok", review: { decision: "pass", summary: "좋다", issues: [] }, issues: [] }),
  };
});

const { POST } = await import("../projects/[id]/review/route");

const call = () => POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: "p1" }) });
const 내그림 = { id: "내그림", selected: true, assetPath: "u1/poster/p1/req/0.png" };

beforeEach(() => {
  listOptions.length = 0;
  uploads.length = 0;
  order.length = 0;
  reserveCalls.length = 0;
  settleCalls.length = 0;
  reserveOk = true;
  providerMissing = false;
  정산결과 = { remaining: 0 };
  ownImages = [];
});

describe("검수는 본인 그림만", () => {
  it("그림 목록을 본인 것만 달라고 한다", async () => {
    ownImages = [내그림];
    await call();
    expect(listOptions[0]).toMatchObject({ ownOnly: true });
    expect(uploads).toEqual(["u1/poster/p1/req/0.png"]);
  });

  it("본인이 고른 그림이 없으면 예약·올리기·검수 전에 멈춘다 — 팀원 그림이 골라져 있어도", async () => {
    const response = await call();
    expect(response.status).toBe(400);
    expect(uploads).toEqual([]);
    expect(reserveCalls).toEqual([]);
  });
});

describe("검수도 예약을 거친다", () => {
  it("올리기 전에 기존 작업 이름과 제 resource 로 자리를 잡는다", async () => {
    ownImages = [내그림];
    await call();
    expect(order.slice(0, 2)).toEqual(["reserve", "upload"]);
    expect(reserveCalls).toEqual([{ operation: "poster_image", units: 0, resource: "poster:p1:review" }]);
  });

  it("자리를 못 잡으면 올리지도 검수하지도 않는다", async () => {
    ownImages = [내그림];
    reserveOk = false;
    const response = await call();
    expect(response.status).toBe(403);
    expect(uploads).toEqual([]);
  });

  it("끝나면 성공으로 닫는다", async () => {
    ownImages = [내그림];
    await call();
    expect(settleCalls).toEqual([{ success: true, code: undefined }]);
  });

  it("설정이 없어 못 부르면 실패로 닫는다", async () => {
    ownImages = [내그림];
    providerMissing = true;
    const response = await call();
    expect(response.status).toBe(503);
    expect(settleCalls).toEqual([{ success: false, code: "poster_review_failed" }]);
  });

  it("정산이 못 닫혀도 검수 결과는 돌려준다", async () => {
    ownImages = [내그림];
    정산결과 = undefined;
    const response = await call();
    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
  });
});
```

`apps/web/lib/__tests__/billable-new-routes.test.ts` 끝에 붙인다:

```ts
describe("포스터", () => {
  const poster = read("../../app/poster/[id]/poster-client.tsx");

  it("검수 요청이 식별자 길목(`billableRequest`)을 지난다", () => {
    expect(poster).toMatch(/billableRequest\(`\/api\/poster\/projects\/\$\{project\.id\}\/review`\)/);
  });
});
```

- [ ] **Step 2: 실패하는지 본다**

Run: `cd apps/web && npx vitest run app/api/poster/__tests__/poster-review-route.test.ts lib/__tests__/billable-new-routes.test.ts`
Expected: FAIL — `reserveCalls` 가 비었다, 포스터 검수 호출 정규식 불일치.

- [ ] **Step 3: 라우트를 교체한다**

`apps/web/app/api/poster/projects/[id]/review/route.ts` 전체:

```ts
import { reviewPoster, shouldReviewPoster } from "@fixup/poster-core";
import { authenticateApiMember, reserveAiUsage, settleAiUsage } from "../../../../../../lib/membership/api";
import { freeCreditPlan } from "../../../../../../lib/membership/credit-ledger";
import { llmSettleCost, withLlmMeter } from "../../../../../../lib/llm/meter";
import { posterStoresForUser } from "../../../../../../lib/poster/stores";
import { createPosterFalClients, createPosterReviewProviders, PosterProviderConfigurationError } from "../../../../../../lib/poster/providers";
import { posterImageBytes } from "../../../../../../lib/poster/asset-bytes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * 고른 변형만 검수한다.
 *
 * 세 장을 다 검수하면 두 장 값은 버리는 셈이다. 자동으로 다시 만들지 않는다 —
 * 반려해도 이미지는 남고 사람이 누를 때까지 기다린다.
 *
 * **예약을 먼저 거친다**(설계 2026-09-30 §3.1). `poster_image` + `poster:{id}:review`,
 * 0 크레딧이다. 크레딧이 없거나 운영자가 멈췄으면 fal 에 올리기 전에 막힌다.
 */
export async function POST(request: Request, context: Context) {
  // 검수 모델에 쓴 돈을 잰다. 정산에 싣는다.
  return withLlmMeter(() => review(request, context));
}

async function review(request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  /** `catch` 에서도 닫아야 하므로 밖에 둔다. */
  let reservation: { userId: string; requestId: string } | null = null;
  try {
    const { id } = await context.params;
    const stores = posterStoresForUser(auth.member.userId);
    const project = await stores.projects.get(id);
    if (!project) return Response.json({ ok: false, message: "포스터 작업을 찾을 수 없습니다." }, { status: 404 });

    /*
     * **본인 그림만.** 검수는 fal 에 올리고 검수 모델을 부르는, 돈이 드는 길이다.
     * 그림 읽기는 팀이면 팀원 것까지 열려 있고 결과 저장은 본인 것만 돼서, 팀원의
     * 작업을 검수하면 모델 값을 낸 뒤에야 막혔다(2026-09-29 리뷰). 이름표도 필요 없다.
     */
    const images = await stores.images.byProject(id, { lineage: false, ownOnly: true });
    const target = images.find(shouldReviewPoster);
    if (!target) {
      return Response.json(
        { ok: false, message: "먼저 변형 하나를 고르세요. 고른 것만 검수합니다." },
        { status: 400 },
      );
    }

    const reserved = await reserveAiUsage(request, "poster_image", 0, freeCreditPlan(`poster:${id}:review`));
    if (!reserved.ok) return reserved.response;
    reservation = { userId: reserved.userId, requestId: reserved.requestId };

    const { bytes, contentType } = await posterImageBytes(target.assetPath);
    const reviewImageUrl = await createPosterFalClients().uploader.uploadReference(bytes, contentType);

    const providers = createPosterReviewProviders();
    const result = await reviewPoster(
      {
        slots: project.data.slots,
        // 검수 모델도 이 서버 밖에 있다. 우리 주소를 주면 401 을 받아 그림
        // 없이 판단하게 된다. 만들 때와 같이 바이트를 올려서 넘긴다.
        imageUrl: reviewImageUrl,
        preservedImageUrls: [],
      },
      providers.primary,
    );

    await stores.images.saveReview(target.id, result.review ?? { decision: "fail", summary: "검수하지 못했습니다.", issues: result.issues });
    const refreshed = await stores.images.byProject(id);
    await settleAiUsage(reservation, true, 0, undefined, llmSettleCost());
    return Response.json({
      ok: true,
      status: result.status,
      review: result.review,
      issues: result.issues,
      images: refreshed,
    });
  } catch (error) {
    // 실패해도 닫는다. 안 닫으면 예약이 만료까지 남는다.
    if (reservation) await settleAiUsage(reservation, false, 0, "poster_review_failed", llmSettleCost());
    if (error instanceof PosterProviderConfigurationError) {
      return Response.json({ ok: false, message: error.message, missing: error.missing }, { status: 503 });
    }
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "검수하지 못했습니다." },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: 화면 호출을 고친다**

`apps/web/app/poster/[id]/poster-client.tsx:717` 을 바꾼다:

```tsx
      // 검수도 값이 나간다 — 식별자 길목을 지나야 서버가 예약을 받는다.
      const body = await (await billableRequest(`/api/poster/projects/${project.id}/review`)).json();
```

- [ ] **Step 5: 통과하는지 본다**

Run: `cd apps/web && npx vitest run app/api/poster/__tests__/poster-review-route.test.ts lib/__tests__/billable-new-routes.test.ts app/poster/__tests__/poster-progress.test.ts app/_components/__tests__/read-only-work.test.ts app/api/__tests__/credit-plan-contract.test.ts`
Expected: PASS.
Run: `cd apps/web && npx tsc --noEmit` → 오류 0. `pnpm lint` → 오류 0.

- [ ] **Step 6: 커밋**

```bash
git add "apps/web/app/api/poster/projects/[id]/review/route.ts" apps/web/app/api/poster/__tests__/poster-review-route.test.ts "apps/web/app/poster/[id]/poster-client.tsx" apps/web/lib/__tests__/billable-new-routes.test.ts
git commit -m "fix(poster): 포스터 검수가 예약을 거친다

poster_image + poster:{id}:review, 0 크레딧. fal 에 올리기 전에 잡고 모든 끝에서 닫는다.
화면의 검수 호출이 식별자 길목을 지난다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 쉬운 만들기 판정이 예약을 거친다

**Files:**
- Modify: `apps/web/app/api/easy/generate/route.ts:1-11`(import), `:90-109`(`read`·`EasyStepError`), `:111`(POST 머리), `:138-162`(판정), `:262-275`(catch)
- Create: `apps/web/app/api/easy/__tests__/decide-usage.test.ts`

**Interfaces:**
- Consumes: `llmSettleCost()` (Task 3), Task 2 의 거절 본문 `retryable:false`, `stepIdempotencyKey(base, step)` (`lib/easy/step-key.ts`, 기존), 이 파일의 `relay(request, url, body, step)`(77-88줄, 기존).
- Produces: 응답 본문 `retryable` 은 이제 안쪽 단계가 준 `retryable:false` 를 존중한다(402·403 규칙은 그대로).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/app/api/easy/__tests__/decide-usage.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stepIdempotencyKey } from "../../../../lib/easy/step-key";

/**
 * **판정도 값이 나간다 — 예약부터**(설계 2026-09-30 §3.1).
 *
 * 쉬운 만들기는 친 말이 주문인지 대화인지를 글 모델에게 먼저 묻는다. 그 한 번이
 * 예약 없이 돌아서, 크레딧이 없어도 운영자가 멈춰도 돌았다. 이제 `poster_image` +
 * `easy:decide`(0 크레딧)로 잡고, 되묻기·대화·주문·실패 — **모든 끝에서 닫는다.**
 * 열쇠는 단계마다 가른다(`step-key.ts`) — 바깥 열쇠를 그대로 쓰면 뒤의 기획·생성
 * 예약이 `duplicate_request` 로 막힌다.
 */
vi.mock("server-only", () => ({}));

const KEY = "22222222-2222-4222-8222-222222222222";
const order: string[] = [];
const reserveCalls: Array<{ key: string | null; operation: string; units: number; resource?: string }> = [];
const settleCalls: Array<{ success: boolean; units: number; code?: string }> = [];
let reserveOk = true;
let decideRaw: unknown = { wants: "talk", reply: "안녕하세요" };
let decideThrows: Error | null = null;
let 정산결과: unknown = { remaining: 0 };
let planReply: () => Response = () => Response.json({ ok: true });

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "u1", profile: { role: "member" } } }),
  reserveAiUsage: async (request: Request, operation: string, units: number, plan?: { resource: string }) => {
    order.push("reserve");
    reserveCalls.push({ key: request.headers.get("x-idempotency-key"), operation, units, resource: plan?.resource });
    return reserveOk
      ? { ok: true as const, userId: "u1", requestId: "decide-request", usage: undefined }
      : {
          ok: false as const,
          response: Response.json(
            { ok: false, code: "credits_required", message: "크레딧이 없어 이 기능을 쓸 수 없습니다.", retryable: false },
            { status: 403 },
          ),
        };
  },
  settleAiUsage: async (_reservation: unknown, success: boolean, units: number, code?: string) => {
    order.push("settle");
    settleCalls.push({ success, units, code });
    return 정산결과;
  },
}));

vi.mock("../../../../lib/easy/store", () => ({
  easyStoreForUser: () => ({
    getConversation: async () => ({ id: "c1", title: "이미 있음" }),
    listMessages: async () => [],
    appendMessage: async (row: { role: string; body?: string }) => ({ id: `m-${row.role}`, ...row }),
    renameConversation: async () => undefined,
  }),
}));

vi.mock("../../../../lib/easy/chat-provider", () => ({
  createEasyChatProvider: () => ({
    decide: async () => {
      order.push("decide");
      if (decideThrows) throw decideThrows;
      return decideRaw;
    },
  }),
}));

vi.mock("../../poster/projects/route", () => ({
  POST: async () => {
    order.push("project");
    return Response.json({ ok: true, project: { id: "p1" } });
  },
}));
vi.mock("../../poster/projects/[id]/plan/route", () => ({
  POST: async () => {
    order.push("plan");
    return planReply();
  },
}));
vi.mock("../../poster/projects/[id]/generate/route", () => ({
  POST: async () => {
    order.push("generate");
    return Response.json({ ok: true, submission: { requestId: "r1" } });
  },
}));

const { POST } = await import("../generate/route");

const call = (body: Record<string, unknown> = {}) =>
  POST(new Request("http://x/api/easy/generate", {
    method: "POST",
    headers: { "content-type": "application/json", "x-idempotency-key": KEY },
    body: JSON.stringify({ conversationId: "c1", prompt: "안녕", ...body }),
  }));

beforeEach(() => {
  order.length = 0;
  reserveCalls.length = 0;
  settleCalls.length = 0;
  reserveOk = true;
  decideRaw = { wants: "talk", reply: "안녕하세요" };
  decideThrows = null;
  정산결과 = { remaining: 0 };
  planReply = () => Response.json({ ok: true });
});

describe("판정도 예약을 거친다", () => {
  it("판정 전에 단계 열쇠로 자리를 잡는다", async () => {
    await call();
    expect(order.slice(0, 2)).toEqual(["reserve", "decide"]);
    expect(reserveCalls[0]).toEqual({
      key: stepIdempotencyKey(KEY, "decide"), operation: "poster_image", units: 0, resource: "easy:decide",
    });
  });

  it("자리를 못 잡으면 판정을 부르지 않고, 다시 눌러도 안 풀린다고 알린다", async () => {
    reserveOk = false;
    const response = await call();
    expect(response.status).toBe(403);
    expect((await response.json()).retryable).toBe(false);
    expect(order).not.toContain("decide");
  });
});

describe("판정 예약은 모든 끝에서 닫는다", () => {
  it("대화로 끝나면 닫는다", async () => {
    decideRaw = { wants: "talk", reply: "네" };
    const body = await (await call()).json();
    expect(body.talked).toBe(true);
    expect(settleCalls).toEqual([{ success: true, units: 0, code: undefined }]);
  });

  it("되물으면 닫는다", async () => {
    decideRaw = { wants: "image" };
    const body = await (await call()).json();
    expect(body.asked).toBe(true);
    expect(settleCalls).toEqual([{ success: true, units: 0, code: undefined }]);
  });

  it("그림 주문이면 판정을 닫고 나서 기획·생성으로 간다", async () => {
    decideRaw = { wants: "image" };
    const body = await (await call({ referenceIds: ["r1"] })).json();
    expect(body.ok).toBe(true);
    expect(order).toEqual(["reserve", "decide", "settle", "project", "plan", "generate"]);
    expect(settleCalls).toHaveLength(1);
  });

  it("판정이 실패하면 실패로 닫는다", async () => {
    decideThrows = new Error("모델이 죽었다");
    const response = await call();
    expect(response.status).toBe(500);
    expect(settleCalls).toEqual([{ success: false, units: 0, code: "easy_decide_failed" }]);
  });

  it("정산이 못 닫혀도 답은 돌려준다", async () => {
    정산결과 = undefined;
    decideRaw = { wants: "talk", reply: "네" };
    const response = await call();
    expect(response.status).toBe(200);
    expect((await response.json()).talked).toBe(true);
  });
});

describe("다시 눌러도 안 풀리는 실패", () => {
  it("안쪽 단계가 멈춤(503)으로 막히면 다시 시도를 안 낸다", async () => {
    decideRaw = { wants: "image" };
    planReply = () => Response.json(
      { ok: false, code: "ai_paused", message: "운영자가 AI 사용을 잠시 멈췄습니다. 잠시 후 다시 시도해 주세요.", retryable: false },
      { status: 503 },
    );
    const response = await call({ referenceIds: ["r1"] });
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.retryable).toBe(false);
    expect(body.message).toBe("운영자가 AI 사용을 잠시 멈췄습니다. 잠시 후 다시 시도해 주세요.");
  });

  it("그냥 서버 오류(500)면 다시 시도를 낸다 — 예전 그대로", async () => {
    decideRaw = { wants: "image" };
    planReply = () => Response.json({ ok: false, message: "잠깐 실패" }, { status: 500 });
    const body = await (await call({ referenceIds: ["r1"] })).json();
    expect(body.retryable).toBe(true);
  });
});
```

- [ ] **Step 2: 실패하는지 본다**

Run: `cd apps/web && npx vitest run app/api/easy/__tests__/decide-usage.test.ts`
Expected: FAIL — `order` 가 `["decide", …]` 로 시작한다(예약 없음), 503 의 `retryable` 이 `true`.

- [ ] **Step 3: 라우트를 고친다**

`apps/web/app/api/easy/generate/route.ts:2` 와 `:6` 을 바꾸고 두 줄을 더한다:

```ts
import { authenticateApiMember, reserveAiUsage, settleAiUsage } from "../../../../lib/membership/api";
import { freeCreditPlan } from "../../../../lib/membership/credit-ledger";
import { llmSettleCost, withLlmMeter } from "../../../../lib/llm/meter";
```

```ts
import { easyChatPrompt, readEasyDecision, type EasyDecision } from "../../../easy/chat";
```

90-109줄(`read`·`EasyStepError`)을 바꾼다:

```ts
/** 라우트의 답을 읽는다. 실패하면 그 라우트가 준 말을 그대로 올린다. */
async function read(response: Response, step: string) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) {
    /*
     * **오류를 뭉개지 않는다**(설계 §5-3). 「문제가 생겼습니다」로 덮으면
     * 사용자는 무엇을 고쳐야 할지 모르고, 같은 것을 또 눌러 값만 나간다.
     * 어디서 실패했는지와 그 라우트가 준 말을 함께 올린다.
     *
     * **다시 눌러도 안 풀린다고 안쪽이 말했으면 그대로 옮긴다**(설계 2026-09-30 §3.2).
     * 멈춤(503)은 상태 코드만으로는 「잠시 뒤 다시」와 가를 수 없다.
     */
    throw new EasyStepError(step, body.message ?? `${step} 단계가 실패했습니다.`, response.status, body.retryable !== false);
  }
  return body;
}

class EasyStepError extends Error {
  constructor(readonly step: string, message: string, readonly status: number, readonly retryable = true) {
    super(message);
    this.name = "EasyStepError";
  }
}
```

111줄 `export async function POST(request: Request) {` 를 둘로 가른다(본문은 `converse` 로 옮겨 그대로 둔다):

```ts
export async function POST(request: Request) {
  /*
   * **판정에 쓴 글 모델 값을 잰다.** 안쪽 기획 라우트는 제 계량기를 따로 연다 —
   * 계량기가 겹치면 안쪽이 제 것을 쓰므로 여기 모이는 것은 판정뿐이다.
   */
  return withLlmMeter(() => converse(request));
}

async function converse(request: Request) {
```

138-162줄(`try {` 부터 `readEasyDecision(...)` 끝까지)을 바꾼다:

```ts
  try {
    const 지난줄 = await store.listMessages(conversationId);

    /*
     * ⓪-1 **판정도 값이 나간다 — 예약부터**(설계 2026-09-30 §3.1).
     *
     * 기존 작업 이름(`poster_image`) + `easy:decide`, 0 크레딧(D1). 크레딧이 없거나
     * 운영자가 멈췄으면 여기서 막혀 글 모델을 안 부른다. 열쇠는 단계마다 가른다 —
     * 바깥 열쇠를 그대로 쓰면 뒤의 기획·생성 예약이 `duplicate_request` 로 막힌다.
     */
    const 판정예약 = await reserveAiUsage(
      relay(request, "/api/easy/generate", {}, "decide"), "poster_image", 0, freeCreditPlan("easy:decide"),
    );
    if (!판정예약.ok) return 판정예약.response;

    /*
     * ⓪-2 **말인가 주문인가.**
     *
     * 값이 나가기 전에 가른다. 여기서 안 가르면 「안녕하세요」 한 마디에
     * 그림값이 나간다.
     *
     * **지난 대화를 같이 준다.** 「그거 말고 다른 걸로」 같은 말은 앞을 봐야
     * 뜻이 선다. 이번 말은 아직 안 남겼으므로 그대로 다 준다.
     *
     * **판정이 끝나면 바로 닫는다.** 되묻기·대화·주문 — 어느 끝으로 가든 판정
     * 예약은 여기서 끝난다. 주문이면 기획·생성이 각자 따로 예약한다.
     */
    let decision: EasyDecision;
    try {
      decision = readEasyDecision(
        await createEasyChatProvider(process.env, textModel).decide(
          easyChatPrompt(
            지난줄.map((row) => ({ id: row.id, role: row.role, body: row.body })),
            prompt,
            /*
             * **붙인 것이 있는지 알려 준다.** 안 알려 주면 「이걸로 하나 그려줘」를
             * 되묻는다 — 「이걸로」가 무엇인지 모르니 물을 수밖에 없다
             * (2026-09-21 실측).
             */
            붙인수,
          ),
        ),
      );
    } catch (error) {
      await settleAiUsage(판정예약, false, 0, "easy_decide_failed", llmSettleCost());
      throw error;
    }
    await settleAiUsage(판정예약, true, 0, undefined, llmSettleCost());
```

(그 뒤 `const 고르기 = easyAsk({ … })` 부터는 그대로다.)

catch 안의 `retryable` 줄(273줄)을 바꾼다:

```ts
        // 402·403 은 다시 눌러도 같은 곳에서 막힌다. 안쪽이 「안 풀린다」고 한 것(멈춤 503)도 같다.
        retryable: error.retryable && error.status !== 402 && error.status !== 403,
```

- [ ] **Step 4: 통과하는지 본다**

Run: `cd apps/web && npx vitest run app/api/easy/__tests__/decide-usage.test.ts app/api/easy/__tests__/generate-wiring.test.ts lib/__tests__/billable-key-wiring.test.ts app/easy/__tests__ app/api/__tests__/credit-plan-contract.test.ts`
Expected: PASS. (`generate-wiring` 의 `/402[\s\S]{0,40}403/`·`step: error.step`·`runPlan(... textModel` 은 그대로 맞는다. `billable-key-wiring` 은 이제 `/api/easy/generate` 를 예약 주소로도 보고, 화면이 이미 `billableFetch` 를 쓰므로 통과한다.)
Run: `cd apps/web && npx tsc --noEmit` → 오류 0. `pnpm lint` → 오류 0.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/api/easy/generate/route.ts apps/web/app/api/easy/__tests__/decide-usage.test.ts
git commit -m "fix(easy): 쉬운 만들기 판정이 예약을 거친다

poster_image + easy:decide, 0 크레딧, 단계 열쇠(decide). 판정 직후 닫아 되묻기·대화·주문·실패
모든 끝에서 닫힌다. 안쪽 단계의 retryable:false(멈춤 503)를 화면까지 옮긴다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 포스터 기획 — 읽기 전에 예약하고, 같은 그림은 한 번만 읽는다

**Files:**
- Create: `apps/web/lib/poster/unique-by-id.ts`, `apps/web/lib/poster/__tests__/unique-by-id.test.ts`
- Modify: `apps/web/app/api/poster/projects/[id]/plan/route.ts:1-14`(import), `:90-128`(읽기·예약 순서)
- Modify: `apps/web/app/api/poster/__tests__/plan-people-wiring.test.ts:33-35`
- Create: `apps/web/app/api/poster/__tests__/plan-reserve-order.test.ts`

**Interfaces:**
- Consumes: 없음(기존 `reserveAiUsage`·`freeCreditPlan`·`readAttachments`).
- Produces: `uniqueById<T extends { id: string }>(items: readonly T[]): T[]` (`lib/poster/unique-by-id.ts`) — 같은 id 는 처음 것 하나만, 차례 유지, 받은 배열은 안 바꾼다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/lib/poster/__tests__/unique-by-id.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { uniqueById } from "../unique-by-id";

/** 같은 그림을 두 역할에 붙이면 두 번 읽고 값도 두 번 나갔다(설계 2026-09-30 §2·§3.1). */
describe("같은 그림은 한 번만", () => {
  it("겹치는 id 는 처음 것 하나만 남기고 차례는 그대로 둔다", () => {
    const list = [{ id: "a", n: 1 }, { id: "b", n: 2 }, { id: "a", n: 3 }, { id: "c", n: 4 }];
    expect(uniqueById(list)).toEqual([{ id: "a", n: 1 }, { id: "b", n: 2 }, { id: "c", n: 4 }]);
  });

  it("받은 목록을 바꾸지 않는다", () => {
    const list = [{ id: "a" }, { id: "a" }];
    uniqueById(list);
    expect(list).toHaveLength(2);
  });

  it("빈 목록이면 빈 목록", () => {
    expect(uniqueById([])).toEqual([]);
  });
});
```

`apps/web/app/api/poster/__tests__/plan-reserve-order.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **포스터 기획은 값이 나가기 전에 자리를 잡는다**(설계 2026-09-30 §3.1, D5).
 *
 * 전에는 붙인 그림을 비전 모델로 다 읽은 **뒤에** 예약했다(읽은 장 수로 값을 세려고).
 * 그러면 크레딧 없는 회원이 거절되기 전에 돈이 나간다. 이제 「읽을 그림 수」로 먼저
 * 세고 예약한 다음 읽는다. 읽을 목록은 두 목록을 합쳐 **중복만** 거른다.
 */
const source = readFileSync(new URL("../projects/[id]/plan/route.ts", import.meta.url), "utf8");

describe("포스터 기획의 예약 순서", () => {
  it("예약이 그림 읽기보다 먼저다", () => {
    const 예약 = source.indexOf("reserveAiUsage(");
    const 읽기 = source.indexOf("readAttachments(");
    expect(예약).toBeGreaterThan(0);
    expect(읽기).toBeGreaterThan(0);
    expect(예약).toBeLessThan(읽기);
  });

  it("막히면 읽지 않고 돌아간다", () => {
    expect(source).toContain("if (!reserved.ok) return reserved.response;");
  });

  it("예약 장수는 읽을 그림 수로 센다", () => {
    expect(source).toContain("visionReads: 읽을것.length");
  });

  it("두 목록을 합쳐 중복만 거른다", () => {
    expect(source).toMatch(/uniqueById\(\s*\[\.\.\.references, \.\.\.preserved\]/);
    expect(source).toMatch(/readAttachments\(\s*읽을것/);
  });
});
```

`apps/web/app/api/poster/__tests__/plan-people-wiring.test.ts:33-35` 의 시험을 바꾼다(뜻은 같다 — 역할로 안 가르고 붙인 것 전부를 읽는다. 이제 그 목록이 중복 제거를 한 번 거친다):

```ts
  it("붙인 것을 역할로 안 가른다", () => {
    expect(source).toMatch(/uniqueById\(\s*\[\.\.\.references, \.\.\.preserved\]/);
    expect(source).toMatch(/readAttachments\(\s*읽을것/);
  });
```

- [ ] **Step 2: 실패하는지 본다**

Run: `cd apps/web && npx vitest run lib/poster/__tests__/unique-by-id.test.ts app/api/poster/__tests__/plan-reserve-order.test.ts app/api/poster/__tests__/plan-people-wiring.test.ts`
Expected: FAIL — `../unique-by-id` 없음, 예약이 읽기보다 뒤.

- [ ] **Step 3: `uniqueById` 를 쓴다**

`apps/web/lib/poster/unique-by-id.ts`:

```ts
/**
 * 같은 id 는 처음 것 하나만 남긴다. 차례는 그대로 두고, 받은 배열은 바꾸지 않는다.
 *
 * 포스터 기획이 `referenceIds` 와 `preservedIds` 를 합쳐 읽는데, 같은 그림이 두 목록에
 * 다 있으면 비전 모델을 두 번 불렀다(설계 2026-09-30 §2).
 */
export function uniqueById<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
```

- [ ] **Step 4: 라우트의 순서를 바꾼다**

`apps/web/app/api/poster/projects/[id]/plan/route.ts` — 9줄(`posterStoresForUser` import) 뒤에 더한다:

```ts
import { uniqueById } from "../../../../../../lib/poster/unique-by-id";
```

90-128줄(`const references = …` 부터 `reservation = { … };` 까지)을 이것으로 바꾼다:

```ts
    const references = await posterReferencesByIds(viewer, project.data.referenceIds);
    const preserved = await posterReferencesByIds(viewer, project.data.preservedIds ?? []);

    /*
     * **붙인 것을 역할과 무관하게 한 번씩 읽는다**(설계 §5-1).
     *
     * 전에는 역할이 읽기를 갈랐다 — 「따라 만들기」면 색·글자만, 「인물
     * 지키기」면 사람만, 「제품 지키기」면 아무도 안 읽었다. **그림을 보기도
     * 전에 고른 버튼 하나가 그 그림에서 배울 수 있는 것을 잘라 버렸다.**
     *
     * 2026-09-17 실측에서 드러났다 — 손 여섯이 핸드폰으로 인물을 둘러싸 찍는
     * 표지를 붙였는데 기획이 그 연출을 볼 방법이 없어 「배경은 거의 무지에
     * 가깝게」라고 쓰고 「다른 인물 추가」를 금지했다.
     *
     * **같은 그림은 한 번만**(설계 2026-09-30 §3.1). 두 목록에 다 있으면 두 번 읽고
     * 값도 두 번 나갔다. 개수 상한은 두지 않는다 — 중복만 거른다.
     */
    const 읽을것 = uniqueById([...references, ...preserved].filter((reference) => Boolean(reference.url)));

    /**
     * **읽기 전에 자리를 잡는다**(설계 2026-09-30 §3.1, D5).
     *
     * 전에는 다 읽은 뒤에 예약했다 — 실제로 몇 장을 읽었는지 알고 세려고. 그러면
     * 크레딧이 없는 회원이 거절되기 **전에** 비전 값이 나간다. 이제 「읽을 그림
     * 수」로 먼저 센다. 확정은 아래에서 실측으로 한다.
     *
     * 기획은 그림보다 싸지만 공짜가 아니다(2026-09-08 사용자 결정) — 기획 한 번에
     * 첨부를 넉 장 읽으면 nano-banana 그림 한 장보다 비싸다.
     */
    const units = creditUnits(llmCostUsd({ planCalls: 1, visionReads: 읽을것.length }));
    const reserved = await reserveAiUsage(request, "poster_image", units, freeCreditPlan(`poster:${id}:plan`));
    if (!reserved.ok) return reserved.response;
    reservation = { userId: reserved.userId, requestId: reserved.requestId };

    const read = await readAttachments(
      읽을것.map((reference) => ({ id: reference.id, title: reference.title ?? "첨부", url: reference.url! })),
      createPosterAttachmentReader(),
    );
    /** 실제로 읽힌 장 수. 확정의 어림값에 쓴다 — 실패한 읽기는 `read.issues` 로 빠진다. */
    const visionReads = Object.keys(read.reads).length;
```

(그 뒤 `const providers = createPosterPlanningProviders(…)` 부터는 그대로다. 192줄의 `llmCostUsd({ planCalls: 1, visionReads })` 는 위의 `visionReads` 를 그대로 쓴다. 기획은 이 계획에서 `finalizeAiUsage` 를 직접 부르는 옛 방식을 그대로 둔다 — Task 8 의 해설 참고.)

- [ ] **Step 5: 통과하는지 본다**

Run: `cd apps/web && npx vitest run lib/poster/__tests__/unique-by-id.test.ts app/api/poster/__tests__ app/poster/__tests__/plan-cost.test.ts lib/__tests__/poster-reference-thumbnail-wiring.test.ts app/api/easy/__tests__/generate-wiring.test.ts`
Expected: PASS.
Run: `cd apps/web && npx tsc --noEmit` → 오류 0. `pnpm lint` → 오류 0.

- [ ] **Step 6: 뮤테이션(빨강-초록)**

`plan/route.ts` 에서 `const reserved = …` 부터 `reservation = …;` 까지 세 줄을 잠시 `const read = await readAttachments(` 블록 **아래**로 옮긴다.
Run: `cd apps/web && npx vitest run app/api/poster/__tests__/plan-reserve-order.test.ts` → `예약이 그림 읽기보다 먼저다` FAIL.
`git checkout -- "apps/web/app/api/poster/projects/[id]/plan/route.ts"` 로 되돌리지 **말고**(커밋 전이다) 손으로 되돌려 PASS 를 본다.

- [ ] **Step 7: 커밋**

```bash
git add apps/web/lib/poster/unique-by-id.ts apps/web/lib/poster/__tests__/unique-by-id.test.ts "apps/web/app/api/poster/projects/[id]/plan/route.ts" apps/web/app/api/poster/__tests__/plan-people-wiring.test.ts apps/web/app/api/poster/__tests__/plan-reserve-order.test.ts
git commit -m "fix(poster): 기획이 그림을 읽기 전에 예약하고, 같은 그림은 한 번만 읽는다

크레딧 없는 회원이 거절되기 전에 비전 값이 나가던 순서를 고친다. 예약 장수는 읽을 그림 수로
먼저 센다. referenceIds 와 preservedIds 의 중복만 거른다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 광고 내보내기 — 배경 제거가 섞이면 `ad:export:cutout`

**Files:**
- Modify: `apps/web/app/api/ad/export/route.ts:171-172`
- Modify: `apps/web/app/api/ad/__tests__/ad-export-route.test.ts:101`(`reserveCalls` 타입), `:112-113`(`reserveAiUsage` 목), `쓸 때마다 장부를 연다` describe 끝(시험 둘 추가)

**Interfaces:**
- Consumes: Task 1 의 SQL 예외 — `ad_export` + `'ad:export'` 만 멈춤·크레딧 없음에서 빠진다.
- Produces: 없음.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`ad-export-route.test.ts:101` 을 바꾼다:

```ts
const reserveCalls: Array<{ operation: string; units: number; resource?: string }> = [];
```

112-113줄의 목 머리를 바꾼다:

```ts
  reserveAiUsage: async (_request: Request, operation: string, units: number, plan?: { resource: string }) => {
    reserveCalls.push({ operation, units, resource: plan?.resource });
```

`describe("쓸 때마다 장부를 연다", …)` 안, `조립이 섞이면 1장으로 예약한다` 시험 뒤에 붙인다:

```ts
  /**
   * **AI 를 부르는지 resource 로 알린다**(설계 2026-09-30 §3.1). SQL 은 `ad:export` 만
   * 「AI 멈춤」·「크레딧 없음」에서 뺀다 — 자르기·줄이기는 돈이 안 든다.
   */
  it("자르기·줄이기만이면 ad:export 로 잡는다", async () => {
    await call(good);
    expect(reserveCalls[0]!.resource).toBe("ad:export");
  });

  it("배경 제거가 섞이면 ad:export:cutout 으로 잡는다 — 돈이 나가므로 다른 AI 와 똑같이 막힌다", async () => {
    globalThis.fetch = (async () => new Response(Buffer.from("cut"))) as never;
    await call(assembling);
    expect(reserveCalls[0]!.resource).toBe("ad:export:cutout");
  });
```

- [ ] **Step 2: 실패하는지 본다**

Run: `cd apps/web && npx vitest run app/api/ad/__tests__/ad-export-route.test.ts`
Expected: FAIL — `배경 제거가 섞이면 …` 에서 `"ad:export"` 를 받았다.

- [ ] **Step 3: 라우트를 고친다**

`apps/web/app/api/ad/export/route.ts:171-172` 를 바꾼다:

```ts
  const cutout = needsCutout(parsed.data.specIds);
  const planned = adExportUnits(cutout ? 1 : 0);
  /*
   * **AI 를 부르는지 resource 로 알린다**(설계 2026-09-30 §3.1). 자르기·줄이기만이면
   * `ad:export` — SQL 이 이것만 「AI 멈춤」·「크레딧 없음」에서 뺀다. 배경 제거가
   * 섞이면 `ad:export:cutout` — 돈이 나가므로 다른 AI 와 똑같이 막힌다.
   */
  const reserved = await reserveAiUsage(
    request, "ad_export", planned, freeCreditPlan(cutout ? "ad:export:cutout" : "ad:export"),
  );
```

- [ ] **Step 4: 통과하는지 본다**

Run: `cd apps/web && npx vitest run app/api/ad/__tests__/ad-export-route.test.ts lib/ad/__tests__/ad-cost.test.ts app/api/__tests__/credit-plan-contract.test.ts`
Expected: PASS.
Run: `cd apps/web && npx tsc --noEmit` → 오류 0. `pnpm lint` → 오류 0.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/api/ad/export/route.ts apps/web/app/api/ad/__tests__/ad-export-route.test.ts
git commit -m "fix(ad): 배경 제거가 섞인 내보내기를 ad:export:cutout 으로 표시한다

AI 없는 자르기·줄이기(ad:export)만 AI 멈춤·크레딧 없음에서 빠진다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 정산 계약 시험을 넓힌다 — 공급자를 부르는 길은 모두 예약한다

**Files:**
- Modify(전체 교체): `apps/web/app/api/__tests__/paid-route-settle-contract.test.ts`

**Interfaces:**
- Consumes: Task 3·4·5 의 라우트와 시험 파일 이름, Task 3·4·5 의 문자열 `"poster_image", 0, freeCreditPlan("easy:decide")` 등.
- Produces: 없음.

**해설(설계와 코드가 어긋나는 자리):** 설계 §5 는 「공급자 모듈을 부르는 `app/api/**/route.ts` 는 `reserveAiUsage`·`settleAiUsage` 를 부른다」고 적었다. 그런데 지금 포스터 생성·고치기·기획, 카드뉴스 생성·낱장, 캐릭터 두 길은 `settleAiUsage` 가 아니라 `finalizeAiUsage` 를 **직접** 부른다(이 계약 파일의 ②가 막는 모양). 이 계획은 그 길들을 고치지 않는다(범위 밖, 수술적 변경). 그래서 넓힌 계약은 둘로 가른다.
- **모든 공급자 길**(예외 셋 제외): 예약한다 + 닫는다(`settleAiUsage` **또는** `finalizeAiUsage`).
- **pdp·redesign + 새로 막은 네 길**: `settleAiUsage` 만 쓴다(②), 실패 주입 시험이 있다(③).

- [ ] **Step 1: 시험을 교체한다**

`apps/web/app/api/__tests__/paid-route-settle-contract.test.ts` 전체:

```ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **값이 나가는 길은 모두 같은 계약을 따라야 한다**(X-02).
 *
 * 설계 §14.6: 「finalize-safety 대상 누락 | PDP·리디자인 **모든 유료/계량
 * 라우트 실패 주입** | T-SETTLE/T-COST」.
 *
 * 계약은 셋이다.
 *
 *   ① 예약한 길은 **반드시 정산한다.** 안 닫으면 크레딧이 예약된 채 묶인다
 *   ② `finalizeAiUsage` 를 **직접 부르지 않는다.** 직접 부르면 그 길만
 *      던지는 갈래로 돌아가, 이미 만든 결과가 「생성 실패」로 둔갑한다
 *   ③ 실패를 **주입해 본 시험이 있다.** 셋 중 이것만 사람이 챙겨야 한다
 *
 * **2026-09-30 에 넓혔다**(AI 사용 통제 설계 §3.1·§5). 회원 확인만 하고 예약 없이
 * 유료 AI 를 부르던 네 길이 있었다 — 크레딧이 없어도, 운영자가 멈춰도 돌았다.
 * 이제 **공급자를 부르는 길은 모두 예약한다.** 예외는 설계 §3.1 의 셋뿐이고 아래
 * 표에 이름으로 적는다.
 *
 * ── 왜 목록을 손으로 안 적나 ────────────────────────────────
 *
 * 유료 라우트는 앞으로도 는다. 목록을 글로 적어 두면 **새로 생긴 길이 조용히
 * 빠진다** — 이 항목이 잡힌 이유가 그것이다. 소스에서 세고, 빠진 것이 있으면
 * 여기가 빨개진다.
 */

const API = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function routesUnder(...folders: string[]): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === "route.ts") found.push(full);
    }
  };
  for (const folder of folders) walk(join(API, folder));
  return found.sort();
}

const 끝부분 = (file: string) => file.replace(/\\/g, "/").split("/api/")[1] ?? file;

/** 예약 없이 유료 AI 를 부르던 네 길(설계 2026-09-30 §3.1). 이제 ①②③ 을 똑같이 진다. */
const 새로막은길 = [
  "easy/generate/route.ts",
  "sns/projects/[id]/plan/route.ts",
  "sns/projects/[id]/caption/route.ts",
  "poster/projects/[id]/review/route.ts",
].map((name) => join(API, name));

/** 설계가 말하는 범위. 포스터·카드뉴스의 나머지는 아래 「공급자를 부르는 길」이 맡는다. */
const 유료길 = [
  ...routesUnder("pdp", "redesign").filter((file) => readFileSync(file, "utf8").includes("reserveAiUsage(")),
  ...새로막은길,
];

describe("값이 나가는 길을 빠짐없이 센다", () => {
  it("**셀 길이 있다** — 못 찾으면 아래 검사가 전부 조용히 통과한다", () => {
    expect(유료길.length).toBeGreaterThanOrEqual(13);
  });
});

describe("예약한 길은 반드시 정산한다", () => {
  it("**예약만 하고 안 닫는 길이 없다**", () => {
    const 안닫는것 = 유료길
      .filter((file) => !readFileSync(file, "utf8").includes("settleAiUsage("))
      .map(끝부분);

    expect(안닫는것, `안 닫는 길: ${안닫는것.join(", ")}`).toEqual([]);
  });
});

describe("던지는 갈래를 직접 쓰지 않는다", () => {
  it("**`finalizeAiUsage` 를 직접 부르는 길이 없다**", () => {
    const 직접부르는것 = 유료길
      .filter((file) => /\bfinalizeAiUsage\s*\(/.test(readFileSync(file, "utf8")))
      .map(끝부분);

    expect(직접부르는것, `직접 부르는 길: ${직접부르는것.join(", ")}`).toEqual([]);
  });
});

/**
 * **실패를 주입해 본 시험이 길마다 있어야 한다.**
 *
 * 「정산을 부른다」까지는 위 두 검사가 본다. 그런데 **못 닫았을 때 결과를
 * 돌려주는지**는 실제로 흔들어 봐야 안다. 그 시험이 어느 파일에 있는지를
 * 여기 적어 둔다 — 새 길이 생기면 이 표가 모자라 빨개진다.
 */
describe("길마다 실패를 주입해 본 시험이 있다", () => {
  /** 길 → 그 길에 실패를 주입하는 시험 파일. */
  const 주입한시험: Record<string, string> = {
    "pdp/analyze/route.ts": "pdp/__tests__/route-reliability.test.ts",
    "pdp/images/route.ts": "pdp/__tests__/route-reliability.test.ts",
    "pdp/images/batch/route.ts": "pdp/__tests__/route-reliability.test.ts",
    "pdp/key-visual/route.ts": "pdp/__tests__/route-reliability.test.ts",
    "pdp/plan-from-text/route.ts": "pdp/__tests__/route-reliability.test.ts",
    "pdp/style-references/route.ts": "pdp/__tests__/style-references-usage.test.ts",
    "redesign/generate/route.ts": "redesign/__tests__/settlement.test.ts",
    "redesign/edit-section/route.ts": "redesign/__tests__/settlement.test.ts",
    "redesign/transcribe-strips/route.ts": "redesign/__tests__/transcribe-usage.test.ts",
    "easy/generate/route.ts": "easy/__tests__/decide-usage.test.ts",
    "sns/projects/[id]/plan/route.ts": "sns/__tests__/plan-caption-usage.test.ts",
    "sns/projects/[id]/caption/route.ts": "sns/__tests__/plan-caption-usage.test.ts",
    "poster/projects/[id]/review/route.ts": "poster/__tests__/poster-review-route.test.ts",
  };

  it("**표에 없는 길이 없다** — 새 유료 길이 생기면 여기가 빨개진다", () => {
    const 빠진것 = 유료길.map(끝부분).filter((name) => !주입한시험[name]);

    expect(빠진것, `실패 주입 시험이 없는 길: ${빠진것.join(", ")}`).toEqual([]);
  });

  it("**표에 적힌 시험 파일이 실제로 있다**", () => {
    const 없는것 = [...new Set(Object.values(주입한시험))].filter((test) => {
      try {
        return !statSync(join(API, test)).isFile();
      } catch {
        return true;
      }
    });

    expect(없는것, `없는 시험 파일: ${없는것.join(", ")}`).toEqual([]);
  });

  /**
   * **정산 흉내를 두고 「못 닫음」을 흔들어 본 자국이 있어야 한다.**
   *
   * 표에 이름만 적어 두면 그 시험이 무엇을 재는지와 무관해진다. 최소한
   * 「정산이 못 닫는 경우」를 만든 흔적은 있어야 한다.
   */
  it("**그 시험들이 못 닫는 경우를 만든다**", () => {
    const 흔든흔적 = /정산결과 = undefined|mockRejectedValue|finalize\.mockRejected|settle[\s\S]{0,40}undefined/;
    const 안흔든것 = [...new Set(Object.values(주입한시험))].filter(
      (test) => !흔든흔적.test(readFileSync(join(API, test), "utf8")),
    );

    expect(안흔든것, `못 닫는 경우를 안 만드는 시험: ${안흔든것.join(", ")}`).toEqual([]);
  });
});

/* ── 공급자를 부르는 길은 모두 관문을 지난다(설계 2026-09-30 §3.1·§5) ──────── */

/**
 * **공급자 모듈.** import 경로로 가른다. 이름을 새로 지으면(`…-provider`, `…/providers`)
 * 저절로 잡힌다.
 */
const PROVIDER_IMPORT: RegExp[] = [
  /(^|\/)providers?$/, // lib/pdp/providers, lib/poster/providers, lib/sns/providers, lib/cs/provider
  /-provider$/, // lib/easy/chat-provider, lib/layout/analyze-provider
  /\/lib\/ad\/background$/,
  /\/lib\/redesign\/image-generator$/,
  /\/lib\/sns\/source-adapters$/, // 웹검색 조사·Apify
  /^@anthropic-ai\/sdk$/,
  /^openai$/,
  /^@google\/genai$/,
  /^@fal-ai\/client$/,
];
/** 패키지 안에서 공급자를 부르는 함수. import 경로만으로는 못 가른다(`@fixup/redesign-core`). */
const PROVIDER_CALL = /\bindexKnowledge\s*\(/;

const 부르는길 = routesUnder(".").filter((file) => {
  const source = readFileSync(file, "utf8");
  const specs = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]!);
  return specs.some((spec) => PROVIDER_IMPORT.some((pattern) => pattern.test(spec))) || PROVIDER_CALL.test(source);
});

/** 설계 §3.1 의 예외 셋. 이 밖에서 예약 없이 공급자를 부르면 빨개진다. */
const 예외: Record<string, string> = {
  "poster/projects/[id]/status/route.ts": "예외 1 — 이미 예약한 작업을 이어 간다",
  "sns/projects/[id]/status/route.ts": "예외 1 — 이미 예약한 작업을 이어 간다(스위치 확인은 C3)",
  "redesign/knowledge/route.ts": "예외 2 — 관리자 지식 올리기. 비용 기록만(C3)",
  "pdp/validate-key/route.ts": "예외 3 — 공급자 모듈을 import 만 하고 부르지 않는다",
};

describe("공급자를 부르는 길은 모두 관문을 지난다", () => {
  it("**셀 길이 있다** — 못 찾으면 아래 검사가 전부 조용히 통과한다", () => {
    expect(부르는길.length).toBeGreaterThanOrEqual(20);
  });

  it("**예외 표가 낡지 않았다** — 적힌 길이 실제로 공급자를 부른다", () => {
    const 찾은것 = new Set(부르는길.map(끝부분));
    const 낡은것 = Object.keys(예외).filter((name) => !찾은것.has(name));

    expect(낡은것, `공급자를 안 부르는데 예외에 남은 길: ${낡은것.join(", ")}`).toEqual([]);
  });

  it("**예외 말고는 모두 예약한다**", () => {
    const 안잡는것 = 부르는길
      .filter((file) => !예외[끝부분(file)])
      .filter((file) => !readFileSync(file, "utf8").includes("reserveAiUsage("))
      .map(끝부분);

    expect(안잡는것, `예약 없이 공급자를 부르는 길: ${안잡는것.join(", ")}`).toEqual([]);
  });

  /**
   * **예약한 길은 닫는다.** 포스터·카드뉴스·캐릭터의 옛 길은 `finalizeAiUsage` 를 직접
   * 부른다 — 그 모양은 ② 가 pdp·redesign·새 네 길에서만 막는다. 여기서는 「닫는다」만 본다.
   */
  it("**예약한 길은 닫는다**", () => {
    const 안닫는것 = 부르는길
      .filter((file) => readFileSync(file, "utf8").includes("reserveAiUsage("))
      .filter((file) => !/\b(settleAiUsage|finalizeAiUsage)\s*\(/.test(readFileSync(file, "utf8")))
      .map(끝부분);

    expect(안닫는것, `예약만 하고 안 닫는 길: ${안닫는것.join(", ")}`).toEqual([]);
  });
});

describe("새로 막은 네 길", () => {
  /** 새 작업 이름을 만들지 않는다 — 기존 이름 + resource 로 가른다(설계 §3.1 의 표). */
  const 기대: Record<string, string> = {
    "easy/generate/route.ts": '"poster_image", 0, freeCreditPlan("easy:decide")',
    "sns/projects/[id]/plan/route.ts": '"sns_image", 0, freeCreditPlan(`sns:${id}:plan`)',
    "sns/projects/[id]/caption/route.ts": '"sns_image", 0, freeCreditPlan(`sns:${id}:caption`)',
    "poster/projects/[id]/review/route.ts": '"poster_image", 0, freeCreditPlan(`poster:${id}:review`)',
  };

  it.each(Object.entries(기대))("%s 는 기존 작업 이름과 제 resource 로 잡는다", (name, call) => {
    expect(readFileSync(join(API, name), "utf8")).toContain(call);
  });

  it("쉬운 만들기 판정은 단계 열쇠로 잡는다 — 바깥 열쇠를 쓰면 뒤 단계가 duplicate_request", () => {
    expect(readFileSync(join(API, "easy/generate/route.ts"), "utf8"))
      .toContain('relay(request, "/api/easy/generate", {}, "decide")');
  });
});
```

- [ ] **Step 2: 통과하는지 본다**

Run: `cd apps/web && npx vitest run app/api/__tests__/paid-route-settle-contract.test.ts`
Expected: PASS(Task 3·4·5 가 끝났으므로).

- [ ] **Step 3: 뮤테이션으로 시험이 잡는지 본다(빨강-초록)**

```bash
sed -i 's/reserveAiUsage(/reserveAiUsageX(/' "apps/web/app/api/sns/projects/[id]/caption/route.ts"
cd apps/web && npx vitest run app/api/__tests__/paid-route-settle-contract.test.ts; cd ../..
```
Expected: FAIL — `예외 말고는 모두 예약한다` 가 `sns/projects/[id]/caption/route.ts` 를 적는다.

```bash
git checkout -- "apps/web/app/api/sns/projects/[id]/caption/route.ts"
cd apps/web && npx vitest run app/api/__tests__/paid-route-settle-contract.test.ts; cd ../..
```
Expected: PASS. (이 파일은 Task 3 에서 커밋됐으므로 `git checkout` 이 커밋된 판으로 되돌린다.)

예외 표에서 `"redesign/knowledge/route.ts"` 줄을 잠시 지우고 돌려 `예외 말고는 모두 예약한다` 가 그 길을 적으며 FAIL 하는지 보고, 되돌린다(탐지기가 패키지 안 호출도 보는지 확인).

- [ ] **Step 4: 전체 검증**

Run: `cd apps/web && npx tsc --noEmit` → 오류 0.
Run: `cd apps/web && npx vitest run` → 실패 0(통과 수를 적어 둔다).
Run: `pnpm test:credit-db` → 모든 파일 PASS.
Run: `pnpm lint` → 오류 0.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/api/__tests__/paid-route-settle-contract.test.ts
git commit -m "test(credit): 공급자를 부르는 길은 모두 예약한다는 계약을 넓힌다

예외는 설계 §3.1 의 셋(상태 조회·관리자 지식 올리기·validate-key)만 이름으로 적는다.
새로 막은 네 길은 settle 만 쓰고 실패 주입 시험을 가진다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 운영 반영 — 앱 먼저, 그다음 SQL (**사용자 필요**)

이 Task 는 운영 서버·운영 DB 를 만진다. **실행자(에이전트)는 명령을 준비해 사용자에게 보여 주고, 사용자가 직접 돌리거나 승인한 뒤에만 한다.** 하나라도 어긋나면 멈추고 사용자에게 묻는다.

**Files:** 없음(코드 변경 없음).

- [ ] **Step 1: 다른 터미널이 master 에 무엇을 넣었는지 본다**

```bash
git fetch -q origin
git log --oneline 5968f679..origin/master
git diff --name-only 5968f679..origin/master -- supabase/migrations/
```
Expected: 이 가지 밖의 머지·마이그레이션이 없다. 있으면 멈추고 사용자에게 묻는다(메모리 「배포 전 다른 터미널 확인」).

- [ ] **Step 2: 적용 전 확인 넷 + 참고 둘(운영 SQL 편집기, 읽기만)**

```sql
-- ① 운영 credit_reserve 의 지문. 줄끝(CR)을 빼고 잰다 — 윈도우에서 붙여 넣은 판이 있을 수 있다.
select md5(regexp_replace(prosrc, E'\r', '', 'g')) as 지문, pg_get_functiondef(oid) as 정의
  from pg_proc where oid = 'public.credit_reserve(uuid,uuid,text,integer[],text,integer)'::regprocedure;

-- ② 장부 계정 없는 active 회원 — 0 이어야 한다(아니면 그 회원은 옛 경로로 새 검사를 비껴간다)
select count(*) from profiles p
 where p.status='active' and not exists(select 1 from credit_accounts a where a.user_id=p.id);

-- ④ 관리자 두 계정이 모두 무제한 — 둘 다 true 여야 한다(아니면 적용 즉시 막힌다)
select p.email, credit_is_unlimited(p.id) from profiles p where p.role='admin';

-- 참고 A: 멈춤 값 — 없거나 '0' 이어야 한다. '1' 이면 적용 즉시 모든 AI 가 멈춘다
select key, value from app_settings where key='ai_paused';

-- 참고 B: 옛 예약 함수가 장부 계정을 막는가(설계 §2·§7 의 전제). false 면 사용자에게 보고한다 — 아래 「보고」 참고
select prosrc like '%credit_ledger_required%' from pg_proc
 where oid='public.reserve_generation(uuid,uuid,text,integer,integer)'::regprocedure;
```

저장소 판(202609280001)의 지문은 로컬에서 같은 방식으로 잰다(일회용 클러스터, 운영 접속 없음). **저장소 뿌리에서** 돌린다 — 표준 입력으로 준 모듈은 지금 폴더를 기준으로 `./scripts/…` 를 찾는다:

```bash
node --input-type=module <<'EOF'
import { testPostgres } from './scripts/lib/test-credit-postgres.mjs';
const db = await testPostgres();
try {
  await db.migrate([], { until: '202609290001' });
  console.log(await db.sql(`select md5(regexp_replace(prosrc, E'\\r', '', 'g')) from pg_proc
    where oid='public.credit_reserve(uuid,uuid,text,integer[],text,integer)'::regprocedure;`));
} finally { await db.close(); }
EOF
```
Expected: 운영 ① 의 지문과 같다. 다르면 멈춘다(42725 교훈 — 운영에 다른 판이 돌고 있다).

③ 서버의 장부 스위치:

```bash
ssh -i <키> ubuntu@<호스트> "sudo grep -c '^CREDIT_LEDGER=1$' /etc/fixup-image-agent/app.env"
```
Expected: `1`.

- [ ] **Step 3: 앱을 먼저 배포한다**

`docs/DEPLOY.md` 의 「매 배포」를 **그대로** 따른다(이번 배포에 딸린 마이그레이션 `202609300001` 은 파일 첫머리 ⚠ 가 이긴다 — **배포 뒤에** 돌린다). 배포 뒤 확인까지 한다:

```bash
systemctl is-active fixup-image-agent                                   # active
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/         # 200
sudo readlink -f /opt/fixup-image-agent/current                         # 새 릴리스 id
sudo grep -rq "무료 질문 10회를 모두 썼습니다" /opt/fixup-image-agent/current/apps/web/.next && echo 반영됨
sudo grep -rq "ad:export:cutout" /opt/fixup-image-agent/current/apps/web/.next && echo 반영됨
```

**둘 다 「반영됨」이 나와야 한다. 하나라도 안 나오면 SQL 단계(Step 4 이후)로 가지 않는다** — 빌드 안에 이번
변경 문구가 없다는 뜻이라, 코드보다 SQL 이 먼저 나간 것과 같은 위험(옛 코드가 새 사유·구분을 모른다)이 있다.

이 시점의 동작: 새 문구는 아직 쓰이지 않는다(SQL 전). 네 길은 기존 작업 이름이라 지금 SQL 로 그대로 돈다(크레딧 0 회원도 아직 통과).

- [ ] **Step 4: 운영 SQL 편집기에서 `begin … rollback` 으로 미리 돌려 본다**

한산한 시간에, **한 번에** 돌린다(`credit_lock()` 이 트랜잭션 끝까지 모든 예약을 잠깐 세운다).

```sql
begin;

-- ① 여기에 supabase/migrations/202609300001_ai_usage_control.sql 전체를 붙인다.

-- ② 동작 확인. 어긋나면 예외로 멈추고, 맞으면 NOTICE 한 줄을 남긴다.
do $$
declare
  v_zero uuid; v_admin uuid; r jsonb; v_req uuid; v_count integer;
  v_codes text[] := array['AI_KEY_MISSING','AI_KEY_INVALID','AI_MODEL_ACCESS_DENIED','AI_QUOTA_EXCEEDED',
                          'AI_PROVIDER_UNAVAILABLE','INVALID_IMAGE_PAYLOAD','reservation_expired','invalid_request'];
begin
  -- 잔액 0 이고 CS 셀 행이 10 미만인 일반 회원 하나, 무제한 관리자 하나
  select p.id into v_zero from profiles p join credit_accounts a on a.user_id=p.id
   where p.status='active' and p.email_confirmed_at is not null and p.role<>'admin'
     and (credit_wallet_state(p.id)->>'balance')::integer=0
     and (select count(*) from generation_events e where e.user_id=p.id and e.operation='cs_ask'
           and coalesce(e.error_code,'') <> all (v_codes)) < 10
   limit 1;
  select p.id into v_admin from profiles p where p.role='admin' and credit_is_unlimited(p.id) limit 1;
  if v_zero is null or v_admin is null then raise exception '시험할 회원(잔액 0)이나 무제한 관리자를 못 찾았습니다'; end if;

  -- 멈춤: 관리자도 막힌다, AI 없는 광고 내보내기는 통과
  insert into app_settings(key,value) values('ai_paused','1') on conflict (key) do update set value='1';
  r := credit_reserve(v_admin, gen_random_uuid(), 'pdp_analyze', array[]::integer[], 'dryrun', 60);
  if r->>'reason' is distinct from 'ai_paused' then raise exception '멈췄는데 관리자가 %', r; end if;
  r := credit_reserve(v_zero, gen_random_uuid(), 'ad_export', array[]::integer[], 'ad:export', 60);
  if (r->>'allowed')::boolean is not true then raise exception 'AI 없는 광고 내보내기가 막혔습니다 %', r; end if;
  update app_settings set value='0' where key='ai_paused';

  -- 잔액 0 이면 0크레딧 작업도 거절, 관리자는 통과
  r := credit_reserve(v_zero, gen_random_uuid(), 'pdp_analyze', array[]::integer[], 'dryrun', 60);
  if r->>'reason' is distinct from 'credits_required' then raise exception '잔액 0 인데 %', r; end if;
  r := credit_reserve(v_admin, gen_random_uuid(), 'pdp_analyze', array[]::integer[], 'dryrun', 60);
  if (r->>'allowed')::boolean is not true then raise exception '관리자가 막혔습니다 %', r; end if;

  -- CS: 셀 행 10 까지 허용, 그다음 거절
  for i in 1..11 loop
    r := credit_reserve(v_zero, gen_random_uuid(), 'cs_ask', array[]::integer[], 'cs:ask', 60);
    exit when (r->>'allowed')::boolean is not true;
  end loop;
  if r->>'reason' is distinct from 'credits_required' then raise exception 'CS 가 10회에서 안 멈췄습니다 %', r; end if;
  select count(*) into v_count from generation_events
   where user_id=v_zero and operation='cs_ask' and coalesce(error_code,'') <> all (v_codes);
  if v_count <> 10 then raise exception 'CS 셀 행이 %건입니다(10 이어야)', v_count; end if;

  -- cs_failed 는 센다(여전히 거절), invalid_request 는 안 센다(한 번 더 허용)
  select request_id into v_req from generation_events
   where user_id=v_zero and operation='cs_ask' and created_at=now() and status='reserved' limit 1;
  perform credit_finalize(v_zero, v_req, array[]::integer[], true, 'cs_failed');
  r := credit_reserve(v_zero, gen_random_uuid(), 'cs_ask', array[]::integer[], 'cs:ask', 60);
  if r->>'reason' is distinct from 'credits_required' then raise exception 'cs_failed 를 안 셌습니다 %', r; end if;
  select request_id into v_req from generation_events
   where user_id=v_zero and operation='cs_ask' and created_at=now() and status='reserved' limit 1;
  perform credit_finalize(v_zero, v_req, array[]::integer[], true, 'invalid_request');
  r := credit_reserve(v_zero, gen_random_uuid(), 'cs_ask', array[]::integer[], 'cs:ask', 60);
  if (r->>'allowed')::boolean is not true then raise exception 'invalid_request 를 셌습니다 %', r; end if;

  -- 잔액이 있으면 CS 10회와 무관
  for i in 1..11 loop
    r := credit_reserve(v_admin, gen_random_uuid(), 'cs_ask', array[]::integer[], 'cs:ask', 60);
    if (r->>'allowed')::boolean is not true then raise exception '관리자 CS %번째가 막혔습니다 %', i, r; end if;
  end loop;

  raise notice 'C1 미리 돌리기 끝 — 모두 설계대로입니다. 이 트랜잭션은 되돌립니다.';
end $$;

rollback;
```
Expected: 마지막 NOTICE 한 줄. 예외가 나면 적용하지 않고 사용자에게 그 줄을 보인다. (`created_at=now()` 는 이 트랜잭션에서 넣은 행만 고른다 — `now()` 는 트랜잭션 시작 시각이다. 관리자의 지난 한 시간 CS 가 49건을 넘으면 마지막 고리가 시간당 한도에 걸릴 수 있다 — 그때는 시간을 두고 다시 돌린다.)

- [ ] **Step 5: 마이그레이션을 적용한다**

`supabase/migrations/202609300001_ai_usage_control.sql` 전체를 SQL 편집기에 붙여 돌린다. NOTICE `credit_reserve 는 하나이고 인자도 그대로입니다.` 를 확인한다.

- [ ] **Step 6: 적용 뒤 확인**

```sql
select p.oid::regprocedure, md5(regexp_replace(prosrc, E'\r', '', 'g'))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='credit_reserve';
```
Expected: 한 줄, 지문이 저장소 새 판과 같다(Step 2 의 로컬 명령에서 `until: '202609300001'` 로 잰 값).
**「새 판」은 최종 리뷰로 살아 있는 덩어리 기준으로 고친 뒤의 `202609300001_ai_usage_control.sql` 이다** —
`balance` 기준의 옛 초안으로 잰 지문과는 다르니, 반드시 지금 저장소 파일로 다시 재 보고 비교한다.
관리자 계정으로 화면 왼쪽 아래 도우미에게 한 번 묻는다 → 답이 온다(관리자가 막히지 않았다).

- [ ] **Step 7: 되돌리기(문제가 생겼을 때만)**

`supabase/migrations/202609280001_cs_ask_operation.sql` 의 **245-304줄**(`create or replace function public.credit_reserve(` 부터 `end $$;` 까지)만 붙여 돌린다. 같은 인자라 옛 동작으로 돌아간다. **파일 전체를 돌리지 않는다** — 그 파일은 `reserve_generation` 과 표 제약도 다시 건다. 앱은 되돌리지 않아도 된다(새 사유가 안 오면 새 문구도 안 쓰인다).

**보고(적용과 별개):** Step 2 참고 B 가 `false` 면 사용자에게 알린다 — 이 경우 detail-page-studio 가 부르는 `reserve_generation` 은 장부 계정도 옛 월 한도로 통과시키므로, 이번 「크레딧 없음·AI 멈춤」 검사가 그 길에는 걸리지 않는다. 설계 §4 가 이 함수를 건드리지 않기로 했으므로 이 계획에서는 고치지 않는다.

---

## 자체 점검(설계 대조)

| 설계 요구 | Task |
|---|---|
| §3.1 예약 없는 4곳 + 기존 이름 + resource 표 | 3·4·5, 계약 8 |
| §3.1 쉬운 만들기 판정 `stepIdempotencyKey(key,"decide")`, 모든 끝에서 닫음 | 5 |
| §3.1 화면 호출 4곳 `billableFetch` 계열 | 3(sns 셋)·4(포스터). 쉬운 만들기는 이미 `billableFetch`(`easy-client.tsx:293`) |
| §3.1 포스터 기획: 예약 뒤 읽기, 중복 제거, 예약 장수 = 읽을 그림 수 | 6 |
| §3.1 광고 `ad:export:cutout` | 7 |
| §3.1 CS 시간당 SQL 목록에 `cs_ask` | 1 |
| §3.1 예외 셋을 정적 시험에 이름으로 | 8 |
| §3.2 검사 순서·`balance`·`v_need>0` 같은 사유·CS 10회 규칙·`ad:export` 예외 | 1 |
| §3.2 문구·403/503·`retryable` | 2(+5 의 안쪽 단계 전달) |
| §3.2 화면이 서버 문구를 보이는지 확인 | 2 Step 6 |
| §5 SQL 정적 시험 + 유일성 + 다른 함수 불변 | 1 |
| §5 SQL 동작(멈춤·잔액 0·CS 10/11·`cs_failed`/`invalid_request`·잔액≥1·광고) | 1(로컬 실제 PG) + 9 Step 4(운영 `begin…rollback`) |
| §5 라우트 계약 확장·화면 호출·판정 모든 끝·기획 순서 | 3·4·5·6·8 |
| §6 C1+C2 함께, 앱 먼저 → SQL, 적용 전 확인 넷 | 9 |
| §7 42725 대응(인자 불변·유일성 검사) | 1 |
| C3 몫(카드뉴스 상태 조회 스위치, 비용 표) | 이 계획 밖 |
