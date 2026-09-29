# 100명 대비 S1.5 — 재시작 때 묶인 예약 정리 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 서버가 재시작(사고·배포)되면, 직전 프로세스가 잡아 두고 끝내지 못한 **동기 이미지 생성 예약**을 정리한다 — 제공사를 아직 안 불렀으면 차감 없이 풀고, 불렀으면 관리자 「정산 확인」에 보이게 한다.

**Architecture:** 예약마다 그것을 잡은 프로세스 표식(`boot_id`)을 `generation_events` 에 남긴다(함수 인자를 바꾸지 않고 예약 직후 한 줄 갱신 — 42725 재발 방지). 새 프로세스가 켜질 때 `instrumentation.ts` 가 DB 함수 `credit_close_restart_orphans(p_boot)` 를 한 번 부른다. 함수는 **와일드카드 없는 허용 목록**의 자원만, 자기와 다른 표식만 고른다 — 상세페이지 제품이 같은 DB 에 쓴 예약(표식 없음)과 카드뉴스·포스터(재시작 뒤에도 이어지는 설계)는 건드리지 않는다.

**Tech Stack:** PostgreSQL(Supabase), Next.js 15 `instrumentation.ts`, vitest, node --test(실제 PostgreSQL)

**Spec:** `docs/superpowers/specs/2026-09-29-capacity-100-design.md` §2.3·§3.5·§4(S1.5)

## Global Constraints

- 허용 목록(그대로 복사): `'pdp:batch','pdp:image','pdp:key-visual','redesign:generate','redesign:edit','character:candidates','character:angles','character:view'` — **`sns:*`·`poster:*`·`pdp:job` 은 절대 대상이 아니다**
- `phase='reserved'`(제공사 안 부름) → `credit_finalize(user, request, '{}', true, 'process_restart')` 로 차감 없이 푼다
- `phase='started'` → `credit_phase='needs_review'`, `error_code='process_restart'`, `cost_state='unknown'` (장부 설계 `2026-09-22-credit-subscription-design.md:717` — TTL 만으로 풀지 않는다)
- 기존 함수의 인자·이름을 바꾸지 않는다(`202609280003` 의 42725 사고). 새 함수 이름은 유일해야 한다(`sql-function-unique.test.ts`)
- 이미 적용된 마이그레이션 파일은 고치지 않는다. 새 파일 `202609290001_restart_orphans.sql`
- 전제: **웹 프로세스는 하나**(설계 §5). 두 개가 되면 이 정리가 살아 있는 형제 프로세스의 예약을 고른다 — 문서와 코드 주석에 적는다
- 로컬 저장소(`LOCAL_STORE=1`)·장부 꺼짐(`CREDIT_LEDGER!=1`)에서는 아무것도 안 한다

## Review Focus

1. **표식을 남기다 실패** — 예약은 됐는데 `boot_id` 갱신이 실패하면 생성은 그대로 진행돼야 하고(사용자 요청을 막지 않음) 그 예약은 정리 대상에서 빠진다(옛 동작) — Task 2 시험 「표식 실패는 요청을 막지 않는다」
2. **정리 함수가 도중에 한 건에서 실패** — 한 건의 예외가 나머지를 막거나 기동을 막으면 안 된다: 앱은 오류를 기록만 하고 기동을 계속한다 — Task 3 시험 「RPC 오류를 삼킨다」. 함수 안 한 건 실패는 그 건만 건너뛴다 — Task 1 시험
3. **이미 정산된 예약** — 늦게 정산이 끝난 건(`status<>'reserved'`)은 건드리지 않는다 — Task 1 시험 조건 `status='reserved'`
4. **같은 프로세스가 두 번 부름**(개발 서버 다시 불러오기) — 두 번째 호출은 고를 것이 없어 0 을 돌려준다(멱등) — Task 1 시험
5. **회원이 이 함수를 직접 부름** — `authenticated` 는 실행 권한이 없다 — Task 1 시험

---

### Task 1: DB — 표식 칸과 정리 함수

**Files:**
- Create: `supabase/migrations/202609290001_restart_orphans.sql`
- Test: `scripts/tests/restart-orphans.test.mjs`
- Modify: `package.json`(`test:credit-db` 목록에 추가)

**Interfaces:**
- Produces: 칸 `generation_events.boot_id uuid`(null 허용), 함수 `public.credit_close_restart_orphans(p_boot uuid) returns jsonb` → `{"released": n, "needs_review": m}`. 서비스 권한만 실행

- [ ] **Step 1: 실패하는 시험을 쓴다**

`scripts/tests/restart-orphans.test.mjs`:

```js
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testPostgres } from '../lib/test-credit-postgres.mjs';

/*
  202609290001 — 재시작 때 묶인 예약 정리(2026-09-29 설계 §3.5).
  서버가 죽거나 배포로 다시 뜨면, 직전 프로세스의 동기 생성 예약이 크레딧을 쥔 채 남는다.
  자기 것이 아닌 표식만, 허용 목록 자원만 고른다 — 카드뉴스·포스터는 재시작 뒤에도 이어진다.
*/
const admin = '80000000-0000-4000-8000-000000000001';
const OLD = '81000000-0000-4000-8000-000000000001';
const NOW = '81000000-0000-4000-8000-000000000002';
let db;
const json = async (q) => JSON.parse(await db.sql(q));

/** 사람 한 명 + 크레딧 100 + 예약 한 건. 동시 1건 규칙 때문에 예약마다 사람을 따로 둔다. */
async function reservation({ resource, operation, boot, started = false, bound = false }) {
  const user = randomUUID();
  const request = randomUUID();
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values('${user}','${user}@example.invalid',now());
    update profiles set status='active' where id='${user}';
    select credit_admin_grant('${user}','bonus',100,0,now()+interval '3 months','g-${user}','fixture','${admin}');`);
  const reserved = await json(`select credit_reserve('${user}','${request}','${operation}',array[1,1],'${resource}');`);
  assert.equal(reserved.allowed, true, JSON.stringify(reserved));
  if (boot) await db.sql(`update generation_events set boot_id='${boot}' where user_id='${user}' and request_id='${request}';`);
  if (started) await db.sql(`select credit_mark_started('${user}','${request}');`);
  if (bound) await db.sql(`insert into credit_jobs(user_id,request_id,job_key,resource_key,provider_request_id,endpoint) values('${user}','${request}','k-${request}','${resource}','p','e');`);
  return { user, request };
}
const row = (r) => json(`select to_jsonb(e) from (select status,credit_phase,error_code,cost_state from generation_events where user_id='${r.user}' and request_id='${r.request}') e;`);
const available = async (r) => (await json(`select credit_wallet_state('${r.user}');`)).available;

let cases;
before(async () => {
  db = await testPostgres();
  await db.migrate();
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values('${admin}','admin@example.invalid',now());
    update profiles set status='active',role='admin' where id='${admin}';`);
  cases = {
    reservedOld: await reservation({ resource: 'pdp:batch', operation: 'pdp_image', boot: OLD }),
    startedOld: await reservation({ resource: 'redesign:generate', operation: 'redesign_generate', boot: OLD, started: true }),
    sns: await reservation({ resource: 'sns:p1', operation: 'sns_image', boot: OLD, started: true }),
    poster: await reservation({ resource: 'poster:p1', operation: 'poster_image', boot: OLD }),
    job: await reservation({ resource: 'pdp:job', operation: 'pdp_image', boot: OLD }),
    mine: await reservation({ resource: 'pdp:image', operation: 'pdp_image', boot: NOW }),
    unmarked: await reservation({ resource: 'pdp:key-visual', operation: 'pdp_image', boot: null }),
    bound: await reservation({ resource: 'character:view', operation: 'pdp_image', boot: OLD, started: true, bound: true }),
  };
});
after(async () => { await db?.close(); });

test('closes only the previous process\'s allow-listed reservations', async () => {
  const result = await json(`select credit_close_restart_orphans('${NOW}');`);
  assert.deepEqual(result, { released: 1, needs_review: 1 });
});

test('a reservation that never reached the provider is released without charge', async () => {
  const r = await row(cases.reservedOld);
  assert.equal(r.status, 'failed');
  assert.equal(r.error_code, 'process_restart');
  assert.equal(await available(cases.reservedOld), 100);
});

test('a started reservation goes to the admin review list, still holding credits', async () => {
  const r = await row(cases.startedOld);
  assert.equal(r.status, 'reserved');
  assert.equal(r.credit_phase, 'needs_review');
  assert.equal(r.error_code, 'process_restart');
  assert.equal(r.cost_state, 'unknown');
  assert.equal(await available(cases.startedOld), 98);
});

test('card news, posters, dispatcher jobs, this process, unmarked and bound rows are untouched', async () => {
  for (const key of ['sns', 'poster', 'job', 'mine', 'unmarked', 'bound']) {
    const r = await row(cases[key]);
    assert.equal(r.status, 'reserved', key);
    assert.notEqual(r.error_code, 'process_restart', key);
  }
});

test('calling again closes nothing (idempotent)', async () => {
  assert.deepEqual(await json(`select credit_close_restart_orphans('${NOW}');`), { released: 0, needs_review: 0 });
});

test('a member session cannot run it', async () => {
  await assert.rejects(db.sql(`begin; set local role authenticated; select credit_close_restart_orphans('${NOW}'); commit;`));
});

test('a null boot id is refused', async () => {
  await assert.rejects(db.sql(`select credit_close_restart_orphans(null);`));
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test scripts/tests/restart-orphans.test.mjs`
Expected: FAIL — `column "boot_id" … does not exist`

- [ ] **Step 3: 마이그레이션을 쓴다**

`supabase/migrations/202609290001_restart_orphans.sql`:

```sql
-- 재시작 때 묶인 예약 정리(2026-09-29 설계 §3.5).
--
-- 서버가 죽거나 배포로 다시 뜨면, 직전 프로세스의 **동기** 이미지 생성 예약이 크레딧을 쥔
-- 채 남는다. 동시 1건 규칙은 10분 뒤 풀리지만 잡아 둔 크레딧은 안 풀리고, `started` 로 죽은
-- 건은 관리자 「정산 확인」(needs_review 만 봄)에도 안 보였다.
--
-- ── 누구 것인가 ───────────────────────────────────────────────────
--
-- 예약마다 그것을 잡은 프로세스 표식(`boot_id`)을 남긴다. 앱이 예약 직후 한 줄로 적는다 —
-- `credit_reserve` 인자를 바꾸면 같은 이름 함수가 둘이 되는 42725 사고(202609280003)가 난다.
-- 이 DB 는 상세페이지 제품과 함께 쓴다. 저쪽 예약은 표식이 없어 절대 고르지 않는다.
--
-- ── 무엇을 고르나 ─────────────────────────────────────────────────
--
-- 와일드카드 없는 허용 목록 — 우리 서버가 응답을 붙잡고 기다리는 동기 경로만. 카드뉴스·
-- 포스터는 fal 대기열에 맡기고 재시작 뒤에도 이어지는 설계라 **절대 대상이 아니다.**
-- 배치기 작업(`pdp:job`, S4)도 재시작을 넘어 이어지므로 목록에 없다.
--
-- 전제: 웹 프로세스는 하나다. 둘이 되면 살아 있는 형제 프로세스의 예약을 고른다.

alter table public.generation_events add column if not exists boot_id uuid;
create index if not exists generation_events_restart_orphans_idx
  on public.generation_events (boot_id)
  where status = 'reserved' and boot_id is not null;

create or replace function public.credit_close_restart_orphans(p_boot uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e generation_events%rowtype;
  v_released integer := 0;
  v_review integer := 0;
begin
  if p_boot is null then raise exception 'boot_required'; end if;
  for e in
    select * from generation_events g
     where g.boot_id is not null and g.boot_id <> p_boot
       and g.pricing_policy = 'image-v2' and g.status = 'reserved'
       and g.credit_quote->>'resource' in ('pdp:batch','pdp:image','pdp:key-visual','redesign:generate',
                                           'redesign:edit','character:candidates','character:angles','character:view')
       and not exists (select 1 from credit_jobs j where j.user_id = g.user_id and j.request_id = g.request_id)
     order by g.created_at
  loop
    begin
      if e.credit_phase = 'reserved' then
        -- 제공사를 아직 안 불렀다 — 원가도 없다. 차감 없이 푼다.
        perform credit_finalize(e.user_id, e.request_id, array[]::integer[], true, 'process_restart');
        v_released := v_released + 1;
      elsif e.credit_phase = 'started' then
        -- 불렀는데 결과를 모른다 — TTL 로 풀지 않고 사람이 본다(장부 설계 :717).
        update generation_events
           set credit_phase = 'needs_review', error_code = 'process_restart', cost_state = 'unknown'
         where id = e.id;
        v_review := v_review + 1;
      end if;
    exception when others then
      -- 한 건이 나머지를 막지 않는다. 남은 건은 다음 기동 때 다시 본다.
      raise warning 'credit_close_restart_orphans: % % — %', e.user_id, e.request_id, sqlerrm;
    end;
  end loop;
  return jsonb_build_object('released', v_released, 'needs_review', v_review);
end $$;

revoke all on function public.credit_close_restart_orphans(uuid) from public, anon, authenticated;
grant execute on function public.credit_close_restart_orphans(uuid) to service_role;

-- 확인:
--   select column_name from information_schema.columns where table_name='generation_events' and column_name='boot_id';
--   select credit_close_restart_orphans(gen_random_uuid());  -- 처음에는 {"released":0,"needs_review":0}
```

- [ ] **Step 4: 통과를 확인한다(파일을 git 에 올려야 시험 틀이 읽는다)**

```bash
git add supabase/migrations/202609290001_restart_orphans.sql scripts/tests/restart-orphans.test.mjs
node --test scripts/tests/restart-orphans.test.mjs
```
Expected: PASS (7)

- [ ] **Step 5: CI 목록에 넣고 전체 DB 시험·함수 유일성 시험을 돌린다**

`package.json` 의 `test:credit-db` 끝에 ` scripts/tests/restart-orphans.test.mjs` 를 붙인다.

```bash
pnpm test:credit-db 2>&1 | grep -E "^ℹ (tests|pass|fail)"
cd apps/web && npx vitest run lib/membership/__tests__/sql-function-unique.test.ts
```
Expected: fail 0, 유일성 시험 PASS

- [ ] **Step 6: 뮤테이션 — 허용 목록에 `sns` 를 섞으면 시험이 잡는지**

```bash
sed -i "s/'character:view')/'character:view','sns:p1')/" supabase/migrations/202609290001_restart_orphans.sql
node --test scripts/tests/restart-orphans.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)"
git checkout -- supabase/migrations/202609290001_restart_orphans.sql
```
Expected: fail 1 이상, 되돌린 뒤 파일 변경 없음(`git status --short` 에 이 파일 없음 — 이미 add 했으므로 `git diff` 가 비어 있어야 한다)

- [ ] **Step 7: Commit**

```bash
git add package.json
git commit -m "feat(credit): 재시작 때 묶인 동기 생성 예약을 정리하는 DB 함수"
```

---

### Task 2: 앱 — 예약마다 프로세스 표식을 남긴다

**Files:**
- Create: `apps/web/lib/runtime/boot-id.ts`
- Modify: `apps/web/lib/membership/api.ts`(`reserveAiUsage` 의 `return { ok: true, … }` 직전)
- Test: `apps/web/lib/membership/__tests__/boot-tag.test.ts`

**Interfaces:**
- Produces: `export const BOOT_ID: string` — 프로세스가 뜰 때 한 번 만든 uuid
- Consumes: Task 1 의 `generation_events.boot_id`

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/lib/membership/__tests__/boot-tag.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **예약마다 프로세스 표식을 남긴다**(설계 §3.5). 재시작 뒤 새 프로세스가 「내 것이 아닌
 * 예약」을 가려 정리한다. 표식을 못 남겨도 사용자의 생성은 막지 않는다 — 그 예약은
 * 정리 대상에서 빠질 뿐이다(옛 동작).
 */
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ updates: [] as Array<Record<string, unknown>>, failTag: false }));

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
    rpc: async () => ({ data: { allowed: true, reason: "ok", usage: {}, policy: "image-v2" }, error: null }),
    from: (table: string) => ({
      update: (values: Record<string, unknown>) => {
        const filters: Record<string, unknown> = {};
        const chain = {
          eq: (column: string, value: unknown) => {
            filters[column] = value;
            if (Object.keys(filters).length === 2) {
              state.updates.push({ table, values, filters });
              return Promise.resolve({ error: state.failTag ? { message: "boom" } : null });
            }
            return chain;
          },
        };
        return chain;
      },
    }),
  }),
}));
vi.mock("../../dev-auth", () => ({ isLocalAuthBypass: false, devMemberProfile: { id: "u1" }, devUsageSummary: {} }));
vi.mock("../../access/core", () => ({ hasFullScope: () => true, viewerFrom: () => ({}) }));

const { reserveAiUsage } = await import("../api");
const { BOOT_ID } = await import("../../runtime/boot-id");
const REQUEST = "11111111-1111-4111-8111-111111111111";
const req = () => new Request("http://local/api/pdp/images", { headers: { "x-idempotency-key": REQUEST } });

beforeEach(() => { state.updates.length = 0; state.failTag = false; process.env.CREDIT_LEDGER = "1"; });

describe("reserveAiUsage — 프로세스 표식", () => {
  it("예약이 되면 그 줄에 이 프로세스의 표식을 적는다", async () => {
    const result = await reserveAiUsage(req(), "pdp_image", 1, { outputs: [{ width: 1024, height: 1024 }], resource: "pdp:image" });
    expect(result.ok).toBe(true);
    expect(state.updates).toEqual([{ table: "generation_events", values: { boot_id: BOOT_ID }, filters: { user_id: "u1", request_id: REQUEST } }]);
  });

  it("표식은 uuid 이고 프로세스 안에서 바뀌지 않는다", async () => {
    expect(BOOT_ID).toMatch(/^[0-9a-f-]{36}$/);
    expect((await import("../../runtime/boot-id")).BOOT_ID).toBe(BOOT_ID);
  });

  it("표식 실패는 요청을 막지 않는다", async () => {
    state.failTag = true;
    const result = await reserveAiUsage(req(), "pdp_image", 1, { outputs: [{ width: 1024, height: 1024 }], resource: "pdp:image" });
    expect(result.ok).toBe(true);
  });

  it("장부가 꺼져 있으면 적지 않는다", async () => {
    process.env.CREDIT_LEDGER = "";
    await reserveAiUsage(req(), "pdp_image", 1).catch(() => undefined);
    expect(state.updates).toEqual([]);
  });
});
```

(`authenticateApiMember` 가 쓰는 회원 조회 모양이 다르면 `duplicate-request.test.ts` 의 가짜를 그대로 복사해 맞춘다 — 이 시험이 보는 것은 표식 한 줄이다)

- [ ] **Step 2: 실패를 확인한다**

Run: `cd apps/web && npx vitest run lib/membership/__tests__/boot-tag.test.ts`
Expected: FAIL — `../../runtime/boot-id` 없음

- [ ] **Step 3: 표식 모듈과 적는 줄을 쓴다**

`apps/web/lib/runtime/boot-id.ts`:

```ts
import "server-only";
import { randomUUID } from "node:crypto";

/**
 * **이 프로세스의 표식.** 뜰 때 한 번 만든다(설계 §3.5).
 *
 * 예약마다 이 값을 남기고(`reserveAiUsage`), 다음 프로세스가 켜질 때 「내 것이 아닌 예약」을
 * 가려 정리한다(`credit_close_restart_orphans`). 웹 프로세스가 하나라는 전제다 — 둘이 되면
 * 살아 있는 형제의 예약을 고른다.
 */
export const BOOT_ID: string = randomUUID();
```

`apps/web/lib/membership/api.ts` — 파일 위 import 에 `import { BOOT_ID } from "../runtime/boot-id";` 를 더하고, `reserveAiUsage` 끝의 `return { ok: true, userId: auth.member.userId, requestId, usage };` 바로 앞에:

```ts
  /*
    **이 예약을 잡은 프로세스를 적는다**(설계 §3.5). 재시작 뒤 새 프로세스가 끊긴 동기 생성
    예약을 가려 정리한다. 함수 인자를 바꾸지 않으려고 따로 한 줄 적는다(42725 사고). 못 적어도
    생성은 막지 않는다 — 그 예약은 정리 대상에서 빠질 뿐이다.
  */
  if (ledger) {
    const { error: tagError } = await admin.from("generation_events")
      .update({ boot_id: BOOT_ID })
      .eq("user_id", auth.member.userId)
      .eq("request_id", requestId);
    if (tagError) console.warn("[usage] 프로세스 표식을 못 남겼습니다", { requestId, message: tagError.message });
  }
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd apps/web && npx vitest run lib/membership/__tests__/boot-tag.test.ts lib/membership/__tests__/duplicate-request.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/runtime/boot-id.ts apps/web/lib/membership/api.ts apps/web/lib/membership/__tests__/boot-tag.test.ts
git commit -m "feat(credit): 예약마다 그것을 잡은 프로세스 표식을 남긴다"
```

---

### Task 3: 앱 — 켜질 때 한 번 정리한다

**Files:**
- Create: `apps/web/lib/runtime/restart-orphans.ts`
- Create: `apps/web/instrumentation.ts`
- Test: `apps/web/lib/runtime/__tests__/restart-orphans.test.ts`

**Interfaces:**
- Consumes: `BOOT_ID`(Task 2), RPC `credit_close_restart_orphans(p_boot)`(Task 1)
- Produces: `closeRestartOrphans(options?: { rpc?: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>; log?: (message: string, detail?: unknown) => void }): Promise<void>`

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/lib/runtime/__tests__/restart-orphans.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const local = vi.hoisted(() => ({ on: false }));
vi.mock("../../local-store", () => ({ isLocalStoreEnabled: () => local.on }));
vi.mock("../../supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc: async () => ({ data: null, error: null }) }) }));

const { closeRestartOrphans } = await import("../restart-orphans");
const { BOOT_ID } = await import("../boot-id");

beforeEach(() => { process.env.CREDIT_LEDGER = "1"; local.on = false; });

describe("closeRestartOrphans", () => {
  it("이 프로세스의 표식으로 DB 정리 함수를 한 번 부르고 결과를 남긴다", async () => {
    const calls: unknown[] = [];
    const logs: unknown[] = [];
    await closeRestartOrphans({
      rpc: async (name, args) => { calls.push([name, args]); return { data: { released: 2, needs_review: 1 }, error: null }; },
      log: (message, detail) => logs.push([message, detail]),
    });
    expect(calls).toEqual([["credit_close_restart_orphans", { p_boot: BOOT_ID }]]);
    expect(JSON.stringify(logs)).toContain("\"released\":2");
  });

  it("RPC 오류를 삼킨다 — 기동을 막지 않는다", async () => {
    const logs: unknown[] = [];
    await expect(closeRestartOrphans({
      rpc: async () => ({ data: null, error: { message: "down" } }),
      log: (message, detail) => logs.push([message, detail]),
    })).resolves.toBeUndefined();
    expect(JSON.stringify(logs)).toContain("down");
  });

  it("던져도 삼킨다", async () => {
    await expect(closeRestartOrphans({ rpc: async () => { throw new Error("net"); }, log: () => undefined })).resolves.toBeUndefined();
  });

  it("장부가 꺼져 있거나 로컬 저장소면 부르지 않는다", async () => {
    const calls: unknown[] = [];
    const rpc = async (name: string) => { calls.push(name); return { data: null, error: null }; };
    process.env.CREDIT_LEDGER = "";
    await closeRestartOrphans({ rpc, log: () => undefined });
    process.env.CREDIT_LEDGER = "1"; local.on = true;
    await closeRestartOrphans({ rpc, log: () => undefined });
    expect(calls).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd apps/web && npx vitest run lib/runtime/__tests__/restart-orphans.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현한다**

`apps/web/lib/runtime/restart-orphans.ts`:

```ts
import "server-only";
import { createSupabaseAdminClient } from "../supabase/admin";
import { isLocalStoreEnabled } from "../local-store";
import { BOOT_ID } from "./boot-id";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

/**
 * **켜질 때 한 번, 직전 프로세스가 끝내지 못한 동기 생성 예약을 정리한다**(설계 §3.5).
 *
 * 무엇을 고르고 어떻게 닫는지는 DB 함수(`202609290001`)가 정한다. 여기서는 부르기만 한다.
 * 실패해도 기동은 계속한다 — 남은 예약은 다음 기동 때 다시 본다. 기다리지도 않는다
 * (`instrumentation.ts` 가 결과를 안 기다린다).
 */
export async function closeRestartOrphans(options: {
  rpc?: Rpc;
  log?: (message: string, detail?: unknown) => void;
} = {}): Promise<void> {
  const log = options.log ?? ((message, detail) => console.info(message, detail ?? ""));
  if (process.env.CREDIT_LEDGER !== "1" || isLocalStoreEnabled()) return;
  const rpc: Rpc = options.rpc ?? (async (name, args) => {
    const { data, error } = await createSupabaseAdminClient().rpc(name, args);
    return { data, error: error ? { message: error.message } : null };
  });
  try {
    const { data, error } = await rpc("credit_close_restart_orphans", { p_boot: BOOT_ID });
    if (error) {
      log("[restart] 묶인 예약 정리 실패", { message: error.message });
      return;
    }
    log("[restart] 묶인 예약 정리", data);
  } catch (error) {
    log("[restart] 묶인 예약 정리 실패", { message: error instanceof Error ? error.message : String(error) });
  }
}
```

`apps/web/instrumentation.ts`:

```ts
/**
 * Next 가 서버를 켤 때 한 번 부른다. **기다리지 않는다** — 정리가 늦거나 실패해도 기동은
 * 계속한다(배포 건강 확인은 40초 안에 끝나야 한다).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { closeRestartOrphans } = await import("./lib/runtime/restart-orphans");
  void closeRestartOrphans();
}
```

- [ ] **Step 4: 통과를 확인하고 전체를 돌린다**

```bash
cd apps/web && npx vitest run lib/runtime/__tests__/restart-orphans.test.ts
npx tsc --noEmit -p tsconfig.json && npx vitest run 2>&1 | grep -E "Test Files|Tests "
cd ../.. && pnpm lint 2>&1 | grep -cE "  error  "
```
Expected: 새 시험 PASS(4), 전체 실패 0, 린트 오류 0

- [ ] **Step 5: 빌드에 `instrumentation` 이 들어가는지 — 시험 서버 B 에서 빌드(Windows 빌드 금지)**

```bash
git push -u origin <이 가지>
ssh -i loadtest.pem ubuntu@43.200.70.164 'cd ~/app && git fetch -q origin && git checkout -q <이 가지> && bash /tmp/build-b.sh >/tmp/build.log 2>&1; tail -1 /tmp/build.log; ls ~/app/dist/ec2/apps/web/.next/server/instrumentation.js'
```
Expected: `BUILD_DONE`, 파일 경로가 찍힌다

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/runtime/restart-orphans.ts apps/web/instrumentation.ts apps/web/lib/runtime/__tests__/restart-orphans.test.ts
git commit -m "feat(credit): 서버가 켜질 때 직전 프로세스의 묶인 예약을 정리한다"
```

---

### Task 4: 시험 서버에서 실제로 — 생성 도중 재시작

**Files:** 없음

- [ ] **Step 1: 시험 DB 에 마이그레이션을 적용하고 Task 3 빌드를 A 에 배포**

```bash
ssh -i loadtest.pem ubuntu@43.200.70.164 'cd ~/app && PGPASSWORD=postgres psql -X -q -h 127.0.0.1 -p 54322 -U postgres -d postgres -f supabase/migrations/202609290001_restart_orphans.sql && scp -i ~/.ssh/loadtest.pem -q ~/app-test.tar.gz ubuntu@172.31.13.128:/tmp/'
ssh -i loadtest.pem ubuntu@<A> 'sudo bash /tmp/ec2/deploy-release.sh /tmp/app-test.tar.gz "$(date -u +%Y%m%dT%H%M%SZ)-s15" | tail -1'
```

- [ ] **Step 2: 상세페이지 묶음을 보내 놓고 20초 뒤 재시작, 정리 결과를 본다**

```bash
ssh -i loadtest.pem ubuntu@43.200.70.164 'cd ~/tools/k6 && . ./envk6.sh && USER_PREFIX=s15 USER_COUNT=1 node setup-users.mjs >/dev/null 2>&1 && (LEVELS=1 HOLD=20s k6 run --quiet generate-pdp.js >/dev/null 2>&1 &) ; sleep 25;
ssh -i ~/.ssh/loadtest.pem ubuntu@172.31.13.128 "sudo systemctl restart fixup-image-agent; sleep 15; sudo journalctl -u fixup-image-agent --since \"1 min ago\" --no-pager | grep restart";
PGPASSWORD=postgres psql -X -At -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "select credit_phase,error_code,cost_state,status from generation_events where error_code=\x27process_restart\x27 order by created_at desc limit 3"'
```
Expected: 로그 `[restart] 묶인 예약 정리 {"released":0,"needs_review":1}` 쯤(생성이 이미 시작됐으므로 `needs_review`), DB 에 `needs_review|process_restart|unknown|reserved` 줄. 같은 회원이 곧바로 새 생성을 시도하면 동시 1건 규칙에 막히지 않아야 한다(`needs_review` 는 막지 않음, `202609280001:264`)

---

### Task 5: 운영 반영

- [ ] **Step 1: 배포 전 확인** — 다른 터미널 머지·마이그레이션(`git log <운영sha>..origin/master`, `git diff --name-only … -- supabase/migrations/`), 진행 중 생성 수(DEPLOY.md)
- [ ] **Step 2: 마이그레이션 먼저** — 이 파일은 칸을 더하고 새 함수를 만든다(옛 코드는 칸을 안 쓴다 → 먼저 돌려도 안전). Supabase SQL Editor 에 `202609290001_restart_orphans.sql` 을 붙여 실행하고, 확인 쿼리 두 줄을 돌린다. 사용자에게 붙여 넣을 내용을 준다
- [ ] **Step 3: PR·머지·배포**(DEPLOY.md 「매 배포」), 확인: 서비스 active·로컬 200·새 릴리스·`grep -rq "credit_close_restart_orphans" /opt/fixup-image-agent/current/apps/web/.next && echo 반영됨`, 로그 `[restart] 묶인 예약 정리`
