# 100명 대비 S3b — fal 계정 풀과 관리자 화면 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 두 명이 `/admin/system` 「fal 계정」에서 fal 계정(키)을 여러 개 등록·켜고 끄고·한도를 정하면, 서버가 새 그림 제출마다 **켜진 계정 중 여유가 가장 큰 곳**으로 보내고, 한 계정이 막히면(429·잔액 소진·키 오류) **같은 제출을 곧바로 다음 계정으로** 옮기며, 결과는 **보낸 계정으로** 묻는다. 계정이 없거나 서버 열쇠가 없으면 지금처럼 `FAL_KEY` 하나로 만든다.

**Architecture:** S3a 의 `FalRouter` 모양에 계정 풀(`lib/fal/pool/router.ts` `createPoolRouter`)을 끼운다. 칸 잡기·진행 중 수·요청 → 계정 기록·계정 상태는 DB 함수(새 표 `fal_accounts`·`fal_requests`)가 하고, 키는 앱이 AES-256-GCM(추가 인증 데이터 = 계정 id)으로 잠가 넣는다(`lib/fal/pool/key-crypto.ts`). 생성 경로(포스터·카드뉴스 큐, 상세페이지·캐릭터·리디자인, 배경 제거, 참고 그림 올리기)는 모두 `defaultFalRouter()`(`lib/fal/pool/default.ts`) 하나를 쓰고, 관리자 화면은 서버 액션(`app/admin/system/fal-account-actions.ts`)이 키를 무료 요청으로 확인한 뒤 잠가 DB 함수로 보낸다.

**Tech Stack:** Next.js 15.5(서버 액션·nodejs 라우트), `@supabase/supabase-js`(service role), Postgres(새 표·함수), Node `crypto`(AES-256-GCM), `nodemailer`(기존), zod 4, vitest 4.1, node:test + 실제 Postgres(`pnpm test:credit-db`), k6·가짜 AI(측정만)

**Spec:** `docs/superpowers/specs/2026-10-01-fal-account-pool-addendum.md`(보충 — 사용자 결정 U1~U6 과 §3 결정표가 이 계획의 기준) · `docs/superpowers/specs/2026-09-29-capacity-100-design.md` §3.3·§3.8·§3.9·§4·§8 · 지킬 계약 `docs/superpowers/specs/2026-09-30-ai-usage-control-design.md` §3.3·§3.4 · 선행 `docs/superpowers/plans/2026-10-01-capacity-s3a-sync-to-queue.md`(머지·배포 뒤 시작)

## Global Constraints

- **선행: S3a 가 master 에 있어야 한다**(`lib/fal/http.ts`·`route.ts`·`run.ts` 를 쓴다). 시작 전에 `git log origin/master --oneline | grep -c "대기열"` 로 S3a 커밋이 있는지 본다
- **공유 DB**: 새 표 둘(`fal_accounts`·`fal_requests`)과 새 함수 13개만 더한다. 기존 표·함수는 다시 정의하지 않는다(`credit_require_admin` 은 부르기만). RLS 켜고 anon·authenticated 회수, 함수는 service_role 만. 끝에 함수 유일성 검사(42725 교훈)
- **순서: 마이그레이션 먼저, 그다음 앱.** 앱이 먼저 나가도 생성은 멈추지 않는다(열쇠가 없으면 풀을 보지 않는다). 관리자 카드는 「읽지 못했습니다」를 보인다
- 서버 열쇠 환경변수 이름 **`FAL_KEY_ENCRYPTION_SECRET`**(설계 §3.3), 값은 `openssl rand -base64 32`(32바이트 base64). 없거나 틀리면 풀을 끄고 `FAL_KEY` + 서버 기록 + (계정이 있으면) 관리자 메일 한 번. **죽지 않는다**
- 키 원문은 **서버 액션 안에서만** 산다 — 브라우저·`?error=` 주소·서버 기록·`credit_admin_events`·DB 에 원문이 없다. 화면은 끝 4자리만
- 관리자: 서버 액션은 `requireAdmin()`, DB 함수는 `credit_require_admin(p_actor)`(두 겹). 변경 기록 액션 이름 `fal_account_add`·`fal_account_update`·`fal_account_enable`·`fal_account_disable`·`fal_account_key`·`fal_account_check`·`fal_account_delete`
- 배정·옮기기·메일 규칙은 보충 §4.2 표 그대로(429 → 60초 쉼·메일 없음, 401·403 → 막고 메일, 422·5xx·네트워크 → 옮기지 않음). 모두 차면 「지금 이미지 생성이 몰려 있습니다. 잠시 뒤 다시 시도해 주세요.」(429)
- 「진행 중」 = 끝나지 않았고 잡은 지 30분 이내. **키 바꾸기·지우기는 진행 중이 0 일 때만**(DB 함수가 거절). 꺼도 진행 중은 그 계정으로 끝까지
- 켜진 계정이 없으면 `FAL_KEY` 로 보내고 DB 에 칸을 잡지 않는다(오늘과 같다). `FAL_KEY` 는 계속 필요하다
- 바뀌면 안 되는 것(보충 §5): 비용 한 줄(제출 자리 `lib/fal/http.ts`, 배경 제거는 `onEnqueue`), AI 멈춤(`credit_reserve`·카드뉴스 상태 조회의 기존 중지 경로), `FalQueueClient` 모양, 상세페이지·리디자인 오류 코드·문구, `classifyFalFailure`
- 메일은 `ALERT_EMAIL` + 앱 SMTP(`SMTP_HOST`·`SMTP_PORT`·`SMTP_SECURE`·`SMTP_USER`·`SMTP_PASS`·`SMTP_FROM`), 해석은 `lib/email/approval.ts`·`deploy/ec2/monitor.sh` 와 같게. 메일 실패는 던지지 않는다
- 화면에 나가는 우리말 문자열에 줄표(—)를 쓰지 않는다. 새 의존성 없음. Windows·EC2 에서 빌드하지 않는다, 시험 서버는 bundle. 커밋 메시지 `<type>(<영역>): <한국어>` + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, push 는 지시가 있을 때만. 사용자 보고는 한국어·쉬운 말

## 계획을 쓰며 확인한 사실

| 확인 | 결과 | 근거 |
|---|---|---|
| fal 클라이언트 설정이 요청끼리 안 섞이나 | `createFalClient` 가 인스턴스마다 설정을 쥔다 — 계정마다 클라이언트를 만들면 동시에 다른 키를 써도 안전 | `node_modules/@fal-ai/client/src/client.js` |
| 무료 키 확인 | 없는 요청 번호의 상태 조회: 엉터리·빈 키 401, 인증 머리 없음 404. 맞는 키는 404 예상(운영 키 미측정 → Task 11 Step 4 첫 등록이 확인) | 보충 §2(2026-10-01 실측) |
| 관리자 판정 함수 | `credit_require_admin(p_actor)` = `profiles.role='admin' and status='active' and email_confirmed_at is not null`, 아니면 `credit_admin_required` | `supabase/migrations/202609220001_credit_ledger_v2.sql:96-101` |
| 변경 기록 표 | `credit_admin_events(id, actor_id, action, target_ids uuid[], reason, input jsonb, result jsonb)`, 액션 이름 제약 없음 | 같은 파일 `:79-83` |
| 관리자 탭 패턴 | 서버 액션은 던지지 않고 `?error=`(`failureUrl`)·`?notice=`, 카드는 못 읽으면 `null` → 「읽지 못했습니다」 | `app/admin/system/ai-control-actions.ts`, `page.tsx:45-57`, `lib/teams/failure.ts` |
| 환경변수 문서 검사 | 코드가 `process.env.X` 로 읽는 이름은 `deploy/ec2/app.env.example` 에 있어야 한다 | `lib/__tests__/env-documented.test.ts` |
| 공급자 호출 파일 목록 | SDK import·업체 주소가 든 파일은 「알려진 목록」과 같아야 한다 | `lib/__tests__/ai-cost-call-sites.test.ts` |
| `supabase/admin` 은 `server-only` 를 들인다 | 생성 경로 모듈이 들이면 시험이 불러오기만 해도 깨진다 → 풀의 DB 길은 **부를 때** 들인다(`await import`) | `lib/supabase/secret-env.ts`, 계획 검증 때 7개 시험 파일이 그렇게 깨졌다 |
| 시험 DB(B) 메일 | 앱 SMTP 가 B 의 Supabase 메일 받는 곳(Inbucket, 172.31.26.41:54325, 웹 54324)으로 간다 | 시험 서버 `app.env.test` |
| 계획 코드 검증 | 일회용 워크트리에서 S3a 위에 이 계획의 코드로 `tsc` 0 · vitest `487 passed \| 3 skipped` 파일(`5829 passed` 시험) · `pnpm test:credit-db` 127 통과(새 16 포함) · 아래 뮤테이션 전부 잡힘 | 2026-10-01 |

## File Structure

| 파일 | 할 일 |
|---|---|
| Create `supabase/migrations/202610010001_fal_account_pool.sql` | 표 둘·함수 13개·권한·유일성 검사 |
| Create `scripts/tests/fal-account-pool.test.mjs` · Modify `package.json`(`test:credit-db`) | 실제 Postgres 시험 |
| Create `apps/web/lib/fal/pool/key-crypto.ts` | 열쇠 읽기·잠그기·풀기·키 다듬기·끝 4자리 |
| Create `apps/web/lib/fal/pool/store.ts` | DB 길(`FalPoolStore`, Supabase 판) |
| Create `apps/web/lib/fal/pool/alert.ts` | 관리자 메일(`sendFalPoolAlert`) |
| Create `apps/web/lib/fal/pool/router.ts` | 계정 고르기·옮기기·묻기·끝남(`createPoolRouter`, `FalPoolBusyError`, `accountFailureOf`) |
| Create `apps/web/lib/fal/pool/default.ts` | 생성 경로가 쓰는 길 하나(`defaultFalRouter`, `refreshFalPool`) |
| Modify `apps/web/lib/fal/queue.ts`·`upload.ts`, `lib/ad/background.ts`, `lib/poster/providers.ts`, `lib/sns/providers.ts`, `lib/pdp/fal.ts`, `lib/redesign/image-generator.ts`, `app/api/ad/export/route.ts` | 생성 경로를 풀에 잇는다 |
| Modify `apps/web/lib/fal/http.ts` | 무료 키 확인(`checkFalKey`) |
| Create `apps/web/lib/fal/pool/admin.ts` | 관리자 카드가 읽는 것(`readFalPoolForAdmin`) |
| Create `apps/web/app/admin/system/fal-account-actions.ts` | 등록·설정·키 바꾸기·다시 확인·지우기 |
| Create `apps/web/app/admin/system/fal-accounts-panel.tsx` · Modify `page.tsx`, `admin-shared.tsx` | 관리자 카드·알림 |
| Modify `deploy/ec2/app.env.example`, `docs/DEPLOY.md` | 열쇠 문서 |
| 시험(새로/고침) | 아래 각 Task |

## Review Focus

1. **배포 첫날 — 표가 비었거나 서버 열쇠가 아직 없음.** 사람이 기대하는 것: 아무 일 없던 것처럼 `FAL_KEY` 로 만든다. DB 왕복도 늘지 않는다. → Task 4 「계정이 하나도 없으면 서버 FAL_KEY 로 — 칸을 잡지 않는다」, Task 5 `default.test.ts` 「열쇠가 없으면」·「열쇠가 틀려도」, Task 10 Step 8
2. **한 계정만 429(영상 서비스가 칸을 다 씀).** 기대: 사용자는 실패를 못 보고 다른 계정에서 나온다, 메일은 안 온다. → Task 4 「한 계정이 429 면 같은 제출을 곧바로 다음 계정으로」, Task 10 Step 5(가짜 fal)
3. **진행 중에 관리자가 계정을 끄거나 키를 바꾸거나 지우려 함.** 기대: 진행 중 그림은 그 계정으로 끝까지 나오고, 키 바꾸기·지우기는 「끝난 뒤에」. → Task 1 PG 「key change and delete are refused while a request is in flight」, Task 4 「계정을 꺼도 진행 중 요청은 그 계정 키로」, Task 7 「진행 중이 있으면 단추가 잠긴다」
4. **서버 재시작(배포) 사이에 포스터·카드뉴스가 결과를 물음.** 기대: 재시작 뒤에도 같은 계정 키로 묻는다(메모리는 비었다). → Task 4 「다시 띄운 뒤에는 DB 기록으로 같은 계정을 찾는다」, Task 10 Step 6
5. **서버 열쇠가 바뀌어(또는 값 손상) 키를 풀 수 없음.** 기대: 그 계정만 빠지고 메일 한 통, 다른 계정이나 `FAL_KEY` 로 계속. → Task 4 「키를 풀 수 없는 계정은 빼고 표시·메일」, Task 6 「다른 열쇠로 잠긴 키는 풀지 못한다고 말한다」

---

### Task 1: 표와 DB 함수

**Files:**
- Create: `supabase/migrations/202610010001_fal_account_pool.sql`
- Test: `scripts/tests/fal-account-pool.test.mjs`
- Modify: `package.json`(`test:credit-db` 끝에 `scripts/tests/fal-account-pool.test.mjs`)

**Interfaces:**
- Consumes: `public.profiles`, `public.credit_admin_events`, `public.credit_require_admin(uuid)`
- Produces(전부 service_role 만):
  - `fal_account_claim(p_endpoint text, p_exclude uuid[]) returns table(slot_id bigint, account_id uuid)` — 행 없으면 다 참
  - `fal_request_bind(p_slot bigint, p_request text)`, `fal_request_release(p_slot bigint)`, `fal_request_finish(p_request text)`
  - `fal_account_mark(p_account uuid, p_kind text, p_detail text) returns boolean`
  - `fal_account_add(p_actor, p_id, p_name, p_ciphertext, p_iv, p_tag, p_last4, p_limit)`, `fal_account_update(p_actor, p_id, p_name, p_limit, p_enabled)`, `fal_account_set_key(p_actor, p_id, p_ciphertext, p_iv, p_tag, p_last4)`, `fal_account_recheck(p_actor, p_id, p_ok, p_detail)`, `fal_account_delete(p_actor, p_id)` — 오류 `fal_account_in_flight`·`fal_account_not_found`·`credit_admin_required`·유일 이름 `fal_accounts_name_live`
  - `fal_account_admin_list()`(암호문 없음), `fal_account_admin_events(p_limit integer)`, `fal_account_open_count(p_account uuid)`

- [ ] **Step 1: 실패하는 시험을 쓴다** — `scripts/tests/fal-account-pool.test.mjs`

```js
import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { testPostgres } from '../lib/test-credit-postgres.mjs';

/*
  202610010001 — fal 계정 풀(설계 2026-09-29 §3.3 · 보충 2026-10-01 · S3b).

  칸 잡기는 「켜진·막히지 않은·쉬지 않는 계정 중 남은 칸이 가장 큰 것」이고, 진행 중은 30분 창 안의 끝나지 않은
  요청이다. 키 바꾸기·지우기는 진행 중이 있으면 거절한다. 관리자 변경은 모두 `credit_admin_events` 에 남고
  암호문은 기록에 없다.
*/
const MIGRATION = '202610010001_fal_account_pool.sql';
const ADMIN = '93000000-0000-4000-8000-000000000001';
const ADMIN2 = '93000000-0000-4000-8000-000000000002';
const MEMBER = '93000000-0000-4000-8000-000000000003';
const A = 'a1000000-0000-4000-8000-000000000001';
const B = 'a1000000-0000-4000-8000-000000000002';
const C = 'a1000000-0000-4000-8000-000000000003';
let db;
const json = async (q) => JSON.parse(await db.sql(q));

const add = (id, name, limit = 20, actor = ADMIN) =>
  db.sql(`select fal_account_add('${actor}','${id}','${name}','Y2lwaGVy','aXY=','dGFn','${id.slice(-4)}',${limit});`);
const claim = async (exclude = []) => {
  const out = await db.sql(`select coalesce(json_agg(c), '[]') from fal_account_claim('fal-ai/x', array[${exclude.map((x) => `'${x}'`).join(',')}]::uuid[]) c;`);
  return JSON.parse(out)[0] ?? null;
};
const open = (id) => db.sql(`select fal_account_open_count('${id}');`).then(Number);

before(async () => {
  db = await testPostgres();
  await db.migrate([MIGRATION]);
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values
      ('${ADMIN}','a1@example.invalid',now()),('${ADMIN2}','a2@example.invalid',now()),('${MEMBER}','m@example.invalid',now());
    update profiles set status='active',role='admin' where id in ('${ADMIN}','${ADMIN2}');
    update profiles set status='active' where id='${MEMBER}';`);
});
after(async () => { await db?.close(); });
beforeEach(async () => {
  await db.sql(`delete from fal_requests; delete from fal_accounts; delete from credit_admin_events where action like 'fal_account_%';`);
});

test('both admins can add; a member cannot', async () => {
  await add(A, 'fal-1 (ai.dev 계정)', 20, ADMIN);
  await add(B, 'fal-2', 20, ADMIN2);
  await assert.rejects(add(C, 'fal-3', 20, MEMBER), /credit_admin_required/);
  assert.equal(await db.sql(`select count(*) from fal_accounts;`), '2');
});

test('the audit row has the name and last 4, never the ciphertext', async () => {
  await add(A, 'fal-1');
  const row = await json(`select to_jsonb(e) from (select action, input from credit_admin_events where action='fal_account_add') e;`);
  assert.equal(row.action, 'fal_account_add');
  assert.deepEqual(row.input, { id: A, name: 'fal-1', last4: '0001', limit: 20 });
  assert.doesNotMatch(JSON.stringify(row), /Y2lwaGVy|aXY=|dGFn/);
});

test('live names are unique, case and spaces ignored', async () => {
  await add(A, 'fal-1');
  await assert.rejects(add(B, ' FAL-1 '), /fal_accounts_name_live/);
});

test('claim picks the account with the most free slots and counts it', async () => {
  await add(A, 'small', 2);
  await add(B, 'big', 5);
  assert.equal((await claim()).account_id, B);   // 5 free vs 2
  assert.equal((await claim()).account_id, B);   // 4 vs 2
  assert.equal((await claim()).account_id, B);   // 3 vs 2
  assert.equal((await claim()).account_id, A);   // 2 vs 2 → older first
  assert.equal(await open(B), 3);
  assert.equal(await open(A), 1);
});

test('claim returns nothing when every account is full', async () => {
  await add(A, 'one', 1);
  assert.ok(await claim());
  assert.equal(await claim(), null);
});

test('claim skips excluded, disabled, cooling, locked, invalid and undecryptable accounts', async () => {
  await add(A, 'a'); await add(B, 'b'); await add(C, 'c');
  assert.notEqual((await claim([A, B])).account_id, A);
  await db.sql(`update fal_accounts set enabled=false where id='${A}';
                update fal_accounts set cooldown_until=now()+interval '1 minute' where id='${B}';`);
  assert.equal((await claim()).account_id, C);
  for (const state of ['locked', 'invalid', 'decrypt_failed']) {
    await db.sql(`update fal_accounts set state='${state}' where id='${C}';`);
    assert.equal(await claim(), null, state);
  }
});

test('release gives the slot back; finish frees it; old open rows stop counting after 30 minutes', async () => {
  await add(A, 'a', 1);
  const first = await claim();
  await db.sql(`select fal_request_release(${first.slot_id});`);
  assert.equal(await open(A), 0);
  const second = await claim();
  await db.sql(`select fal_request_bind(${second.slot_id}, 'req-1');`);
  assert.equal(await claim(), null);
  await db.sql(`select fal_request_finish('req-1');`);
  assert.equal(await open(A), 0);
  const third = await claim();
  await db.sql(`select fal_request_bind(${third.slot_id}, 'req-2');
                update fal_requests set claimed_at = now() - interval '31 minutes' where fal_request_id='req-2';`);
  assert.equal(await open(A), 0);
});

test('release does not delete a slot that already has a request id', async () => {
  await add(A, 'a');
  const slot = await claim();
  await db.sql(`select fal_request_bind(${slot.slot_id}, 'req-9'); select fal_request_release(${slot.slot_id});`);
  assert.equal(await db.sql(`select count(*) from fal_requests where fal_request_id='req-9';`), '1');
});

test('mark is true only on the first change; rate_limited cools for 60 seconds and bind clears it', async () => {
  await add(A, 'a');
  assert.equal(await db.sql(`select fal_account_mark('${A}','locked','User is locked');`), 't');
  assert.equal(await db.sql(`select fal_account_mark('${A}','locked','again');`), 'f');
  const locked = await json(`select to_jsonb(a) from (select state, last_error_kind, last_error_detail from fal_accounts where id='${A}') a;`);
  assert.deepEqual(locked, { state: 'locked', last_error_kind: 'locked', last_error_detail: 'again' });

  await db.sql(`update fal_accounts set state='ok' where id='${A}';`);
  await db.sql(`select fal_account_mark('${A}','rate_limited','429');`);
  const cool = await db.sql(`select extract(epoch from cooldown_until - now())::int from fal_accounts where id='${A}';`);
  assert.ok(Number(cool) > 50 && Number(cool) <= 60, cool);
  assert.equal(await claim(), null);
  await db.sql(`update fal_accounts set cooldown_until = now() - interval '1 second' where id='${A}';`);
  const slot = await claim();
  await db.sql(`select fal_request_bind(${slot.slot_id}, 'req-3');`);
  assert.equal(await db.sql(`select state || ':' || coalesce(cooldown_until::text,'none') from fal_accounts where id='${A}';`), 'ok:none');
});

test('an unknown failure kind is refused', async () => {
  await add(A, 'a');
  await assert.rejects(db.sql(`select fal_account_mark('${A}','mystery','x');`), /unknown kind/);
});

test('update writes enable/disable/update audit names', async () => {
  await add(A, 'a');
  await db.sql(`select fal_account_update('${ADMIN}','${A}','a',20,false);
                select fal_account_update('${ADMIN2}','${A}','a',20,true);
                select fal_account_update('${ADMIN}','${A}','a2',30,true);`);
  const actions = await json(`select json_agg(action order by created_at, action) from credit_admin_events where action like 'fal_account_%' and action <> 'fal_account_add';`);
  assert.deepEqual(actions.sort(), ['fal_account_disable', 'fal_account_enable', 'fal_account_update']);
  await assert.rejects(db.sql(`select fal_account_update('${ADMIN}','${A}','a',0,true);`), /concurrency_limit/);
  await assert.rejects(db.sql(`select fal_account_update('${ADMIN}','${A}','a',201,true);`), /concurrency_limit/);
});

test('key change and delete are refused while a request is in flight, then allowed', async () => {
  await add(A, 'a');
  const slot = await claim();
  await db.sql(`select fal_request_bind(${slot.slot_id}, 'req-4');`);
  await assert.rejects(db.sql(`select fal_account_set_key('${ADMIN}','${A}','bmV3','aXY=','dGFn','9999');`), /fal_account_in_flight/);
  await assert.rejects(db.sql(`select fal_account_delete('${ADMIN}','${A}');`), /fal_account_in_flight/);
  await db.sql(`select fal_request_finish('req-4');`);
  await db.sql(`select fal_account_set_key('${ADMIN}','${A}','bmV3','aXY=','dGFn','9999');`);
  assert.equal(await db.sql(`select key_last4 || ':' || state from fal_accounts where id='${A}';`), '9999:ok');
  await db.sql(`select fal_account_delete('${ADMIN}','${A}');`);
  const gone = await json(`select to_jsonb(a) from (select enabled, key_ciphertext, deleted_at is not null as deleted from fal_accounts where id='${A}') a;`);
  assert.deepEqual(gone, { enabled: false, key_ciphertext: null, deleted: true });
  assert.equal(await db.sql(`select count(*) from fal_account_admin_list();`), '0');
  // 지운 이름은 다시 쓸 수 있다.
  await add(B, 'a');
});

test('recheck sets ok or invalid and is recorded', async () => {
  await add(A, 'a');
  await db.sql(`select fal_account_mark('${A}','locked','x'); select fal_account_recheck('${ADMIN}','${A}',true,null);`);
  assert.equal(await db.sql(`select state from fal_accounts where id='${A}';`), 'ok');
  await db.sql(`select fal_account_recheck('${ADMIN}','${A}',false,'invalid key credentials');`);
  assert.equal(await db.sql(`select state || ':' || last_error_detail from fal_accounts where id='${A}';`), 'invalid:invalid key credentials');
  assert.equal(await db.sql(`select count(*) from credit_admin_events where action='fal_account_check';`), '2');
});

test('the admin list and history never carry ciphertext', async () => {
  await add(A, 'a');
  const list = await json(`select json_agg(l) from fal_account_admin_list() l;`);
  assert.equal(list[0].key_last4, '0001');
  assert.equal(list[0].in_flight, 0);
  assert.equal('key_ciphertext' in list[0], false);
  const history = await json(`select json_agg(h) from fal_account_admin_events(20) h;`);
  assert.equal(history[0].actor_email, 'a1@example.invalid');
  assert.doesNotMatch(JSON.stringify(history), /Y2lwaGVy/);
});

test('members cannot read the tables or call any function', async () => {
  for (const table of ['fal_accounts', 'fal_requests']) {
    assert.equal(await db.sql(`select has_table_privilege('anon','public.${table}','select');`), 'f');
    assert.equal(await db.sql(`select has_table_privilege('authenticated','public.${table}','select');`), 'f');
    assert.equal(await db.sql(`select relrowsecurity from pg_class where oid='public.${table}'::regclass;`), 't');
  }
  for (const fn of ['fal_account_claim(text,uuid[])', 'fal_account_add(uuid,uuid,text,text,text,text,text,integer)', 'fal_account_admin_list()']) {
    assert.equal(await db.sql(`select has_function_privilege('authenticated','public.${fn}','execute');`), 'f', fn);
    assert.equal(await db.sql(`select has_function_privilege('anon','public.${fn}','execute');`), 'f', fn);
    assert.equal(await db.sql(`select has_function_privilege('service_role','public.${fn}','execute');`), 't', fn);
  }
});

test('running the file twice is safe', async () => {
  await db.sql(await readFile(new URL(`../../supabase/migrations/${MIGRATION}`, import.meta.url), 'utf8'));
  assert.equal(await db.sql(`select count(*) from pg_proc where proname='fal_account_claim';`), '1');
});
```

`package.json` 의 `"test:credit-db"` 값 끝(`… scripts/tests/ai-cost-admin.test.mjs`) 뒤에 ` scripts/tests/fal-account-pool.test.mjs` 를 붙인다.

- [ ] **Step 2: 실패를 본다**

Run: `node --test scripts/tests/fal-account-pool.test.mjs`
Expected: FAIL — `Migration 202610010001_fal_account_pool.sql: ENOENT`(파일이 없다). PostgreSQL 17 이 `C:/Program Files/PostgreSQL/17/bin` 에 있어야 한다(없으면 `TEST_PG_BIN`)

- [ ] **Step 3: 마이그레이션을 쓴다** — `supabase/migrations/202610010001_fal_account_pool.sql`

```sql
-- fal 계정 풀 (설계 2026-09-29 §3.3 · 보충 2026-10-01 · S3b).
--
-- 관리자가 fal 계정(키)을 여러 개 등록하면, 서버가 새 제출마다 **여유가 가장 큰 켜진 계정**을 골라 보낸다.
-- 키는 앱이 AES-256-GCM 으로 암호화해 넣는다(열쇠는 서버 `FAL_KEY_ENCRYPTION_SECRET`, 추가 인증 데이터 =
-- 계정 id). 이 DB 는 원문 키를 보지 않는다.
--
-- ⚠ 공유 DB — detail-page-studio 가 같은 Supabase 를 본다. **새 표·새 함수만 더한다.** 기존 표·함수는
--   다시 정의하지 않는다(`credit_require_admin` 은 부르기만 한다).
-- ⚠ 순서 — **이 파일 먼저, 그다음 앱.** 앱이 먼저 나가도 생성은 멈추지 않는다: 열쇠 환경변수가 없으면 풀을
--   보지 않고 `FAL_KEY` 로 보낸다(오늘과 같다).
--
-- 「진행 중」 = `fal_requests` 에서 `finished_at is null` 이고 잡은 지 **30분 이내**. 30분은 카드뉴스가 fal 상태를
-- 포기하는 시간(`lib/sns/queued-flow.ts` `QUEUE_GIVE_UP_MS`)과 같다 — 화면을 닫아 아무도 다시 묻지 않는 요청이
-- 계정 칸을 영원히 쥐지 않게 한다.

create table if not exists public.fal_accounts (
  id                 uuid primary key,
  name               text not null check (char_length(btrim(name)) between 1 and 80),
  -- 암호문·IV·태그(base64). 지운 계정은 비운다.
  key_ciphertext     text,
  key_iv             text,
  key_tag            text,
  key_version        smallint not null default 1 check (key_version >= 1),
  key_last4          text not null check (char_length(key_last4) = 4),
  enabled            boolean not null default true,
  concurrency_limit  integer not null default 20 check (concurrency_limit between 1 and 200),
  state              text not null default 'ok'
                     check (state in ('ok','rate_limited','locked','invalid','decrypt_failed')),
  cooldown_until     timestamptz,
  last_error_kind    text check (last_error_kind in ('rate_limited','locked','invalid','decrypt_failed')),
  last_error_at      timestamptz,
  last_error_detail  text check (char_length(last_error_detail) <= 300),
  created_by         uuid not null references public.profiles(id),
  updated_by         uuid references public.profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  constraint fal_accounts_key_present check (
    deleted_at is not null or (key_ciphertext is not null and key_iv is not null and key_tag is not null)
  )
);

-- 살아 있는 계정끼리 이름이 겹치지 않게(관리자 화면에서 구분하는 유일한 이름이다).
create unique index if not exists fal_accounts_name_live
  on public.fal_accounts (lower(btrim(name))) where deleted_at is null;

-- 제출(시도)마다 한 줄: 어느 계정으로 보냈는가. 상태·결과·취소는 이 계정의 키로 한다.
create table if not exists public.fal_requests (
  id              bigint generated always as identity primary key,
  account_id      uuid not null references public.fal_accounts(id),
  endpoint        text not null check (char_length(endpoint) between 1 and 200),
  -- 제출 전에 칸을 잡고(null), 받은 번호를 붙인다.
  fal_request_id  text unique,
  claimed_at      timestamptz not null default now(),
  finished_at     timestamptz
);

create index if not exists fal_requests_open_idx
  on public.fal_requests (account_id, claimed_at) where finished_at is null;

alter table public.fal_accounts enable row level security;
alter table public.fal_requests enable row level security;
revoke all on table public.fal_accounts from public, anon, authenticated;
revoke all on table public.fal_requests from public, anon, authenticated;

-- ── 진행 중 수 ─────────────────────────────────────────────────────
create or replace function public.fal_account_open_count(p_account uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from fal_requests r
  where r.account_id = p_account and r.finished_at is null and r.claimed_at > now() - interval '30 minutes'
$$;

-- ── 칸 잡기 ─────────────────────────────────────────────────────────
--
-- 켜졌고·지우지 않았고·막히지 않았고(locked/invalid/decrypt_failed)·쉬는 중이 아니고·이번 제출에서 이미 실패한
-- 계정이 아닌 것 가운데 **남은 칸이 가장 큰** 계정 하나. 다 찼으면 행 없이 돌아간다(앱: 「잠시 뒤 다시」).
-- 둘이 동시에 잡아도 한도를 넘지 않게 짧은 잠금 하나로 줄을 세운다(`credit_lock` 과 다른 번호).
create or replace function public.fal_account_claim(p_endpoint text, p_exclude uuid[])
returns table(slot_id bigint, account_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid;
  v_slot bigint;
begin
  perform pg_advisory_xact_lock(922202610::bigint);
  select a.id into v_account
  from fal_accounts a
  cross join lateral (select fal_account_open_count(a.id) as open) o
  where a.deleted_at is null
    and a.enabled
    and a.state not in ('locked','invalid','decrypt_failed')
    and (a.cooldown_until is null or a.cooldown_until <= now())
    and not (a.id = any(coalesce(p_exclude, '{}'::uuid[])))
    and o.open < a.concurrency_limit
  order by a.concurrency_limit - o.open desc, a.created_at, a.id
  limit 1;

  if v_account is null then
    return;
  end if;

  insert into fal_requests(account_id, endpoint) values (v_account, p_endpoint) returning id into v_slot;
  return query select v_slot, v_account;
end $$;

-- 받은 번호를 붙인다. 이 계정으로 제출이 됐으니 「한도 걸림」 표시는 푼다.
create or replace function public.fal_request_bind(p_slot bigint, p_request text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid;
begin
  update fal_requests set fal_request_id = p_request
  where id = p_slot and fal_request_id is null
  returning account_id into v_account;
  if v_account is not null then
    update fal_accounts set state = 'ok', cooldown_until = null
    where id = v_account and state = 'rate_limited';
  end if;
end $$;

-- 제출이 실패했다. 잡은 칸을 돌려준다.
create or replace function public.fal_request_release(p_slot bigint)
returns void
language sql
security definer
set search_path = public
as $$
  delete from fal_requests where id = p_slot and fal_request_id is null
$$;

-- 끝났다(성공·실패·포기). 진행 중 수에서 빠진다.
create or replace function public.fal_request_finish(p_request text)
returns void
language sql
security definer
set search_path = public
as $$
  update fal_requests set finished_at = now() where fal_request_id = p_request and finished_at is null
$$;

-- 계정에 탈이 났다. **상태가 바뀐 첫 호출만 참** — 메일을 한 번만 보낸다.
-- 한도 걸림(rate_limited)은 60초 쉬고 다시 쓴다. 나머지는 관리자가 키를 바꾸거나 「다시 확인」할 때까지 뺀다.
create or replace function public.fal_account_mark(p_account uuid, p_kind text, p_detail text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev text;
begin
  if p_kind not in ('rate_limited','locked','invalid','decrypt_failed') then
    raise exception 'fal_account_mark: unknown kind %', p_kind;
  end if;
  select state into v_prev from fal_accounts where id = p_account and deleted_at is null for update;
  if not found then
    return false;
  end if;
  update fal_accounts set
    state = p_kind,
    last_error_kind = p_kind,
    last_error_at = now(),
    last_error_detail = left(coalesce(p_detail, ''), 300),
    cooldown_until = case when p_kind = 'rate_limited' then now() + interval '60 seconds' else cooldown_until end
  where id = p_account;
  return v_prev is distinct from p_kind;
end $$;

-- ── 관리자(두 명 모두, `credit_require_admin`) ─────────────────────
-- 모든 변경은 `credit_admin_events` 에 한 줄. **암호문은 기록에 싣지 않는다** — 이름·끝 4자리·한도만.

create or replace function public.fal_account_add(
  p_actor uuid, p_id uuid, p_name text, p_ciphertext text, p_iv text, p_tag text, p_last4 text, p_limit integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform credit_require_admin(p_actor);
  insert into fal_accounts(id, name, key_ciphertext, key_iv, key_tag, key_last4, concurrency_limit, created_by, updated_by)
  values (p_id, btrim(p_name), p_ciphertext, p_iv, p_tag, p_last4, coalesce(p_limit, 20), p_actor, p_actor);
  insert into credit_admin_events(id, actor_id, action, target_ids, reason, input)
  values (gen_random_uuid(), p_actor, 'fal_account_add', '{}'::uuid[], 'fal 계정 등록',
          jsonb_build_object('id', p_id, 'name', btrim(p_name), 'last4', p_last4, 'limit', coalesce(p_limit, 20)));
end $$;

create or replace function public.fal_account_update(
  p_actor uuid, p_id uuid, p_name text, p_limit integer, p_enabled boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old fal_accounts%rowtype;
  v_action text;
begin
  perform credit_require_admin(p_actor);
  select * into v_old from fal_accounts where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'fal_account_not_found';
  end if;
  update fal_accounts set name = btrim(p_name), concurrency_limit = p_limit, enabled = p_enabled,
    updated_by = p_actor, updated_at = now()
  where id = p_id;
  v_action := case
    when v_old.enabled and not p_enabled then 'fal_account_disable'
    when not v_old.enabled and p_enabled then 'fal_account_enable'
    else 'fal_account_update' end;
  insert into credit_admin_events(id, actor_id, action, target_ids, reason, input)
  values (gen_random_uuid(), p_actor, v_action, '{}'::uuid[], 'fal 계정 설정 변경',
          jsonb_build_object('id', p_id,
            'before', jsonb_build_object('name', v_old.name, 'limit', v_old.concurrency_limit, 'enabled', v_old.enabled),
            'after', jsonb_build_object('name', btrim(p_name), 'limit', p_limit, 'enabled', p_enabled)));
end $$;

-- 키 바꾸기. **진행 중 요청이 있으면 거절** — 다른 fal 계정의 키로 바뀌면 진행 중 요청을 더는 물을 수 없다.
create or replace function public.fal_account_set_key(
  p_actor uuid, p_id uuid, p_ciphertext text, p_iv text, p_tag text, p_last4 text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old fal_accounts%rowtype;
begin
  perform credit_require_admin(p_actor);
  perform pg_advisory_xact_lock(922202610::bigint);
  select * into v_old from fal_accounts where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'fal_account_not_found';
  end if;
  if fal_account_open_count(p_id) > 0 then
    raise exception 'fal_account_in_flight';
  end if;
  update fal_accounts set key_ciphertext = p_ciphertext, key_iv = p_iv, key_tag = p_tag, key_last4 = p_last4,
    key_version = 1, state = 'ok', cooldown_until = null, updated_by = p_actor, updated_at = now()
  where id = p_id;
  insert into credit_admin_events(id, actor_id, action, target_ids, reason, input)
  values (gen_random_uuid(), p_actor, 'fal_account_key', '{}'::uuid[], 'fal 계정 키 교체',
          jsonb_build_object('id', p_id, 'name', v_old.name, 'last4_before', v_old.key_last4, 'last4_after', p_last4));
end $$;

-- 「다시 확인」 결과(앱이 무료 요청으로 확인한 뒤 부른다).
create or replace function public.fal_account_recheck(p_actor uuid, p_id uuid, p_ok boolean, p_detail text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  perform credit_require_admin(p_actor);
  select name into v_name from fal_accounts where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'fal_account_not_found';
  end if;
  if p_ok then
    update fal_accounts set state = 'ok', cooldown_until = null, updated_at = now() where id = p_id;
  else
    update fal_accounts set state = 'invalid', last_error_kind = 'invalid', last_error_at = now(),
      last_error_detail = left(coalesce(p_detail, ''), 300), updated_at = now()
    where id = p_id;
  end if;
  insert into credit_admin_events(id, actor_id, action, target_ids, reason, input, result)
  values (gen_random_uuid(), p_actor, 'fal_account_check', '{}'::uuid[], 'fal 계정 다시 확인',
          jsonb_build_object('id', p_id, 'name', v_name), jsonb_build_object('ok', p_ok));
end $$;

-- 지우기. **진행 중 요청이 있으면 거절.** 행은 남기고(옛 요청이 어느 계정이었는지) 키를 비운다.
create or replace function public.fal_account_delete(p_actor uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old fal_accounts%rowtype;
begin
  perform credit_require_admin(p_actor);
  perform pg_advisory_xact_lock(922202610::bigint);
  select * into v_old from fal_accounts where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'fal_account_not_found';
  end if;
  if fal_account_open_count(p_id) > 0 then
    raise exception 'fal_account_in_flight';
  end if;
  update fal_accounts set deleted_at = now(), enabled = false, key_ciphertext = null, key_iv = null, key_tag = null,
    updated_by = p_actor, updated_at = now()
  where id = p_id;
  insert into credit_admin_events(id, actor_id, action, target_ids, reason, input)
  values (gen_random_uuid(), p_actor, 'fal_account_delete', '{}'::uuid[], 'fal 계정 삭제',
          jsonb_build_object('id', p_id, 'name', v_old.name, 'last4', v_old.key_last4));
end $$;

-- 관리자 화면 목록. **암호문은 내보내지 않는다.**
create or replace function public.fal_account_admin_list()
returns table(
  id uuid, name text, key_last4 text, enabled boolean, concurrency_limit integer, state text,
  cooldown_until timestamptz, last_error_kind text, last_error_at timestamptz, last_error_detail text,
  in_flight integer, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.name, a.key_last4, a.enabled, a.concurrency_limit, a.state, a.cooldown_until,
    a.last_error_kind, a.last_error_at, a.last_error_detail, fal_account_open_count(a.id), a.created_at
  from fal_accounts a
  where a.deleted_at is null
  order by a.created_at, a.id
$$;

-- 관리자 화면의 변경 기록(최근 n 줄).
create or replace function public.fal_account_admin_events(p_limit integer)
returns table(created_at timestamptz, action text, actor_email text, input jsonb, result jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select e.created_at, e.action, p.email, e.input, e.result
  from credit_admin_events e
  left join profiles p on p.id = e.actor_id
  where e.action in ('fal_account_add','fal_account_update','fal_account_enable','fal_account_disable',
                     'fal_account_key','fal_account_check','fal_account_delete')
  order by e.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
$$;

-- ── 권한: 서버(service_role)만 ─────────────────────────────────────
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.fal_account_open_count(uuid)',
    'public.fal_account_claim(text,uuid[])',
    'public.fal_request_bind(bigint,text)',
    'public.fal_request_release(bigint)',
    'public.fal_request_finish(text)',
    'public.fal_account_mark(uuid,text,text)',
    'public.fal_account_add(uuid,uuid,text,text,text,text,text,integer)',
    'public.fal_account_update(uuid,uuid,text,integer,boolean)',
    'public.fal_account_set_key(uuid,uuid,text,text,text,text)',
    'public.fal_account_recheck(uuid,uuid,boolean,text)',
    'public.fal_account_delete(uuid,uuid)',
    'public.fal_account_admin_list()',
    'public.fal_account_admin_events(integer)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_fn);
    execute format('grant execute on function %s to service_role', v_fn);
  end loop;
end $$;

-- ── 하나씩인지 센다(42725 교훈) ────────────────────────────────────
do $$
declare
  v_name text;
begin
  foreach v_name in array array[
    'fal_account_open_count','fal_account_claim','fal_request_bind','fal_request_release','fal_request_finish',
    'fal_account_mark','fal_account_add','fal_account_update','fal_account_set_key','fal_account_recheck',
    'fal_account_delete','fal_account_admin_list','fal_account_admin_events'
  ] loop
    if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = v_name) <> 1 then
      raise exception '% 가 하나가 아닙니다', v_name;
    end if;
  end loop;
  raise notice 'fal 계정 풀 표 둘과 함수 13개를 만들었습니다.';
end $$;

-- 확인(적용 뒤, 읽기만):
--   select to_regclass('public.fal_accounts'), to_regclass('public.fal_requests');
--   select has_table_privilege('anon', 'public.fal_accounts', 'select');            -- false
--   select has_function_privilege('authenticated', 'public.fal_account_claim(text,uuid[])', 'execute'); -- false
--   select count(*) from public.fal_accounts;                                        -- 0 (앱 화면에서 등록 전)
```

- [ ] **Step 4: 통과를 본다**

Run: `node --test scripts/tests/fal-account-pool.test.mjs && pnpm test:credit-db`
Expected: `ℹ pass 16`, `ℹ fail 0`; 이어서 전체 `ℹ fail 0`(계획 검증 때 127개 — 기존 111 + 새 16)

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/202610010001_fal_account_pool.sql scripts/tests/fal-account-pool.test.mjs package.json
git commit -m "feat(fal-pool): fal 계정 풀 표와 DB 함수

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 키 잠그기

**Files:**
- Create: `apps/web/lib/fal/pool/key-crypto.ts`
- Test: `apps/web/lib/fal/pool/__tests__/key-crypto.test.ts`

**Interfaces:**
- Produces: `FAL_KEY_VERSION = 1`, `type MasterKey = { ok: true; key: Buffer } | { ok: false; reason: "missing" | "invalid" }`, `readMasterKey(raw: string | undefined): MasterKey`, `interface SealedFalKey { ciphertext: string; iv: string; tag: string }`(base64), `sealFalKey(master: Buffer, accountId: string, plain: string): SealedFalKey`, `openFalKey(master: Buffer, accountId: string, sealed: SealedFalKey): string`(못 풀면 던짐), `normalizeFalKey(raw: string): string | null`, `lastFourOf(key: string): string`

- [ ] **Step 1: 실패하는 시험을 쓴다**

```ts
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { lastFourOf, normalizeFalKey, openFalKey, readMasterKey, sealFalKey } from "../key-crypto";

/**
 * **키 잠그기**(설계 2026-09-29 §3.3). DB 를 다른 제품과 함께 쓰므로 암호화가 사실상 유일한 방어다.
 */
const 열쇠 = randomBytes(32);
const 계정 = "a1000000-0000-4000-8000-000000000001";
const 원문 = "11111111-2222-3333-4444-555555555555:0123456789abcdef";

describe("열쇠 읽기", () => {
  it("32바이트 base64 만 받는다 — 따옴표는 벗긴다", () => {
    const b64 = 열쇠.toString("base64");
    expect(readMasterKey(b64)).toEqual({ ok: true, key: 열쇠 });
    expect(readMasterKey(`"${b64}"`)).toEqual({ ok: true, key: 열쇠 });
    expect(readMasterKey(` '${b64}' `)).toEqual({ ok: true, key: 열쇠 });
  });

  it("없으면 missing, 길이·모양이 틀리면 invalid", () => {
    expect(readMasterKey(undefined)).toEqual({ ok: false, reason: "missing" });
    expect(readMasterKey('""')).toEqual({ ok: false, reason: "missing" });
    expect(readMasterKey(randomBytes(16).toString("base64"))).toEqual({ ok: false, reason: "invalid" });
    expect(readMasterKey("not base64 at all!")).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("잠그고 풀기", () => {
  it("같은 열쇠·같은 계정이면 풀린다. 원문은 암호문 어디에도 없다", () => {
    const sealed = sealFalKey(열쇠, 계정, 원문);
    expect(openFalKey(열쇠, 계정, sealed)).toBe(원문);
    expect(JSON.stringify(sealed)).not.toContain("0123456789abcdef");
    expect(Buffer.from(sealed.iv, "base64")).toHaveLength(12);
    expect(Buffer.from(sealed.tag, "base64")).toHaveLength(16);
  });

  it("같은 키도 잠글 때마다 IV·암호문이 다르다", () => {
    const a = sealFalKey(열쇠, 계정, 원문);
    const b = sealFalKey(열쇠, 계정, 원문);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("**다른 계정 행으로 옮겨 붙이면 안 풀린다**(추가 인증 데이터 = 계정 id)", () => {
    const sealed = sealFalKey(열쇠, 계정, 원문);
    expect(() => openFalKey(열쇠, "a1000000-0000-4000-8000-000000000002", sealed)).toThrow();
  });

  it("열쇠가 다르거나 한 글자라도 바뀌면 안 풀린다", () => {
    const sealed = sealFalKey(열쇠, 계정, 원문);
    expect(() => openFalKey(randomBytes(32), 계정, sealed)).toThrow();
    const flipped = Buffer.from(sealed.ciphertext, "base64");
    flipped[0] = flipped[0]! ^ 1;
    expect(() => openFalKey(열쇠, 계정, { ...sealed, ciphertext: flipped.toString("base64") })).toThrow();
  });

  it("잘린 태그는 받지 않는다", () => {
    const sealed = sealFalKey(열쇠, 계정, 원문);
    const short = Buffer.from(sealed.tag, "base64").subarray(0, 4).toString("base64");
    expect(() => openFalKey(열쇠, 계정, { ...sealed, tag: short })).toThrow();
  });
});

describe("붙여 넣은 키 다듬기", () => {
  it("앞뒤 공백·따옴표를 벗기고 끝 4자리를 뽑는다", () => {
    expect(normalizeFalKey(`  "${원문}"\n`)).toBe(원문);
    expect(lastFourOf(원문)).toBe("cdef");
  });

  it("너무 짧거나 안에 공백이 있으면 받지 않는다", () => {
    expect(normalizeFalKey("short")).toBeNull();
    expect(normalizeFalKey("abcd efgh ijkl mnop qrst")).toBeNull();
  });
});
```

- [ ] **Step 2: 실패를 본다** — Run: `cd apps/web && npx vitest run lib/fal/pool/__tests__/key-crypto.test.ts` · Expected: FAIL `Failed to load url ../key-crypto`

- [ ] **Step 3: 만든다** — `apps/web/lib/fal/pool/key-crypto.ts`

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * fal 키를 DB 에 넣기 전에 잠근다(설계 2026-09-29 §3.3 「암호화」).
 *
 * 비유: 키를 금고(DB)에 넣되, 금고 열쇠(`FAL_KEY_ENCRYPTION_SECRET`)는 서버에만 둔다. DB 를 다른 제품과
 * 함께 쓰므로 금고만 열린다고 키가 새지 않게 하는 것이 사실상 유일한 방어다.
 *
 * - AES-256-GCM, 기록마다 12바이트 무작위 IV, 16바이트 인증 태그
 * - **추가 인증 데이터 = 계정 id** — 암호문을 다른 행으로 옮겨 붙이면 풀리지 않는다
 * - 열쇠는 32바이트 무작위 값의 base64(`openssl rand -base64 32`). 운영 `app.env` 는 값을 큰따옴표로
 *   감싸 두므로(systemd 가 벗긴다) 혹시 남은 따옴표도 벗긴다
 */

export const FAL_KEY_VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export type MasterKey = { ok: true; key: Buffer } | { ok: false; reason: "missing" | "invalid" };

export function readMasterKey(raw: string | undefined): MasterKey {
  const value = (raw ?? "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();
  if (!value) return { ok: false, reason: "missing" };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return { ok: false, reason: "invalid" };
  const key = Buffer.from(value, "base64");
  return key.length === 32 ? { ok: true, key } : { ok: false, reason: "invalid" };
}

export interface SealedFalKey {
  ciphertext: string;
  iv: string;
  tag: string;
}

export function sealFalKey(master: Buffer, accountId: string, plain: string): SealedFalKey {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", master, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(accountId, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

/** 풀지 못하면(열쇠가 다름·다른 행의 암호문·변조) 던진다. */
export function openFalKey(master: Buffer, accountId: string, sealed: SealedFalKey): string {
  const tag = Buffer.from(sealed.tag, "base64");
  if (tag.length !== TAG_BYTES) throw new Error("fal key tag has the wrong length");
  const decipher = createDecipheriv("aes-256-gcm", master, Buffer.from(sealed.iv, "base64"), { authTagLength: TAG_BYTES });
  decipher.setAAD(Buffer.from(accountId, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, "base64")), decipher.final()]).toString("utf8");
}

/**
 * 붙여 넣은 키를 다듬는다. 앞뒤 공백·따옴표는 벗기고, 안에 공백이 있거나 길이가 이상하면 null.
 * (fal 키는 `아이디:비밀` 모양이지만 모양을 단정하지 않는다 — 확인은 fal 에 한 번 물어서 한다.)
 */
export function normalizeFalKey(raw: string): string | null {
  const value = raw.trim().replace(/^(["'])(.*)\1$/, "$2").trim();
  if (value.length < 16 || value.length > 300 || /\s/.test(value)) return null;
  return value;
}

export function lastFourOf(key: string): string {
  return key.slice(-4);
}
```

- [ ] **Step 4: 통과를 본다** — Run: 같은 명령 · Expected: PASS(9개)

- [ ] **Step 5: 커밋**

```bash
git add apps/web/lib/fal/pool/key-crypto.ts apps/web/lib/fal/pool/__tests__/key-crypto.test.ts
git commit -m "feat(fal-pool): fal 키를 계정 id 에 묶어 AES-256-GCM 으로 잠근다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: DB 길과 관리자 메일

**Files:**
- Create: `apps/web/lib/fal/pool/store.ts`, `apps/web/lib/fal/pool/alert.ts`
- Test: `apps/web/lib/fal/pool/__tests__/store.test.ts`, `apps/web/lib/fal/pool/__tests__/alert.test.ts`

**Interfaces:**
- Consumes: Task 1 의 함수 이름·인자 이름, `createSupabaseAdminClient()`(부를 때 `await import`)
- Produces:
  - `type FalAccountState = "ok" | "rate_limited" | "locked" | "invalid" | "decrypt_failed"`, `type FalAccountFailure = Exclude<FalAccountState, "ok">`
  - `interface FalAccountRow { id; name; enabled; state; key_ciphertext; key_iv; key_tag }`
  - `interface FalPoolStore { liveAccounts(); claim(endpoint, exclude): Promise<{ slotId: number; accountId: string } | null>; bind(slotId, requestId); release(slotId); finish(requestId); accountOf(requestId): Promise<string | null>; mark(accountId, kind, detail): Promise<boolean> }`, `supabaseFalPoolStore(): FalPoolStore`
  - `type FalPoolAlertKind = "locked" | "invalid" | "decrypt_failed" | "master_key_missing"`, `interface FalPoolAlert { kind; accountName: string; detail: string }`, `falPoolAlertMail(event): { subject; text }`, `sendFalPoolAlert(event, environment?, makeTransport?): Promise<void>`(던지지 않음)

- [ ] **Step 1: 실패하는 시험을 쓴다** — `store.test.ts`(마이그레이션 글에서 인자 이름을 읽어 맞춰 본다)

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **DB 길이 마이그레이션의 함수 이름·인자 이름과 같은가.** RPC 는 이름이 하나라도 틀리면 운영에서야
 * 「함수 없음」으로 드러난다(42883). 마이그레이션 글에서 인자 이름을 읽어 맞춰 본다.
 */
const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
let rpcData: unknown = null;
const queries: string[] = [];
const fake = {
  rpc: async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    return { data: rpcData, error: null };
  },
  from: (table: string) => {
    queries.push(`from ${table}`);
    const chain = {
      select: (columns: string) => { queries.push(`select ${columns}`); return chain; },
      is: (column: string, value: unknown) => { queries.push(`is ${column} ${String(value)}`); return Promise.resolve({ data: [], error: null }); },
      eq: (column: string, value: unknown) => { queries.push(`eq ${column} ${String(value)}`); return chain; },
      maybeSingle: async () => ({ data: { account_id: "acct-1" }, error: null }),
    };
    return chain;
  },
};
vi.mock("../../../supabase/admin", () => ({ createSupabaseAdminClient: () => fake }));

const { supabaseFalPoolStore } = await import("../store");

const migration = readFileSync(join(__dirname, "..", "..", "..", "..", "..", "..", "supabase", "migrations", "202610010001_fal_account_pool.sql"), "utf8");
function paramsOf(fn: string): string[] {
  const match = new RegExp(String.raw`create or replace function public\.${fn}\(([^)]*)\)`).exec(migration);
  if (!match) throw new Error(`${fn} 가 마이그레이션에 없습니다`);
  return [...match[1]!.matchAll(/\b(p_\w+)/g)].map((m) => m[1]!);
}

beforeEach(() => {
  calls.length = 0;
  queries.length = 0;
  rpcData = null;
});

describe("supabaseFalPoolStore", () => {
  const store = supabaseFalPoolStore();

  it.each([
    ["claim", () => store.claim("fal-ai/x", ["a"]), "fal_account_claim"],
    ["bind", () => store.bind(7, "req-1"), "fal_request_bind"],
    ["release", () => store.release(7), "fal_request_release"],
    ["finish", () => store.finish("req-1"), "fal_request_finish"],
    ["mark", () => store.mark("acct", "locked", "x"), "fal_account_mark"],
  ] as const)("%s 는 %s 를 마이그레이션의 인자 이름 그대로 부른다", async (_name, run, fn) => {
    await run();
    expect(calls[0]!.fn).toBe(fn);
    expect(Object.keys(calls[0]!.args).sort()).toEqual(paramsOf(fn).sort());
  });

  it("칸 잡기는 첫 행을 숫자 칸 번호로 돌려주고, 없으면 null", async () => {
    rpcData = [{ slot_id: "12", account_id: "acct-1" }];
    expect(await store.claim("e", [])).toEqual({ slotId: 12, accountId: "acct-1" });
    rpcData = [];
    expect(await store.claim("e", [])).toBeNull();
  });

  it("표시는 DB 가 참을 줄 때만 참", async () => {
    rpcData = true;
    expect(await store.mark("a", "invalid", "")).toBe(true);
    rpcData = false;
    expect(await store.mark("a", "invalid", "")).toBe(false);
  });

  it("목록은 지우지 않은 계정만, 암호문 칸까지 읽는다(서버 안에서만 푼다)", async () => {
    await store.liveAccounts();
    expect(queries).toEqual(["from fal_accounts", "select id,name,enabled,state,key_ciphertext,key_iv,key_tag", "is deleted_at null"]);
  });

  it("요청 번호로 계정을 찾는다", async () => {
    expect(await store.accountOf("req-9")).toBe("acct-1");
    expect(queries).toEqual(["from fal_requests", "select account_id", "eq fal_request_id req-9"]);
  });
});
```

`alert.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { falPoolAlertMail, sendFalPoolAlert } from "../alert";

/**
 * **관리자 메일**(보충 2026-10-01). 감시 스크립트와 같은 SMTP 해석, `ALERT_EMAIL` 로. 메일이 실패해도 던지지
 * 않는다 — 생성은 다른 계정으로 계속된다.
 */
const 환경 = {
  ALERT_EMAIL: "ops@example.invalid",
  SMTP_HOST: "smtp.example.invalid",
  SMTP_PORT: "465",
  SMTP_USER: "bot@example.invalid",
  SMTP_PASS: "pw",
};

afterEach(() => vi.restoreAllMocks());

describe("falPoolAlertMail", () => {
  it("무엇이 났고 무엇을 하면 되는지 — 계정 이름과 fal 원문을 싣는다", () => {
    const mail = falPoolAlertMail({ kind: "locked", accountName: "fal-1 (ai.dev 계정)", detail: "User is locked" });
    expect(mail.subject).toBe("[FormWith] fal 계정 잔액이 바닥나 잠겼습니다 (fal-1 (ai.dev 계정))");
    expect(mail.text).toContain("「다시 확인」");
    expect(mail.text).toContain("fal 응답: User is locked");
  });

  it("**키 원문은 어디에도 없다** — 이름·원문 응답만 받는다", () => {
    const mail = falPoolAlertMail({ kind: "invalid", accountName: "a", detail: "invalid key credentials" });
    expect(Object.keys(mail)).toEqual(["subject", "text"]);
  });
});

describe("sendFalPoolAlert", () => {
  it("app.env 의 SMTP 로 ALERT_EMAIL 에 보낸다 — 465 면 secure, from 은 SMTP_USER", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const sent: unknown[] = [];
    const options: unknown[] = [];
    await sendFalPoolAlert({ kind: "invalid", accountName: "a", detail: "x" }, 환경, (o) => {
      options.push(o);
      return { sendMail: async (mail) => { sent.push(mail); } };
    });
    expect(options).toEqual([{ host: "smtp.example.invalid", port: 465, secure: true, auth: { user: "bot@example.invalid", pass: "pw" } }]);
    expect(sent).toEqual([expect.objectContaining({ from: "bot@example.invalid", to: "ops@example.invalid" })]);
  });

  it("ALERT_EMAIL 이 비면 서버 기록만 남기고 보내지 않는다", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const make = vi.fn();
    await sendFalPoolAlert({ kind: "locked", accountName: "a", detail: "x" }, { ...환경, ALERT_EMAIL: "" }, make);
    expect(make).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("[fal-pool]"), expect.anything());
  });

  it("보내기가 실패해도 던지지 않는다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendFalPoolAlert({ kind: "locked", accountName: "a", detail: "x" }, 환경, () => ({
      sendMail: async () => { throw new Error("smtp down"); },
    }))).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: 실패를 본다** — Run: `cd apps/web && npx vitest run lib/fal/pool/__tests__/store.test.ts lib/fal/pool/__tests__/alert.test.ts` · Expected: FAIL(파일 없음)

- [ ] **Step 3: `store.ts` 를 만든다**

```ts
/**
 * 계정 풀이 DB 에 묻는 일 전부(마이그레이션 `202610010001_fal_account_pool.sql`).
 * 라우터는 이 모양만 알고, 시험은 이 모양을 메모리로 흉내 낸다.
 */

export type FalAccountState = "ok" | "rate_limited" | "locked" | "invalid" | "decrypt_failed";
export type FalAccountFailure = Exclude<FalAccountState, "ok">;

export interface FalAccountRow {
  id: string;
  name: string;
  enabled: boolean;
  state: FalAccountState;
  key_ciphertext: string;
  key_iv: string;
  key_tag: string;
}

export interface FalPoolStore {
  /** 지우지 않은 계정 전부(꺼진 것 포함 — 꺼진 계정의 진행 중 요청도 물어야 한다). */
  liveAccounts(): Promise<FalAccountRow[]>;
  /** 칸 하나를 잡는다. 다 찼으면 null. */
  claim(endpoint: string, exclude: string[]): Promise<{ slotId: number; accountId: string } | null>;
  bind(slotId: number, requestId: string): Promise<void>;
  release(slotId: number): Promise<void>;
  finish(requestId: string): Promise<void>;
  /** 이 요청을 보낸 계정. 기록이 없으면(서버 키로 보낸 옛 요청) null. */
  accountOf(requestId: string): Promise<string | null>;
  /** 상태가 이번에 바뀌었으면 참(메일은 그때 한 번). */
  mark(accountId: string, kind: FalAccountFailure, detail: string): Promise<boolean>;
}

function fail(what: string, error: { message: string }): never {
  throw new Error(`[fal-pool] ${what}: ${error.message}`);
}

/**
 * Supabase 관리 클라이언트는 **부를 때** 들인다. 그 모듈은 `server-only` 를 들여서, 생성 경로 모듈
 * (상세페이지·카드뉴스 등)을 시험이 불러오기만 해도 깨진다.
 */
async function adminClient() {
  const { createSupabaseAdminClient } = await import("../../supabase/admin");
  return createSupabaseAdminClient();
}

export function supabaseFalPoolStore(): FalPoolStore {
  const db = adminClient;
  return {
    async liveAccounts() {
      const { data, error } = await (await db())
        .from("fal_accounts")
        .select("id,name,enabled,state,key_ciphertext,key_iv,key_tag")
        .is("deleted_at", null);
      if (error) fail("liveAccounts", error);
      return (data ?? []) as FalAccountRow[];
    },
    async claim(endpoint, exclude) {
      const { data, error } = await (await db()).rpc("fal_account_claim", { p_endpoint: endpoint, p_exclude: exclude });
      if (error) fail("claim", error);
      const row = (data as Array<{ slot_id: number; account_id: string }> | null)?.[0];
      return row ? { slotId: Number(row.slot_id), accountId: row.account_id } : null;
    },
    async bind(slotId, requestId) {
      const { error } = await (await db()).rpc("fal_request_bind", { p_slot: slotId, p_request: requestId });
      if (error) fail("bind", error);
    },
    async release(slotId) {
      const { error } = await (await db()).rpc("fal_request_release", { p_slot: slotId });
      if (error) fail("release", error);
    },
    async finish(requestId) {
      const { error } = await (await db()).rpc("fal_request_finish", { p_request: requestId });
      if (error) fail("finish", error);
    },
    async accountOf(requestId) {
      const { data, error } = await (await db())
        .from("fal_requests")
        .select("account_id")
        .eq("fal_request_id", requestId)
        .maybeSingle();
      if (error) fail("accountOf", error);
      return (data as { account_id?: string } | null)?.account_id ?? null;
    },
    async mark(accountId, kind, detail) {
      const { data, error } = await (await db()).rpc("fal_account_mark", { p_account: accountId, p_kind: kind, p_detail: detail });
      if (error) fail("mark", error);
      return data === true;
    },
  };
}
```

- [ ] **Step 4: `alert.ts` 를 만든다**

```ts
import nodemailer from "nodemailer";

/**
 * fal 계정에 탈이 났을 때 관리자에게 메일 한 통(보충 2026-10-01).
 *
 * 감시 스크립트(`deploy/ec2/monitor.sh`)와 같은 길이다 — `app.env` 의 SMTP 계정으로 `ALERT_EMAIL` 에 보낸다.
 * 해석도 같다: secure = `SMTP_SECURE === "true" || port === 465`, from = `SMTP_FROM || SMTP_USER`
 * (`lib/email/approval.ts`). 운영 `app.env` 는 값을 큰따옴표로 감싸 두지만 systemd 가 벗겨서 넘기므로
 * `process.env` 에는 따옴표가 없다.
 *
 * - 같은 사건은 한 번: 「상태가 바뀐 첫 호출」에만 부른다(`fal_account_mark` 가 참일 때)
 * - **던지지 않는다.** 메일이 실패해도 생성은 다른 계정으로 계속된다. 실패는 서버 기록에만
 * - 한도 걸림(429)은 보내지 않는다 — 잠깐이고 자주 생긴다
 */

export type FalPoolAlertKind = "locked" | "invalid" | "decrypt_failed" | "master_key_missing";

export interface FalPoolAlert {
  kind: FalPoolAlertKind;
  accountName: string;
  detail: string;
}

const TITLE: Record<FalPoolAlertKind, string> = {
  locked: "fal 계정 잔액이 바닥나 잠겼습니다",
  invalid: "fal 계정 키가 거절됐습니다",
  decrypt_failed: "fal 계정 키를 풀지 못했습니다",
  master_key_missing: "fal 계정 풀이 꺼져 있습니다(서버 열쇠 없음)",
};

const NEXT_STEP: Record<FalPoolAlertKind, string> = {
  locked: "fal 대시보드에서 잔액을 충전한 뒤 관리자 화면 「fal 계정」에서 「다시 확인」을 눌러 주세요. 그동안 새 생성은 다른 계정으로 갑니다.",
  invalid: "fal 에서 새 키를 만들어 관리자 화면 「fal 계정」에서 키를 바꿔 주세요. 그동안 새 생성은 다른 계정으로 갑니다.",
  decrypt_failed: "서버의 FAL_KEY_ENCRYPTION_SECRET 이 바뀌었을 수 있습니다. 관리자 화면 「fal 계정」에서 키를 다시 넣어 주세요.",
  master_key_missing: "/etc/fixup-image-agent/app.env 에 FAL_KEY_ENCRYPTION_SECRET 을 넣고 서비스를 다시 시작해 주세요. 그동안은 FAL_KEY 하나로 만듭니다.",
};

export function falPoolAlertMail(event: FalPoolAlert): { subject: string; text: string } {
  const who = event.accountName ? ` (${event.accountName})` : "";
  return {
    subject: `[FormWith] ${TITLE[event.kind]}${who}`,
    text: [`${TITLE[event.kind]}${who}`, "", NEXT_STEP[event.kind], "", `fal 응답: ${event.detail || "없음"}`].join("\n"),
  };
}

type Env = Record<string, string | undefined>;
type Transport = { sendMail(mail: { from?: string; to: string; subject: string; text: string }): Promise<unknown> };
type MakeTransport = (options: { host: string; port: number; secure: boolean; auth: { user: string; pass: string } }) => Transport;

export function sendFalPoolAlert(
  event: FalPoolAlert,
  environment: Env = process.env,
  makeTransport: MakeTransport = nodemailer.createTransport as unknown as MakeTransport,
): Promise<void> {
  const mail = falPoolAlertMail(event);
  console.error(`[fal-pool] ${mail.subject}`, { detail: event.detail });
  const to = environment.ALERT_EMAIL?.trim();
  const host = environment.SMTP_HOST;
  const user = environment.SMTP_USER;
  const pass = environment.SMTP_PASS;
  const port = Number(environment.SMTP_PORT || 465);
  if (!to || !host || !user || !pass || !Number.isFinite(port)) return Promise.resolve();
  return makeTransport({ host, port, secure: environment.SMTP_SECURE === "true" || port === 465, auth: { user, pass } })
    .sendMail({ from: environment.SMTP_FROM || user, to, subject: mail.subject, text: mail.text })
    .then(() => undefined, (cause: unknown) => {
      console.error("[fal-pool] 알림 메일을 보내지 못했습니다", { message: cause instanceof Error ? cause.message : String(cause) });
    });
}
```

- [ ] **Step 5: 통과를 본다** — Run: 같은 명령 · Expected: PASS(store 9 · alert 5)

- [ ] **Step 6: 커밋**

```bash
git add apps/web/lib/fal/pool/store.ts apps/web/lib/fal/pool/alert.ts apps/web/lib/fal/pool/__tests__/store.test.ts apps/web/lib/fal/pool/__tests__/alert.test.ts
git commit -m "feat(fal-pool): 계정 풀의 DB 길과 관리자 메일

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 계정 고르기·옮기기·묻기

**Files:**
- Create: `apps/web/lib/fal/pool/router.ts`
- Test: `apps/web/lib/fal/pool/__tests__/router.test.ts`

**Interfaces:**
- Consumes: S3a `FalHttpError`·`submitFalQueue`(`lib/fal/http.ts`), `envFalRouter`·`FalRoute`·`FalRouter`(`lib/fal/route.ts`); Task 2 `openFalKey`; Task 3 `FalPoolStore`·`FalAccountFailure`·`FalAccountState`·`FalPoolAlert`
- Produces: `FAL_POOL_REFRESH_MS = 30000`, `class FalPoolBusyError extends Error { status: 429; body: string }`(문구 「지금 이미지 생성이 몰려 있습니다. 잠시 뒤 다시 시도해 주세요.」), `accountFailureOf(error: unknown): FalAccountFailure | null`, `interface PoolRouterDeps { store; masterKey: Buffer; environment; alert(event): unknown; submit?; now?; log? }`, `interface PoolRouter extends FalRouter { refresh(): void }`, `createPoolRouter(deps): PoolRouter`

- [ ] **Step 1: 실패하는 시험을 쓴다**

```ts
import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { FalHttpError } from "../../http";
import type { FalPoolAlert } from "../alert";
import { sealFalKey } from "../key-crypto";
import { FalPoolBusyError, accountFailureOf, createPoolRouter } from "../router";
import type { FalAccountRow, FalAccountState, FalPoolStore } from "../store";

/**
 * **계정 풀 고르기·옮기기**(보충 2026-10-01). DB 함수(`fal_account_claim`)의 규칙은 PG 시험이 잰다 —
 * 여기는 그 규칙을 메모리로 흉내 낸 가게로, 라우터가 **무엇을 언제 부르는지**를 잰다.
 */

const 열쇠 = randomBytes(32);
const A = "a1000000-0000-4000-8000-00000000000a";
const B = "a1000000-0000-4000-8000-00000000000b";

interface FakeAccount { id: string; name: string; key: string; enabled: boolean; state: FalAccountState; limit: number; sealedFor?: string }

function 가게(accounts: FakeAccount[]) {
  let nextSlot = 1;
  const slots = new Map<number, { accountId: string; requestId: string | null; finished: boolean }>();
  const calls: string[] = [];
  const marks: Array<[string, string]> = [];
  const open = (id: string) => [...slots.values()].filter((s) => s.accountId === id && !s.finished).length;
  const store: FalPoolStore = {
    async liveAccounts() {
      calls.push("liveAccounts");
      return accounts.map((a): FalAccountRow => {
        const sealed = sealFalKey(열쇠, a.sealedFor ?? a.id, a.key);
        return { id: a.id, name: a.name, enabled: a.enabled, state: a.state, key_ciphertext: sealed.ciphertext, key_iv: sealed.iv, key_tag: sealed.tag };
      });
    },
    async claim(_endpoint, exclude) {
      calls.push(`claim:${exclude.join(",")}`);
      const pick = accounts
        .filter((a) => a.enabled && !["locked", "invalid", "decrypt_failed"].includes(a.state) && !exclude.includes(a.id) && open(a.id) < a.limit)
        .sort((x, y) => (y.limit - open(y.id)) - (x.limit - open(x.id)))[0];
      if (!pick) return null;
      const slotId = nextSlot++;
      slots.set(slotId, { accountId: pick.id, requestId: null, finished: false });
      return { slotId, accountId: pick.id };
    },
    async bind(slotId, requestId) { calls.push(`bind:${requestId}`); slots.get(slotId)!.requestId = requestId; },
    async release(slotId) { calls.push(`release:${slotId}`); slots.delete(slotId); },
    async finish(requestId) {
      calls.push(`finish:${requestId}`);
      for (const s of slots.values()) if (s.requestId === requestId) s.finished = true;
    },
    async accountOf(requestId) {
      calls.push(`accountOf:${requestId}`);
      return [...slots.values()].find((s) => s.requestId === requestId)?.accountId ?? null;
    },
    async mark(id, kind) {
      marks.push([id, kind]);
      const account = accounts.find((a) => a.id === id)!;
      const changed = account.state !== kind;
      account.state = kind;
      return changed;
    },
  };
  return { store, calls, marks, slots, open };
}

/** 키마다 fal 의 답을 정해 둔 가짜 제출. */
function fal(answers: Record<string, () => string | FalHttpError>) {
  const seen: string[] = [];
  let n = 0;
  const submit = async (key: string) => {
    seen.push(key);
    const answer = (answers[key] ?? (() => `req-${key}-${++n}`))();
    if (answer instanceof FalHttpError) throw answer;
    return answer;
  };
  return { seen, submit };
}

let alerts: FalPoolAlert[] = [];
beforeEach(() => { alerts = []; });

const 만들기 = (store: FalPoolStore, submit: ReturnType<typeof fal>["submit"], environment: Record<string, string> = { FAL_KEY: "env-key" }) =>
  createPoolRouter({ store, masterKey: 열쇠, environment, alert: (e) => { alerts.push(e); }, submit, log: () => {} });

const 계정 = (id: string, key: string, extra: Partial<FakeAccount> = {}): FakeAccount =>
  ({ id, name: `fal-${id.slice(-1)}`, key, enabled: true, state: "ok", limit: 20, ...extra });

describe("어느 계정으로 보내나", () => {
  it("계정이 하나도 없으면 서버 FAL_KEY 로 — 칸을 잡지 않는다(오늘과 같다)", async () => {
    const g = 가게([]);
    const f = fal({});
    const out = await 만들기(g.store, f.submit).submit("fal-ai/x", {});
    expect(f.seen).toEqual(["env-key"]);
    expect(out.route).toEqual({ accountId: null, key: "env-key" });
    expect(g.calls).toEqual(["liveAccounts"]);
  });

  it("켜진 계정이 없으면(다 꺼짐) 서버 FAL_KEY 로", async () => {
    const g = 가게([계정(A, "key-a", { enabled: false })]);
    const f = fal({});
    await 만들기(g.store, f.submit).submit("fal-ai/x", {});
    expect(f.seen).toEqual(["env-key"]);
  });

  it("켜진 계정이 있으면 그 계정 키로 보내고 받은 번호를 붙인다", async () => {
    const g = 가게([계정(A, "key-a")]);
    const f = fal({ "key-a": () => "req-1" });
    const out = await 만들기(g.store, f.submit).submit("fal-ai/x", {});
    expect(out).toEqual({ requestId: "req-1", route: { accountId: A, key: "key-a" } });
    expect(g.calls).toContain("bind:req-1");
  });

  it("**한 계정이 429 면 같은 제출을 곧바로 다음 계정으로** — 사용자는 모른다, 메일은 없다", async () => {
    const g = 가게([계정(A, "key-a", { limit: 30 }), 계정(B, "key-b")]);
    const f = fal({ "key-a": () => new FalHttpError(429, "rate limited"), "key-b": () => "req-b" });
    const out = await 만들기(g.store, f.submit).submit("fal-ai/x", {});
    expect(f.seen).toEqual(["key-a", "key-b"]);
    expect(out.route.accountId).toBe(B);
    expect(g.marks).toEqual([[A, "rate_limited"]]);
    expect(g.calls).toContain(`claim:${A}`);
    expect(g.calls.filter((c) => c.startsWith("release:"))).toHaveLength(1);
    expect(alerts).toEqual([]);
  });

  it("잔액 소진(403 locked)·키 오류(401)는 다음 계정으로 옮기고 관리자 메일 — 같은 사건은 한 번", async () => {
    const g = 가게([계정(A, "key-a", { limit: 30 }), 계정(B, "key-b")]);
    const f = fal({ "key-a": () => new FalHttpError(403, '{"detail":"User is locked. Reason: Exhausted balance."}') });
    const router = 만들기(g.store, f.submit);
    await router.submit("fal-ai/x", {});
    await router.submit("fal-ai/x", {});
    expect(g.marks).toEqual([[A, "locked"]]);
    expect(alerts).toEqual([expect.objectContaining({ kind: "locked", accountName: "fal-a" })]);
    expect(f.seen).toEqual(["key-a", "key-b", "key-b"]);
  });

  it("다른 프로세스가 먼저 표시했으면(이번에 바뀐 것이 아니면) 메일을 또 보내지 않는다", async () => {
    const g = 가게([계정(A, "key-a", { limit: 30 }), 계정(B, "key-b")]);
    g.store.mark = async () => false;
    await 만들기(g.store, fal({ "key-a": () => new FalHttpError(403, "User is locked") }).submit).submit("fal-ai/x", {});
    expect(alerts).toEqual([]);
  });

  it("401 은 키 오류로 적는다", async () => {
    const g = 가게([계정(A, "key-a", { limit: 30 }), 계정(B, "key-b")]);
    await 만들기(g.store, fal({ "key-a": () => new FalHttpError(401, "invalid key credentials") }).submit).submit("fal-ai/x", {});
    expect(g.marks).toEqual([[A, "invalid"]]);
    expect(alerts[0]!.kind).toBe("invalid");
  });

  it("모든 계정이 차면 「잠시 뒤 다시」(429) — 서버 키로 새지 않는다", async () => {
    const g = 가게([계정(A, "key-a", { limit: 1 })]);
    const f = fal({});
    const router = 만들기(g.store, f.submit);
    await router.submit("fal-ai/x", {});
    const error = await router.submit("fal-ai/x", {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FalPoolBusyError);
    expect(error).toMatchObject({ status: 429, message: "지금 이미지 생성이 몰려 있습니다. 잠시 뒤 다시 시도해 주세요." });
    expect(f.seen).toEqual(["key-a"]);
  });

  it("모든 계정이 거절하면 「잠시 뒤 다시」", async () => {
    const g = 가게([계정(A, "key-a"), 계정(B, "key-b")]);
    const busy = () => new FalHttpError(429, "busy");
    await expect(만들기(g.store, fal({ "key-a": busy, "key-b": busy }).submit).submit("fal-ai/x", {})).rejects.toBeInstanceOf(FalPoolBusyError);
  });

  it("내용 거절(422)·fal 장애(500)는 옮기지 않고 그대로 던진다 — 두 번 과금될 수 있다", async () => {
    for (const status of [422, 500]) {
      const g = 가게([계정(A, "key-a", { limit: 30 }), 계정(B, "key-b")]);
      const f = fal({ "key-a": () => new FalHttpError(status, "no") });
      await expect(만들기(g.store, f.submit).submit("fal-ai/x", {})).rejects.toMatchObject({ status });
      expect(f.seen).toEqual(["key-a"]);
      expect(g.marks).toEqual([]);
      expect(g.calls.filter((c) => c.startsWith("release:"))).toHaveLength(1);
    }
  });

  it("**키를 풀 수 없는 계정은 빼고** 표시·메일 — 다른 계정이 없으면 서버 키로", async () => {
    const g = 가게([계정(A, "key-a", { sealedFor: B })]);
    const f = fal({});
    await 만들기(g.store, f.submit).submit("fal-ai/x", {});
    expect(g.marks).toEqual([[A, "decrypt_failed"]]);
    expect(alerts[0]!.kind).toBe("decrypt_failed");
    expect(f.seen).toEqual(["env-key"]);
  });
});

describe("보낸 요청은 보낸 계정으로 묻는다", () => {
  it("같은 프로세스는 메모리로, 다시 띄운 뒤에는 DB 기록으로 같은 계정을 찾는다", async () => {
    const g = 가게([계정(A, "key-a")]);
    const f = fal({ "key-a": () => "req-1" });
    await 만들기(g.store, f.submit).submit("fal-ai/x", {});
    const restarted = 만들기(g.store, f.submit);
    expect(await restarted.routeOf("req-1")).toEqual({ accountId: A, key: "key-a" });
    expect(g.calls).toContain("accountOf:req-1");
  });

  it("번호를 DB 에 못 붙여도(세 번 실패) 같은 프로세스는 메모리로 같은 계정을 찾는다", async () => {
    const g = 가게([계정(A, "key-a")]);
    g.store.bind = async () => { throw new Error("db down"); };
    const router = 만들기(g.store, fal({ "key-a": () => "req-1" }).submit);
    await router.submit("fal-ai/x", {});
    expect(await router.routeOf("req-1")).toEqual({ accountId: A, key: "key-a" });
  });

  it("**계정을 꺼도** 진행 중 요청은 그 계정 키로 계속 묻는다", async () => {
    const accounts = [계정(A, "key-a"), 계정(B, "key-b", { limit: 5 })];
    const g = 가게(accounts);
    const f = fal({ "key-a": () => "req-a" });
    const router = 만들기(g.store, f.submit);
    await router.submit("fal-ai/x", {});
    accounts[0]!.enabled = false;
    router.refresh();
    expect((await 만들기(g.store, f.submit).routeOf("req-a")).key).toBe("key-a");
  });

  it("기록이 없는 옛 요청(풀 이전)은 서버 FAL_KEY 로 묻는다", async () => {
    const g = 가게([계정(A, "key-a")]);
    expect(await 만들기(g.store, fal({}).submit).routeOf("old-req")).toEqual({ accountId: null, key: "env-key" });
  });

  it("계정 행이 아예 없으면 DB 를 보지 않는다", async () => {
    const g = 가게([]);
    await 만들기(g.store, fal({}).submit).routeOf("old-req");
    expect(g.calls).toEqual(["liveAccounts"]);
  });

  it("끝나면 진행 중에서 뺀다 — 서버 키 요청은 DB 를 부르지 않는다", async () => {
    const g = 가게([계정(A, "key-a", { limit: 1 })]);
    const f = fal({ "key-a": () => "req-1" });
    const router = 만들기(g.store, f.submit);
    await router.submit("fal-ai/x", {});
    router.finished("req-1");
    await Promise.resolve();
    expect(g.open(A)).toBe(0);

    const empty = 가게([]);
    const envRouter = 만들기(empty.store, fal({}).submit);
    const { requestId } = await envRouter.submit("fal-ai/x", {});
    envRouter.finished(requestId);
    expect(empty.calls).toEqual(["liveAccounts"]);
  });
});

describe("accountFailureOf", () => {
  it("429·401·403 만 계정 탓이다", () => {
    expect(accountFailureOf(new FalHttpError(429, ""))).toBe("rate_limited");
    expect(accountFailureOf(new FalHttpError(401, ""))).toBe("invalid");
    expect(accountFailureOf(new FalHttpError(403, "User is locked. Reason: Exhausted balance"))).toBe("locked");
    expect(accountFailureOf(new FalHttpError(403, "Forbidden"))).toBe("invalid");
    expect(accountFailureOf(new FalHttpError(422, ""))).toBeNull();
    expect(accountFailureOf(new FalHttpError(503, ""))).toBeNull();
    expect(accountFailureOf(new Error("fetch failed"))).toBeNull();
  });
});
```

- [ ] **Step 2: 실패를 본다** — Run: `cd apps/web && npx vitest run lib/fal/pool/__tests__/router.test.ts` · Expected: FAIL `Failed to load url ../router`

- [ ] **Step 3: 만든다** — `apps/web/lib/fal/pool/router.ts`

```ts
import { FalHttpError, submitFalQueue } from "../http";
import { envFalRouter, type FalRoute, type FalRouter } from "../route";
import type { FalPoolAlert } from "./alert";
import { openFalKey } from "./key-crypto";
import type { FalAccountFailure, FalAccountState, FalPoolStore } from "./store";

/**
 * **fal 계정 풀**(설계 2026-09-29 §3.3 · 보충 2026-10-01).
 *
 * 비유: 계산대가 여러 개인 가게. 손님(제출)이 오면 줄이 가장 짧은 열린 계산대로 보낸다. 한 계산대가
 * 갑자기 멈추면(429·잔액 소진·키 오류) 손님을 **곧바로 옆 계산대로** 옮긴다 — 손님은 모른다. 계산대가
 * 모두 꽉 찼을 때만 「잠시 뒤 다시」라고 말한다. 영수증(fal 요청 번호)에는 어느 계산대였는지 적어 두어,
 * 나중에 결과를 찾을 때 같은 계산대로 간다.
 *
 * - **켜진 계정이 하나도 없으면**(표가 비었거나 다 꺼짐·키를 풀 수 없음) 서버 `FAL_KEY` 로 보낸다 — 오늘과 같다.
 *   이때는 DB 에 칸을 잡지 않는다
 * - 칸 잡기는 DB 가 한다(`fal_account_claim`) — 웹 프로세스가 여럿이거나 배치기(S4)가 붙어도 같은 수를 센다
 * - 계정 목록(복호한 키)은 30초 보관한다. 관리자 화면이 바꾸면 `refresh()` 로 바로 비운다
 * - 키는 이 프로세스 메모리에만 있다. 브라우저·기록·오류 문구로 나가지 않는다
 */

export const FAL_POOL_REFRESH_MS = 30_000;
const REMEMBERED_LIMIT = 5_000;

/** 켜진 계정이 모두 찼다(또는 모두 막혔다). 429 를 실어 화면이 「잠시 뒤 다시」로 말하게 한다. */
export class FalPoolBusyError extends Error {
  readonly status = 429;
  readonly body = "fal account pool is full";
  constructor() {
    super("지금 이미지 생성이 몰려 있습니다. 잠시 뒤 다시 시도해 주세요.");
    this.name = "FalPoolBusyError";
  }
}

/**
 * fal 이 **이 계정을** 거절한 까닭. 계정 탓이 아니면 null — 다른 계정으로 옮기지 않는다.
 *
 * 429 = 한도, 401 = 키 무효, 403 = 잔액 소진 잠김(본문에 lock·balance 등) 또는 그 밖의 권한 거절.
 * 내용 거절(422)·fal 장애(5xx)·네트워크 오류는 다른 계정으로 보내도 같거나, fal 이 이미 받았을 수 있어
 * 두 번 과금될 수 있다 — 옮기지 않는다.
 */
export function accountFailureOf(error: unknown): FalAccountFailure | null {
  if (!(error instanceof FalHttpError)) return null;
  if (error.status === 429) return "rate_limited";
  if (error.status === 401) return "invalid";
  if (error.status === 403) return /lock|balance|credit|exhaust|billing|payment/i.test(error.body) ? "locked" : "invalid";
  return null;
}

interface PoolAccount {
  id: string;
  name: string;
  key: string;
  enabled: boolean;
  state: FalAccountState;
}

interface Snapshot {
  at: number;
  accounts: Map<string, PoolAccount>;
  /** 지우지 않은 계정 행이 하나라도 있는가(꺼졌거나 풀 수 없어도). 없으면 DB 를 보지 않는다. */
  anyRow: boolean;
}

type Env = Record<string, string | undefined>;

export interface PoolRouterDeps {
  store: FalPoolStore;
  masterKey: Buffer;
  environment: Env;
  alert: (event: FalPoolAlert) => unknown;
  submit?: typeof submitFalQueue;
  now?: () => number;
  log?: (message: string, detail?: unknown) => void;
}

export interface PoolRouter extends FalRouter {
  /** 계정 목록을 다음 호출 때 다시 읽는다(관리자 화면이 바꾼 직후). */
  refresh(): void;
}

export function createPoolRouter(deps: PoolRouterDeps): PoolRouter {
  const submit = deps.submit ?? submitFalQueue;
  const env = envFalRouter(deps.environment, submit);
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((message: string, detail?: unknown) => console.error(message, detail));
  const remembered = new Map<string, FalRoute>();
  let snapshot: Snapshot | null = null;
  let loading: Promise<Snapshot> | null = null;

  const remember = (requestId: string, route: FalRoute) => {
    remembered.set(requestId, route);
    if (remembered.size > REMEMBERED_LIMIT) remembered.delete(remembered.keys().next().value as string);
  };

  const alert = (event: FalPoolAlert) => {
    try {
      void Promise.resolve(deps.alert(event)).catch(() => undefined);
    } catch {
      // 알림이 터져도 생성은 계속된다.
    }
  };

  async function load(): Promise<Snapshot> {
    const rows = await deps.store.liveAccounts();
    const accounts = new Map<string, PoolAccount>();
    for (const row of rows) {
      try {
        const key = openFalKey(deps.masterKey, row.id, { ciphertext: row.key_ciphertext, iv: row.key_iv, tag: row.key_tag });
        accounts.set(row.id, { id: row.id, name: row.name, key, enabled: row.enabled, state: row.state });
      } catch {
        const detail = "키를 풀지 못했습니다(서버 열쇠가 바뀌었거나 값이 손상됨).";
        const changed = await deps.store.mark(row.id, "decrypt_failed", detail).catch(() => false);
        if (changed) alert({ kind: "decrypt_failed", accountName: row.name, detail });
      }
    }
    return { at: now(), accounts, anyRow: rows.length > 0 };
  }

  function current(force = false): Promise<Snapshot> {
    if (!force && snapshot && now() - snapshot.at < FAL_POOL_REFRESH_MS) return Promise.resolve(snapshot);
    loading ??= load()
      .then((loaded) => {
        snapshot = loaded;
        return loaded;
      })
      .finally(() => {
        loading = null;
      });
    return loading;
  }

  const poolOn = (s: Snapshot) => [...s.accounts.values()].some((account) => account.enabled);

  /** 받은 번호를 DB 에 붙인다. 세 번 해도 안 되면 기록만 — 같은 프로세스는 메모리로 찾는다. */
  async function bind(slotId: number, requestId: string) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await deps.store.bind(slotId, requestId);
        return;
      } catch (error) {
        if (attempt === 3) log("[fal-pool] 요청 번호를 계정에 묶지 못했습니다", { requestId, message: (error as Error).message });
      }
    }
  }

  return {
    refresh() {
      snapshot = null;
    },

    async submit(endpoint, input, options) {
      let snap = await current();
      if (!poolOn(snap)) return env.submit(endpoint, input, options);

      const tried: string[] = [];
      for (let attempt = 0; attempt <= snap.accounts.size; attempt += 1) {
        const slot = await deps.store.claim(endpoint, tried);
        if (!slot) throw new FalPoolBusyError();

        let account = snap.accounts.get(slot.accountId);
        if (!account) {
          snap = await current(true);
          account = snap.accounts.get(slot.accountId);
        }
        if (!account) {
          await deps.store.release(slot.slotId).catch(() => undefined);
          tried.push(slot.accountId);
          continue;
        }

        let requestId: string;
        try {
          requestId = await submit(account.key, endpoint, input, options);
        } catch (error) {
          await deps.store.release(slot.slotId).catch((cause: unknown) => log("[fal-pool] 칸을 돌려주지 못했습니다", cause));
          const failure = accountFailureOf(error);
          if (!failure) throw error;
          tried.push(account.id);
          const detail = (error as FalHttpError).body.slice(0, 300);
          const changed = await deps.store.mark(account.id, failure, detail).catch(() => false);
          if (changed && failure !== "rate_limited") alert({ kind: failure, accountName: account.name, detail });
          continue;
        }

        const route: FalRoute = { accountId: account.id, key: account.key };
        remember(requestId, route);
        await bind(slot.slotId, requestId);
        return { requestId, route };
      }
      throw new FalPoolBusyError();
    },

    async routeOf(requestId) {
      const known = remembered.get(requestId);
      if (known) return known;
      let snap = await current();
      if (!snap.anyRow) return env.routeOf(requestId);
      const accountId = await deps.store.accountOf(requestId);
      // 계정 기록이 없으면 서버 키로 보낸 요청이다(풀을 켜기 전·켜진 계정이 없던 때).
      if (!accountId) return env.routeOf(requestId);
      let account = snap.accounts.get(accountId);
      if (!account) {
        snap = await current(true);
        account = snap.accounts.get(accountId);
      }
      if (!account) throw new FalHttpError(410, "", "이 요청을 보낸 fal 계정을 더는 쓸 수 없습니다.");
      const route: FalRoute = { accountId, key: account.key };
      remember(requestId, route);
      return route;
    },

    finished(requestId) {
      const route = remembered.get(requestId);
      if (route ? route.accountId === null : !snapshot?.anyRow) return;
      deps.store.finish(requestId).catch((cause: unknown) => log("[fal-pool] 끝난 요청을 적지 못했습니다", cause));
    },

    async uploadRoute() {
      const snap = await current();
      const healthy = [...snap.accounts.values()].find(
        (account) => account.enabled && (account.state === "ok" || account.state === "rate_limited"),
      );
      return healthy ? { accountId: healthy.id, key: healthy.key } : env.uploadRoute();
    },
  };
}
```

- [ ] **Step 4: 통과를 본다** — Run: 같은 명령 · Expected: PASS(18개)

- [ ] **Step 5: 커밋**

```bash
git add apps/web/lib/fal/pool/router.ts apps/web/lib/fal/pool/__tests__/router.test.ts
git commit -m "feat(fal-pool): 여유가 가장 큰 계정으로 보내고 막히면 곧바로 다음 계정으로

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 생성 경로를 풀에 잇는다

**Files:**
- Create: `apps/web/lib/fal/pool/default.ts`, Test `apps/web/lib/fal/pool/__tests__/default.test.ts`
- Modify(전체): `apps/web/lib/fal/queue.ts`, `apps/web/lib/fal/upload.ts`, Test `apps/web/lib/fal/__tests__/queue.test.ts`, `apps/web/lib/fal/__tests__/upload.test.ts`
- Modify: `apps/web/lib/ad/background.ts:1-2·75-77·87-88`, `apps/web/app/api/ad/export/route.ts:122`, `apps/web/lib/poster/providers.ts:12·303-309`, `apps/web/lib/sns/providers.ts:19·287-288`, `apps/web/lib/pdp/fal.ts:8·66`, `apps/web/lib/redesign/image-generator.ts:4·126-130`
- Test: `apps/web/lib/ai-cost/__tests__/image-submit-cost.test.ts`(포스터·카드뉴스 블록), `apps/web/lib/__tests__/ai-cost-call-sites.test.ts`, `apps/web/lib/__tests__/ad-bundle-boundary.test.ts:64`

**Interfaces:**
- Consumes: Task 2 `readMasterKey`, Task 3 `supabaseFalPoolStore`·`sendFalPoolAlert`, Task 4 `createPoolRouter`·`PoolRouter`, S3a `envFalRouter`·`falQueueOps`·`runFalQueued`
- Produces: `defaultFalRouter(environment?): FalRouter`, `refreshFalPool(): void`; `createFalQueueClient(router?: FalRouter, opsFor?): FalQueueClient`(첫 인자가 키 문자열에서 router 로 바뀐다), `createFalUploader(router?: FalRouter, factory?): FalUploader`(같다), `createBackgroundRemover(router?: FalRouter): FalSubscriber`(인자 없이 부른다)

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/lib/fal/pool/__tests__/default.test.ts`:
```ts
import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

/**
 * **배포 첫날 생성이 멈추지 않는다**(보충 2026-10-01). 서버 열쇠가 없거나 틀리면 풀을 끄고 `FAL_KEY` 로 보낸다.
 * 열쇠가 있으면 프로세스에 풀 하나.
 */
const liveAccounts = vi.fn(async () => [] as unknown[]);
vi.mock("../store", () => ({ supabaseFalPoolStore: () => ({ liveAccounts }) }));
vi.mock("../alert", () => ({ sendFalPoolAlert: vi.fn() }));

const { defaultFalRouter } = await import("../default");
const { createPoolRouter } = await import("../router");

describe("defaultFalRouter", () => {
  it("열쇠가 없으면 FAL_KEY 로 보내는 길 — 풀을 보지 않는다", async () => {
    const router = defaultFalRouter({ FAL_KEY: "env-key" });
    expect(await router.routeOf("r")).toEqual({ accountId: null, key: "env-key" });
    expect(liveAccounts).not.toHaveBeenCalled();
  });

  it("열쇠가 틀려도(32바이트가 아님) FAL_KEY 로 — 죽지 않는다", async () => {
    const router = defaultFalRouter({ FAL_KEY: "env-key", FAL_KEY_ENCRYPTION_SECRET: "short" });
    expect(await router.uploadRoute()).toEqual({ accountId: null, key: "env-key" });
  });

  it("열쇠가 있으면 같은 풀 하나를 돌려준다", () => {
    const secret = randomBytes(32).toString("base64");
    const first = defaultFalRouter({ FAL_KEY: "k", FAL_KEY_ENCRYPTION_SECRET: secret });
    const second = defaultFalRouter({ FAL_KEY: "k", FAL_KEY_ENCRYPTION_SECRET: secret });
    expect(first).toBe(second);
    expect(typeof (first as ReturnType<typeof createPoolRouter>).refresh).toBe("function");
  });
});
```

`apps/web/lib/fal/__tests__/queue.test.ts` 전체를:
```ts
import { describe, expect, it, vi } from "vitest";
import { createFalQueueClient } from "../queue";
import type { FalQueueOps } from "../http";
import type { FalRouter } from "../route";

/**
 * **포스터·카드뉴스의 fal 큐**(S3b). 제출은 `router` 가 계정을 골라 보내고, 상태·결과는 그 요청을 보낸
 * 계정의 키로 묻는다. 끝났으면(`completed`) 계정의 진행 중 수에서 뺀다.
 */
function 길() {
  const log: string[] = [];
  const router: FalRouter = {
    async submit(endpoint, _input, options) {
      log.push(`submit ${endpoint} ${JSON.stringify(options)}`);
      return { requestId: "fal-1", route: { accountId: "acct-b", key: "key-b" } };
    },
    async routeOf(requestId) { log.push(`routeOf ${requestId}`); return { accountId: "acct-b", key: "key-b" }; },
    finished(requestId) { log.push(`finished ${requestId}`); },
    async uploadRoute() { return { accountId: null, key: "env" }; },
  };
  return { log, router };
}

function 묻기(status: "queued" | "in_progress" | "completed", data: unknown = { images: [] }) {
  const keys: string[] = [];
  const ops: FalQueueOps = { status: vi.fn(async () => status), result: vi.fn(async () => data), cancel: vi.fn() };
  return { keys, ops, opsFor: (key: string) => { keys.push(key); return ops; } };
}

describe("공용 fal queue", () => {
  it("한 번 제출하고 requestId 를 즉시 돌려준다 — 값(모델 id·장수)을 함께 넘긴다", async () => {
    const { log, router } = 길();
    const queue = createFalQueueClient(router, 묻기("queued").opsFor);
    expect(await queue.submitJob("openai/gpt-image-2.5/flare/edit", { prompt: "x", num_images: 3 })).toEqual({ requestId: "fal-1" });
    expect(log).toEqual(['submit openai/gpt-image-2.5/flare/edit {"cost":{"model":"gpt-image-2.5-flare","images":3}}']);
  });

  it("상태·결과는 보낸 계정의 키로 묻고, 새 작업을 제출하지 않는다", async () => {
    const { log, router } = 길();
    const fake = 묻기("completed", { images: [{ url: "https://fal.media/result.png" }, {}] });
    const queue = createFalQueueClient(router, fake.opsFor);
    expect(await queue.jobStatus("openai/gpt-image-2/edit", "fal-1")).toBe("completed");
    expect(await queue.jobResult("openai/gpt-image-2/edit", "fal-1")).toEqual({ images: [{ url: "https://fal.media/result.png" }] });
    expect(fake.keys).toEqual(["key-b", "key-b"]);
    expect(log.filter((line) => line.startsWith("submit"))).toEqual([]);
  });

  it("끝났을 때만 진행 중에서 뺀다", async () => {
    const running = 길();
    await createFalQueueClient(running.router, 묻기("in_progress").opsFor).jobStatus("e", "fal-1");
    expect(running.log).not.toContain("finished fal-1");
    const done = 길();
    await createFalQueueClient(done.router, 묻기("completed").opsFor).jobStatus("e", "fal-1");
    expect(done.log).toContain("finished fal-1");
  });
});
```

`apps/web/lib/fal/__tests__/upload.test.ts` 전체를:
```ts
import { describe, expect, it, vi } from "vitest";
import { createFalUploader, uploadUniqueReferences } from "../upload";
import type { FalRouter } from "../route";

const 길 = (key: string): FalRouter => ({
  submit: vi.fn(),
  routeOf: vi.fn(),
  finished: vi.fn(),
  uploadRoute: async () => ({ accountId: "acct", key }),
});

describe("공용 fal 업로드", () => {
  it("바이트를 fal에 올리고 짧게 쓸 URL을 돌려준다 — 키는 router 가 고른다", async () => {
    const upload = vi.fn(async () => "https://v3b.fal.media/reference.png");
    const configs: unknown[] = [];
    const uploader = createFalUploader(길("key-a"), (config) => { configs.push(config); return { storage: { upload } } as never; });

    const url = await uploader.uploadReference(new Uint8Array([1, 2, 3]), "image/png");

    expect(url).toBe("https://v3b.fal.media/reference.png");
    expect(configs).toEqual([{ credentials: "key-a", retry: { maxRetries: 0 } }]);
    expect(upload).toHaveBeenCalledWith(expect.any(Blob), { lifecycle: { expiresIn: "1h" } });
  });

  it("같은 배치에서 같은 키는 한 번만 올린다", async () => {
    const upload = vi.fn(async (item: { id: string }) => `https://fal.media/${item.id}`);
    const urls = await uploadUniqueReferences(
      [{ id: "same" }, { id: "same" }, { id: "other" }],
      (item) => item.id,
      upload,
    );

    expect(upload).toHaveBeenCalledTimes(2);
    expect(urls).toEqual({ same: "https://fal.media/same", other: "https://fal.media/other" });
  });
});
```

`apps/web/lib/ai-cost/__tests__/image-submit-cost.test.ts`: `const { createFalQueueClient, falModelIdFor } = await import("../../fal/queue");` 줄 아래에 두 줄을 더하고
```ts
const { envFalRouter } = await import("../../fal/route");
const { submitFalQueue } = await import("../../fal/http");
```
`describe("fal 큐(포스터·카드뉴스)", …)` 블록 전체를:
```ts
describe("fal 큐(포스터·카드뉴스)", () => {
  /** 서버 키 하나로 보내는 길에 가짜 fetch 를 끼운다 — 제출 자리(`lib/fal/http.ts`)가 적는지 본다. */
  const queueWith = (response: () => Response) =>
    createFalQueueClient(envFalRouter({ FAL_KEY: "key" }, (key, endpoint, input, options) =>
      submitFalQueue(key, endpoint, input, options, async () => response())));

  it("제출에 한 줄 — 모델 id·요청 장수·fal 요청 id·작업 문맥을 싣는다", async () => {
    const queue = queueWith(() => new Response(JSON.stringify({ request_id: "fal-9" })));
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
    const queue = queueWith(() => new Response("busy", { status: 429 }));
    await withLlmMeter(async () => {
      await expect(queue.submitJob("fal-ai/nano-banana-pro", { prompt: "x" })).rejects.toThrow();
    });
    expect(rows).toEqual([]);
  });

  it("상태·결과 조회는 적지 않는다", async () => {
    const ops = { status: vi.fn(async () => "completed" as const), result: vi.fn(async () => ({ images: [] })), cancel: vi.fn() };
    const queue = createFalQueueClient(envFalRouter({ FAL_KEY: "key" }), () => ops);
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
```

- [ ] **Step 2: 실패를 본다** — Run: `cd apps/web && npx vitest run lib/fal lib/ai-cost` · Expected: FAIL — `default.test.ts`(파일 없음), `queue.test.ts`·`upload.test.ts`(첫 인자가 아직 키 문자열이라 `router.submit is not a function` 류), 비용 시험 포스터 블록

- [ ] **Step 3: `apps/web/lib/fal/pool/default.ts` 를 만든다**

```ts
import { envFalRouter, type FalRouter } from "../route";
import { sendFalPoolAlert } from "./alert";
import { readMasterKey } from "./key-crypto";
import { createPoolRouter, type PoolRouter } from "./router";
import { supabaseFalPoolStore } from "./store";

/**
 * 생성 경로가 쓰는 fal 길 하나.
 *
 * - 서버 열쇠(`FAL_KEY_ENCRYPTION_SECRET`)가 **없거나 틀리면** 풀을 끄고 `FAL_KEY` 로 보낸다 — 배포 첫날
 *   생성이 멈추면 안 된다. 그때 등록된 계정이 있으면 한 번 경고하고 관리자에게 메일(조용히 넘어가지 않는다)
 * - 열쇠가 있으면 프로세스에 풀 하나(계정 목록 30초 보관). 계정이 없으면 그 풀도 `FAL_KEY` 로 보낸다
 */

type Env = Record<string, string | undefined>;

let pool: { secret: string; router: PoolRouter } | null = null;
let warned = false;

export function defaultFalRouter(environment: Env = process.env): FalRouter {
  const secret = environment.FAL_KEY_ENCRYPTION_SECRET;
  const master = readMasterKey(secret);
  if (!master.ok) {
    if (environment === process.env) warnIfAccountsWaiting(master.reason);
    return envFalRouter(environment);
  }
  if (!pool || pool.secret !== secret) {
    pool = {
      secret: secret as string,
      router: createPoolRouter({ store: supabaseFalPoolStore(), masterKey: master.key, environment, alert: sendFalPoolAlert }),
    };
  }
  return pool.router;
}

/** 관리자 화면이 계정을 바꾼 직후 — 다음 제출부터 새 목록을 쓴다. */
export function refreshFalPool(): void {
  pool?.router.refresh();
}

function warnIfAccountsWaiting(reason: "missing" | "invalid"): void {
  if (warned) return;
  warned = true;
  if (reason === "invalid") {
    console.error("[fal-pool] FAL_KEY_ENCRYPTION_SECRET 이 32바이트 base64 가 아닙니다. 계정 풀을 끄고 FAL_KEY 로 만듭니다.");
  }
  // 기다리지 않는다. Supabase 가 없는 로컬·시험에서는 조용히 끝난다.
  void Promise.resolve()
    .then(() => supabaseFalPoolStore().liveAccounts())
    .then((rows) => {
      if (rows.length === 0) return;
      void sendFalPoolAlert({ kind: "master_key_missing", accountName: "", detail: `등록된 계정 ${rows.length}개` });
    })
    .catch(() => undefined);
}
```

- [ ] **Step 4: `apps/web/lib/fal/queue.ts` 전체를 바꾼다** — 비용 한 줄은 이제 제출 자리(`lib/fal/http.ts`)가 쓴다

```ts
import { IMAGE_MODELS } from "@fixup/sns-core";
import { falQueueOps, type FalQueueOps } from "./http";
import { defaultFalRouter } from "./pool/default";
import type { FalRouter } from "./route";

export type FalJobStatus = "queued" | "in_progress" | "completed";

export interface FalQueueClient {
  submitJob(endpoint: string, input: Record<string, unknown>): Promise<{ requestId: string }>;
  jobStatus(endpoint: string, requestId: string): Promise<FalJobStatus>;
  jobResult(endpoint: string, requestId: string): Promise<{ images: Array<{ url: string }> }>;
}

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

/**
 * 모델 도메인과 무관한 fal queue 제출·조회 계약(포스터·카드뉴스).
 *
 * **어느 계정으로 보낼지·물을지는 `router` 가 정한다**(S3b). 제출은 켜진 계정 중 여유가 가장 큰 곳으로,
 * 상태·결과는 그 요청을 보낸 계정의 키로 묻는다. 카드뉴스·포스터 기록에는 계정 칸이 없어도 된다 —
 * fal 요청 번호로 찾는다(`fal_requests`). 비용 한 줄은 제출 자리(`lib/fal/http.ts`)에서 쓴다.
 */
export function createFalQueueClient(
  router: FalRouter = defaultFalRouter(),
  opsFor: (key: string) => FalQueueOps = falQueueOps,
): FalQueueClient {
  return {
    async submitJob(endpoint, input) {
      const { requestId } = await router.submit(endpoint, input, {
        cost: { model: falModelIdFor(endpoint), images: requestedImages(input) },
      });
      return { requestId };
    },
    async jobStatus(endpoint, requestId) {
      const route = await router.routeOf(requestId);
      const status = await opsFor(route.key).status(endpoint, requestId);
      // 끝났으면 계정의 진행 중 수에서 뺀다. 결과 받기는 그 뒤에 와도 같은 키를 쓴다.
      if (status === "completed") router.finished(requestId);
      return status;
    },
    async jobResult(endpoint, requestId) {
      const route = await router.routeOf(requestId);
      const data = (await opsFor(route.key).result(endpoint, requestId)) as { images?: Array<{ url?: string }> } | null;
      return {
        images: (data?.images ?? []).flatMap((image) => image.url ? [{ url: image.url }] : []),
      };
    },
  };
}
```

- [ ] **Step 5: `apps/web/lib/fal/upload.ts` 전체를 바꾼다**

```ts
import { createFalClient, type FalClient } from "@fal-ai/client";
import { defaultFalRouter } from "./pool/default";
import type { FalRouter } from "./route";

export interface FalUploader {
  uploadReference(bytes: Uint8Array, contentType: string): Promise<string>;
}

type FalClientFactory = (config: { credentials: string; retry: { maxRetries: number } }) => Pick<FalClient, "storage">;

/**
 * 로컬·운영 파일을 같은 fal 업로드 URL로 바꾸는 공용 계약.
 *
 * 올릴 키는 `router.uploadRoute()` 가 고른다(켜진 성한 계정, 없으면 서버 `FAL_KEY`). 올린 주소는 공개
 * 주소라 다른 계정의 생성 요청에도 그대로 쓸 수 있다.
 */
export function createFalUploader(
  router: FalRouter = defaultFalRouter(),
  factory: FalClientFactory = createFalClient,
): FalUploader {
  return {
    async uploadReference(bytes, contentType) {
      const { key } = await router.uploadRoute();
      const client = factory({ credentials: key, retry: { maxRetries: 0 } });
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const blob = new Blob([copy.buffer], { type: contentType });
      return client.storage.upload(blob, { lifecycle: { expiresIn: "1h" } });
    },
  };
}

/** 같은 배치의 동일 키를 한 번만 업로드하고 URL을 재사용한다. */
export async function uploadUniqueReferences<T>(
  items: T[],
  keyOf: (item: T) => string,
  upload: (item: T) => Promise<string>,
): Promise<Record<string, string>> {
  const urls: Record<string, string> = {};
  for (const item of items) {
    const key = keyOf(item);
    if (urls[key] === undefined) urls[key] = await upload(item);
  }
  return urls;
}
```

- [ ] **Step 6: 배경 제거를 풀에 잇는다** — `apps/web/lib/ad/background.ts`

1~2줄을:
```ts
import { recordAiCost } from "../llm/meter";
import { defaultFalRouter } from "../fal/pool/default";
import type { FalRouter } from "../fal/route";
import { runFalQueued } from "../fal/run";
```
`createBackgroundRemover`(75~77줄)를:
```ts
/**
 * 계정 풀을 거치는 배경 제거(S3b). 제출·상태·결과가 모두 **같은 계정의 키**로 간다.
 * 비용 한 줄은 지금처럼 `onEnqueue` 에서 적는다 — 그래서 여기서는 `cost` 를 넘기지 않는다.
 */
export function createBackgroundRemover(router: FalRouter = defaultFalRouter()): FalSubscriber {
  return {
    async subscribe(endpoint, options) {
      const { data } = await runFalQueued(router, {
        endpoint,
        input: options.input,
        signal: options.abortSignal,
        onSubmitted: options.onEnqueue,
        startTimeoutS: 60,
        deadlineMs: BACKGROUND_TIMEOUT_MS,
        pollMs: 500,
      });
      return { data };
    },
  };
}
```
`removeBackground` 주석의 두 줄(「그것만으로는 우리가 손을 뗀 뒤에도 fal 클라이언트가 상태를 계속 묻는다. / `@fal-ai/client` 의 `RunOptions` 에 `abortSignal` 이 있으므로 실제로 끊는다.」)을:
```ts
 * 그것만으로는 우리가 손을 뗀 뒤에도 상태를 계속 묻는다. `runFalQueued` 가
 * 신호(`abortSignal`)를 보고 묻기를 멈추고 fal 에 취소를 한 번 보낸다.
```
`apps/web/app/api/ad/export/route.ts:122` 의 `createBackgroundRemover(process.env.FAL_KEY!)` → `createBackgroundRemover()`

- [ ] **Step 7: 포스터·카드뉴스 제공자** — `apps/web/lib/poster/providers.ts`: `import { createFalUploader } from "../fal/upload";` 아래에 `import { defaultFalRouter } from "../fal/pool/default";`, 그리고 `createPosterFalClients` 의 `return { … }` 를:
```ts
  // 계정은 풀이 고른다(S3b). 열쇠가 없거나 계정이 없으면 FAL_KEY 로 — 오늘과 같다.
  const router = defaultFalRouter(environment);
  return {
    queue: createFalQueueClient(router),
    uploader: createFalUploader(router),
  };
```
`apps/web/lib/sns/providers.ts`: `import { createFalUploader, type FalUploader } from "../fal/upload";` 아래에 `import { defaultFalRouter } from "../fal/pool/default";`, 그리고 `createSnsGenerationProviders` 의 두 줄(`const falQueue = createFalQueueClient(environment.FAL_KEY!);` / `const falUploader = createFalUploader(environment.FAL_KEY!);`)을:
```ts
  // 계정은 풀이 고른다(S3b). 열쇠가 없거나 계정이 없으면 FAL_KEY 로 — 오늘과 같다.
  const router = defaultFalRouter(environment);
  const falQueue = createFalQueueClient(router);
  const falUploader = createFalUploader(router);
```
(`requireKeys(["FAL_KEY"])`·`requireSnsProviderKeys` 는 그대로 둔다 — `FAL_KEY` 는 대체 길이라 계속 필요하다)

- [ ] **Step 8: 상세페이지·리디자인의 기본 길** — `apps/web/lib/pdp/fal.ts`: `import { envFalRouter, type FalRouter } from "../fal/route";` 를
```ts
import { defaultFalRouter } from "../fal/pool/default";
import type { FalRouter } from "../fal/route";
```
로, `router: FalRouter = envFalRouter(environment),` 를 `router: FalRouter = defaultFalRouter(environment),` 로. `apps/web/lib/redesign/image-generator.ts`: 같은 import 두 줄 바꿈, 같은 기본값 바꿈, 그리고
```ts
  const apiKey = requireKey(environment);
  const uploader = createFalUploader(apiKey);
```
를
```ts
  requireKey(environment);
  const uploader = createFalUploader(router);
```

- [ ] **Step 9: 목록 시험 둘** — `apps/web/lib/__tests__/ai-cost-call-sites.test.ts` 의 `기록하는파일` 에서 `"apps/web/lib/fal/queue.ts": /recordAiCost\(/,` 와 `"apps/web/lib/ad/background.ts": /recordAiCost\(/,` 줄을 지우고, S3a 가 넣은 `http.ts` 줄의 주석을 바꾼다:
```ts
  // fal 대기열 제출 한 곳(S3a·S3b). 포스터·카드뉴스·상세페이지·캐릭터·리디자인이 모두 여기로 보낸다.
  // 배경 제거는 `onEnqueue` 에서 따로 적는다(`lib/ad/background.ts`, 제출은 같은 함수).
  "apps/web/lib/fal/http.ts": /recordAiCost\(/,
```
(두 파일은 이제 SDK·업체 주소가 없다 — 남기면 「알려진 목록과 같다」가 빨개진다.) `apps/web/lib/__tests__/ad-bundle-boundary.test.ts:64` 의 `expect(importsOf("../ad/background.ts")).toMatch(HEAVY);` 를:
```ts
    // 배경 제거는 S3b 부터 fal 클라이언트를 직접 들이지 않고 공용 대기열 길(`lib/fal/run.ts` → `http.ts`)로 간다.
    expect(importsOf("../ad/background.ts")).toMatch(/from\s+["']\.\.\/fal\/run["']/);
    expect(importsOf("../fal/http.ts")).toMatch(HEAVY);
```

- [ ] **Step 10: 통과를 본다**

Run: `cd apps/web && npx vitest run lib app/api && npx tsc --noEmit && echo TSC_OK`
Expected: 실패 0, `TSC_OK`. (`lib/__tests__/sns-*`·`ad-background`·`redesign-image-generator` 처럼 생성 경로 모듈을 불러오기만 하는 시험이 `server-only` 로 깨지면 Task 3 의 `store.ts` 가 `supabase/admin` 을 **부를 때** 들이는지 본다)

- [ ] **Step 11: 커밋**

```bash
git add apps/web/lib/fal apps/web/lib/ad/background.ts apps/web/app/api/ad/export/route.ts apps/web/lib/poster/providers.ts apps/web/lib/sns/providers.ts apps/web/lib/pdp/fal.ts apps/web/lib/redesign/image-generator.ts apps/web/lib/ai-cost/__tests__/image-submit-cost.test.ts apps/web/lib/__tests__/ai-cost-call-sites.test.ts apps/web/lib/__tests__/ad-bundle-boundary.test.ts
git commit -m "feat(fal-pool): 포스터·카드뉴스·상세페이지·리디자인·배경 제거를 계정 풀로 보낸다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 관리자 서버 쪽 — 확인·등록·설정·키 바꾸기·다시 확인·지우기

**Files:**
- Modify: `apps/web/lib/fal/http.ts`(끝에 `checkFalKey`), Test `apps/web/lib/fal/__tests__/http.test.ts`
- Create: `apps/web/lib/fal/pool/admin.ts`
- Create: `apps/web/app/admin/system/fal-account-actions.ts`, Test `apps/web/app/admin/__tests__/fal-account-actions.test.ts`
- Modify: `apps/web/app/admin/admin-shared.tsx:39·48`

**Interfaces:**
- Consumes: Task 1 함수, Task 2 `readMasterKey`·`sealFalKey`·`openFalKey`·`normalizeFalKey`·`lastFourOf`, Task 5 `refreshFalPool`, `requireAdmin`(`lib/membership/server.ts:56`), `failureUrl`(`lib/teams/failure.ts`)
- Produces:
  - `FAL_KEY_PROBE_URL`, `type FalKeyCheck = { ok: true } | { ok: false; reason: "invalid" | "unavailable"; status?: number; detail: string }`, `checkFalKey(key, fetchImpl?): Promise<FalKeyCheck>`
  - `interface FalAccountView { id; name; keyLast4; enabled; limit; state; cooldownUntil; lastErrorKind; lastErrorAt; lastErrorDetail; inFlight }`, `interface FalPoolAdminView { masterKey: "ok" | "missing" | "invalid"; accounts: FalAccountView[]; events: Array<{ at; action; actorEmail; name }> }`, `readFalPoolForAdmin(environment?): Promise<FalPoolAdminView>`
  - 서버 액션(FormData): `addFalAccountAction`(name·key·limit), `updateFalAccountAction`(id·name·limit·enabled '1'/'0'), `replaceFalKeyAction`(id·key), `recheckFalAccountAction`(id), `deleteFalAccountAction`(id). 알림 `fal_account_added`·`_saved`·`_key`·`_checked`·`_deleted`

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/lib/fal/__tests__/http.test.ts`: 맨 위 import 줄 `const { FalHttpError, falQueueOps, submitFalQueue } = await import("../http");` 를
```ts
const { FAL_KEY_PROBE_URL, FalHttpError, checkFalKey, falQueueOps, submitFalQueue } = await import("../http");
```
로 바꾸고 파일 끝에:
```ts
describe("checkFalKey", () => {
  const 답 = (status: number, body = "") => async () => new Response(body, { status });

  it("없는 요청의 상태를 Key 인증으로 묻는다 — 그림을 만들지 않는다", async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    await checkFalKey("k-1", async (url, init) => { seen.push({ url, init }); return new Response("", { status: 404 }); });
    expect(seen[0]!.url).toBe(FAL_KEY_PROBE_URL);
    expect(seen[0]!.url).toMatch(/\/requests\/[0-9a-f-]+\/status$/);
    expect(seen[0]!.init).toEqual({ method: "GET", headers: { Authorization: "Key k-1" } });
  });

  it("404(그런 요청 없음)·200 이면 키가 살아 있다", async () => {
    expect(await checkFalKey("k", 답(404, '{"status":"NOT_FOUND"}'))).toEqual({ ok: true });
    expect(await checkFalKey("k", 답(200))).toEqual({ ok: true });
  });

  it("401·403 이면 키가 틀렸다", async () => {
    expect(await checkFalKey("k", 답(401, '{"detail":"invalid key credentials"}'))).toEqual({ ok: false, reason: "invalid", status: 401, detail: '{"detail":"invalid key credentials"}' });
    expect(await checkFalKey("k", 답(403))).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("그 밖(5xx·429·네트워크)은 「지금 확인할 수 없음」— 틀렸다고 말하지 않는다", async () => {
    expect(await checkFalKey("k", 답(503))).toMatchObject({ ok: false, reason: "unavailable", status: 503 });
    expect(await checkFalKey("k", 답(429))).toMatchObject({ ok: false, reason: "unavailable" });
    expect(await checkFalKey("k", async () => { throw new Error("fetch failed"); })).toMatchObject({ ok: false, reason: "unavailable" });
  });
});
```

`apps/web/app/admin/__tests__/fal-account-actions.test.ts`:
```ts
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **fal 계정을 바꾸는 문**(보충 2026-10-01).
 *
 * 관리자인지 다시 본다(서버 액션은 주소만 알면 부를 수 있다). 키는 fal 에 무료로 한 번 물어 확인한 뒤
 * **계정 id 를 추가 인증 데이터로 잠가** DB 로 보낸다 — 원문은 RPC 인자에도, 주소(`?error=`)에도 없다.
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
let rpcError: { message: string; code?: string } | null = null;
let stored: Record<string, string> | null = null;
vi.mock("../../../lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return { data: null, error: rpcError };
    },
    from: () => ({ select: () => ({ eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: stored, error: null }) }) }) }) }),
  }),
}));

let 확인결과: { ok: true } | { ok: false; reason: "invalid" | "unavailable"; status?: number; detail: string } = { ok: true };
const 확인한키: string[] = [];
vi.mock("../../../lib/fal/http", () => ({
  checkFalKey: async (key: string) => { 확인한키.push(key); return 확인결과; },
}));
const refreshFalPool = vi.fn();
vi.mock("../../../lib/fal/pool/default", () => ({ refreshFalPool: () => refreshFalPool() }));

const { openFalKey, sealFalKey } = await import("../../../lib/fal/pool/key-crypto");
const actions = await import("../system/fal-account-actions");

const 열쇠 = randomBytes(32);
const 키 = "11111111-2222-3333-4444-555555555555:0123456789abcdefWXYZ";
const ID = "a1000000-0000-4000-8000-000000000001";
const 폼 = (fields: Record<string, string>) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
};
const 오류 = () => decodeURIComponent(redirected.at(-1)!.split("error=")[1] ?? "");

beforeEach(() => {
  calls.length = 0;
  redirected.length = 0;
  확인한키.length = 0;
  rpcError = null;
  stored = null;
  관리자다 = true;
  확인결과 = { ok: true };
  refreshFalPool.mockClear();
  process.env.FAL_KEY_ENCRYPTION_SECRET = 열쇠.toString("base64");
});
afterEach(() => { delete process.env.FAL_KEY_ENCRYPTION_SECRET; });

describe("등록", () => {
  it("확인하고, 계정 id 로 잠가 보낸다 — 원문은 RPC 인자 어디에도 없다", async () => {
    await actions.addFalAccountAction(폼({ name: " fal-1 (ai.dev 계정) ", key: `  ${키}\n`, limit: "20" }));
    expect(확인한키).toEqual([키]);
    expect(calls).toHaveLength(1);
    const { fn, args } = calls[0]!;
    expect(fn).toBe("fal_account_add");
    expect(args).toMatchObject({ p_actor: "admin-1", p_name: "fal-1 (ai.dev 계정)", p_last4: "WXYZ", p_limit: 20 });
    expect(JSON.stringify(args)).not.toContain("0123456789abcdef");
    const sealed = { ciphertext: String(args.p_ciphertext), iv: String(args.p_iv), tag: String(args.p_tag) };
    expect(openFalKey(열쇠, String(args.p_id), sealed)).toBe(키);
    expect(refreshFalPool).toHaveBeenCalledOnce();
    expect(redirected).toEqual(["/admin/system?notice=fal_account_added"]);
  });

  it("관리자가 아니면 아무것도 하지 않는다", async () => {
    관리자다 = false;
    await expect(actions.addFalAccountAction(폼({ name: "a", key: 키 }))).rejects.toThrow();
    expect(calls).toEqual([]);
    expect(확인한키).toEqual([]);
  });

  it("fal 이 거절하면 저장하지 않고 까닭을 말한다 — 키는 주소에 싣지 않는다", async () => {
    확인결과 = { ok: false, reason: "invalid", status: 401, detail: "invalid key credentials" };
    await actions.addFalAccountAction(폼({ name: "a", key: 키 }));
    expect(calls).toEqual([]);
    expect(오류()).toBe("fal 이 이 키를 거절했습니다(401). 키를 다시 확인해 주세요.");
    expect(redirected.at(-1)).not.toContain("0123456789");
  });

  it("fal 에 물을 수 없으면 틀렸다고 하지 않고 「잠시 뒤」", async () => {
    확인결과 = { ok: false, reason: "unavailable", status: 503, detail: "" };
    await actions.addFalAccountAction(폼({ name: "a", key: 키 }));
    expect(오류()).toBe("지금 fal 에 키를 확인할 수 없습니다. 잠시 뒤 다시 시도해 주세요.");
  });

  it("서버 열쇠가 없으면 저장하지 않는다", async () => {
    delete process.env.FAL_KEY_ENCRYPTION_SECRET;
    await actions.addFalAccountAction(폼({ name: "a", key: 키 }));
    expect(calls).toEqual([]);
    expect(오류()).toContain("FAL_KEY_ENCRYPTION_SECRET");
  });

  it("이름·한도·키 모양을 본다", async () => {
    await actions.addFalAccountAction(폼({ name: "  ", key: 키 }));
    expect(오류()).toBe("이름을 1~80자로 넣어 주세요.");
    await actions.addFalAccountAction(폼({ name: "a", key: 키, limit: "201" }));
    expect(오류()).toBe("동시 한도는 1~200 사이로 넣어 주세요.");
    await actions.addFalAccountAction(폼({ name: "a", key: "short" }));
    expect(오류()).toBe("키 모양이 올바르지 않습니다. fal 에서 복사한 키를 그대로 붙여 넣어 주세요.");
    expect(calls).toEqual([]);
  });

  it("같은 이름이면 사람 말로", async () => {
    rpcError = { message: 'duplicate key value violates unique constraint "fal_accounts_name_live"', code: "23505" };
    await actions.addFalAccountAction(폼({ name: "a", key: 키 }));
    expect(오류()).toBe("같은 이름의 계정이 이미 있습니다.");
  });
});

describe("설정·켜고 끄기", () => {
  it("이름·한도·사용을 한 번에 보낸다", async () => {
    await actions.updateFalAccountAction(폼({ id: ID, name: "fal-2", limit: "30", enabled: "0" }));
    expect(calls).toEqual([{ fn: "fal_account_update", args: { p_actor: "admin-1", p_id: ID, p_name: "fal-2", p_limit: 30, p_enabled: false } }]);
    expect(redirected).toEqual(["/admin/system?notice=fal_account_saved"]);
  });

  it("사용 값은 정확히 '1'/'0' 만", async () => {
    await actions.updateFalAccountAction(폼({ id: ID, name: "a", limit: "20", enabled: "yes" }));
    expect(calls).toEqual([]);
  });
});

describe("키 바꾸기·지우기 — 진행 중이면 DB 가 거절한다", () => {
  it("키 바꾸기는 새 키를 같은 계정 id 로 잠근다", async () => {
    await actions.replaceFalKeyAction(폼({ id: ID, key: 키 }));
    const { fn, args } = calls[0]!;
    expect(fn).toBe("fal_account_set_key");
    expect(openFalKey(열쇠, ID, { ciphertext: String(args.p_ciphertext), iv: String(args.p_iv), tag: String(args.p_tag) })).toBe(키);
  });

  it("진행 중이면 기다리라고 말한다", async () => {
    rpcError = { message: "fal_account_in_flight" };
    await actions.deleteFalAccountAction(폼({ id: ID }));
    expect(오류()).toBe("진행 중인 생성이 끝난 뒤에 할 수 있습니다. 먼저 「사용」을 끄고, 진행 중이 0 이 되면 다시 눌러 주세요.");
    expect(refreshFalPool).not.toHaveBeenCalled();
  });
});

describe("다시 확인", () => {
  it("저장된 키를 풀어 fal 에 묻고 결과를 적는다", async () => {
    const sealed = sealFalKey(열쇠, ID, 키);
    stored = { key_ciphertext: sealed.ciphertext, key_iv: sealed.iv, key_tag: sealed.tag };
    await actions.recheckFalAccountAction(폼({ id: ID }));
    expect(확인한키).toEqual([키]);
    expect(calls).toEqual([{ fn: "fal_account_recheck", args: { p_actor: "admin-1", p_id: ID, p_ok: true, p_detail: null } }]);
    expect(redirected).toEqual(["/admin/system?notice=fal_account_checked"]);
  });

  it("거절이면 「키 오류」로 적고 키를 바꾸라고 말한다", async () => {
    const sealed = sealFalKey(열쇠, ID, 키);
    stored = { key_ciphertext: sealed.ciphertext, key_iv: sealed.iv, key_tag: sealed.tag };
    확인결과 = { ok: false, reason: "invalid", status: 401, detail: "invalid key credentials" };
    await actions.recheckFalAccountAction(폼({ id: ID }));
    expect(calls[0]!.args).toMatchObject({ p_ok: false, p_detail: "invalid key credentials" });
    expect(오류()).toContain("「키 바꾸기」");
  });

  it("다른 열쇠로 잠긴 키는 풀지 못한다고 말한다", async () => {
    const sealed = sealFalKey(randomBytes(32), ID, 키);
    stored = { key_ciphertext: sealed.ciphertext, key_iv: sealed.iv, key_tag: sealed.tag };
    await actions.recheckFalAccountAction(폼({ id: ID }));
    expect(calls).toEqual([]);
    expect(오류()).toBe("서버 열쇠로 이 키를 풀 수 없습니다. 「키 바꾸기」로 키를 다시 넣어 주세요.");
  });
});

describe("DB 함수와 이름이 맞는다", () => {
  const migration = readFileSync(join(__dirname, "..", "..", "..", "..", "..", "supabase", "migrations", "202610010001_fal_account_pool.sql"), "utf8");
  const paramsOf = (fn: string) => {
    const match = new RegExp(String.raw`create or replace function public\.${fn}\(([^)]*)\)`).exec(migration);
    if (!match) throw new Error(`${fn} 가 마이그레이션에 없습니다`);
    return [...match[1]!.matchAll(/\b(p_\w+)/g)].map((m) => m[1]!).sort();
  };

  it("다섯 액션이 부르는 함수 이름·인자 이름이 마이그레이션과 같다", async () => {
    const sealed = sealFalKey(열쇠, ID, 키);
    stored = { key_ciphertext: sealed.ciphertext, key_iv: sealed.iv, key_tag: sealed.tag };
    await actions.addFalAccountAction(폼({ name: "a", key: 키 }));
    await actions.updateFalAccountAction(폼({ id: ID, name: "a", limit: "20", enabled: "1" }));
    await actions.replaceFalKeyAction(폼({ id: ID, key: 키 }));
    await actions.recheckFalAccountAction(폼({ id: ID }));
    await actions.deleteFalAccountAction(폼({ id: ID }));
    expect(calls.map((c) => c.fn)).toEqual(["fal_account_add", "fal_account_update", "fal_account_set_key", "fal_account_recheck", "fal_account_delete"]);
    for (const call of calls) expect(Object.keys(call.args).sort()).toEqual(paramsOf(call.fn));
  });
});
```

- [ ] **Step 2: 실패를 본다** — Run: `cd apps/web && npx vitest run lib/fal/__tests__/http.test.ts app/admin/__tests__/fal-account-actions.test.ts` · Expected: FAIL(`checkFalKey is not a function`, 액션 파일 없음)

- [ ] **Step 3: `apps/web/lib/fal/http.ts` 끝에 무료 확인을 더한다**

```ts
/**
 * **이미지를 만들지 않고** 키가 살아 있는지 본다(관리자 화면의 등록·「다시 확인」).
 *
 * 없는 요청 번호의 상태를 묻는다. 2026-10-01 실측: 엉터리 키는 `401 {"detail":"invalid key credentials"}`,
 * 모양이 틀린 키·빈 키도 401 이다. 맞는 키는 「그런 요청 없음」(404)을 받는다. 값이 들지 않는다.
 *
 * **한계**: 잔액 소진 잠김은 여기서 안 드러날 수 있다 — 실제 생성에서만 드러난다(설계 §3.3). 화면에 적는다.
 */
export const FAL_KEY_PROBE_URL = `${FAL_QUEUE_BASE}/fal-ai/nano-banana-pro/requests/00000000-0000-4000-8000-000000000000/status`;

export type FalKeyCheck =
  | { ok: true }
  | { ok: false; reason: "invalid" | "unavailable"; status?: number; detail: string };

export async function checkFalKey(key: string, fetchImpl: FetchLike = fetch): Promise<FalKeyCheck> {
  let response: Response;
  try {
    response = await fetchImpl(FAL_KEY_PROBE_URL, { method: "GET", headers: { Authorization: `Key ${key}` } });
  } catch (error) {
    return { ok: false, reason: "unavailable", detail: error instanceof Error ? error.message : String(error) };
  }
  const detail = (await response.text().catch(() => "")).slice(0, 300);
  if (response.ok || response.status === 404) return { ok: true };
  if (response.status === 401 || response.status === 403) return { ok: false, reason: "invalid", status: response.status, detail };
  return { ok: false, reason: "unavailable", status: response.status, detail };
}
```

- [ ] **Step 4: `apps/web/lib/fal/pool/admin.ts` 를 만든다**

```ts
import { createSupabaseAdminClient } from "../../supabase/admin";
import { readMasterKey } from "./key-crypto";
import type { FalAccountState } from "./store";

/**
 * 관리자 화면 「fal 계정」이 읽는 것(보충 2026-10-01). **키 원문·암호문은 여기 없다** — DB 함수가 이름·끝 4자리·
 * 상태·진행 중 수만 내보낸다(`fal_account_admin_list`).
 */

export interface FalAccountView {
  id: string;
  name: string;
  keyLast4: string;
  enabled: boolean;
  limit: number;
  state: FalAccountState;
  cooldownUntil: string | null;
  lastErrorKind: Exclude<FalAccountState, "ok"> | null;
  lastErrorAt: string | null;
  lastErrorDetail: string | null;
  inFlight: number;
}

export interface FalAccountEventView {
  at: string;
  action: string;
  actorEmail: string | null;
  name: string | null;
}

export interface FalPoolAdminView {
  /** 서버 열쇠 상태. ok 가 아니면 등록·키 바꾸기를 막고, 생성은 `FAL_KEY` 로 간다. */
  masterKey: "ok" | "missing" | "invalid";
  accounts: FalAccountView[];
  events: FalAccountEventView[];
}

type ListRow = {
  id: string; name: string; key_last4: string; enabled: boolean; concurrency_limit: number; state: FalAccountState;
  cooldown_until: string | null; last_error_kind: FalAccountView["lastErrorKind"]; last_error_at: string | null;
  last_error_detail: string | null; in_flight: number;
};
type EventRow = { created_at: string; action: string; actor_email: string | null; input: { name?: string } | null };

export async function readFalPoolForAdmin(environment: Record<string, string | undefined> = process.env): Promise<FalPoolAdminView> {
  const master = readMasterKey(environment.FAL_KEY_ENCRYPTION_SECRET);
  const admin = createSupabaseAdminClient();
  const [list, events] = await Promise.all([
    admin.rpc("fal_account_admin_list"),
    admin.rpc("fal_account_admin_events", { p_limit: 20 }),
  ]);
  if (list.error) throw new Error(`fal_account_admin_list: ${list.error.message}`);
  if (events.error) throw new Error(`fal_account_admin_events: ${events.error.message}`);
  return {
    masterKey: master.ok ? "ok" : master.reason,
    accounts: ((list.data ?? []) as ListRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      keyLast4: row.key_last4,
      enabled: row.enabled,
      limit: Number(row.concurrency_limit),
      state: row.state,
      cooldownUntil: row.cooldown_until,
      lastErrorKind: row.last_error_kind,
      lastErrorAt: row.last_error_at,
      lastErrorDetail: row.last_error_detail,
      inFlight: Number(row.in_flight),
    })),
    events: ((events.data ?? []) as EventRow[]).map((row) => ({
      at: row.created_at,
      action: row.action,
      actorEmail: row.actor_email,
      name: row.input?.name ?? null,
    })),
  };
}
```

- [ ] **Step 5: `apps/web/app/admin/system/fal-account-actions.ts` 를 만든다**

```ts
"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { checkFalKey } from "../../../lib/fal/http";
import { refreshFalPool } from "../../../lib/fal/pool/default";
import { lastFourOf, normalizeFalKey, openFalKey, readMasterKey, sealFalKey } from "../../../lib/fal/pool/key-crypto";
import { requireAdmin } from "../../../lib/membership/server";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { failureUrl } from "../../../lib/teams/failure";

/**
 * **관리자 화면 「fal 계정」의 문**(보충 2026-10-01).
 *
 * - 관리자 두 명 모두(`requireAdmin`, DB 함수도 `credit_require_admin` 으로 다시 본다). 서버 액션은 주소만 알면
 *   직접 부를 수 있다
 * - 키 원문은 **이 함수 안에서만** 산다: 다듬기 → fal 에 무료로 한 번 물어 확인 → 계정 id 를 추가 인증 데이터로
 *   잠가 DB 로. 화면·기록·오류 문구로 되돌아가지 않는다
 * - 던지지 않는다 — 실패는 `?error=` 로(`ai-control-actions.ts` 와 같은 판단)
 * - 바꾼 뒤 `refreshFalPool()` — 같은 프로세스의 생성이 다음 제출부터 새 목록을 쓴다
 */

const BACK = "/admin/system";

const NameSchema = z.string().trim().min(1).max(80);
const LimitSchema = z.coerce.number().int().min(1).max(200);
const IdSchema = z.string().uuid();

function failed(message: string): void {
  revalidatePath(BACK);
  redirect(failureUrl(BACK, message));
}

function done(notice: string): void {
  refreshFalPool();
  revalidatePath(BACK);
  redirect(`${BACK}?notice=${notice}`);
}

/** DB 오류를 사람 말로. 표·제약 이름은 화면에 내지 않는다. */
function dbFailure(error: { message: string; code?: string }): string {
  if (error.message.includes("fal_account_in_flight")) {
    return "진행 중인 생성이 끝난 뒤에 할 수 있습니다. 먼저 「사용」을 끄고, 진행 중이 0 이 되면 다시 눌러 주세요.";
  }
  if (error.message.includes("fal_accounts_name_live") || error.code === "23505") return "같은 이름의 계정이 이미 있습니다.";
  if (error.message.includes("credit_admin_required")) return "관리자만 바꿀 수 있습니다.";
  if (error.message.includes("fal_account_not_found")) return "이 계정을 찾지 못했습니다. 새로고침해 주세요.";
  console.error("[fal-pool] 관리자 변경 실패", { message: error.message });
  return "처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

/** 서버 열쇠. 없으면 등록·키 바꾸기를 하지 않는다(잠글 수 없다). */
function masterKeyOrFail(): Buffer | null {
  const master = readMasterKey(process.env.FAL_KEY_ENCRYPTION_SECRET);
  if (master.ok) return master.key;
  failed("서버 열쇠(FAL_KEY_ENCRYPTION_SECRET)가 없어 키를 저장할 수 없습니다. 운영 설정을 먼저 해 주세요.");
  return null;
}

/** 붙여 넣은 키를 다듬고 fal 에 한 번 물어 본다. 통과하면 다듬은 키, 아니면 null(이미 돌려보냄). */
async function verifiedKeyOrFail(raw: FormDataEntryValue | null): Promise<string | null> {
  const key = normalizeFalKey(String(raw ?? ""));
  if (!key) {
    failed("키 모양이 올바르지 않습니다. fal 에서 복사한 키를 그대로 붙여 넣어 주세요.");
    return null;
  }
  const check = await checkFalKey(key);
  if (check.ok) return key;
  failed(check.reason === "invalid"
    ? `fal 이 이 키를 거절했습니다(${check.status ?? "?"}). 키를 다시 확인해 주세요.`
    : "지금 fal 에 키를 확인할 수 없습니다. 잠시 뒤 다시 시도해 주세요.");
  return null;
}

export async function addFalAccountAction(formData: FormData) {
  const membership = await requireAdmin();
  const name = NameSchema.safeParse(formData.get("name"));
  const limit = LimitSchema.safeParse(formData.get("limit") || 20);
  if (!name.success) return failed("이름을 1~80자로 넣어 주세요.");
  if (!limit.success) return failed("동시 한도는 1~200 사이로 넣어 주세요.");
  const master = masterKeyOrFail();
  if (!master) return;
  const key = await verifiedKeyOrFail(formData.get("key"));
  if (!key) return;

  const id = randomUUID();
  const sealed = sealFalKey(master, id, key);
  const { error } = await createSupabaseAdminClient().rpc("fal_account_add", {
    p_actor: membership.user.id,
    p_id: id,
    p_name: name.data,
    p_ciphertext: sealed.ciphertext,
    p_iv: sealed.iv,
    p_tag: sealed.tag,
    p_last4: lastFourOf(key),
    p_limit: limit.data,
  });
  if (error) return failed(dbFailure(error));
  done("fal_account_added");
}

export async function updateFalAccountAction(formData: FormData) {
  const membership = await requireAdmin();
  const id = IdSchema.safeParse(formData.get("id"));
  const name = NameSchema.safeParse(formData.get("name"));
  const limit = LimitSchema.safeParse(formData.get("limit"));
  const enabled = formData.get("enabled");
  if (!id.success || (enabled !== "1" && enabled !== "0")) return failed("올바르지 않은 값입니다.");
  if (!name.success) return failed("이름을 1~80자로 넣어 주세요.");
  if (!limit.success) return failed("동시 한도는 1~200 사이로 넣어 주세요.");

  const { error } = await createSupabaseAdminClient().rpc("fal_account_update", {
    p_actor: membership.user.id,
    p_id: id.data,
    p_name: name.data,
    p_limit: limit.data,
    p_enabled: enabled === "1",
  });
  if (error) return failed(dbFailure(error));
  done("fal_account_saved");
}

export async function replaceFalKeyAction(formData: FormData) {
  const membership = await requireAdmin();
  const id = IdSchema.safeParse(formData.get("id"));
  if (!id.success) return failed("올바르지 않은 값입니다.");
  const master = masterKeyOrFail();
  if (!master) return;
  const key = await verifiedKeyOrFail(formData.get("key"));
  if (!key) return;

  const sealed = sealFalKey(master, id.data, key);
  const { error } = await createSupabaseAdminClient().rpc("fal_account_set_key", {
    p_actor: membership.user.id,
    p_id: id.data,
    p_ciphertext: sealed.ciphertext,
    p_iv: sealed.iv,
    p_tag: sealed.tag,
    p_last4: lastFourOf(key),
  });
  if (error) return failed(dbFailure(error));
  done("fal_account_key");
}

/** 「다시 확인」 — 잔액을 채웠거나 fal 쪽 문제가 풀렸을 때. 저장된 키를 풀어 fal 에 무료로 한 번 묻는다. */
export async function recheckFalAccountAction(formData: FormData) {
  const membership = await requireAdmin();
  const id = IdSchema.safeParse(formData.get("id"));
  if (!id.success) return failed("올바르지 않은 값입니다.");
  const master = masterKeyOrFail();
  if (!master) return;

  const admin = createSupabaseAdminClient();
  const { data, error: readError } = await admin
    .from("fal_accounts")
    .select("key_ciphertext,key_iv,key_tag")
    .eq("id", id.data)
    .is("deleted_at", null)
    .maybeSingle();
  if (readError || !data) return failed("이 계정을 찾지 못했습니다. 새로고침해 주세요.");

  let key: string;
  try {
    const row = data as { key_ciphertext: string; key_iv: string; key_tag: string };
    key = openFalKey(master, id.data, { ciphertext: row.key_ciphertext, iv: row.key_iv, tag: row.key_tag });
  } catch {
    return failed("서버 열쇠로 이 키를 풀 수 없습니다. 「키 바꾸기」로 키를 다시 넣어 주세요.");
  }

  const check = await checkFalKey(key);
  if (!check.ok && check.reason === "unavailable") return failed("지금 fal 에 키를 확인할 수 없습니다. 잠시 뒤 다시 시도해 주세요.");
  const { error } = await admin.rpc("fal_account_recheck", {
    p_actor: membership.user.id,
    p_id: id.data,
    p_ok: check.ok,
    p_detail: check.ok ? null : check.detail,
  });
  if (error) return failed(dbFailure(error));
  if (!check.ok) return failed(`fal 이 이 키를 거절했습니다(${check.status ?? "?"}). 「키 바꾸기」로 새 키를 넣어 주세요.`);
  done("fal_account_checked");
}

export async function deleteFalAccountAction(formData: FormData) {
  const membership = await requireAdmin();
  const id = IdSchema.safeParse(formData.get("id"));
  if (!id.success) return failed("올바르지 않은 값입니다.");
  const { error } = await createSupabaseAdminClient().rpc("fal_account_delete", {
    p_actor: membership.user.id,
    p_id: id.data,
  });
  if (error) return failed(dbFailure(error));
  done("fal_account_deleted");
}
```

- [ ] **Step 6: 알림 문구** — `apps/web/app/admin/admin-shared.tsx` 의 `AI_CONTROL_NOTICE` 표 바로 아래에:
```tsx
/** fal 계정 알림(보충 2026-10-01). */
const FAL_ACCOUNT_NOTICE: Record<string, string> = {
  fal_account_added: "fal 계정을 확인하고 등록했습니다. 키는 잠가 두었고 화면에는 끝 4자리만 보입니다.",
  fal_account_saved: "fal 계정 설정을 저장했습니다.",
  fal_account_key: "fal 계정 키를 바꿨습니다.",
  fal_account_checked: "fal 이 키를 받아 주었습니다. 다시 이 계정으로 보냅니다.",
  fal_account_deleted: "fal 계정을 지웠습니다. 저장된 키도 함께 지웠습니다.",
};
```
그리고 `AdminNotice` 의 `AI_CONTROL_NOTICE[notice] ?? (` 를 `AI_CONTROL_NOTICE[notice] ?? FAL_ACCOUNT_NOTICE[notice] ?? (` 로

- [ ] **Step 7: 통과를 본다**

Run: `cd apps/web && npx vitest run lib/fal app/admin lib/__tests__/ai-cost-call-sites.test.ts app/__tests__/ui-text-dash.test.ts && npx tsc --noEmit && echo TSC_OK`
Expected: 실패 0(http 12 · actions 15), `TSC_OK`

- [ ] **Step 8: 커밋**

```bash
git add apps/web/lib/fal/http.ts apps/web/lib/fal/__tests__/http.test.ts apps/web/lib/fal/pool/admin.ts apps/web/app/admin/system/fal-account-actions.ts apps/web/app/admin/__tests__/fal-account-actions.test.ts apps/web/app/admin/admin-shared.tsx
git commit -m "feat(fal-pool): 관리자가 fal 키를 확인해 잠가 등록하고 바꾸고 지운다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 관리자 화면 「fal 계정」

**Files:**
- Create: `apps/web/app/admin/system/fal-accounts-panel.tsx`, Test `apps/web/app/admin/__tests__/fal-accounts-panel.test.tsx`
- Modify: `apps/web/app/admin/system/page.tsx:19·58·72`

**Interfaces:**
- Consumes: Task 6 `FalPoolAdminView`·`FalAccountView`·`readFalPoolForAdmin`·다섯 액션, `ConfirmSubmitButton`(`app/admin/confirm-submit-button.tsx`), `@fixup/ui` 의 `Badge`·`Button`·`Card…`·`Input`·`Label`
- Produces: `FalAccountsPanel({ view: FalPoolAdminView | null })`

- [ ] **Step 1: 실패하는 시험을 쓴다**

```tsx
import React from "react";
import { create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

/**
 * **관리자 화면 「fal 계정」**(보충 2026-10-01). 화면이 무엇을 말하는지 본다 — 끝 4자리만, 상태 이름, 진행 중 수,
 * 서버 열쇠가 없을 때의 경고, 진행 중이면 키 바꾸기·지우기 단추가 잠김, 못 읽었을 때.
 */
vi.mock("server-only", () => ({}));
vi.mock("../system/fal-account-actions", () => ({
  addFalAccountAction: vi.fn(), updateFalAccountAction: vi.fn(), replaceFalKeyAction: vi.fn(),
  recheckFalAccountAction: vi.fn(), deleteFalAccountAction: vi.fn(),
}));
vi.mock("../confirm-submit-button", () => ({
  ConfirmSubmitButton: ({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) =>
    React.createElement("button", { type: "submit", disabled }, children),
}));

const { FalAccountsPanel } = await import("../system/fal-accounts-panel");
type View = NonNullable<Parameters<typeof FalAccountsPanel>[0]["view"]>;

const 계정 = (extra: Partial<View["accounts"][number]> = {}): View["accounts"][number] => ({
  id: "a1000000-0000-4000-8000-000000000001", name: "fal-1 (ai.dev 계정)", keyLast4: "WXYZ", enabled: true, limit: 20,
  state: "ok", cooldownUntil: null, lastErrorKind: null, lastErrorAt: null, lastErrorDetail: null, inFlight: 0, ...extra,
});

const 글 = (view: View | null) => JSON.stringify(create(<FalAccountsPanel view={view} />).toJSON());
const 단추 = (view: View, label: string) =>
  create(<FalAccountsPanel view={view} />).root.findAll((node) => node.type === "button" && JSON.stringify(node.props.children).includes(label));

describe("fal 계정 패널", () => {
  it("끝 4자리·사용·진행 중/한도·상태를 보인다", () => {
    const text = 글({ masterKey: "ok", accounts: [계정({ inFlight: 3 })], events: [] });
    expect(text).toContain("····");
    expect(text).toContain("WXYZ");
    expect(text).toContain("진행 중 ");
    expect(text).toContain("정상");
  });

  it("마지막 오류의 종류와 시각(한국 시각)을 보인다", () => {
    const text = 글({ masterKey: "ok", events: [], accounts: [계정({ state: "locked", lastErrorKind: "locked", lastErrorAt: "2026-10-01T00:30:00Z", lastErrorDetail: "User is locked" })] });
    expect(text).toContain("잔액 소진");
    expect(text).toContain("오전 09:30");
  });

  it("계정이 없으면 서버 FAL_KEY 로 만든다고 말한다", () => {
    expect(글({ masterKey: "ok", accounts: [], events: [] })).toContain("등록된 계정이 없습니다. 지금은 서버 FAL_KEY 하나로 만듭니다.");
  });

  it("서버 열쇠가 없으면 경고하고 등록 단추를 잠근다", () => {
    const view: View = { masterKey: "missing", accounts: [], events: [] };
    expect(글(view)).toContain("FAL_KEY_ENCRYPTION_SECRET");
    expect(단추(view, "확인하고 등록")[0]!.props.disabled).toBe(true);
  });

  it("진행 중이 있으면 키 바꾸기·지우기 단추가 잠긴다", () => {
    const view: View = { masterKey: "ok", accounts: [계정({ inFlight: 1 })], events: [] };
    expect(단추(view, "키 바꾸기")[0]!.props.disabled).toBe(true);
    expect(단추(view, "지우기")[0]!.props.disabled).toBe(true);
  });

  it("키 입력칸은 가려진 칸이고 자동 완성을 끈다", () => {
    const inputs = create(<FalAccountsPanel view={{ masterKey: "ok", accounts: [계정()], events: [] }} />).root
      .findAll((node) => node.props.name === "key" && typeof node.type !== "string");
    expect(inputs.length).toBe(2);
    for (const input of inputs) expect(input.props).toMatchObject({ type: "password", autoComplete: "off" });
  });

  it("못 읽었으면 단추 없이 모른다고 말한다", () => {
    const text = 글(null);
    expect(text).toContain("fal 계정 목록을 읽지 못했습니다");
    expect(text).not.toContain("확인하고 등록");
  });

  it("변경 기록에 누가 무엇을 했는지", () => {
    const text = 글({ masterKey: "ok", accounts: [], events: [{ at: "2026-10-01T01:00:00Z", action: "fal_account_disable", actorEmail: "ai.dev@example.invalid", name: "fal-1" }] });
    expect(text).toContain("사용 끔");
    expect(text).toContain("ai.dev@example.invalid");
  });
});
```

- [ ] **Step 2: 실패를 본다** — Run: `cd apps/web && npx vitest run app/admin/__tests__/fal-accounts-panel.test.tsx` · Expected: FAIL(파일 없음)

- [ ] **Step 3: 카드를 만든다** — `apps/web/app/admin/system/fal-accounts-panel.tsx`

```tsx
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@fixup/ui";
import type { FalAccountView, FalPoolAdminView } from "../../../lib/fal/pool/admin";
import { ConfirmSubmitButton } from "../confirm-submit-button";
import {
  addFalAccountAction,
  deleteFalAccountAction,
  recheckFalAccountAction,
  replaceFalKeyAction,
  updateFalAccountAction,
} from "./fal-account-actions";

/**
 * 관리자 화면 「fal 계정」(보충 2026-10-01).
 *
 * 등록(이름·키·동시 한도) → 목록(끝 4자리·사용·한도·진행 중·상태·마지막 오류) → 변경 기록. 키는 **등록할 때 한 번만**
 * 입력하고 그 뒤로는 끝 4자리만 보인다. 못 읽으면(`view === null`) 단추를 숨기고 모른다고 말한다.
 */

const STATE_LABEL: Record<FalAccountView["state"], string> = {
  ok: "정상",
  rate_limited: "한도 걸림",
  locked: "잔액 소진",
  invalid: "키 오류",
  decrypt_failed: "키를 풀 수 없음",
};

const ACTION_LABEL: Record<string, string> = {
  fal_account_add: "등록",
  fal_account_update: "설정 변경",
  fal_account_enable: "사용 켬",
  fal_account_disable: "사용 끔",
  fal_account_key: "키 바꿈",
  fal_account_check: "다시 확인",
  fal_account_delete: "삭제",
};

const when = (iso: string) =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function FalAccountsPanel({ view }: { view: FalPoolAdminView | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>fal 계정</CardTitle>
        <CardDescription>
          이미지 생성은 켜진 계정 가운데 여유가 가장 큰 계정으로 보냅니다. 한 계정이 막히면(한도·잔액·키 오류) 같은 요청을 곧바로 다음
          계정으로 옮기고, 잔액·키 문제는 관리자 메일로 알립니다. 켜진 계정이 없으면 서버 FAL_KEY 하나로 만듭니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {view === null ? (
          <p className="text-sm text-destructive">fal 계정 목록을 읽지 못했습니다. 새로고침해서 다시 확인해 주세요.</p>
        ) : (
          <>
            {view.masterKey !== "ok" ? (
              <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                서버 열쇠(FAL_KEY_ENCRYPTION_SECRET)가 {view.masterKey === "missing" ? "없어" : "올바르지 않아"} 계정 풀이 꺼져 있습니다.
                지금은 서버 FAL_KEY 하나로 만듭니다. 운영 설정을 마친 뒤 등록할 수 있습니다.
              </p>
            ) : null}
            <AccountList accounts={view.accounts} keyEditable={view.masterKey === "ok"} />
            <AddForm disabled={view.masterKey !== "ok"} />
            <History events={view.events} />
          </>
        )}
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>키는 저장하는 순간 잠가 두고, 화면에는 끝 4자리만 보입니다. 브라우저로는 키가 오지 않습니다.</li>
          <li>「다시 확인」과 등록 때의 확인은 그림을 만들지 않는 무료 요청입니다. 그래서 잔액 소진은 실제 생성에서만 드러납니다.</li>
          <li>사용을 꺼도 이미 진행 중인 생성은 그 계정으로 끝까지 돕니다. 키 바꾸기·지우기는 진행 중이 0 일 때만 됩니다.</li>
          <li>동시 한도는 fal 계정의 실제 한도보다 크게 넣지 마세요. 다른 서비스와 같은 계정을 쓰면 그 몫을 빼고 넣습니다.</li>
        </ul>
      </CardContent>
    </Card>
  );
}

function AccountList({ accounts, keyEditable }: { accounts: FalAccountView[]; keyEditable: boolean }) {
  if (!accounts.length) {
    return <p className="text-sm text-muted-foreground">등록된 계정이 없습니다. 지금은 서버 FAL_KEY 하나로 만듭니다.</p>;
  }
  return (
    <ul className="space-y-4">
      {accounts.map((account) => (
        <li key={account.id} className="space-y-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-sm">{account.name}</strong>
            <span className="font-mono text-xs text-muted-foreground">····{account.keyLast4}</span>
            <Badge variant={account.enabled ? "default" : "secondary"}>{account.enabled ? "사용" : "꺼짐"}</Badge>
            <Badge variant={account.state === "ok" ? "outline" : "destructive"}>{STATE_LABEL[account.state]}</Badge>
            <span className="text-xs text-muted-foreground">진행 중 {account.inFlight} / 한도 {account.limit}</span>
          </div>
          {account.lastErrorKind && account.lastErrorAt ? (
            <p className="text-xs text-muted-foreground">
              마지막 오류: {STATE_LABEL[account.lastErrorKind]} · {when(account.lastErrorAt)}
              {account.lastErrorDetail ? ` · ${account.lastErrorDetail.slice(0, 120)}` : ""}
            </p>
          ) : null}
          <div className="flex flex-wrap items-end gap-3">
            <form action={updateFalAccountAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={account.id} />
              <input type="hidden" name="enabled" value={account.enabled ? "1" : "0"} />
              <div className="space-y-1">
                <Label htmlFor={`name-${account.id}`}>이름</Label>
                <Input id={`name-${account.id}`} name="name" defaultValue={account.name} maxLength={80} className="h-8 w-48" />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`limit-${account.id}`}>동시 한도</Label>
                <Input id={`limit-${account.id}`} name="limit" type="number" min={1} max={200} defaultValue={account.limit} className="h-8 w-24" />
              </div>
              <Button type="submit" size="sm" variant="outline">저장</Button>
            </form>
            <form action={updateFalAccountAction}>
              <input type="hidden" name="id" value={account.id} />
              <input type="hidden" name="name" value={account.name} />
              <input type="hidden" name="limit" value={account.limit} />
              <input type="hidden" name="enabled" value={account.enabled ? "0" : "1"} />
              <ConfirmSubmitButton
                variant={account.enabled ? "destructive" : "default"}
                confirmMessage={account.enabled
                  ? `「${account.name}」로 새 생성을 보내지 않습니다. 진행 중인 생성은 끝까지 돕니다. 끌까요?`
                  : `「${account.name}」로 다시 새 생성을 보냅니다. 켤까요?`}
              >
                {account.enabled ? "사용 끄기" : "사용 켜기"}
              </ConfirmSubmitButton>
            </form>
            <form action={recheckFalAccountAction}>
              <input type="hidden" name="id" value={account.id} />
              <Button type="submit" size="sm" variant="outline" disabled={!keyEditable}>다시 확인</Button>
            </form>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <form action={replaceFalKeyAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={account.id} />
              <div className="space-y-1">
                <Label htmlFor={`key-${account.id}`}>새 키</Label>
                <Input id={`key-${account.id}`} name="key" type="password" autoComplete="off" className="h-8 w-72" placeholder="fal 에서 복사한 새 키" />
              </div>
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={!keyEditable || account.inFlight > 0}
                title={account.inFlight > 0 ? "진행 중인 생성이 끝난 뒤에 바꿀 수 있습니다." : undefined}
              >
                키 바꾸기
              </Button>
            </form>
            <form action={deleteFalAccountAction}>
              <input type="hidden" name="id" value={account.id} />
              <ConfirmSubmitButton
                variant="destructive"
                disabled={account.inFlight > 0}
                title={account.inFlight > 0 ? "진행 중인 생성이 끝난 뒤에 지울 수 있습니다." : undefined}
                confirmMessage={`「${account.name}」를 지웁니다. 저장된 키도 함께 지워집니다. 지울까요?`}
              >
                지우기
              </ConfirmSubmitButton>
            </form>
          </div>
        </li>
      ))}
    </ul>
  );
}

function AddForm({ disabled }: { disabled: boolean }) {
  return (
    <form action={addFalAccountAction} className="space-y-3 rounded-lg border border-dashed p-4">
      <p className="text-sm font-medium">계정 추가</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="fal-new-name">이름(구분용)</Label>
          <Input id="fal-new-name" name="name" maxLength={80} placeholder="fal-1 (ai.dev 계정)" className="h-8 w-56" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="fal-new-key">API 키</Label>
          <Input id="fal-new-key" name="key" type="password" autoComplete="off" className="h-8 w-80" placeholder="저장하면 다시 볼 수 없습니다" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="fal-new-limit">동시 한도</Label>
          <Input id="fal-new-limit" name="limit" type="number" min={1} max={200} defaultValue={20} className="h-8 w-24" />
        </div>
        <Button type="submit" size="sm" disabled={disabled}>확인하고 등록</Button>
      </div>
    </form>
  );
}

function History({ events }: { events: FalPoolAdminView["events"] }) {
  if (!events.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">변경 기록</p>
      <ul className="space-y-1 text-xs text-muted-foreground">
        {events.map((event, index) => (
          <li key={`${event.at}-${index}`}>
            {when(event.at)} · {event.actorEmail ?? "알 수 없음"} · {ACTION_LABEL[event.action] ?? event.action}
            {event.name ? ` · ${event.name}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: 시스템 탭에 단다** — `apps/web/app/admin/system/page.tsx`: `import { getAiCostReport, readAiPausedForAdmin } from "../../../lib/ai-control/report";` 아래에
```tsx
import { readFalPoolForAdmin } from "../../../lib/fal/pool/admin";
import { FalAccountsPanel } from "./fal-accounts-panel";
```
`/* 못 읽어도 던지지 않는다. 이 표는 나중에 붙어서, 마이그레이션 전 서버에는 없다. */` 줄 바로 위에
```tsx
  /*
    **fal 계정**(보충 2026-10-01). 못 읽어도 탭을 죽이지 않는다 — 마이그레이션 전 서버에는 함수가 없다.
    패널이 「읽지 못했습니다」를 보이고 단추를 숨긴다.
  */
  const falPool = await readFalPoolForAdmin().catch((cause) => {
    console.error("[fal-pool] 관리자 목록을 읽지 못했습니다", { message: cause instanceof Error ? cause.message : String(cause) });
    return null;
  });
```
그리고 `<AiUsagePanel report={aiReport} paused={aiPaused} usdKrw={usdKrw} />` 바로 아래에 `<FalAccountsPanel view={falPool} />`

- [ ] **Step 5: 통과를 본다** — Run: `cd apps/web && npx vitest run app/admin && npx tsc --noEmit && echo TSC_OK` · Expected: 실패 0(panel 8), `TSC_OK`

- [ ] **Step 6: 로컬에서 눈으로 본다** — 로컬은 Supabase 가 비어 있어(`CLAUDE.md` 「로컬 확인」) 카드는 「fal 계정 목록을 읽지 못했습니다」가 맞다. `pnpm --filter @fixup/web dev` 로 `/admin/system` 을 열어 카드가 AI 사용 비용 아래에 뜨고 탭 나머지가 멀쩡한지만 본다(로컬에 Supabase 값을 채우지 않는다 — 운영 DB 를 건드린다). 끝나면 dev 서버를 끈다

- [ ] **Step 7: 커밋**

```bash
git add apps/web/app/admin/system/fal-accounts-panel.tsx apps/web/app/admin/__tests__/fal-accounts-panel.test.tsx apps/web/app/admin/system/page.tsx
git commit -m "feat(admin): 시스템 탭에 fal 계정 카드

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 운영 문서 — 열쇠 넣기·보관·회전

**Files:**
- Modify: `deploy/ec2/app.env.example`(`ALERT_EMAIL=` 줄 둘레)
- Modify: `docs/DEPLOY.md`(「### 서버 크기 바꾸기」 바로 위에 새 절)
- Test: `apps/web/lib/__tests__/env-documented.test.ts`(기존 — 고치지 않는다)

- [ ] **Step 1: 실패를 본다** — 액션이 `process.env.FAL_KEY_ENCRYPTION_SECRET` 을 읽으므로 문서 검사가 빨갛다
Run: `cd apps/web && npx vitest run lib/__tests__/env-documented.test.ts`
Expected: FAIL — `FAL_KEY_ENCRYPTION_SECRET` 이 빠졌다

- [ ] **Step 2: `deploy/ec2/app.env.example`** — `# 서버 감시 메일을 받을 주소(…). 비우면 감시는 돌되 메일을 안 보낸다.` / `ALERT_EMAIL=` 두 줄을:

```ini
# 서버 감시 메일을 받을 주소(deploy/ec2/monitor.sh). 비우면 감시는 돌되 메일을 안 보낸다.
# fal 계정 풀도 잔액 소진·키 오류를 이 주소로 알린다(apps/web/lib/fal/pool/alert.ts).
ALERT_EMAIL=

# fal 계정 풀의 키를 잠그는 서버 열쇠(32바이트 base64). 만들기: openssl rand -base64 32
# 비우거나 틀리면 풀이 꺼지고 FAL_KEY 하나로 만든다(죽지 않는다). **잃으면 등록한 키를 모두 다시 넣어야 한다**
# — 보관처는 docs/DEPLOY.md 「fal 계정 풀 열쇠」. 관리자 화면 「fal 계정」에서 계정을 등록한다.
FAL_KEY_ENCRYPTION_SECRET=
```

- [ ] **Step 3: `docs/DEPLOY.md`** — 「### 서버 크기 바꾸기 (AWS 콘솔, 약 5분 정지)」 바로 위에 이 절을 넣는다(값은 **서버에서 만들어** 화면·채팅에 찍히지 않게 한다):

````markdown
### fal 계정 풀 열쇠 (처음 한 번, 2026-10 S3b)

관리자 화면 「fal 계정」은 붙여 넣은 fal 키를 **서버 열쇠**(`FAL_KEY_ENCRYPTION_SECRET`)로 잠가 DB 에 둔다.
열쇠는 DB 에 없고 `/etc/fixup-image-agent/app.env` 에만 있다 — DB 를 상세페이지 제품과 함께 쓰므로 DB 만
열려서는 키가 새지 않게 하려는 것이다.

- **열쇠가 없거나 틀리면** 계정 풀이 꺼지고 지금처럼 `FAL_KEY` 하나로 만든다. 서비스는 죽지 않는다.
  등록된 계정이 있는데 열쇠가 없으면 서버 기록에 `[fal-pool]` 줄을 남기고 `ALERT_EMAIL` 로 한 번 알린다
- **열쇠를 잃으면** 등록한 키를 관리자 화면에서 모두 다시 넣어야 한다(각 계정 「키 바꾸기」). fal 대시보드에서
  새 키를 만들면 되므로 돈은 들지 않는다. 그래서 사본 보관은 선택이다 — 보관한다면 비밀번호 관리자에만 둔다
  (이 저장소·채팅·메일에 적지 않는다)

넣기(값이 화면·기록에 찍히지 않게 **서버에서 만든다**):

```bash
ssh -i <운영 키> ubuntu@54.180.68.212 'sudo grep -c "^FAL_KEY_ENCRYPTION_SECRET=" /etc/fixup-image-agent/app.env || true'
```
`0` 이면 넣는다(1 이면 이미 있다 — 덮어쓰지 않는다. 바꾸면 등록한 키를 모두 다시 넣어야 한다):
```bash
ssh -i <운영 키> ubuntu@54.180.68.212 'set -e; F=/etc/fixup-image-agent/app.env; sudo cp -a $F /root/app.env.bak-$(date +%Y%m%d%H%M); S=$(openssl rand -base64 32); printf "\n# fal 계정 풀 열쇠(docs/DEPLOY.md 「fal 계정 풀 열쇠」)\nFAL_KEY_ENCRYPTION_SECRET=\"%s\"\n" "$S" | sudo tee -a $F >/dev/null; unset S; sudo stat -c "%a %U:%G" $F; sudo grep -c "^FAL_KEY_ENCRYPTION_SECRET=" $F'
```
Expected: `640 root:fixup-agent`, `1`. 그다음 재시작(배포와 같다 — 위 「배포 전에 최근 생성 요청을 본다」를 먼저):
```bash
ssh -i <운영 키> ubuntu@54.180.68.212 'sudo systemctl restart fixup-image-agent; sleep 8; systemctl is-active fixup-image-agent; curl -s -o /dev/null -w "local=%{http_code}\n" http://127.0.0.1:3000/'
```
확인: 관리자 화면 → 시스템 → 「fal 계정」 카드에 빨간 「서버 열쇠가 없어」 경고가 **없어야** 한다.

사본을 남기려면(선택, 사용자가 직접): 사용자 터미널에서
`ssh -i <운영 키> ubuntu@54.180.68.212 'sudo grep "^FAL_KEY_ENCRYPTION_SECRET=" /etc/fixup-image-agent/app.env'`
를 돌려 나온 값을 비밀번호 관리자에 「FormWith 운영 FAL_KEY_ENCRYPTION_SECRET」으로 넣는다.

**되돌리기**: 그 두 줄을 지우고(`sudo -e /etc/fixup-image-agent/app.env`) 재시작 → 풀이 꺼지고 `FAL_KEY` 로 만든다.
등록한 계정·기록은 DB 에 그대로 남는다.

**열쇠 바꾸기(회전)**: ① 관리자 화면에서 모든 계정 「사용 끄기」 → ② 모든 계정의 「진행 중」이 0 이 될 때까지
기다린다(진행 중 요청은 옛 열쇠로 푼 키로 묻는다) → ③ `app.env` 의 값을 새 값으로 바꾸고 재시작 → ④ 각 계정
「키 바꾸기」로 키를 다시 넣고 「사용 켜기」. ①~④ 동안은 `FAL_KEY` 로 만든다. 순서를 건너뛰고 ③부터 하면 진행 중
요청의 결과를 받지 못한다.
````

- [ ] **Step 4: 통과를 본다** — Run: `cd apps/web && npx vitest run lib/__tests__/env-documented.test.ts` · Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add deploy/ec2/app.env.example docs/DEPLOY.md
git commit -m "docs(deploy): fal 계정 풀 열쇠 넣기·보관·회전

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 전체 검증·뮤테이션·독립 리뷰

**Files:** 없음(고칠 것이 나오면 해당 Task 파일)

- [ ] **Step 1: 설계·계획 재확인** — 보충 문서 U1~U6·§3·§4.2·§5 와 이 계획의 File Structure 를 다시 읽고, 결정마다 코드 자리를 짚는다(예: U2 「모두 차면 잠시 뒤 다시」 → `router.ts` `FalPoolBusyError`; U3 「진행 중이면 못 지움」 → 마이그레이션 `fal_account_delete`; U5 「끝 4자리만」 → `fal_account_admin_list`·패널). `git diff origin/master --stat` 이 표와 맞는지

- [ ] **Step 2: 형 검사·시험·린트·DB 시험**

```bash
cd apps/web && npx tsc --noEmit && echo TSC_OK
cd apps/web && npx vitest run
cd apps/web && npx next lint 2>&1 | grep -E "^\./" | grep -E "fal|admin/system|ad/background|providers" ; echo LINT_CHECKED
pnpm test:credit-db
```
Expected: `TSC_OK`; vitest 실패 0(계획 검증 때 `487 passed | 3 skipped` 파일, `5829 passed` 시험); 린트는 이 가지 파일에 경고 없음(`LINT_CHECKED` 앞에 아무 줄도 없음 — 남은 경고는 손대지 않은 옛 파일 12개); DB 시험 `ℹ fail 0`
`install-host-duplicate-site.test.ts` 가 전체 실행에서만 한 번 실패하면 단독으로 다시 돌린다

- [ ] **Step 3: 키가 새는 길이 없나**

```bash
cd apps/web && grep -rnE "console\.(log|error|warn)\([^)]*\b(key|apiKey|plain)\b" lib/fal app/admin/system | grep -v __tests__ ; echo LOG_CHECKED
grep -n "key_ciphertext" ../../supabase/migrations/202610010001_fal_account_pool.sql | grep -i "admin_list\|admin_events\|credit_admin_events" ; echo SQL_CHECKED
```
Expected: `LOG_CHECKED`·`SQL_CHECKED` 앞에 아무 줄도 없다

- [ ] **Step 4: 뮤테이션 확인** — 하나씩 바꿔 해당 시험이 **실패하는지** 보고 되돌린다(계획 검증 때 모두 실패를 확인했다)

| 바꾸기 | 잡아야 할 시험 |
|---|---|
| 마이그레이션 `and o.open < a.concurrency_limit` → `<=` | PG 「claim returns nothing when every account is full」 |
| 마이그레이션 `fal_account_set_key` 의 `if fal_account_open_count(p_id) > 0 then … end if;` 삭제 | PG 「key change and delete are refused while a request is in flight」 |
| 마이그레이션 `a.state not in ('locked','invalid','decrypt_failed')` → `('locked','invalid')` | PG 「claim skips … undecryptable accounts」 |
| `key-crypto.ts` `decipher.setAAD(…)` 줄 삭제 | key-crypto 전부 |
| `key-crypto.ts` 잠글 때 `cipher.setAAD(Buffer.from(accountId…` → `Buffer.from("same"…` | key-crypto 「다른 계정 행으로 옮겨 붙이면 안 풀린다」 |
| `store.ts` `p_exclude: exclude` → `p_excluded: exclude` | store 「claim 은 … 인자 이름 그대로」 |
| `router.ts` 실패 분기의 `tried.push(account.id);` 삭제 | router 「한 계정이 429 면 … 다음 계정으로」 |
| `router.ts` `if (changed && failure !== "rate_limited")` → `if (failure !== "rate_limited")` | router 「다른 프로세스가 먼저 표시했으면 메일을 또 보내지 않는다」 |
| `router.ts` `if (error.status === 401) return "invalid";` → `return null;` | router 「401 은 키 오류로」·accountFailureOf |
| `router.ts` `if (!failure) throw error;` → `{ tried.push(account.id); continue; }` | router 「내용 거절·fal 장애는 옮기지 않고」 |
| `router.ts` `if (!poolOn(snap)) return env.submit` → `if (false) …` | router 「계정이 하나도 없으면 서버 FAL_KEY 로」 |
| `router.ts` `if (!snap.anyRow) return env.routeOf(requestId);` 삭제 | router 「계정 행이 아예 없으면 DB 를 보지 않는다」 |
| `router.ts` `remember(requestId, route);`(제출 성공 뒤) 삭제 | router 「번호를 DB 에 못 붙여도 … 메모리로」 |
| `default.ts` `if (!master.ok) {` → `if (false) {` | default 「열쇠가 없으면 FAL_KEY 로」 |
| `queue.ts` `if (status === "completed") router.finished(requestId);` 삭제 | queue 「끝났을 때만 진행 중에서 뺀다」 |
| `upload.ts` `const { key } = await router.uploadRoute();` → `const key = "fixed";` | upload 「키는 router 가 고른다」 |
| `http.ts` `checkFalKey` 의 `\|\| response.status === 404` 뒤에 `\|\| response.status === 401` 추가 | http 「401·403 이면 키가 틀렸다」 |
| `fal-account-actions.ts` `sealFalKey(master, id, key)` → `sealFalKey(master, "x", key)` | actions 「확인하고, 계정 id 로 잠가 보낸다」 |
| `fal-account-actions.ts` `addFalAccountAction` 의 `await requireAdmin()` → `{ user: { id: "admin-1" } }` | actions 「관리자가 아니면 아무것도 하지 않는다」 |
| `fal-account-actions.ts` `p_ok: check.ok,` → `p_okay: check.ok,` | actions 「DB 함수와 이름이 맞는다」 |
| `fal-accounts-panel.tsx` `disabled={!keyEditable \|\| account.inFlight > 0}` → `disabled={!keyEditable}` | panel 「진행 중이 있으면 … 잠긴다」 |

- [ ] **Step 5: 독립 리뷰** — `security-reviewer` 와 `code-reviewer` 에이전트(각각 새 맥락, 함께 띄운다)에 이 계획·보충 문서·`git diff origin/master...HEAD` 를 준다. 보안: 키 원문이 새는 길(기록·주소·DB·브라우저), AAD·IV·태그 처리, 관리자 판정 두 겹, RLS·권한, 공유 DB 영향. 코드: 배정·옮기기 표(보충 §4.2)와 코드의 일치, 진행 중 세기(30분 창)와 끝남 누락, 재시작 뒤 묻기, 이중 과금 가능성(옮기면 안 되는 실패), DB 장애 때 동작. CRITICAL·HIGH 는 고치고 Step 2·4 를 다시 돈다. 지적과 반영을 PR 본문에 표로

---

### Task 10: 시험 서버 — 가짜 fal 로 「한 계정 429 → 다른 계정」

**Files:**
- Create(이 저장소 밖, 시험 도구): `$(dirname "$K")/seal-fal-accounts.mjs`
- Create: `docs/capacity/raw/2026-10-01-s3b/*.txt`, Modify: `docs/capacity/2026-09-29-baseline.md`(끝에 「S3b 뒤」 절)

**조건:** S3a Task 6 과 같다(A `43.202.63.50`·B `43.200.70.164`·키 `K`). 가짜 fal 의 키별 흉내(S3a Task 6 Step 2)가 B 에 깔려 있어야 한다 — `ssh -i "$K" ubuntu@$B 'grep -c "mock-429" ~/tools/mock-ai/fal.mjs'` 가 1 이상. 아니면 S3a Task 6 Step 2 를 먼저 한다.

- [ ] **Step 1: 조건 확인** — S3a Task 6 Step 1 의 명령을 그대로(Expected 같음)

- [ ] **Step 2: 이 가지를 B 에서 빌드해 A 에 배포한다** — S2 계획 Task 7 Step 2 의 bundle·빌드 명령에서 `s2` → `s3b`, 가지 이름만 바꾸고 「후」 하나만 만든다(`for tag in after`). 그리고 마이그레이션을 **먼저** B 의 시험 DB 에:
```bash
scp -i "$K" supabase/migrations/202610010001_fal_account_pool.sql ubuntu@$B:/tmp/
ssh -i "$K" ubuntu@$B 'docker exec -i supabase_db_sb psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /tmp/202610010001_fal_account_pool.sql 2>&1 | tail -2'
ssh -i "$K" ubuntu@$A 'sed -i "s/\r$//" /tmp/ec2-new/*; sudo bash /tmp/ec2-new/deploy-release.sh /tmp/app-s3b-after.tar.gz "$(date -u +%Y%m%dT%H%M%SZ)-s3b" | tail -2'
```
Expected: `NOTICE:  fal 계정 풀 표 둘과 함수 13개를 만들었습니다.`, `Release active`

- [ ] **Step 3: A 에 서버 열쇠와 알림 주소를 넣는다**(운영 절차와 같은 모양 — `DEPLOY.md` 새 절)
```bash
ssh -i "$K" ubuntu@$A 'set -e; F=/etc/fixup-image-agent/app.env; sudo cp -a $F /root/app.env.s3b-bak; S=$(openssl rand -base64 32); printf "\nFAL_KEY_ENCRYPTION_SECRET=\"%s\"\nALERT_EMAIL=\"ops@loadtest.local\"\n" "$S" | sudo tee -a $F >/dev/null; unset S; sudo systemctl restart fixup-image-agent; sleep 8; systemctl is-active fixup-image-agent; sudo grep -c "^FAL_KEY_ENCRYPTION_SECRET=" $F'
```
Expected: `active`, `1`. (이미 `ALERT_EMAIL` 줄이 있으면 뒤의 줄이 이긴다 — systemd 는 마지막 값을 쓴다)

- [ ] **Step 4: 계정 둘을 넣는다 — 「fal-429」(늘 429)와 「fal-b」(정상)** — 앱과 같은 방식으로 잠그는 작은 스크립트(시험 서버 전용, 이 저장소에 넣지 않는다). 이 컴퓨터에 `$(dirname "$K")/seal-fal-accounts.mjs` 로 만든다:

```js
// 시험 서버 전용: fal 계정 행을 앱과 같은 방식(AES-256-GCM, 추가 인증 데이터 = 계정 id)으로 잠가 SQL 로 찍는다.
// 쓰기: FAL_KEY_ENCRYPTION_SECRET=… ADMIN_ID=<관리자 uuid> node seal-fal-accounts.mjs "fal-429:mock-429-a:20" "fal-b:mock-b-key:20"
import { createCipheriv, randomBytes, randomUUID } from "node:crypto";

const secret = (process.env.FAL_KEY_ENCRYPTION_SECRET ?? "").trim().replace(/^(["'])(.*)\1$/, "$2");
const master = Buffer.from(secret, "base64");
if (master.length !== 32) throw new Error("FAL_KEY_ENCRYPTION_SECRET 이 32바이트 base64 가 아닙니다");
const admin = process.env.ADMIN_ID;
if (!/^[0-9a-f-]{36}$/.test(admin ?? "")) throw new Error("ADMIN_ID 가 없습니다");
const q = (value) => `'${String(value).replace(/'/g, "''")}'`;

for (const spec of process.argv.slice(2)) {
  const [name, key, limit] = spec.split(":");
  const id = process.env[`ID_${name.replace(/\W/g, "_")}`] || randomUUID();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", master, iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(id, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(key, "utf8"), cipher.final()]);
  console.log(`select fal_account_add(${q(admin)}, ${q(id)}, ${q(name)}, ${q(ciphertext.toString("base64"))}, ${q(iv.toString("base64"))}, ${q(cipher.getAuthTag().toString("base64"))}, ${q(key.slice(-4))}, ${Number(limit) || 20});`);
}
```
(계획 검증 때 이 스크립트의 출력을 앱의 `openFalKey` 로 풀어 원문이 나오는 것을 확인했다.) A 에서 열쇠를 읽어 SQL 을 만들고 B 의 시험 DB 에 넣는다 — 관리자는 `setup-users.mjs` 가 만든 `s3-admin@loadtest.local`:
```bash
scp -i "$K" "$(dirname "$K")/seal-fal-accounts.mjs" ubuntu@$A:/tmp/
ADMIN=$(ssh -i "$K" ubuntu@$B "docker exec -i supabase_db_sb psql -U postgres -At -c \"select id from profiles where email='s3-admin@loadtest.local'\"")
ssh -i "$K" ubuntu@$A "FAL_KEY_ENCRYPTION_SECRET=\$(sudo sed -n 's/^FAL_KEY_ENCRYPTION_SECRET=//p' /etc/fixup-image-agent/app.env | tail -1) ADMIN_ID=$ADMIN node /tmp/seal-fal-accounts.mjs fal-429:mock-429-a:20 fal-b:mock-b-key:20" > "$(dirname "$K")/s3b-accounts.sql"
scp -i "$K" "$(dirname "$K")/s3b-accounts.sql" ubuntu@$B:/tmp/ && ssh -i "$K" ubuntu@$B 'docker exec -i supabase_db_sb psql -U postgres -At -v ON_ERROR_STOP=1 < /tmp/s3b-accounts.sql; docker exec -i supabase_db_sb psql -U postgres -At -c "select name, key_last4, enabled, concurrency_limit, state from fal_account_admin_list()"'
rm "$(dirname "$K")/s3b-accounts.sql"
```
Expected: `ADMIN` 이 uuid(비면 `USER_PREFIX=s3 … setup-users.mjs` 를 S3a Task 6 Step 4 처럼 먼저), 목록 두 줄 `fal-429|29-a|t|20|ok`, `fal-b|-key|t|20|ok`. 그다음 A 의 계정 목록 보관(30초)이 지나도록 `sleep 35`

- [ ] **Step 5: 한 계정 429 → 다른 계정(핵심 시험)** — 「fal-429」가 「fal-b」보다 먼저 만들어져 여유가 같으면 먼저 골린다. 포스터 5명 + 상세페이지 1명:

```bash
ssh -i "$K" ubuntu@$B 'cd ~/tools/k6 && . ./envk6.sh && curl -s -XPOST http://127.0.0.1:8081/__reset >/dev/null &&
(LEVELS=5 HOLD=90s k6 run generate-poster.js > /tmp/k6-s3b-poster.txt 2>&1 &) ; LEVELS=1 HOLD=90s k6 run generate-pdp.js > /tmp/k6-s3b-pdp.txt 2>&1; sleep 60;
tail -12 /tmp/k6-s3b-poster.txt; tail -12 /tmp/k6-s3b-pdp.txt;
curl -s http://127.0.0.1:8081/__stats | python3 -c "import json,sys; r=json.load(sys.stdin)[\"routes\"]; [print(k, v[\"count\"], v[\"status\"]) for k,v in sorted(r.items()) if \"queue\" in k]"
docker exec -i supabase_db_sb psql -U postgres -At -c "select a.name, count(*), count(*) filter (where r.finished_at is null) from fal_requests r join fal_accounts a on a.id=r.account_id group by a.name; select name, state, last_error_kind, cooldown_until is not null from fal_accounts order by name;"'
```

**S3b 합격 기준(이 Step):**

| 항목 | 기준 |
|---|---|
| k6 포스터·상세페이지 실패율 | **0%**(사용자는 실패를 못 본다) |
| `queue submit key=mock-429-a` | 1 이상, 상태 **전부 429** |
| `queue submit key=mock-b-key` | = 만든 장 수, 상태 전부 200 |
| `queue status`·`queue result` 의 키 | 전부 `mock-b-key`. **`WRONG-KEY` 줄 0**(보낸 계정으로 묻는다) |
| `fal_requests` | 모두 `fal-b`, 끝나지 않은 줄 0(포스터 화면이 끝까지 물었으므로) |
| `fal_accounts` | `fal-429` = `rate_limited`/`rate_limited`/`t`(60초 쉼), `fal-b` = `ok` |
| Inbucket(`http://172.31.26.41:54324` 또는 `curl -s http://127.0.0.1:54324/api/v1/messages | head -c 300`) | **fal 메일 없음**(429 는 알리지 않는다) |

- [ ] **Step 6: 재시작 사이에도 같은 계정으로 묻는다** — 포스터 1명을 돌리다 중간에 A 를 재시작한다:
```bash
ssh -i "$K" ubuntu@$B 'cd ~/tools/k6 && . ./envk6.sh && curl -s -XPOST http://127.0.0.1:8081/__reset >/dev/null && (LEVELS=1 HOLD=60s k6 run generate-poster.js > /tmp/k6-s3b-restart.txt 2>&1 &); sleep 20'
ssh -i "$K" ubuntu@$A 'sudo systemctl restart fixup-image-agent; sleep 8; systemctl is-active fixup-image-agent'
ssh -i "$K" ubuntu@$B 'sleep 90; tail -8 /tmp/k6-s3b-restart.txt; curl -s http://127.0.0.1:8081/__stats | grep -o "WRONG-KEY[^\"]*" | head -3; echo WRONG_CHECKED'
```
Expected: 포스터 완료(실패 0 또는 재시작 순간 502 한 번 — Caddy `lb_try_duration` 이 있으면 0), `WRONG_CHECKED` 앞에 줄 없음

- [ ] **Step 7: 잔액 소진(403) → 다른 계정으로 계속 + 메일 한 통(설계 §3.9 「fal 계정 하나 막힘」)** — 정상 계정 「fal-c」를 더하고, 「fal-b」의 키를 `mock-locked-b`(늘 403 잠김)로 바꾼다(진행 중 0 이어야 한다):
```bash
SECRET='FAL_KEY_ENCRYPTION_SECRET=$(sudo sed -n "s/^FAL_KEY_ENCRYPTION_SECRET=//p" /etc/fixup-image-agent/app.env | tail -1)'
ID_B=$(ssh -i "$K" ubuntu@$B "docker exec -i supabase_db_sb psql -U postgres -At -c \"select id from fal_accounts where name='fal-b'\"")
ssh -i "$K" ubuntu@$A "$SECRET ADMIN_ID=$ADMIN node /tmp/seal-fal-accounts.mjs fal-c:mock-c-key:20" > "$(dirname "$K")/s3b-step7.sql"
ssh -i "$K" ubuntu@$A "$SECRET ADMIN_ID=$ADMIN ID_fal_b=$ID_B node /tmp/seal-fal-accounts.mjs fal-b:mock-locked-b:20" | sed -E "s/^select fal_account_add\('([^']*)', '([^']*)', '[^']*', ('[^']*'), ('[^']*'), ('[^']*'), ('[^']*'), [0-9]+\);/select fal_account_set_key('\1', '\2', \3, \4, \5, \6);/" >> "$(dirname "$K")/s3b-step7.sql"
grep -c "fal_account_set_key" "$(dirname "$K")/s3b-step7.sql"
scp -i "$K" "$(dirname "$K")/s3b-step7.sql" ubuntu@$B:/tmp/ && rm "$(dirname "$K")/s3b-step7.sql"
ssh -i "$K" ubuntu@$B 'docker exec -i supabase_db_sb psql -U postgres -At -v ON_ERROR_STOP=1 < /tmp/s3b-step7.sql && sleep 35 && cd ~/tools/k6 && . ./envk6.sh && curl -s -XPOST http://127.0.0.1:8081/__reset >/dev/null &&
LEVELS=2 HOLD=60s k6 run generate-poster.js > /tmp/k6-s3b-locked.txt 2>&1; sleep 45; tail -8 /tmp/k6-s3b-locked.txt;
curl -s http://127.0.0.1:8081/__stats | python3 -c "import json,sys; r=json.load(sys.stdin)[\"routes\"]; [print(k, v[\"count\"], v[\"status\"]) for k,v in sorted(r.items()) if \"submit\" in k]";
docker exec -i supabase_db_sb psql -U postgres -At -c "select name, state from fal_accounts order by name";
curl -s "http://127.0.0.1:54324/api/v1/messages" | python3 -c "import json,sys; m=json.load(sys.stdin).get(\"messages\",[]); s=[x.get(\"Subject\",\"\") for x in m if \"fal\" in x.get(\"Subject\",\"\")]; print(len(s), s[:3])"'
```
`grep -c` 가 `1` 이 아니면(sed 가 바꾸지 못함) 멈춘다. `fal_account_in_flight` 로 거절되면(Step 6 의 포스터가 아직 안 끝남) 1~2분 기다렸다 다시 하거나, 시험 DB 에서 `update fal_requests set finished_at = now() where finished_at is null;` 뒤 다시(시험 서버에서만).
Expected: k6 실패 **0%**, 제출 통계 `queue submit key=mock-locked-b` 1 이상·전부 403, `queue submit key=mock-c-key` = 만든 장 수·전부 200, 상태 `fal-429|rate_limited`·`fal-b|locked`·`fal-c|ok`, 메일 **정확히 1통** `[FormWith] fal 계정 잔액이 바닥나 잠겼습니다 (fal-b)`(Inbucket API 모양이 다르면 웹 `http://172.31.26.41:54324` 에서 본다). 같은 시험을 한 번 더 돌려도 메일은 늘지 않는다(상태가 이미 `locked`)

- [ ] **Step 7b: 켜진 계정이 모두 막히면 「잠시 뒤 다시」 — `FAL_KEY` 로 새지 않는다** — 「fal-c」를 끈다(관리자 함수로 — 기록이 남는다):
```bash
ID_C=$(ssh -i "$K" ubuntu@$B "docker exec -i supabase_db_sb psql -U postgres -At -c \"select id from fal_accounts where name='fal-c'\"")
ssh -i "$K" ubuntu@$B "docker exec -i supabase_db_sb psql -U postgres -At -v ON_ERROR_STOP=1 -c \"select fal_account_update('$ADMIN','$ID_C','fal-c',20,false)\" && sleep 35 && cd ~/tools/k6 && . ./envk6.sh && curl -s -XPOST http://127.0.0.1:8081/__reset >/dev/null && LEVELS=1 HOLD=30s k6 run generate-poster.js 2>&1 | grep -cE '몰려 있습니다|status=429|\"status\":429'; curl -s http://127.0.0.1:8081/__stats | grep -oE 'queue submit key=[^\"]*' | sort -u; echo SUBMIT_KEYS_DONE"
```
Expected: 첫 숫자 1 이상(「지금 이미지 생성이 몰려 있습니다. 잠시 뒤 다시 시도해 주세요.」 — 포스터 화면은 429 를 `classifyFalFailure` 의 「몰려 있습니다」로 보인다), 제출 키 목록에 **`mock-fal-key` 가 없다**(`fal-429` 의 쉬는 시간이 끝났으면 `mock-429-a` 만 보일 수 있다). 끝나면 「fal-c」를 다시 켠다: 같은 명령의 `false` → `true`(시험 DB 만)

- [ ] **Step 8: 열쇠가 없으면 FAL_KEY 로(배포 첫날 모양)** — 열쇠 줄을 빼고 재시작 → 포스터 1명:
```bash
ssh -i "$K" ubuntu@$A 'F=/etc/fixup-image-agent/app.env; sudo sed -i "/^FAL_KEY_ENCRYPTION_SECRET=/d" $F; sudo systemctl restart fixup-image-agent; sleep 8; systemctl is-active fixup-image-agent'
ssh -i "$K" ubuntu@$B 'cd ~/tools/k6 && . ./envk6.sh && curl -s -XPOST http://127.0.0.1:8081/__reset >/dev/null && LEVELS=1 HOLD=40s k6 run generate-poster.js > /tmp/k6-s3b-nokey.txt 2>&1; tail -6 /tmp/k6-s3b-nokey.txt; curl -s http://127.0.0.1:8081/__stats | grep -oE "queue submit key=[^\"]*" | sort -u'
ssh -i "$K" ubuntu@$A 'sudo journalctl -u fixup-image-agent --since "5 min ago" --no-pager | grep -c "fal-pool"'
```
Expected: 실패 0, 제출 키는 `queue submit key=mock-fal-key` 하나뿐, A 기록에 `fal-pool` 1 이상(등록된 계정이 있는데 열쇠가 없다는 경고), Inbucket 에 「fal 계정 풀이 꺼져 있습니다」 1통

- [ ] **Step 9: 관리자 화면 눈으로(사용자와)** — A 를 열쇠 있는 상태로 되돌리고(`sudo cp -a /root/app.env.s3b-bak /etc/fixup-image-agent/app.env` 후 Step 3 을 다시 — **새 열쇠라 세 계정 모두 「키를 풀 수 없음」이 되고 계정마다 메일이 한 통씩 온다**: 이것이 회전 시험이다), 브라우저로 `http://43.202.63.50/admin/system` 에 시험 관리자 `s3-admin@loadtest.local`(비밀번호는 `setup-users.mjs` 의 `USER_PASSWORD` 기본값 — 이 문서에 적지 않는다)로 들어가 본다(사용자에게 화면을 함께 보자고 한다): ① 「fal 계정」 카드에 세 계정(fal-429·fal-b·fal-c), 상태 「키를 풀 수 없음」, `····끝4자리` ② 「키 바꾸기」에 `mock-b-key` → 「fal 계정 키를 바꿨습니다」, 상태 정상 ③ 「계정 추가」에 이름 `bad`, 키 `nope-not-a-mock-key-123`(16자 이상) → 「fal 이 이 키를 거절했습니다(401)」 ④ 「사용 끄기」 확인 창 → 꺼짐 ⑤ 변경 기록에 누가·무엇이. 하나라도 다르면 Task 6·7 로 돌아간다

- [ ] **Step 10: 기록·정리·커밋** — 원본(`k6-s3b-*.txt`, 통계, SQL 결과)을 `docs/capacity/raw/2026-10-01-s3b/` 로, 비밀값 검사(S2 Task 7 Step 6 의 `grep` + `FAL_KEY_ENCRYPTION_SECRET|mock-.*key` 는 시험 값이라 괜찮다 — 운영 키 모양 `[0-9a-f-]{36}:[0-9a-f]{32}` 가 없어야 한다)가 `CLEAN` 인지 본 뒤, 기준선 문서 끝에 「## S3b 뒤 (fal 계정 풀, 2026-10-01)」 절(조건·Step 5~8 표·맞음/아님). 시험 서버: A 의 app.env 는 `/root/app.env.s3b-bak` 으로 되돌리지 **않는다**(열쇠가 있는 모양이 다음 단계에 맞다), B 의 시험 DB 계정 두 줄은 남긴다(시험 데이터). 이 컴퓨터의 `seal-fal-accounts.mjs` 는 남겨도 된다(키 원문 없음)
```bash
git add docs/capacity/2026-09-29-baseline.md docs/capacity/raw/2026-10-01-s3b
git commit -m "docs(capacity): S3b — 한 계정 429 에도 실패 0, 보낸 계정으로 묻기, 열쇠 없을 때 FAL_KEY

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 운영 반영 — **사용자가 해야 하는 단계가 있다**

**Files:** 없음

- [ ] **Step 1: (사용자) fal 약관 확인 — 여러 계정을 켜기 전에만** — 본 설계 §3.3·§7. 확인 전이면 **계정 하나(지금의 `FAL_KEY`)만 등록**한다. 그것만으로도 관리자 화면·상태·메일을 얻는다. 사용자에게 쉬운 말로: 「fal 계정을 여러 개 만들어 나눠 쓰는 것이 fal 규칙에 맞는지 fal 에 물어 답을 받기 전에는, 지금 쓰는 계정 하나만 등록하겠습니다.」

- [ ] **Step 2: 다른 터미널의 작업이 섞였나 본다** — S2 계획 Task 8 Step 2. 이 단계에는 **마이그레이션이 있다** — `git diff --name-only <운영 sha>..origin/master -- supabase/migrations/` 에 이 파일 말고 다른 것이 있으면 멈추고 묻는다

- [ ] **Step 3: (사용자) DB 에 표를 만든다 — 앱 배포보다 먼저** — 바탕화면에 파일 둘을 둔다:
```bash
cp supabase/migrations/202610010001_fal_account_pool.sql "C:/Users/PC/Desktop/S3b-1-fal계정풀-마이그레이션.sql"
cat > "C:/Users/PC/Desktop/S3b-2-fal계정풀-확인.sql" <<'SQL'
-- 읽기만 한다. 결과 네 줄을 캡처해 주세요.
select to_regclass('public.fal_accounts') as accounts, to_regclass('public.fal_requests') as requests;
select has_table_privilege('anon', 'public.fal_accounts', 'select') as anon_can_read;            -- false 여야 합니다
select has_function_privilege('authenticated', 'public.fal_account_claim(text,uuid[])', 'execute') as member_can_claim; -- false
select count(*) as functions from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'fal\_%' escape '\';                                -- 13
SQL
```
사용자에게: 「Supabase 운영 프로젝트(`bbuweuvylystagohqlhf`) → SQL Editor 에 바탕화면의 `S3b-1-…마이그레이션.sql` 내용을 붙여 넣고 Run 해 주세요. 맨 아래에 『fal 계정 풀 표 둘과 함수 13개를 만들었습니다』가 보이면 됩니다. 이어서 `S3b-2-…확인.sql` 을 Run 하고 결과를 캡처해 주세요.」 Expected: `fal_accounts`·`fal_requests`, `false`, `false`, `13`. 새 표·새 함수만 더하므로 상세페이지 제품에는 영향이 없다.
**되돌리기 SQL**(필요할 때만, 계정을 등록하기 전이면 잃을 것이 없다): `drop function if exists public.fal_account_admin_events(integer), public.fal_account_admin_list(), public.fal_account_delete(uuid,uuid), public.fal_account_recheck(uuid,uuid,boolean,text), public.fal_account_set_key(uuid,uuid,text,text,text,text), public.fal_account_update(uuid,uuid,text,integer,boolean), public.fal_account_add(uuid,uuid,text,text,text,text,text,integer), public.fal_account_mark(uuid,text,text), public.fal_request_finish(text), public.fal_request_release(bigint), public.fal_request_bind(bigint,text), public.fal_account_claim(text,uuid[]), public.fal_account_open_count(uuid); drop table if exists public.fal_requests; drop table if exists public.fal_accounts;` — `credit_admin_events` 의 `fal_account_*` 줄은 기록이라 남긴다

- [ ] **Step 4: 앱 배포** — PR(Task 9 리뷰 표·Task 10 표) → 사용자가 「배포해 주세요」라고 하면 `docs/DEPLOY.md` 「매 배포」를 **열어서** 그대로. 배포 뒤 확인에 이번 변경 문구: `sudo grep -rl "fal_account_claim" /opt/fixup-image-agent/current/apps/web/.next/server | head -2` 가 파일 하나 이상. 이때는 열쇠가 아직 없으므로 **생성은 오늘과 똑같이 `FAL_KEY`** 이고 관리자 카드는 빨간 「서버 열쇠가 없어」 경고를 보인다 — 정상이다

- [ ] **Step 5: 서버 열쇠를 넣는다** — `docs/DEPLOY.md` 「fal 계정 풀 열쇠 (처음 한 번)」 절을 **열어서** 그대로(서버에서 만들어 화면에 찍지 않는다, 재시작 전에 「배포 전에 최근 생성 요청을 본다」). 확인: 관리자 카드의 빨간 경고가 사라지고 「등록된 계정이 없습니다. 지금은 서버 FAL_KEY 하나로 만듭니다.」. 사용자에게 열쇠 사본을 비밀번호 관리자에 둘지 묻는다(보충 §8-2, 선택)

- [ ] **Step 6: (사용자) 첫 계정 등록 = 운영 키 확인** — 사용자에게: 「관리자 화면 → 시스템 → 『fal 계정』 → 계정 추가에, 이름 『fal-1 (ai.dev 계정)』, API 키에는 지금 서버에 쓰는 fal 키(fal 대시보드 → API Keys 에서 복사하거나 새로 만든 것), 동시 한도는 12(영상 서비스와 같은 계정이라 20 에서 몫을 뺀 값 — 보충 §8-3)를 넣고 『확인하고 등록』을 눌러 주세요.」
  - 「fal 계정을 확인하고 등록했습니다」가 뜨면 = **맞는 운영 키가 무료 확인에 404 를 받는다**(보충 §2 의 남은 확인이 끝남). 목록에 `····끝4자리`
  - 「fal 이 이 키를 거절했습니다(401)」면 복사가 틀렸다 — 다시 붙여 넣는다
  - 「지금 fal 에 키를 확인할 수 없습니다」가 계속되면(맞는 키가 404 가 아닌 다른 값을 받는다는 뜻) **멈추고** 서버 기록을 본다: `sudo journalctl -u fixup-image-agent --since "10 min ago" | grep fal-pool`. 보충 §7 첫 줄의 대비대로 확인 규칙을 고칠지 사용자와 정한다

- [ ] **Step 7: 등록 뒤 실제 생성 한 번** — 사용자에게 포스터 하나와 상세페이지 섹션 하나를 만들어 달라고 한 뒤:
```bash
ssh -i "C:/Users/PC/Desktop/coding/aws/instargram.pem" ubuntu@54.180.68.212 'sudo journalctl -u fixup-image-agent --since "10 min ago" --no-pager | grep -E "fal-pool" | tail -5; echo LOG_DONE'
```
그리고 사용자 SQL 편집기에서(읽기만): `select a.name, count(*), count(*) filter (where r.finished_at is null) as open from fal_requests r join fal_accounts a on a.id = r.account_id group by a.name;`
Expected: `LOG_DONE` 앞에 줄 없음, `fal-1 (ai.dev 계정)` 에 2줄 이상·open 0(포스터 화면을 끝까지 봤다면). 관리자 카드의 「진행 중」이 0 으로 돌아온다. 그림이 안 나오면: 카드에서 「사용 끄기」 → 즉시 `FAL_KEY` 로 돌아간다(되돌리기 1단계). 그래도 이상하면 `DEPLOY.md` 「되돌리기」로 앱을 이전 릴리스로(표는 남겨도 옛 앱은 보지 않는다)

- [ ] **Step 8: (사용자, 약관 확인 뒤에만) 두 번째 계정** — 새 fal 계정의 키로 Step 6 과 같이 등록. 한도는 그 계정의 실제 동시 한도(새 계정이면 fal 대시보드의 값). 이후 관리자 카드에서 두 계정의 「진행 중」이 함께 오르는지 사용자와 본다

- [ ] **Step 9: 보고·메모리** — 결과(등록 상태·첫 확인·생성 확인)를 사용자에게 표로 보고하고, 메모리 갱신(「fal 계정 풀 운영 중 — 열쇠는 app.env, 계정 n개」)을 묻는다(쓰기는 묻고 한다)
