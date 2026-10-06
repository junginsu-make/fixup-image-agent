# 방문 분석(사이트 이용 통계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 화면에 「방문 분석」 탭을 새로 만들어, 하루 방문자 수·들어온 경로·많이 보는 화면·기기·회원 구성·많이 쓰는 기능·다시 온 사람·가입자의 첫 유입 경로를 쌓아 두고 기간별로 본다.

**Architecture — 섞어 쓰기(2026-10-06 사용자 결정):**
- **모든 방문자:** 쿠키 없이 센다. 화면이 바뀔 때마다 `/api/track` 으로 한 줄. IP·브라우저 정보는 **그날의 무작위 값과 섞은 되돌릴 수 없는 값**(`visitor`, 하루 단위)으로만 저장한다 → 하루 방문자 수는 빠짐없이 나온다.
- **동의한 방문자만:** 첫 방문 때 뜨는 동의 띠에서 「동의」를 누르면 서버가 무작위 번호 쿠키(`fx_vid`, 365일, HttpOnly)를 심는다. 이 번호(DB 에는 sha256 으로만)로 **여러 날을 이어서** 본다 → 다시 온 사람, 며칠 전 광고를 보고 가입한 경로. 동의 직전 같은 날의 기록(첫 화면·유입 경로)도 이 번호에 이어 붙인다.
- **거부·철회:** `fx_vid` 를 심지 않거나 지우고, 그 번호로 남은 기록에서도 번호를 지운다.
- **회원:** 로그인 회원 번호(`user_id`)로 이미 정확하다. 「어떤 기능을 쓰나」는 이미 쌓이고 있는 `ai_cost_events` 를 쓴다.
- 관리자 탭은 한국 시각으로 자르는 보고 함수 둘(`admin_site_traffic`·`admin_site_people`)을 읽는다.

**Tech Stack:** Next.js App Router(apps/web), Supabase PostgreSQL(service_role RPC), zod, vitest, react-test-renderer(브라우저 전역값은 vi.stubGlobal 로 흉내), node:test + 로컬 PostgreSQL 17(`scripts/lib/test-credit-postgres.mjs`).

**Spec:** 별도 설계 문서 없음 — 사용자 요청 원문(2026-10-06): 「관리자 페이지에 별도 새로운 탭을 만들어서 접속하는 사람들 트래킹 및 데이터 수집하여 어떤 사람들이 어떻게 오고 있고 얼만큼 어디에서 쓰고 있으며 하루에 몇 명이나 방문하고 있고 어떤 기능들을 쓰는지 누적데이터를 만들어서 분석하고 개선하고 평가하는 시스템」, 이어서 「정확한 사용자 데이터 수집이 필요합니다」 → 「섞어 쓰기 방식으로 계획을 바꿔주세요」. 맨 아래 「사용자 결정 대기」의 기본값을 전제로 한다.

## 단계

| 단계 | 내용 | 끝나면 |
|---|---|---|
| 1. 수집 | DB 표·함수 + `/api/track` + 동의 띠·동의 API + 화면 쪽 보내기 + 개인정보 처리방침 | 운영 배포 → **그날부터 데이터가 쌓인다** |
| 2. 보기 | 보고 함수 둘 + 관리자 「방문 분석」 탭(동의율·재방문·가입자 첫 유입 포함) | 배포 → 관리자가 숫자를 본다 |
| 3. 평가 | 가입 깔때기·주간 재방문(코호트)·기간 비교 | **별도 계획.** 2주 이상 쌓인 실제 데이터를 보고 설계 |

단계마다 PR 하나, 독립 리뷰 + 뮤테이션 확인 뒤 병합·배포한다(메모리 「단계별 진행 + 독립 리뷰」).

## Global Constraints

- **작업 위치:** `origin/master` 에서 새 워크트리·브랜치 `feat/site-analytics`(`.worktrees/site-analytics`). 메인 폴더는 다른 터미널이 쓰고 있다(2026-10-06 에 그쪽이 브랜치를 바꾸며 커밋 안 된 파일이 사라졌다) — 메인 폴더에서 작업하지 않는다.
- **공유 DB:** detail-page-studio 가 같은 Supabase 를 본다. **새 표·새 함수만 더한다.** 기존 표·함수는 `alter`·`create or replace`·`drop` 하지 않는다.
- **배포 순서:** 마이그레이션 SQL 먼저(사용자가 Supabase SQL 편집기에서), 그다음 앱(`docs/DEPLOY.md` 「매 배포」).
- **쿠키 규칙:**
  - `fx_consent`: 값 `1`(동의)·`0`(거부), 365일, HttpOnly 아님(동의 띠가 읽는다), SameSite=Lax, https 면 Secure.
  - `fx_vid`: **`fx_consent=1` 일 때만**, 무작위 UUID v4, 365일, HttpOnly, SameSite=Lax, https 면 Secure. 서버만 심고 지운다.
  - 화면 쪽 보내기(`page-view-tracker.tsx`)는 쿠키·브라우저 저장소를 **직접 만지지 않는다**(시험이 본다). 동의 띠만 `fx_consent` 를 읽는다.
  - 외부 분석 도구(GA·PostHog 등) 패키지를 넣지 않는다 — `launch-ready.test.ts` 가 막는다.
- **동의 띠:** 「동의」와 「거부」는 **같은 모양의 단추**(한쪽만 눈에 띄게 하지 않는다). 거부해도 모든 기능을 쓸 수 있다고 적는다. 첫 화면 아래 법률 링크 옆과 「계정」 화면에서 언제든 다시 연다.
- **원래 IP·전체 브라우저 정보·쿠키 원래 값·주소 뒤 조회 값(`?…`, `#…`)은 DB 에 저장하지 않는다.** 로그에도 찍지 않는다.
- **통계 실패가 화면이나 요청을 막지 않는다.** `/api/track` 은 언제나 204. 단 **거부 처리(기록에서 번호 지우기)가 실패하면 503** 을 돌려 동의 띠가 「다시 눌러 주세요」를 보인다 — 철회를 못 지킨 채 「됐다」고 하지 않는다.
- **날짜는 한국 시각(`Asia/Seoul`).** 기존 `admin_ai_cost_report` 와 같다.
- **관리자(`role='admin'`)의 방문은 숫자에서 뺀다** — 로그인 전 같은 날 방문(같은 `visitor`), 같은 쿠키 번호의 다른 날 방문까지.
- **보유기간:** 원본 줄 365일(`ANALYTICS_KEEP_DAYS`), 쿠키 365일(`ANALYTICS_COOKIE_DAYS`). 처리방침 문구와 코드 상수를 시험으로 묶는다.
- **추가 과금 없음.** 새 유료 서비스·새 패키지 없음(jsdom 도 넣지 않는다). 그래프는 CSS 막대.
- **파일 800줄 미만, 함수 50줄 미만, 불변 패턴.** 상태 보관 자리(속도 제한 Map, 마지막 경고·정리 시각)만 예외이며 주석으로 밝힌다.
- **처음 만들기 경로 0줄 변경.** 생성 기능 코드는 건드리지 않는다.
- **커밋 메시지:** `<type>: <설명>` + 빈 줄 + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **철회가 실제로 지켜지나** — 「거부」를 누르면 `fx_vid` 가 지워지고(`Max-Age=0`), DB 에서 그 번호가 붙은 **모든 날의** 기록에서 번호가 빠져야 한다. 지우기 실패 시 쿠키를 그대로 두고 503. → Task 1 DB 시험, Task 5 동의 API 시험.
2. **주소에 든 비밀 값** — `/auth/confirm?token_hash=…`, `/reset-password#access_token=…`, `/library/<uuid>` 가 들어와도 DB 에는 `/auth/confirm`, `/reset-password`, `/library/:id` 만. → Task 2·4 시험.
3. **관리자 본인 방문이 숫자를 부풀림** — 운영자 둘이 매일 들어온다. 관리자 줄, 같은 날 같은 `visitor` 의 로그인 전 줄, **같은 쿠키 번호의 다른 날 줄**까지 빠져야 한다. → Task 8 DB 시험.
4. **한국 자정 경계** — 한국 0시~9시 방문이 「어제」로 잡히면 안 된다. `visitor` 값도 한국 날짜로 바뀌어야 한다. → Task 1·8 DB 시험.
5. **통계가 고장 나도 서비스는 그대로** — DB 함수가 없거나(마이그레이션 전) Supabase 가 느려도 `/api/track` 은 204, 화면 오류 없음. → Task 4 라우트 시험.

---

# 1단계 — 수집

### Task 0: 작업 자리 만들기

**Files:** 없음(워크트리만)

- [ ] **Step 1: 다른 터미널이 master 에 남긴 것 확인**

```bash
cd /c/Users/PC/Desktop/coding/fixup-image-agent
git fetch origin
git log --oneline -10 origin/master
```

마지막으로 확인한 `cc2db375`(PR #253) 뒤에 남의 머지·마이그레이션이 섞였으면 **멈추고 사용자에게 묻는다**(메모리 「배포 전 다른 터미널 확인」).

- [ ] **Step 2: 워크트리 만들기**

```bash
git worktree add .worktrees/site-analytics -b feat/site-analytics origin/master
cd .worktrees/site-analytics && pnpm install --frozen-lockfile
```

이후 모든 경로는 이 워크트리 기준이다. 이 계획 파일도 워크트리의 `docs/superpowers/plans/` 에 옮겨 둔다.

---

### Task 1: DB 표와 함수

**Files:**
- Create: `supabase/migrations/202610060001_site_analytics.sql`
- Create: `scripts/tests/site-analytics.test.mjs`
- Create: `apps/web/lib/analytics/__tests__/site-analytics-migration.test.ts`
- Modify: `package.json` (루트, `test:credit-db` 끝에 새 시험 파일 추가)

**Interfaces:**
- Produces:
  - 표 `public.analytics_page_views(id, created_at, visitor, cookie_key, user_id, path, referrer_host, utm_source, utm_medium, utm_campaign, device, browser, entry)`
  - 표 `public.analytics_salts(day date pk, salt text)`
  - 내부 함수(부르는 권한 없음): `analytics_visitor_hash(p_ip text, p_ua text, p_now timestamptz) returns text`, `analytics_cookie_key(p_cookie text) returns text`
  - service_role 만 부르는 함수:
    - `analytics_record(p_ip text, p_ua text, p_user uuid, p_path text, p_referrer_host text, p_utm_source text, p_utm_medium text, p_utm_campaign text, p_device text, p_browser text, p_entry boolean, p_cookie text, p_now timestamptz default now()) returns void`
    - `analytics_link_cookie(p_cookie text, p_ip text, p_ua text, p_now timestamptz default now()) returns integer` — 오늘(한국) 같은 `visitor` 의 번호 없는 줄에 번호를 붙인 수
    - `analytics_forget(p_cookie text) returns integer` — 번호를 지운 줄 수
    - `analytics_prune(p_keep_days integer, p_now timestamptz default now()) returns integer` — 지운 줄 수

- [ ] **Step 1: 실제 PostgreSQL 시험을 먼저 쓴다**

`scripts/tests/site-analytics.test.mjs`:

```js
import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { testPostgres } from '../lib/test-credit-postgres.mjs';

/*
  202610060001 — 방문 통계 표와 함수(계획 2026-10-06 site-analytics, 1단계).

  섞어 쓰기: 모두를 쿠키 없이 하루 단위(visitor)로 세고, 동의한 브라우저만 쿠키 번호(cookie_key)로
  여러 날을 잇는다. IP·브라우저 정보·쿠키 원래 값은 남지 않는다. 날짜는 **한국 시각**이다.
*/
const MIGRATIONS = ['202610060001_site_analytics.sql'];
const MEMBER = '93000000-0000-4000-8000-000000000001';
const C1 = '5b1f0c1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f';
const C2 = '6c2a1d2f-3b4c-4d6e-9fa0-1b2c3d4e5f60';
let db;

const q = (value) => (value ? `'${value}'` : 'null');
const record = (now, { ip = '203.0.113.7', ua = 'UA-A', user = null, path = '/', entry = false, cookie = null } = {}) =>
  db.sql(`select analytics_record('${ip}', '${ua}', ${q(user)}, '${path}',
    null, null, null, null, 'desktop', 'chrome', ${entry}, ${q(cookie)}, '${now}'::timestamptz);`);
const visitors = async () => Number(await db.sql('select count(distinct visitor) from analytics_page_views;'));
const cookieKeys = async () => Number(await db.sql('select count(distinct cookie_key) from analytics_page_views;'));

before(async () => {
  db = await testPostgres();
  await db.migrate(MIGRATIONS);
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values('${MEMBER}','m@example.invalid',now());
    update profiles set status='active' where id='${MEMBER}';`);
});
beforeEach(async () => { await db.sql('truncate analytics_page_views, analytics_salts;'); });
after(async () => { await db?.close(); });

test('stores one-way values, never the IP, the user agent or the raw cookie', async () => {
  await record('2026-10-06 10:00:00+09', { ip: '203.0.113.7', ua: 'Mozilla/5.0 UNIQUE-UA', cookie: C1 });
  const row = await db.sql('select row_to_json(t)::text from analytics_page_views t;');
  assert.ok(!row.includes('203.0.113.7'), 'IP 가 남았다');
  assert.ok(!row.includes('UNIQUE-UA'), '브라우저 정보가 남았다');
  assert.ok(!row.includes(C1), '쿠키 원래 값이 남았다');
  assert.match(await db.sql('select visitor from analytics_page_views;'), /^[0-9a-f]{64}$/);
  assert.match(await db.sql('select cookie_key from analytics_page_views;'), /^[0-9a-f]{64}$/);
});

test('same IP and browser on the same Korean day is one visitor, logged in or not', async () => {
  await record('2026-10-06 10:00:00+09');
  await record('2026-10-06 10:05:00+09', { user: MEMBER });
  assert.equal(await visitors(), 1);
  assert.equal(await db.sql(`select count(*) from analytics_page_views where user_id='${MEMBER}';`), '1');
});

test('the day follows the Korean clock, not UTC', async () => {
  // 한국 08:50 과 09:10 은 UTC 로는 다른 날이지만 한국으로는 같은 날이다.
  await record('2026-10-06 08:50:00+09');
  await record('2026-10-06 09:10:00+09');
  assert.equal(await visitors(), 1);
});

test('a new Korean day gives a new visitor value and drops the old salt', async () => {
  await record('2026-10-06 23:50:00+09');
  await record('2026-10-07 00:10:00+09');
  assert.equal(await visitors(), 2);
  assert.equal(await db.sql(`select string_agg(day::text, ',') from analytics_salts;`), '2026-10-07');
});

test('the cookie ties days together while the daily value does not', async () => {
  await record('2026-10-02 20:00:00+09', { cookie: C1 });
  await record('2026-10-06 10:00:00+09', { cookie: C1 });
  assert.equal(await visitors(), 2);
  assert.equal(await cookieKeys(), 1);
});

test('consent links the earlier rows of the same visitor today, and nobody else', async () => {
  await record('2026-10-05 15:00:00+09', { ip: '203.0.113.7' });          // 어제 — 이어 붙이지 않는다
  await record('2026-10-06 10:00:00+09', { ip: '203.0.113.7', entry: true }); // 오늘 첫 화면 — 붙인다
  await record('2026-10-06 10:00:30+09', { ip: '198.51.100.9' });           // 다른 사람 — 안 붙인다
  const linked = await db.sql(`select analytics_link_cookie('${C1}', '203.0.113.7', 'UA-A', '2026-10-06 10:02:00+09'::timestamptz);`);
  assert.equal(linked, '1');
  assert.equal(await db.sql('select count(*) from analytics_page_views where cookie_key is not null;'), '1');
  assert.equal(await db.sql('select bool_and(entry) from analytics_page_views where cookie_key is not null;'), 't');
});

test('linking without a cookie is refused', async () => {
  await assert.rejects(() => db.sql(`select analytics_link_cookie(null, '1.1.1.1', 'UA-A');`), /cookie required/);
});

test('refusing forgets the cookie on every day and leaves others alone', async () => {
  await record('2026-10-02 20:00:00+09', { cookie: C1 });
  await record('2026-10-06 10:00:00+09', { cookie: C1 });
  await record('2026-10-06 10:00:00+09', { ip: '198.51.100.9', cookie: C2 });
  assert.equal(await db.sql(`select analytics_forget('${C1}');`), '2');
  assert.equal(await cookieKeys(), 1);
  assert.equal(await db.sql('select count(*) from analytics_page_views;'), '3'); // 하루 단위 숫자는 남는다
  assert.equal(await db.sql(`select analytics_forget(null);`), '0');
});

test('an unknown user id is kept as null instead of failing the write', async () => {
  await record('2026-10-06 10:00:00+09', { user: '93000000-0000-4000-8000-0000000000ff' });
  assert.equal(await db.sql('select count(*) from analytics_page_views where user_id is null;'), '1');
});

test('prune deletes only rows older than the keep window and refuses a short window', async () => {
  await record('2025-09-01 10:00:00+09');
  await record('2026-10-01 10:00:00+09');
  assert.equal(await db.sql(`select analytics_prune(365, '2026-10-06 12:00:00+09'::timestamptz);`), '1');
  assert.equal(await db.sql('select count(*) from analytics_page_views;'), '1');
  await assert.rejects(() => db.sql('select analytics_prune(7);'), /keep_days/);
});

test('members and visitors cannot read the tables or call any function', async () => {
  const fns = [
    'analytics_record(text,text,uuid,text,text,text,text,text,text,text,boolean,text,timestamptz)',
    'analytics_link_cookie(text,text,text,timestamptz)',
    'analytics_forget(text)',
    'analytics_prune(integer,timestamptz)',
    'analytics_visitor_hash(text,text,timestamptz)',
    'analytics_cookie_key(text)',
  ];
  for (const role of ['anon', 'authenticated']) {
    for (const table of ['analytics_page_views', 'analytics_salts']) {
      assert.equal(await db.sql(`select has_table_privilege('${role}', 'public.${table}', 'select');`), 'f');
    }
    for (const fn of fns) {
      assert.equal(await db.sql(`select has_function_privilege('${role}', 'public.${fn}', 'execute');`), 'f', `${role} ${fn}`);
    }
  }
});
```

- [ ] **Step 2: 실패 확인**

```bash
TEST_PG_BIN="C:/Program Files/PostgreSQL/17/bin" node --test scripts/tests/site-analytics.test.mjs
```

Expected: FAIL — `Migration 202610060001_site_analytics.sql: ENOENT`.

- [ ] **Step 3: 마이그레이션을 쓴다**

`supabase/migrations/202610060001_site_analytics.sql`:

```sql
-- 방문 통계 — 표 둘과 함수 여섯(계획 2026-10-06 site-analytics, 1단계 수집).
--
-- ⚠ 공유 DB — detail-page-studio 가 같은 Supabase 를 본다. **새 표·새 함수만 더한다.**
-- ⚠ 순서 — **이 파일 먼저, 그다음 앱.** 앱이 먼저 나가면 기록이 「함수 없음」으로 실패하고
--   경고만 남는다(화면은 안 막는다). 그동안의 방문이 빠질 뿐이다.
--
-- 섞어 쓰기(2026-10-06 사용자 결정):
--   visitor    — 모두. IP·브라우저 정보를 **그날의** 무작위 값(salt)과 섞은 sha256. 지난 salt 는 지운다.
--                그래서 하루가 지나면 누구도(우리도) 되돌리지 못한다. 하루 안에서만 같은 사람이다.
--   cookie_key — 방문 통계 쿠키에 **동의한** 브라우저만. 쿠키 번호(fx_vid)의 sha256. 여러 날을 잇는다.
--                거부·철회하면 analytics_forget 이 모든 줄에서 지운다.
-- 원래 IP·브라우저 정보·쿠키 값은 어디에도 남지 않는다.

create table if not exists public.analytics_salts (
  day  date primary key,
  salt text not null check (char_length(salt) = 64)
);
alter table public.analytics_salts enable row level security;
revoke all on table public.analytics_salts from public, anon, authenticated;

create table if not exists public.analytics_page_views (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  visitor       text not null check (visitor ~ '^[0-9a-f]{64}$'),
  cookie_key    text check (cookie_key ~ '^[0-9a-f]{64}$'),
  -- 회원을 지우면 이 칸만 비운다. 통계 숫자는 남는다.
  user_id       uuid references public.profiles(id) on delete set null,
  -- 조회 값(?…)·개별 번호를 지운 주소. 앱이 지워서 넘긴다(lib/analytics/normalize.ts).
  path          text not null check (char_length(path) between 1 and 200),
  referrer_host text check (char_length(referrer_host) between 1 and 120),
  utm_source    text check (char_length(utm_source) between 1 and 80),
  utm_medium    text check (char_length(utm_medium) between 1 and 80),
  utm_campaign  text check (char_length(utm_campaign) between 1 and 80),
  device        text not null check (device in ('mobile','tablet','desktop')),
  browser       text not null check (browser in ('chrome','safari','edge','firefox','samsung','kakaotalk','naver','other')),
  -- 이 탭에서 처음 연 화면(바깥에서 들어온 순간). 유입 경로는 이 줄에서만 센다.
  entry         boolean not null default false
);
create index if not exists analytics_page_views_created_idx on public.analytics_page_views (created_at desc);
create index if not exists analytics_page_views_user_idx on public.analytics_page_views (user_id, created_at desc) where user_id is not null;
create index if not exists analytics_page_views_cookie_idx on public.analytics_page_views (cookie_key, created_at) where cookie_key is not null;
alter table public.analytics_page_views enable row level security;
revoke all on table public.analytics_page_views from public, anon, authenticated;

-- ── 내부: 그날의 방문자 값 ─────────────────────────────────────────
create or replace function public.analytics_visitor_hash(p_ip text, p_ua text, p_now timestamptz)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (p_now at time zone 'Asia/Seoul')::date;
  v_salt text;
begin
  insert into analytics_salts(day, salt)
  values (v_day, replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
  on conflict (day) do nothing;
  select salt into v_salt from analytics_salts where day = v_day;
  -- 지난 날의 salt 를 지운다. 이것이 「되돌릴 수 없다」의 근거다.
  delete from analytics_salts where day < v_day;
  return encode(sha256(convert_to(v_salt || '|' || coalesce(p_ip, '') || '|' || coalesce(p_ua, ''), 'UTF8')), 'hex');
end $$;
revoke all on function public.analytics_visitor_hash(text, text, timestamptz) from public, anon, authenticated;

-- ── 내부: 쿠키 번호 → 저장할 값 ────────────────────────────────────
create or replace function public.analytics_cookie_key(p_cookie text)
returns text
language sql
immutable
set search_path = public
as $$
  select case when nullif(btrim(coalesce(p_cookie, '')), '') is null then null
              else encode(sha256(convert_to(btrim(p_cookie), 'UTF8')), 'hex') end;
$$;
revoke all on function public.analytics_cookie_key(text) from public, anon, authenticated;

-- ── 한 줄 쓰기 ───────────────────────────────────────────────────
create or replace function public.analytics_record(
  p_ip text,
  p_ua text,
  p_user uuid,
  p_path text,
  p_referrer_host text,
  p_utm_source text,
  p_utm_medium text,
  p_utm_campaign text,
  p_device text,
  p_browser text,
  p_entry boolean,
  p_cookie text,
  p_now timestamptz default now()
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  -- 없는 회원 번호로 쓰기 전체가 실패하지 않게, 있는 회원만 적는다.
  select id into v_user from profiles where id = p_user;
  insert into analytics_page_views(
    created_at, visitor, cookie_key, user_id, path, referrer_host,
    utm_source, utm_medium, utm_campaign, device, browser, entry
  ) values (
    p_now, analytics_visitor_hash(p_ip, p_ua, p_now), analytics_cookie_key(p_cookie),
    v_user, p_path, nullif(btrim(p_referrer_host), ''),
    nullif(btrim(p_utm_source), ''), nullif(btrim(p_utm_medium), ''), nullif(btrim(p_utm_campaign), ''),
    p_device, p_browser, coalesce(p_entry, false)
  );
end $$;
revoke all on function public.analytics_record(text,text,uuid,text,text,text,text,text,text,text,boolean,text,timestamptz) from public, anon, authenticated;
grant execute on function public.analytics_record(text,text,uuid,text,text,text,text,text,text,text,boolean,text,timestamptz) to service_role;

-- ── 동의: 오늘 같은 방문자의 앞선 줄에 번호를 잇는다 ──────────────────
-- 첫 화면(유입 경로가 실린 줄)은 동의 띠를 누르기 **전에** 적힌다. 잇지 않으면 「어디서 왔나」가 번호에서 빠진다.
-- 같은 날·같은 IP·같은 브라우저 정보면 같은 사람으로 본다(하루 단위 visitor 와 같은 판단).
create or replace function public.analytics_link_cookie(
  p_cookie text,
  p_ip text,
  p_ua text,
  p_now timestamptz default now()
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := analytics_cookie_key(p_cookie);
  v_visitor text;
  v_linked integer;
begin
  if v_key is null then
    raise exception 'analytics_link_cookie: cookie required';
  end if;
  v_visitor := analytics_visitor_hash(p_ip, p_ua, p_now);
  update analytics_page_views
     set cookie_key = v_key
   where visitor = v_visitor
     and cookie_key is null
     and created_at >= date_trunc('day', p_now at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'
     and created_at <= p_now;
  get diagnostics v_linked = row_count;
  return v_linked;
end $$;
revoke all on function public.analytics_link_cookie(text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.analytics_link_cookie(text, text, text, timestamptz) to service_role;

-- ── 거부·철회: 그 번호를 모든 줄에서 지운다 ─────────────────────────
create or replace function public.analytics_forget(p_cookie text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := analytics_cookie_key(p_cookie);
  v_forgot integer;
begin
  if v_key is null then
    return 0;
  end if;
  update analytics_page_views set cookie_key = null where cookie_key = v_key;
  get diagnostics v_forgot = row_count;
  return v_forgot;
end $$;
revoke all on function public.analytics_forget(text) from public, anon, authenticated;
grant execute on function public.analytics_forget(text) to service_role;

-- ── 오래된 줄 지우기 ──────────────────────────────────────────────
-- 보유기간은 앱 상수 ANALYTICS_KEEP_DAYS(365)가 정하고 처리방침과 시험으로 묶인다.
-- 실수로 짧은 값을 넘겨 쌓인 것을 날리지 않게 30일 미만은 거절한다.
create or replace function public.analytics_prune(
  p_keep_days integer,
  p_now timestamptz default now()
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  if p_keep_days is null or p_keep_days < 30 then
    raise exception 'analytics_prune: keep_days must be >= 30 (got %)', p_keep_days;
  end if;
  delete from analytics_page_views where created_at < p_now - make_interval(days => p_keep_days);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $$;
revoke all on function public.analytics_prune(integer, timestamptz) from public, anon, authenticated;
grant execute on function public.analytics_prune(integer, timestamptz) to service_role;

-- ── 하나씩인지 센다(42725 교훈) ────────────────────────────────────
do $$
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('analytics_visitor_hash', 'analytics_cookie_key', 'analytics_record',
                           'analytics_link_cookie', 'analytics_forget', 'analytics_prune')) <> 6 then
    raise exception '방문 통계 함수 여섯이 하나씩이 아닙니다';
  end if;
  raise notice '방문 통계 표 둘과 함수 여섯을 만들었습니다.';
end $$;

-- 확인(적용 뒤, 읽기만):
--   select to_regclass('public.analytics_page_views'), to_regclass('public.analytics_salts');
--   select has_table_privilege('anon', 'public.analytics_page_views', 'select');   -- false
```

- [ ] **Step 4: 통과 확인**

```bash
TEST_PG_BIN="C:/Program Files/PostgreSQL/17/bin" node --test scripts/tests/site-analytics.test.mjs
```

Expected: PASS 11/11. (Windows 에서 정리 단계 `EBUSY … postgres.log` 1건이면 한 번 더 돌린다.)

- [ ] **Step 5: 「새것만 더한다」 계약 시험**

`apps/web/lib/analytics/__tests__/site-analytics-migration.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **방문 통계 마이그레이션은 새것만 더한다**(계획 2026-10-06 site-analytics).
 * 같은 Supabase 를 detail-page-studio 가 본다. 동작은 `scripts/tests/site-analytics*.test.mjs`(실제 PostgreSQL)가 본다.
 */
const migrationsDir = fileURLToPath(new URL("../../../../../supabase/migrations/", import.meta.url));

function code(name: string): string {
  return readFileSync(path.join(migrationsDir, name), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*--.*$/gm, "");
}

const defined = (sql: string) =>
  [...sql.matchAll(/create\s+or\s+replace\s+function\s+public\.(\w+)\s*\(/gi)].map((m) => m[1]!.toLowerCase()).sort();
const revoked = (sql: string, fn: string) =>
  new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${fn}\\([^)]*\\)\\s+from\\s+public,\\s*anon,\\s*authenticated`, "i").test(sql);
const granted = (sql: string, fn: string) =>
  new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}\\([^)]*\\)\\s+to\\s+service_role`, "i").test(sql);

describe("표·함수 파일", () => {
  const sql = code("202610060001_site_analytics.sql");

  it("함수 여섯만 정의한다", () => {
    expect(defined(sql)).toEqual([
      "analytics_cookie_key", "analytics_forget", "analytics_link_cookie",
      "analytics_prune", "analytics_record", "analytics_visitor_hash",
    ]);
  });

  it("다른 표를 바꾸거나 지우지 않는다", () => {
    expect(sql).not.toMatch(/\balter\s+table\s+(?!public\.analytics_(page_views|salts)\b)/i);
    expect(sql).not.toMatch(/\bdrop\s+(table|function|index)\b/i);
  });

  it("두 표 모두 RLS 를 켜고 회원·손님 권한을 거둔다", () => {
    for (const table of ["analytics_page_views", "analytics_salts"]) {
      expect(sql).toMatch(new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i"));
      expect(sql).toMatch(new RegExp(`revoke\\s+all\\s+on\\s+table\\s+public\\.${table}\\s+from\\s+public,\\s*anon,\\s*authenticated`, "i"));
    }
  });

  it("바깥에서 부르는 넷은 서비스 권한만, 내부 둘은 아무에게도 주지 않는다", () => {
    for (const fn of ["analytics_record", "analytics_link_cookie", "analytics_forget", "analytics_prune"]) {
      expect(revoked(sql, fn), fn).toBe(true);
      expect(granted(sql, fn), fn).toBe(true);
    }
    for (const fn of ["analytics_visitor_hash", "analytics_cookie_key"]) {
      expect(revoked(sql, fn), fn).toBe(true);
      expect(granted(sql, fn), fn).toBe(false);
    }
  });

  it("IP·브라우저 정보·쿠키 원래 값 칸이 없다", () => {
    const table = sql.match(/create\s+table\s+if\s+not\s+exists\s+public\.analytics_page_views\s*\(([\s\S]*?)\n\);/i)?.[1] ?? "";
    expect(table.length).toBeGreaterThan(0);
    expect(table).not.toMatch(/\b(ip|user_agent|ua|cookie|fx_vid)\b\s+text/i);
  });
});
```

Run: `pnpm --filter web exec vitest run lib/analytics/__tests__/site-analytics-migration.test.ts` → PASS.

- [ ] **Step 6: DB 시험 목록에 넣는다**

루트 `package.json` 의 `test:credit-db` 값 끝(`scripts/tests/member-phone.test.mjs` 뒤)에 ` scripts/tests/site-analytics.test.mjs` 를 붙인다. (CI 가 이 스크립트를 돈다. master 에서 목록이 바뀌었으면 끝에 붙이기만 한다.)

- [ ] **Step 7: 커밋**

```bash
git add supabase/migrations/202610060001_site_analytics.sql scripts/tests/site-analytics.test.mjs apps/web/lib/analytics/__tests__/site-analytics-migration.test.ts package.json
git commit -m "feat(analytics): 방문 통계 표와 기록·잇기·잊기·정리 함수

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 주소·유입·기기 정리 규칙(순수 함수)

**Files:**
- Create: `apps/web/lib/analytics/normalize.ts`
- Create: `apps/web/lib/analytics/retention.ts`
- Test: `apps/web/lib/analytics/__tests__/normalize.test.ts`

**Interfaces:**
- Produces (모두 `normalize.ts`, 브라우저·서버 양쪽에서 import 가능 — `server-only` 금지):
  - `normalizePath(pathname: string): string | null`
  - `isTrackedPath(path: string): boolean`
  - `referrerHost(referrer: string | undefined, ownHost: string): string | null`
  - `utmOnly(search: string): string`
  - `type Utm = { source: string | null; medium: string | null; campaign: string | null }`, `utmFrom(search: string): Utm`
  - `type Device = "mobile" | "tablet" | "desktop"`, `deviceFrom(ua: string): Device`
  - `type Browser = "chrome" | "safari" | "edge" | "firefox" | "samsung" | "kakaotalk" | "naver" | "other"`, `browserFrom(ua: string): Browser`
  - `isBot(ua: string): boolean`
  - `clientIp(headers: { get(name: string): string | null }): string | null`
- `retention.ts`: `export const ANALYTICS_KEEP_DAYS = 365;`

- [ ] **Step 1: 실패하는 시험**

`apps/web/lib/analytics/__tests__/normalize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  browserFrom, clientIp, deviceFrom, isBot, isTrackedPath, normalizePath, referrerHost, utmFrom, utmOnly,
} from "../normalize";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID_TAB = "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const ANDROID_PHONE_SAMSUNG = "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36";
const KAKAO_INAPP = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0";
const NAVER_INAPP = "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.8.1)";
const WIN_EDGE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0";
const WIN_CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const MAC_FIREFOX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0";

describe("normalizePath — 주소에 든 값은 남기지 않는다", () => {
  it("조회 값과 # 뒤를 지운다", () => {
    expect(normalizePath("/auth/confirm?token_hash=abc&type=signup")).toBe("/auth/confirm");
    expect(normalizePath("/reset-password#access_token=xyz")).toBe("/reset-password");
  });
  it("uuid·숫자·긴 토큰 조각을 :id 로 바꾼다", () => {
    expect(normalizePath("/library/3f2c9a1e-1b2c-4d5e-8f90-123456789abc")).toBe("/library/:id");
    expect(normalizePath("/characters/12345/edit")).toBe("/characters/:id/edit");
    expect(normalizePath("/share/aB3dE5fG7hJ9kL1m")).toBe("/share/:id");
  });
  it("평범한 이름 조각과 한글은 그대로 둔다", () => {
    expect(normalizePath("/guide/ad")).toBe("/guide/ad");
    expect(normalizePath("/create/poster")).toBe("/create/poster");
    expect(normalizePath("/guide/%EA%B4%91%EA%B3%A0")).toBe("/guide/광고");
  });
  it("/ 로 시작하지 않으면 버리고, 200자에서 자른다", () => {
    expect(normalizePath("https://evil.example/x")).toBeNull();
    expect(normalizePath("")).toBeNull();
    expect(normalizePath(`/${"a".repeat(300)}`)!.length).toBe(200);
  });
  it("끝 / 를 하나로 맞춘다", () => {
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("/guide/")).toBe("/guide");
  });
});

describe("isTrackedPath — 관리자·API 는 세지 않는다", () => {
  it.each([["/admin", false], ["/admin/system", false], ["/api/track", false], ["/administrator", true], ["/", true], ["/guide", true]])(
    "%s → %s", (path, expected) => expect(isTrackedPath(path)).toBe(expected),
  );
});

describe("referrerHost — 들어오기 직전 사이트의 도메인만", () => {
  it("도메인만 남기고 www 를 뗀다", () => {
    expect(referrerHost("https://www.instagram.com/p/abc?igsh=secret", "formwith.fix-up.kr")).toBe("instagram.com");
    expect(referrerHost("https://search.naver.com/search.naver?query=카드뉴스", "formwith.fix-up.kr")).toBe("search.naver.com");
  });
  it("우리 사이트·빈 값·이상한 주소는 null", () => {
    expect(referrerHost("https://formwith.fix-up.kr/guide", "formwith.fix-up.kr")).toBeNull();
    expect(referrerHost("https://formwith.fix-up.kr/guide", "formwith.fix-up.kr:443")).toBeNull();
    expect(referrerHost("", "formwith.fix-up.kr")).toBeNull();
    expect(referrerHost(undefined, "formwith.fix-up.kr")).toBeNull();
    expect(referrerHost("android-app://com.google.android.gm/", "formwith.fix-up.kr")).toBeNull();
    expect(referrerHost("not a url", "formwith.fix-up.kr")).toBeNull();
  });
});

describe("utm — 광고 꼬리표만", () => {
  it("utm 셋만 남긴 조회 문자열을 만든다", () => {
    expect(utmOnly("?utm_source=Instagram&token=abc&utm_campaign=Launch")).toBe("utm_source=Instagram&utm_campaign=Launch");
    expect(utmOnly("?token=abc")).toBe("");
  });
  it("소문자로, 80자까지, 빈 값은 null", () => {
    expect(utmFrom("utm_source=Instagram&utm_medium=%20&utm_campaign=" + "x".repeat(100))).toEqual({
      source: "instagram", medium: null, campaign: "x".repeat(80),
    });
    expect(utmFrom("")).toEqual({ source: null, medium: null, campaign: null });
  });
});

describe("기기·브라우저", () => {
  it.each([[IPHONE, "mobile"], [ANDROID_PHONE_SAMSUNG, "mobile"], [IPAD, "tablet"], [ANDROID_TAB, "tablet"], [WIN_CHROME, "desktop"], [MAC_FIREFOX, "desktop"]])(
    "기기 %#", (ua, expected) => expect(deviceFrom(ua)).toBe(expected),
  );
  it.each([[KAKAO_INAPP, "kakaotalk"], [NAVER_INAPP, "naver"], [ANDROID_PHONE_SAMSUNG, "samsung"], [WIN_EDGE, "edge"], [MAC_FIREFOX, "firefox"], [WIN_CHROME, "chrome"], [IPHONE, "safari"], ["", "other"]])(
    "브라우저 %#", (ua, expected) => expect(browserFrom(ua)).toBe(expected),
  );
});

describe("isBot — 사람이 아닌 것은 뺀다", () => {
  it.each([
    "facebookexternalhit/1.1", "kakaotalk-scrap/1.0", "Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)",
    "Mozilla/5.0 (compatible; Googlebot/2.1)", "Mozilla/5.0 HeadlessChrome/129.0", "Daum/4.1", "curl/8.5.0", "python-requests/2.32", "",
  ])("봇: %s", (ua) => expect(isBot(ua)).toBe(true));
  it.each([KAKAO_INAPP, NAVER_INAPP, IPHONE, WIN_CHROME, "Mozilla/5.0 (Linux; Android 14) DaumApps/6.0"])(
    "사람: %s", (ua) => expect(isBot(ua)).toBe(false),
  );
});

describe("clientIp — 앞단(Caddy)이 붙인 마지막 값", () => {
  const h = (values: Record<string, string>) => ({ get: (name: string) => values[name.toLowerCase()] ?? null });
  it("x-forwarded-for 의 마지막을 쓴다 — 앞쪽은 요청자가 지어낼 수 있다", () => {
    expect(clientIp(h({ "x-forwarded-for": "1.1.1.1, 203.0.113.7" }))).toBe("203.0.113.7");
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
  });
  it("없으면 x-real-ip, 그것도 없으면 null", () => {
    expect(clientIp(h({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(h({}))).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter web exec vitest run lib/analytics/__tests__/normalize.test.ts`
Expected: FAIL — `Failed to resolve import "../normalize"`.

- [ ] **Step 3: 구현**

`apps/web/lib/analytics/retention.ts`:

```ts
/**
 * 방문 통계 원본 줄을 며칠 두나(계획 2026-10-06 site-analytics).
 * 처리방침 제1조 표의 「수집일부터 365일」과 `launch-ready.test.ts` 가 이 값으로 묶인다.
 */
export const ANALYTICS_KEEP_DAYS = 365;
```

`apps/web/lib/analytics/normalize.ts`:

```ts
/**
 * **방문 한 줄에 무엇을 남길지 정하는 규칙**(계획 2026-10-06 site-analytics).
 *
 * 화면(보내기 전에 줄이기)과 서버(받은 것을 믿지 않고 다시 줄이기)가 같은 규칙을 쓴다.
 * 그래서 `server-only` 를 붙이지 않는다.
 *
 * 남기지 않는 것: 주소 뒤 조회 값(`?…`·`#…` — 메일 인증 토큰이 여기 실린다), 개별 작업 번호,
 * 들어오기 전 사이트의 경로·검색어, 원래 IP·브라우저 정보 전체.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC = /^\d+$/;
// 숫자가 섞인 16자 이상 — 공유 토큰·짧은 id 모양.
const LONG_TOKEN = /^(?=.*\d)[A-Za-z0-9_-]{16,}$/;
const MAX_PATH = 200;

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function normalizePath(pathname: string): string | null {
  if (!pathname.startsWith("/")) return null;
  const clean = pathname.split(/[?#]/)[0] ?? "/";
  const segments = clean
    .split("/")
    .filter(Boolean)
    .map(decodeSegment)
    .map((segment) => (UUID.test(segment) || NUMERIC.test(segment) || LONG_TOKEN.test(segment) ? ":id" : segment));
  return `/${segments.join("/")}`.slice(0, MAX_PATH);
}

/** 관리자 화면과 API 는 세지 않는다 — 운영자가 숫자를 부풀린다. */
export function isTrackedPath(path: string): boolean {
  const under = (root: string) => path === root || path.startsWith(`${root}/`);
  return !under("/admin") && !under("/api");
}

const bareHost = (host: string) => host.toLowerCase().split(":")[0]!.replace(/^www\./, "");

export function referrerHost(referrer: string | undefined, ownHost: string): string | null {
  if (!referrer) return null;
  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = bareHost(url.hostname);
  if (!host || host === bareHost(ownHost)) return null;
  return host.slice(0, 120);
}

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign"] as const;

/** 화면이 보낼 조회 문자열 — utm 셋만. 나머지(토큰 등)는 서버로 보내지도 않는다. */
export function utmOnly(search: string): string {
  const params = new URLSearchParams(search);
  const kept = UTM_KEYS.flatMap((key) => {
    const value = params.get(key);
    return value ? [[key, value] as [string, string]] : [];
  });
  return new URLSearchParams(kept).toString();
}

export type Utm = { source: string | null; medium: string | null; campaign: string | null };

export function utmFrom(search: string): Utm {
  const params = new URLSearchParams(search);
  const pick = (key: (typeof UTM_KEYS)[number]) => {
    const value = params.get(key)?.trim().toLowerCase();
    return value ? value.slice(0, 80) : null;
  };
  return { source: pick("utm_source"), medium: pick("utm_medium"), campaign: pick("utm_campaign") };
}

export type Device = "mobile" | "tablet" | "desktop";

export function deviceFrom(ua: string): Device {
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android/i.test(ua)) return "mobile";
  return "desktop";
}

export type Browser = "chrome" | "safari" | "edge" | "firefox" | "samsung" | "kakaotalk" | "naver" | "other";

/** 순서가 중요하다 — 앱 안 브라우저·삼성·엣지는 UA 에 Chrome/Safari 도 함께 적는다. */
const BROWSER_RULES: ReadonlyArray<[RegExp, Browser]> = [
  [/KAKAOTALK/i, "kakaotalk"],
  [/NAVER\(inapp/i, "naver"],
  [/SamsungBrowser/i, "samsung"],
  [/Edg(e|A|iOS)?\//i, "edge"],
  [/Firefox|FxiOS/i, "firefox"],
  [/Chrome|CriOS/i, "chrome"],
  [/Safari/i, "safari"],
];

export function browserFrom(ua: string): Browser {
  return BROWSER_RULES.find(([pattern]) => pattern.test(ua))?.[1] ?? "other";
}

// `scrap` 은 카카오톡 링크 미리보기, `Yeti` 는 네이버, `Daum/` 은 다음 검색 봇(다음 앱 `DaumApps` 는 사람).
const BOT = /bot|crawl|spider|slurp|scrap|preview|headless|lighthouse|facebookexternalhit|yeti|daum\/|curl\/|wget\/|python|node-fetch|axios/i;

export function isBot(ua: string): boolean {
  return !ua.trim() || BOT.test(ua);
}

/**
 * Caddy 가 앞단이다. 요청자가 보낸 x-forwarded-for 앞쪽은 지어낼 수 있으므로
 * **Caddy 가 붙인 마지막 값**을 쓴다.
 */
export function clientIp(headers: { get(name: string): string | null }): string | null {
  const last = headers.get("x-forwarded-for")?.split(",").map((part) => part.trim()).filter(Boolean).at(-1);
  return last ?? headers.get("x-real-ip") ?? null;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter web exec vitest run lib/analytics/__tests__/normalize.test.ts` → 전부 PASS.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/lib/analytics/normalize.ts apps/web/lib/analytics/retention.ts apps/web/lib/analytics/__tests__/normalize.test.ts
git commit -m "feat(analytics): 방문 한 줄에 남길 것을 정하는 규칙

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 동의 쿠키 규칙(순수 함수)

**Files:**
- Create: `apps/web/lib/analytics/consent.ts`
- Test: `apps/web/lib/analytics/__tests__/consent.test.ts`

**Interfaces:**
- Produces (`server-only` 금지 — 동의 띠도 쓴다):
  - `CONSENT_COOKIE = "fx_consent"`, `VISITOR_COOKIE = "fx_vid"`, `ANALYTICS_COOKIE_DAYS = 365`
  - `readCookie(header: string | null, name: string): string | null`
  - `type Consent = "yes" | "no" | "unset"`, `consentFrom(value: string | null): Consent`
  - `validVisitorId(value: string | null): string | null` — UUID v4 모양이면 소문자로, 아니면 null
  - `setCookie(name: string, value: string, opts: { secure: boolean; httpOnly: boolean; days: number }): string` — `Set-Cookie` 헤더 값
  - `clearCookie(name: string, secure: boolean): string`

- [ ] **Step 1: 실패하는 시험**

`apps/web/lib/analytics/__tests__/consent.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ANALYTICS_COOKIE_DAYS, CONSENT_COOKIE, VISITOR_COOKIE, clearCookie, consentFrom, readCookie, setCookie, validVisitorId,
} from "../consent";

const ID = "5b1f0c1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f";

describe("readCookie", () => {
  it("이름이 정확히 같은 것만, 앞뒤 공백 무시, 인코딩 풀기", () => {
    const header = `sb-x-auth-token=abc; ${CONSENT_COOKIE}=1;  ${VISITOR_COOKIE}=${encodeURIComponent(ID)}; fx_consent_old=0`;
    expect(readCookie(header, CONSENT_COOKIE)).toBe("1");
    expect(readCookie(header, VISITOR_COOKIE)).toBe(ID);
    expect(readCookie(header, "missing")).toBeNull();
    expect(readCookie(null, CONSENT_COOKIE)).toBeNull();
  });
  it("값에 = 가 들어 있어도 자르지 않는다, 깨진 인코딩은 null", () => {
    expect(readCookie("a=b=c", "a")).toBe("b=c");
    expect(readCookie("a=%E0%A4%A", "a")).toBeNull();
  });
});

describe("consentFrom", () => {
  it.each([["1", "yes"], ["0", "no"], [null, "unset"], ["yes", "unset"], ["", "unset"]])("%s → %s", (value, expected) =>
    expect(consentFrom(value)).toBe(expected));
});

describe("validVisitorId — 서버가 만든 모양만 믿는다", () => {
  it("UUID v4 는 소문자로", () => expect(validVisitorId(ID.toUpperCase())).toBe(ID));
  it.each([null, "", "abc", "5b1f0c1e-2a3b-1c5d-8e9f-0a1b2c3d4e5f", `${ID}x`, "' or 1=1 --"])("버림: %s", (value) =>
    expect(validVisitorId(value)).toBeNull());
});

describe("setCookie / clearCookie", () => {
  it("동의 번호 쿠키 — HttpOnly·Lax·Secure·365일", () => {
    expect(setCookie(VISITOR_COOKIE, ID, { secure: true, httpOnly: true, days: ANALYTICS_COOKIE_DAYS })).toBe(
      `fx_vid=${ID}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly; Secure`,
    );
  });
  it("동의 여부 쿠키 — 화면이 읽어야 하므로 HttpOnly 아님, http 면 Secure 없음", () => {
    expect(setCookie(CONSENT_COOKIE, "0", { secure: false, httpOnly: false, days: 365 })).toBe(
      "fx_consent=0; Path=/; Max-Age=31536000; SameSite=Lax",
    );
  });
  it("지우기는 Max-Age=0", () => {
    expect(clearCookie(VISITOR_COOKIE, true)).toBe("fx_vid=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly; Secure");
  });
});
```

Run: `pnpm --filter web exec vitest run lib/analytics/__tests__/consent.test.ts` → FAIL(모듈 없음).

- [ ] **Step 2: 구현**

`apps/web/lib/analytics/consent.ts`:

```ts
/**
 * **방문 통계 쿠키 동의**(계획 2026-10-06 site-analytics, 섞어 쓰기).
 *
 * `fx_consent` — 동의(1)·거부(0)를 기억한다. 동의 띠가 읽어야 하므로 HttpOnly 가 아니다.
 * `fx_vid`     — **동의한 경우에만** 서버가 심는 무작위 번호. 여러 날을 잇는다. 화면 스크립트는 못 읽는다(HttpOnly).
 *
 * 이름과 기간은 처리방침 제11조 표와 `launch-ready.test.ts` 로 묶인다.
 */
export const CONSENT_COOKIE = "fx_consent";
export const VISITOR_COOKIE = "fx_vid";
export const ANALYTICS_COOKIE_DAYS = 365;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key !== name) continue;
    try {
      return decodeURIComponent(rest.join("="));
    } catch {
      return null;
    }
  }
  return null;
}

export type Consent = "yes" | "no" | "unset";

export function consentFrom(value: string | null): Consent {
  if (value === "1") return "yes";
  if (value === "0") return "no";
  return "unset";
}

/** 우리가 만든 모양(UUID v4)이 아니면 버린다 — 요청자가 쿠키에 아무 값이나 넣을 수 있다. */
export function validVisitorId(value: string | null): string | null {
  return value && UUID_V4.test(value) ? value.toLowerCase() : null;
}

export function setCookie(name: string, value: string, { secure, httpOnly, days }: { secure: boolean; httpOnly: boolean; days: number }): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${days * 86_400}`,
    "SameSite=Lax",
    ...(httpOnly ? ["HttpOnly"] : []),
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export const clearCookie = (name: string, secure: boolean) => setCookie(name, "", { secure, httpOnly: true, days: 0 });
```

- [ ] **Step 3: 통과 확인 후 커밋**

Run: `pnpm --filter web exec vitest run lib/analytics/__tests__/consent.test.ts` → PASS.

```bash
git add apps/web/lib/analytics/consent.ts apps/web/lib/analytics/__tests__/consent.test.ts
git commit -m "feat(analytics): 방문 통계 쿠키 동의 규칙

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 받는 자리 `/api/track`

**Files:**
- Create: `apps/web/lib/analytics/rate-limit.ts`
- Create: `apps/web/lib/analytics/record.ts`
- Create: `apps/web/lib/analytics/viewer.ts`
- Create: `apps/web/app/api/track/route.ts`
- Test: `apps/web/lib/analytics/__tests__/rate-limit.test.ts`
- Test: `apps/web/app/api/track/__tests__/route.test.ts`

**Interfaces:**
- Consumes: Task 2 `normalize.ts` 전부, `ANALYTICS_KEEP_DAYS`; Task 3 `consent.ts` 전부; Task 1 RPC `analytics_record`·`analytics_link_cookie`·`analytics_forget`·`analytics_prune`.
- Produces:
  - `rate-limit.ts`: `type Window = { startedAt: number; count: number }`, `nextWindow(prev: Window | undefined, now: number, windowMs: number): Window`, `createLimiter(opts: { limit: number; windowMs: number; maxKeys: number }): (key: string, now?: number) => boolean`
  - `record.ts`(server-only):
    - `type PageView = { ip: string | null; userAgent: string; userId: string | null; cookieId: string | null; path: string; referrerHost: string | null; utm: Utm; device: Device; browser: Browser; entry: boolean }`
    - `recordPageView(view: PageView): Promise<void>` — 던지지 않음
    - `linkCookie(input: { cookieId: string; ip: string | null; userAgent: string }): Promise<void>` — 던지지 않음
    - `forgetCookie(cookieId: string): Promise<boolean>` — 성공 여부
    - `pruneAnalytics(): Promise<number | null>`, `pruneSoon(now?: number): void`
  - `viewer.ts`(server-only): `currentUserId(): Promise<string | null>`
  - `POST /api/track` — 본문 `{ path: string; entry: boolean; referrer?: string; search?: string }`, 응답 항상 204. 동의했는데 번호가 없으면 `Set-Cookie: fx_vid=…` 를 붙인다.

- [ ] **Step 1: 속도 제한 시험**

`apps/web/lib/analytics/__tests__/rate-limit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createLimiter, nextWindow } from "../rate-limit";

describe("nextWindow", () => {
  it("창 안에서는 센 수를 하나 올린 새 값을 준다(원래 값은 그대로)", () => {
    const prev = { startedAt: 1_000, count: 3 };
    const next = nextWindow(prev, 1_500, 60_000);
    expect(next).toEqual({ startedAt: 1_000, count: 4 });
    expect(prev).toEqual({ startedAt: 1_000, count: 3 });
  });
  it("창이 지나면 1 부터 다시", () => {
    expect(nextWindow({ startedAt: 0, count: 99 }, 60_000, 60_000)).toEqual({ startedAt: 60_000, count: 1 });
    expect(nextWindow(undefined, 5, 60_000)).toEqual({ startedAt: 5, count: 1 });
  });
});

describe("createLimiter", () => {
  it("한도까지 받고 넘으면 거절, 다음 창에서 다시 받는다", () => {
    const allow = createLimiter({ limit: 2, windowMs: 1_000, maxKeys: 10 });
    expect([allow("a", 0), allow("a", 1), allow("a", 2)]).toEqual([true, true, false]);
    expect(allow("b", 2)).toBe(true);
    expect(allow("a", 1_000)).toBe(true);
  });
  it("열쇠가 너무 많아지면 비우고 계속 받는다 — 메모리가 끝없이 늘지 않는다", () => {
    const allow = createLimiter({ limit: 1, windowMs: 1_000, maxKeys: 2 });
    allow("a", 0);
    allow("b", 0);
    expect(allow("a", 0)).toBe(true); // 비운 뒤라 새 창
  });
});
```

- [ ] **Step 2: 라우트 시험**

`apps/web/app/api/track/__tests__/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **방문 한 줄 받기**(계획 2026-10-06 site-analytics).
 *
 * 재는 것: ① 언제나 204 — 통계가 화면을 막지 않는다 ② 봇·남의 사이트·큰 본문·관리자 화면은 안 적는다
 * ③ 주소의 조회 값·번호, 우리 사이트 referrer 는 지운 채 적는다 ④ 한 IP 가 몰아치면 끊는다
 * ⑤ 번호표(fx_vid)는 동의한 경우에만 — 없으면 새로 심고, 거부했으면 있어도 안 쓴다.
 */
vi.mock("server-only", () => ({}));

const 적은것: Array<Record<string, unknown>> = [];
let 기록이터진다 = false;
vi.mock("../../../../lib/analytics/record", () => ({
  recordPageView: async (view: Record<string, unknown>) => {
    if (기록이터진다) throw new Error("db down");
    적은것.push(view);
  },
  pruneSoon: () => undefined,
}));
let 로그인 = null as string | null;
vi.mock("../../../../lib/analytics/viewer", () => ({ currentUserId: async () => 로그인 }));

const { POST } = await import("../route");

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const ID = "5b1f0c1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f";
let ipSeq = 0;
function 보내기(body: unknown, headers: Record<string, string> = {}) {
  ipSeq += 1;
  return POST(new Request("https://formwith.fix-up.kr/api/track", {
    method: "POST",
    headers: { "user-agent": CHROME, "x-forwarded-for": `198.51.100.${ipSeq}`, "sec-fetch-site": "same-origin", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
}

beforeEach(() => {
  적은것.length = 0;
  기록이터진다 = false;
  로그인 = null;
});

describe("적는다", () => {
  it("첫 화면 — 지운 주소·유입 도메인·utm·기기·로그인 회원", async () => {
    로그인 = "member-1";
    const res = await 보내기({
      path: "/library/3f2c9a1e-1b2c-4d5e-8f90-123456789abc",
      entry: true,
      referrer: "https://www.instagram.com/p/abc?igsh=secret",
      search: "utm_source=Instagram&utm_campaign=launch",
    });
    expect(res.status).toBe(204);
    expect(적은것).toEqual([expect.objectContaining({
      path: "/library/:id", entry: true, referrerHost: "instagram.com", userId: "member-1", cookieId: null,
      utm: { source: "instagram", medium: null, campaign: "launch" }, device: "desktop", browser: "chrome",
      ip: expect.stringMatching(/^198\.51\.100\.\d+$/),
    })]);
  });

  it("화면 이동 — referrer·utm 을 보내도 entry 가 아니면 버린다", async () => {
    await 보내기({ path: "/guide", entry: false, referrer: "https://naver.com/", search: "utm_source=x" });
    expect(적은것[0]).toMatchObject({ path: "/guide", referrerHost: null, utm: { source: null, medium: null, campaign: null } });
  });

  it("우리 사이트에서 온 referrer 는 유입이 아니다", async () => {
    await 보내기({ path: "/", entry: true, referrer: "https://formwith.fix-up.kr/guide" });
    expect(적은것[0]).toMatchObject({ referrerHost: null });
  });

  it("DB 가 터져도 204", async () => {
    기록이터진다 = true;
    expect((await 보내기({ path: "/", entry: true })).status).toBe(204);
  });
});

describe("번호표(fx_vid) — 동의한 경우에만", () => {
  it("동의 안 함(쿠키 없음) — 번호 없음, 쿠키도 안 심는다", async () => {
    const res = await 보내기({ path: "/", entry: true });
    expect(적은것[0]).toMatchObject({ cookieId: null });
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("동의 + 번호 있음 — 그 번호를 쓰고 다시 심지 않는다", async () => {
    const res = await 보내기({ path: "/", entry: false }, { cookie: `fx_consent=1; fx_vid=${ID}` });
    expect(적은것[0]).toMatchObject({ cookieId: ID });
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("동의 + 번호 없음(또는 이상한 값) — 새 번호를 만들어 HttpOnly 로 심는다", async () => {
    for (const cookie of ["fx_consent=1", "fx_consent=1; fx_vid=not-a-uuid"]) {
      적은것.length = 0;
      const res = await 보내기({ path: "/", entry: false }, { cookie });
      const issued = 적은것[0]!.cookieId as string;
      expect(issued).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(res.headers.getSetCookie()).toEqual([`fx_vid=${issued}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly; Secure`]);
    }
  });

  it("거부(fx_consent=0) — 번호가 남아 있어도 쓰지 않는다", async () => {
    await 보내기({ path: "/", entry: false }, { cookie: `fx_consent=0; fx_vid=${ID}` });
    expect(적은것[0]).toMatchObject({ cookieId: null });
  });
});

describe("안 적는다 — 그래도 204", () => {
  it.each([
    ["봇", { path: "/", entry: true }, { "user-agent": "kakaotalk-scrap/1.0" }],
    ["남의 사이트에서 보낸 것", { path: "/", entry: true }, { "sec-fetch-site": "cross-site" }],
    ["관리자 화면", { path: "/admin/system", entry: false }, {}],
    ["API 주소", { path: "/api/track", entry: false }, {}],
    ["/ 로 시작하지 않는 주소", { path: "https://evil.example/", entry: true }, {}],
    ["모르는 칸", { path: "/", entry: true, extra: 1 }, {}],
    ["entry 빠짐", { path: "/" }, {}],
  ])("%s", async (_name, body, headers) => {
    const res = await 보내기(body, headers as Record<string, string>);
    expect(res.status).toBe(204);
    expect(적은것).toEqual([]);
  });

  it("JSON 이 아닌 본문", async () => {
    expect((await 보내기("not json")).status).toBe(204);
    expect(적은것).toEqual([]);
  });

  it("4KB 넘는 본문", async () => {
    expect((await 보내기({ path: `/${"a".repeat(5000)}`, entry: true })).status).toBe(204);
    expect(적은것).toEqual([]);
  });
});

describe("몰아치기", () => {
  it("한 IP 가 1분에 120번을 넘으면 그 뒤는 안 적는다", async () => {
    for (let i = 0; i < 125; i += 1) {
      await POST(new Request("https://formwith.fix-up.kr/api/track", {
        method: "POST",
        headers: { "user-agent": CHROME, "sec-fetch-site": "same-origin", "x-forwarded-for": "192.0.2.250" },
        body: JSON.stringify({ path: "/", entry: false }),
      }));
    }
    expect(적은것).toHaveLength(120);
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `pnpm --filter web exec vitest run lib/analytics/__tests__/rate-limit.test.ts app/api/track/__tests__/route.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 4: 구현**

`apps/web/lib/analytics/rate-limit.ts`:

```ts
/**
 * **한 IP 가 몰아치면 끊는다**(계획 2026-10-06 site-analytics).
 *
 * `/api/track` 은 로그인 없이 열린 자리라 누구나 DB 에 줄을 쌓을 수 있다. 서버가 한 대(EC2)라
 * 프로세스 안 메모리로 충분하다. `windows` Map 은 상태 보관 자리라 바뀐다 — 그 안의 값은 매번 새로 만든다.
 */
export type Window = { startedAt: number; count: number };

export function nextWindow(prev: Window | undefined, now: number, windowMs: number): Window {
  if (!prev || now - prev.startedAt >= windowMs) return { startedAt: now, count: 1 };
  return { ...prev, count: prev.count + 1 };
}

export function createLimiter({ limit, windowMs, maxKeys }: { limit: number; windowMs: number; maxKeys: number }) {
  const windows = new Map<string, Window>();
  return (key: string, now: number = Date.now()): boolean => {
    if (windows.size >= maxKeys) windows.clear();
    const next = nextWindow(windows.get(key), now, windowMs);
    windows.set(key, next);
    return next.count <= limit;
  };
}
```

`apps/web/lib/analytics/record.ts`:

```ts
import "server-only";

import { createSupabaseAdminClient } from "../supabase/admin";
import type { Browser, Device, Utm } from "./normalize";
import { ANALYTICS_KEEP_DAYS } from "./retention";

/**
 * **방문 기록을 DB 에 남기고, 잇고, 잊는다**(계획 2026-10-06 site-analytics).
 *
 * 기록·잇기는 던지지 않는다 — 통계 때문에 화면이 깨지면 안 된다. **잊기(거부)만 성공 여부를 돌려준다** —
 * 철회를 못 지킨 채 「됐다」고 하면 안 된다. 경고는 10분에 한 번, 방문 내용(IP·주소·번호)은 싣지 않는다.
 */
export type PageView = {
  ip: string | null;
  userAgent: string;
  userId: string | null;
  cookieId: string | null;
  path: string;
  referrerHost: string | null;
  utm: Utm;
  device: Device;
  browser: Browser;
  entry: boolean;
};

const WARN_EVERY_MS = 10 * 60_000;
const PRUNE_EVERY_MS = 60 * 60_000;
// 상태 보관 자리 둘. 프로세스 하나에 하나씩.
let lastWarnAt = 0;
let lastPruneAt = 0;

function warn(cause: unknown, now = Date.now()) {
  if (now - lastWarnAt < WARN_EVERY_MS) return;
  lastWarnAt = now;
  console.warn("[analytics] 방문 기록을 다루지 못했습니다", { message: cause instanceof Error ? cause.message : String(cause) });
}

async function call(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await createSupabaseAdminClient().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

export async function recordPageView(view: PageView): Promise<void> {
  try {
    await call("analytics_record", {
      p_ip: view.ip,
      p_ua: view.userAgent,
      p_user: view.userId,
      p_path: view.path,
      p_referrer_host: view.referrerHost,
      p_utm_source: view.utm.source,
      p_utm_medium: view.utm.medium,
      p_utm_campaign: view.utm.campaign,
      p_device: view.device,
      p_browser: view.browser,
      p_entry: view.entry,
      p_cookie: view.cookieId,
    });
  } catch (error) {
    warn(error);
  }
}

/** 동의한 순간, 오늘 같은 방문자의 앞선 줄(첫 화면·유입 경로)에 번호를 잇는다. */
export async function linkCookie({ cookieId, ip, userAgent }: { cookieId: string; ip: string | null; userAgent: string }): Promise<void> {
  try {
    await call("analytics_link_cookie", { p_cookie: cookieId, p_ip: ip, p_ua: userAgent });
  } catch (error) {
    warn(error);
  }
}

/** 거부·철회 — 그 번호를 모든 줄에서 지운다. 실패하면 false(부르는 쪽이 쿠키를 지우지 않고 다시 시도하게 한다). */
export async function forgetCookie(cookieId: string): Promise<boolean> {
  try {
    await call("analytics_forget", { p_cookie: cookieId });
    return true;
  } catch (error) {
    warn(error);
    return false;
  }
}

/** 보유기간이 지난 줄을 지운다. 못 지우면 null — 부르는 쪽은 기다리지 않는다. */
export async function pruneAnalytics(): Promise<number | null> {
  try {
    return Number((await call("analytics_prune", { p_keep_days: ANALYTICS_KEEP_DAYS })) ?? 0);
  } catch (error) {
    warn(error);
    return null;
  }
}

/**
 * 한 시간에 한 번만 지운다. 따로 도는 예약 작업(cron)이 없어서 **방문이 들어올 때** 겸사겸사 한다
 * (관리자 탭을 열 때도 한다 — 2단계).
 */
export function pruneSoon(now: number = Date.now()): void {
  if (now - lastPruneAt < PRUNE_EVERY_MS) return;
  lastPruneAt = now;
  void pruneAnalytics();
}
```

`apps/web/lib/analytics/viewer.ts`:

```ts
import "server-only";

import { isLocalAuthBypass } from "../dev-auth";
import { verifiedLogin } from "../auth/verified-login";
import { createSupabaseServerClient } from "../supabase/server";

/**
 * 지금 요청이 로그인한 회원이면 그 번호, 아니면 null. **막지 않는다** — 손님 방문도 센다.
 * 토큰 서명만 본다(서버 왕복 없음, 설계 2026-09-29 §3.2). 정지·탈퇴 여부는 통계에 상관없다.
 */
export async function currentUserId(): Promise<string | null> {
  if (isLocalAuthBypass) return null;
  try {
    const supabase = await createSupabaseServerClient();
    return (await verifiedLogin(supabase.auth))?.userId ?? null;
  } catch {
    return null;
  }
}
```

`apps/web/app/api/track/route.ts`:

```ts
import { z } from "zod";
import {
  ANALYTICS_COOKIE_DAYS, CONSENT_COOKIE, VISITOR_COOKIE, consentFrom, readCookie, setCookie, validVisitorId,
} from "../../../lib/analytics/consent";
import {
  browserFrom, clientIp, deviceFrom, isBot, isTrackedPath, normalizePath, referrerHost, utmFrom,
} from "../../../lib/analytics/normalize";
import { createLimiter } from "../../../lib/analytics/rate-limit";
import { pruneSoon, recordPageView } from "../../../lib/analytics/record";
import { currentUserId } from "../../../lib/analytics/viewer";
import { publicOrigin } from "../../../lib/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * **방문 한 줄 받기**(계획 2026-10-06 site-analytics).
 *
 * 무슨 일이 있어도 204 다. 화면은 답을 기다리지 않고(sendBeacon), 거절 이유를 알려 줘 봐야
 * 장난치는 쪽만 돕는다. 화면이 보낸 값은 믿지 않고 `normalize.ts` 로 다시 줄인다.
 */
const NO_CONTENT = () => new Response(null, { status: 204 });
const MAX_BODY = 4_096;
const allow = createLimiter({ limit: 120, windowMs: 60_000, maxKeys: 5_000 });

const 방문 = z.object({
  path: z.string().min(1).max(2_000),
  entry: z.boolean(),
  referrer: z.string().max(2_000).optional(),
  search: z.string().max(2_000).optional(),
}).strict();

async function readVisit(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BODY) return null;
  try {
    const parsed = 방문.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** 사람이 우리 화면에서 보낸 것인가. 아니면 조용히 버린다. */
function acceptable(req: Request, userAgent: string, ip: string | null): boolean {
  if (isBot(userAgent)) return false;
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  return allow(ip ?? "unknown");
}

/** 동의한 브라우저의 번호표. 동의했는데 번호가 없거나 모양이 틀리면 새로 만든다 — 그때만 issue. */
function visitorCookie(req: Request): { cookieId: string | null; issue: boolean } {
  const header = req.headers.get("cookie");
  if (consentFrom(readCookie(header, CONSENT_COOKIE)) !== "yes") return { cookieId: null, issue: false };
  const known = validVisitorId(readCookie(header, VISITOR_COOKIE));
  return known ? { cookieId: known, issue: false } : { cookieId: crypto.randomUUID(), issue: true };
}

export async function POST(req: Request) {
  const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 512);
  const ip = clientIp(req.headers);
  if (!acceptable(req, userAgent, ip)) return NO_CONTENT();

  const visit = await readVisit(req);
  const path = visit ? normalizePath(visit.path) : null;
  if (!visit || !path || !isTrackedPath(path)) return NO_CONTENT();

  const origin = new URL(publicOrigin(req.headers, new URL(req.url).origin));
  const { cookieId, issue } = visitorCookie(req);
  await recordPageView({
    ip,
    userAgent,
    userId: await currentUserId(),
    cookieId,
    path,
    referrerHost: visit.entry ? referrerHost(visit.referrer, origin.host) : null,
    utm: utmFrom(visit.entry ? visit.search ?? "" : ""),
    device: deviceFrom(userAgent),
    browser: browserFrom(userAgent),
    entry: visit.entry,
  });
  pruneSoon();

  const response = NO_CONTENT();
  if (issue && cookieId) {
    response.headers.append("set-cookie", setCookie(VISITOR_COOKIE, cookieId, {
      secure: origin.protocol === "https:", httpOnly: true, days: ANALYTICS_COOKIE_DAYS,
    }));
  }
  return response;
}
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm --filter web exec vitest run lib/analytics app/api/track/__tests__/route.test.ts` → 전부 PASS.

- [ ] **Step 6: 커밋**

```bash
git add apps/web/lib/analytics apps/web/app/api/track/route.ts apps/web/app/api/track/__tests__/route.test.ts
git commit -m "feat(analytics): 방문 한 줄을 받는 /api/track

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 동의·거부 받는 자리 `/api/track/consent`

**Files:**
- Create: `apps/web/app/api/track/consent/route.ts`
- Test: `apps/web/app/api/track/__tests__/consent-route.test.ts`

**Interfaces:**
- Consumes: Task 3 `consent.ts`, Task 2 `clientIp`, Task 4 `linkCookie`·`forgetCookie`
- Produces: `POST /api/track/consent` — 본문 `{ consent: boolean }`.
  - 동의: 204 + `fx_consent=1`(HttpOnly 아님) + (번호가 없으면) `fx_vid=<새 UUID>`(HttpOnly). 오늘 앞선 기록에 번호를 잇는다.
  - 거부: 번호가 있으면 먼저 DB 에서 잊는다. 성공 → 204 + `fx_consent=0` + `fx_vid` 지움. **실패 → 503, 쿠키 그대로.**
  - 남의 사이트에서 온 요청 403, 이상한 본문 400.

- [ ] **Step 1: 실패하는 시험**

`apps/web/app/api/track/__tests__/consent-route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **방문 통계 쿠키 동의·거부**(계획 2026-10-06 site-analytics).
 * 재는 것: 동의하면 번호를 심고 오늘 앞선 기록에 잇는다 / 거부하면 DB 에서 먼저 잊고 쿠키를 지운다 /
 * 잊기가 실패하면 쿠키를 그대로 두고 503 — 철회를 못 지킨 채 「됐다」고 하지 않는다.
 */
vi.mock("server-only", () => ({}));

const 이은것: Array<Record<string, unknown>> = [];
const 잊은것: string[] = [];
let 잊기된다 = true;
vi.mock("../../../../lib/analytics/record", () => ({
  linkCookie: async (input: Record<string, unknown>) => { 이은것.push(input); },
  forgetCookie: async (id: string) => { 잊은것.push(id); return 잊기된다; },
}));

const { POST } = await import("../consent/route");

const ID = "5b1f0c1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0 Safari/537.36";
const 누르기 = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request("https://formwith.fix-up.kr/api/track/consent", {
    method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", "user-agent": UA, "x-forwarded-for": "203.0.113.7", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));

beforeEach(() => {
  이은것.length = 0;
  잊은것.length = 0;
  잊기된다 = true;
});

describe("동의", () => {
  it("번호가 없으면 새로 심고, 같은 IP·브라우저의 오늘 기록에 잇는다", async () => {
    const res = await 누르기({ consent: true });
    expect(res.status).toBe(204);
    const cookies = res.headers.getSetCookie();
    expect(cookies[0]).toBe("fx_consent=1; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
    const issued = cookies[1]!.match(/^fx_vid=([0-9a-f-]{36}); Path=\/; Max-Age=31536000; SameSite=Lax; HttpOnly; Secure$/)?.[1];
    expect(issued).toBeTruthy();
    expect(이은것).toEqual([{ cookieId: issued, ip: "203.0.113.7", userAgent: UA }]);
  });

  it("이미 번호가 있으면 다시 심지 않고 그 번호로 잇는다", async () => {
    const res = await 누르기({ consent: true }, { cookie: `fx_vid=${ID}` });
    expect(res.headers.getSetCookie()).toEqual(["fx_consent=1; Path=/; Max-Age=31536000; SameSite=Lax; Secure"]);
    expect(이은것[0]).toMatchObject({ cookieId: ID });
  });
});

describe("거부·철회", () => {
  it("DB 에서 먼저 잊고, 쿠키를 지운다", async () => {
    const res = await 누르기({ consent: false }, { cookie: `fx_consent=1; fx_vid=${ID}` });
    expect(res.status).toBe(204);
    expect(잊은것).toEqual([ID]);
    expect(res.headers.getSetCookie()).toEqual([
      "fx_consent=0; Path=/; Max-Age=31536000; SameSite=Lax; Secure",
      "fx_vid=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly; Secure",
    ]);
  });

  it("번호가 없으면 잊을 것도 없다 — 거부만 기억한다", async () => {
    const res = await 누르기({ consent: false });
    expect(res.status).toBe(204);
    expect(잊은것).toEqual([]);
  });

  it("잊기가 실패하면 503, 쿠키는 그대로", async () => {
    잊기된다 = false;
    const res = await 누르기({ consent: false }, { cookie: `fx_consent=1; fx_vid=${ID}` });
    expect(res.status).toBe(503);
    expect(res.headers.getSetCookie()).toEqual([]);
  });
});

describe("거절", () => {
  it("남의 사이트에서 보낸 것은 403, 아무것도 안 한다", async () => {
    const res = await 누르기({ consent: true }, { "sec-fetch-site": "cross-site" });
    expect(res.status).toBe(403);
    expect(이은것).toEqual([]);
    expect(res.headers.getSetCookie()).toEqual([]);
  });
  it.each([["JSON 아님", "nope"], ["모르는 칸", { consent: true, extra: 1 }], ["값이 참거짓 아님", { consent: "yes" }]])(
    "%s → 400", async (_name, body) => expect((await 누르기(body)).status).toBe(400),
  );
});
```

Run: `pnpm --filter web exec vitest run app/api/track/__tests__/consent-route.test.ts` → FAIL(모듈 없음).

- [ ] **Step 2: 구현**

`apps/web/app/api/track/consent/route.ts`:

```ts
import { z } from "zod";
import {
  ANALYTICS_COOKIE_DAYS, CONSENT_COOKIE, VISITOR_COOKIE, clearCookie, readCookie, setCookie, validVisitorId,
} from "../../../../lib/analytics/consent";
import { clientIp } from "../../../../lib/analytics/normalize";
import { forgetCookie, linkCookie } from "../../../../lib/analytics/record";
import { publicOrigin } from "../../../../lib/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * **방문 통계 쿠키 동의·거부**(계획 2026-10-06 site-analytics, 섞어 쓰기).
 *
 * 동의 띠와 「방문 통계 설정」이 부른다. 거부는 **DB 에서 먼저 잊고** 쿠키를 지운다 — 거꾸로 하면
 * 잊기가 실패했을 때 번호를 잃어 다시는 지울 수 없다.
 */
const 선택 = z.object({ consent: z.boolean() }).strict();

async function readChoice(req: Request): Promise<boolean | null> {
  try {
    const parsed = 선택.safeParse(await req.json());
    return parsed.success ? parsed.data.consent : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return new Response(null, { status: 403 });
  const consent = await readChoice(req);
  if (consent === null) return new Response(null, { status: 400 });

  const secure = new URL(publicOrigin(req.headers, new URL(req.url).origin)).protocol === "https:";
  const existing = validVisitorId(readCookie(req.headers.get("cookie"), VISITOR_COOKIE));
  return consent ? agree(req, existing, secure) : refuse(existing, secure);
}

async function agree(req: Request, existing: string | null, secure: boolean): Promise<Response> {
  const cookieId = existing ?? crypto.randomUUID();
  // /api/track 과 같은 값으로 잇는다 — 하루 방문자 값이 IP·브라우저 정보로 만들어진다.
  await linkCookie({ cookieId, ip: clientIp(req.headers), userAgent: (req.headers.get("user-agent") ?? "").slice(0, 512) });
  const response = new Response(null, { status: 204 });
  response.headers.append("set-cookie", setCookie(CONSENT_COOKIE, "1", { secure, httpOnly: false, days: ANALYTICS_COOKIE_DAYS }));
  if (!existing) {
    response.headers.append("set-cookie", setCookie(VISITOR_COOKIE, cookieId, { secure, httpOnly: true, days: ANALYTICS_COOKIE_DAYS }));
  }
  return response;
}

async function refuse(existing: string | null, secure: boolean): Promise<Response> {
  if (existing && !(await forgetCookie(existing))) {
    return Response.json({ ok: false, message: "잠시 뒤 다시 눌러 주세요." }, { status: 503 });
  }
  const response = new Response(null, { status: 204 });
  response.headers.append("set-cookie", setCookie(CONSENT_COOKIE, "0", { secure, httpOnly: false, days: ANALYTICS_COOKIE_DAYS }));
  response.headers.append("set-cookie", clearCookie(VISITOR_COOKIE, secure));
  return response;
}
```

- [ ] **Step 3: 통과 확인 후 커밋**

Run: `pnpm --filter web exec vitest run app/api/track` → 전부 PASS.

```bash
git add apps/web/app/api/track/consent apps/web/app/api/track/__tests__/consent-route.test.ts
git commit -m "feat(analytics): 방문 통계 쿠키 동의·거부를 받는 자리

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 화면 — 보내기, 동의 띠, 설정 단추

**Files:**
- Create: `apps/web/app/_components/page-view-tracker.tsx`
- Create: `apps/web/app/_components/consent-banner.tsx`
- Modify: `apps/web/app/layout.tsx` (import 두 줄 + `<PageViewTracker />`·`<ConsentBanner />`)
- Modify: `apps/web/app/_landing/legal/LegalLinks.tsx` (법률 링크 옆에 설정 단추 한 줄 + import)
- Modify: `apps/web/app/settings/page.tsx` (`LoginCard` 아래 카드 하나 + import)
- Test: `apps/web/app/_components/__tests__/page-view-tracker.test.tsx`
- Test: `apps/web/app/_components/__tests__/consent-banner.test.tsx`

**Interfaces:**
- Consumes: `isTrackedPath`, `utmOnly` (Task 2), `CONSENT_COOKIE`·`consentFrom`·`readCookie` (Task 3), `POST /api/track`, `POST /api/track/consent`
- Produces: `PageViewTracker(): null`, `ConsentBanner(): JSX.Element | null`, `ConsentSettingsButton({ outlined }: { outlined?: boolean })`, `OPEN_CONSENT_EVENT = "fx:open-consent"`

> 화면 작업이다. 시작 전에 `frontend-design` 스킬을 읽는다. 단추는 `@fixup/ui` 의 `Button`(shadcn 기반)을 쓴다. 휴대폰 폭(390px)에서 띠가 화면 아래를 가로로 채우고, 컴퓨터에서는 오른쪽 아래 작은 카드가 된다.

- [ ] **Step 1: 보내기 시험**

`apps/web/app/_components/__tests__/page-view-tracker.test.tsx`:

```tsx
import React from "react";
import { act, create } from "react-test-renderer";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **화면이 바뀔 때마다 한 줄 보낸다**(계획 2026-10-06 site-analytics).
 * 첫 화면만 referrer·utm 을 싣고, 관리자 화면은 안 보내며, 쿠키·저장소를 직접 만지지 않는다
 * (동의한 번호표는 브라우저가 알아서 같이 보낸다).
 *
 * 이 저장소에는 jsdom 이 없다. 다른 화면 시험(`app/create/__tests__/draft-ui.test.tsx`)처럼
 * 브라우저 전역값을 `vi.stubGlobal` 로 흉내 낸다.
 */
let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
const { PageViewTracker } = await import("../page-view-tracker");

const sent: Array<Record<string, unknown>> = [];
beforeEach(() => {
  sent.length = 0;
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("document", { referrer: "https://www.instagram.com/" });
  vi.stubGlobal("window", { location: { search: "?utm_source=insta&token_hash=secret" } });
  vi.stubGlobal("navigator", {
    sendBeacon: (_url: string, blob: Blob) => {
      void blob.text().then((text) => sent.push(JSON.parse(text)));
      return true;
    },
  });
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("PageViewTracker", () => {
  it("첫 화면은 referrer 와 utm 만 싣고, 다음 화면은 주소만", async () => {
    pathname = "/";
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<PageViewTracker />); });
    pathname = "/guide";
    await act(async () => { tree.update(<PageViewTracker />); });
    await flush();
    expect(sent).toEqual([
      { path: "/", entry: true, referrer: "https://www.instagram.com/", search: "utm_source=insta" },
      { path: "/guide", entry: false },
    ]);
  });

  it("관리자 화면은 안 보낸다 — 그 뒤 첫 일반 화면도 entry 가 아니다", async () => {
    pathname = "/admin";
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<PageViewTracker />); });
    pathname = "/library";
    await act(async () => { tree.update(<PageViewTracker />); });
    await flush();
    expect(sent).toEqual([{ path: "/library", entry: false }]);
  });

  it("쿠키·브라우저 저장소를 직접 만지지 않는다(처리방침 제11조)", () => {
    const source = readFileSync(new URL("../page-view-tracker.tsx", import.meta.url), "utf8");
    for (const 저장 of ["document.cookie", "localStorage", "sessionStorage", "indexedDB"]) {
      expect(source).not.toContain(저장);
    }
  });
});
```

(새 패키지를 넣지 않는다 — jsdom 없이 위처럼 전역값을 흉내 낸다.)

- [ ] **Step 2: 동의 띠 시험**

`apps/web/app/_components/__tests__/consent-banner.test.tsx`:

```tsx
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **방문 통계 쿠키 동의 띠**(계획 2026-10-06 site-analytics).
 * 정한 적 없으면 뜬다 / 정했으면 안 뜬다 / 두 단추는 같은 모양 / 실패하면 남아서 다시 누르게 한다 /
 * 「방문 통계 설정」으로 다시 연다.
 *
 * jsdom 없이 전역값을 흉내 낸다. `document.cookie` 는 평범한 문자열, `window` 는 Node 의 EventTarget
 * (다시 열기 신호를 실제로 주고받는다).
 */
const fetchMock = vi.fn();
const fakeDocument = { cookie: "" };
const fakeWindow = new EventTarget();
vi.stubGlobal("React", React);
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
vi.stubGlobal("fetch", fetchMock);
vi.stubGlobal("document", fakeDocument);
vi.stubGlobal("window", fakeWindow);
const { ConsentBanner, ConsentSettingsButton } = await import("../consent-banner");

const buttons = (tree: ReactTestRenderer) => tree.root.findAllByType("button");
const button = (tree: ReactTestRenderer, label: string) => buttons(tree).find((b) => b.children.includes(label))!;
// onClick 은 기다릴 수 없는 비동기(`void choose(…)`)라, 누른 뒤 한 박자 쉬어 fetch·상태 변경을 끝낸다.
const click = (tree: ReactTestRenderer, label: string) =>
  act(async () => {
    button(tree, label).props.onClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
const mount = async () => {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<ConsentBanner />); });
  return tree;
};

beforeEach(() => {
  fakeDocument.cookie = "";
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 204 });
});

describe("ConsentBanner", () => {
  it("정한 적 없으면 뜨고, 동의를 누르면 보내고 닫힌다", async () => {
    const tree = await mount();
    expect(JSON.stringify(tree.toJSON())).toContain("거부해도 모든 기능");
    await click(tree, "동의");
    expect(fetchMock).toHaveBeenCalledWith("/api/track/consent", expect.objectContaining({ method: "POST", body: JSON.stringify({ consent: true }) }));
    expect(tree.toJSON()).toBeNull();
  });

  it("거부도 같은 모양의 단추다", async () => {
    const tree = await mount();
    expect(button(tree, "거부").props.className).toBe(button(tree, "동의").props.className);
  });

  it("이미 정했으면 안 뜬다", async () => {
    fakeDocument.cookie = "fx_consent=0";
    expect((await mount()).toJSON()).toBeNull();
  });

  it("저장에 실패하면 남아서 다시 누르게 한다", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    const tree = await mount();
    await click(tree, "거부");
    expect(JSON.stringify(tree.toJSON())).toContain("저장하지 못했습니다");
  });

  it("「방문 통계 설정」을 누르면 다시 뜬다", async () => {
    fakeDocument.cookie = "fx_consent=1";
    let tree!: ReactTestRenderer;
    await act(async () => { tree = create(<><ConsentBanner /><ConsentSettingsButton /></>); });
    expect(buttons(tree)).toHaveLength(1);
    await click(tree, "방문 통계 설정");
    expect(JSON.stringify(tree.toJSON())).toContain("거부해도 모든 기능");
  });
});
```

Run: `pnpm --filter web exec vitest run app/_components/__tests__/page-view-tracker.test.tsx app/_components/__tests__/consent-banner.test.tsx` → FAIL(모듈 없음).

- [ ] **Step 3: 구현**

`apps/web/app/_components/page-view-tracker.tsx`:

```tsx
"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { isTrackedPath, utmOnly } from "../../lib/analytics/normalize";

/**
 * **방문 통계 보내기**(계획 2026-10-06 site-analytics).
 *
 * 화면이 바뀔 때마다 `/api/track` 으로 한 줄. 이 탭의 첫 화면만 「어디서 왔나」(referrer)와 광고
 * 꼬리표(utm 셋만)를 싣는다 — 그 뒤 화면 이동의 referrer 는 늘 첫 값 그대로라 뜻이 없다.
 *
 * 쿠키·브라우저 저장소를 직접 만지지 않는다(시험이 본다). 동의한 브라우저의 번호표(fx_vid)는
 * 같은 사이트 요청이라 브라우저가 알아서 같이 보낸다. 실패해도 아무 일 없다.
 */
export function PageViewTracker() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (!pathname) return;
    const entry = first.current;
    first.current = false;
    if (!isTrackedPath(pathname)) return;
    const body = entry
      ? { path: pathname, entry, referrer: document.referrer, search: utmOnly(window.location.search) }
      : { path: pathname, entry };
    send(JSON.stringify(body));
  }, [pathname]);

  return null;
}

function send(body: string) {
  try {
    if (navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }))) return;
    void fetch("/api/track", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => undefined);
  } catch {
    // 통계 때문에 화면을 깨지 않는다.
  }
}
```

`apps/web/app/_components/consent-banner.tsx`:

```tsx
"use client";

import { Button, buttonVariants } from "@fixup/ui";
import { useEffect, useState } from "react";
import { CONSENT_COOKIE, consentFrom, readCookie } from "../../lib/analytics/consent";

/**
 * **방문 통계 쿠키 동의 띠**(계획 2026-10-06 site-analytics, 섞어 쓰기).
 *
 * 정한 적이 없으면 뜬다. 「동의」와 「거부」는 **같은 모양**이다 — 한쪽만 눈에 띄게 하지 않는다.
 * 거부해도 모든 기능을 쓸 수 있다. 「방문 통계 설정」(첫 화면 아래·「계정」 화면)으로 다시 연다.
 * 저장에 실패하면 닫지 않는다 — 거부가 저장되지 않았는데 닫히면 거부한 줄 안다.
 */
export const OPEN_CONSENT_EVENT = "fx:open-consent";

export function ConsentBanner() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (consentFrom(readCookie(document.cookie, CONSENT_COOKIE)) === "unset") setOpen(true);
    const reopen = () => {
      setFailed(false);
      setOpen(true);
    };
    window.addEventListener(OPEN_CONSENT_EVENT, reopen);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, reopen);
  }, []);

  async function choose(consent: boolean) {
    setBusy(true);
    try {
      const response = await fetch("/api/track/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consent }),
      });
      if (!response.ok) throw new Error(String(response.status));
      setFailed(false);
      setOpen(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-label="방문 통계 쿠키"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background p-4 shadow-lg sm:inset-x-auto sm:bottom-4 sm:right-4 sm:max-w-sm sm:rounded-lg sm:border"
    >
      <p className="text-sm font-medium">방문 통계 쿠키</p>
      <p className="mt-1 text-sm text-muted-foreground">
        서비스를 고치는 데 쓰려고, 이 브라우저가 다시 방문했는지 알아보는 쿠키(fx_vid)를 저장해도 될까요?
        거부해도 모든 기능을 그대로 쓸 수 있습니다. 자세한 내용은 개인정보 처리방침 제11조에 있습니다.
      </p>
      {failed ? <p className="mt-2 text-sm text-destructive">저장하지 못했습니다. 잠시 뒤 다시 눌러 주세요.</p> : null}
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => void choose(false)}>거부</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void choose(true)}>동의</Button>
      </div>
    </div>
  );
}

/**
 * 동의 띠를 다시 연다. `outlined` 는 「계정」 화면용 단추 모양 — 서버 컴포넌트가 단추 모양 함수를
 * 직접 부르지 않게 여기서 고른다. 기본은 둘러싼 자리(첫 화면 아래 법률 링크)의 모양을 따른다.
 */
export function ConsentSettingsButton({ outlined = false }: { outlined?: boolean }) {
  return (
    <button
      type="button"
      className={outlined ? buttonVariants({ variant: "outline" }) : undefined}
      onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}
    >
      방문 통계 설정
    </button>
  );
}
```

`apps/web/app/layout.tsx` — 기존 `ImageViewerHost` import 바로 아래:

```tsx
import { PageViewTracker } from "./_components/page-view-tracker";
import { ConsentBanner } from "./_components/consent-banner";
```

`<body>` 안:

```tsx
      <body>
        <PageViewTracker />
        <ThemeProvider>
          {children}
          {/* 어느 화면에서 눌러도 같은 창이 뜨도록 한 곳에만 둔다. */}
          <ImageViewerHost />
          <Toaster />
          <ConsentBanner />
        </ThemeProvider>
      </body>
```

`apps/web/app/_landing/legal/LegalLinks.tsx` — import 추가:

```tsx
import { ConsentSettingsButton } from "../../_components/consent-banner";
```

`<span className="mcs-legal-links">` 안, `LEGAL_DOCS.map(...)` 바로 뒤:

```tsx
        <ConsentSettingsButton />
```

`apps/web/app/settings/page.tsx` — import 한 줄 추가(`Card` 등은 이미 import 되어 있다):

```tsx
import { ConsentSettingsButton } from "../_components/consent-banner";
```

`<LoginCard … />` 줄 바로 아래:

```tsx
          <Card>
            <CardHeader>
              <CardTitle>방문 통계 쿠키</CardTitle>
              <CardDescription>
                다시 방문했는지 알아보는 쿠키(fx_vid)에 동의할지 바꿉니다. 거부하면 번호를 지우고, 그 번호로 남은 방문 기록에서도 지웁니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConsentSettingsButton outlined />
            </CardContent>
          </Card>
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter web exec vitest run app/_components app/settings app/_landing` → 전부 PASS(기존 시험 포함).

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/_components/page-view-tracker.tsx apps/web/app/_components/consent-banner.tsx apps/web/app/_components/__tests__/page-view-tracker.test.tsx apps/web/app/_components/__tests__/consent-banner.test.tsx apps/web/app/layout.tsx apps/web/app/_landing/legal/LegalLinks.tsx apps/web/app/settings/page.tsx
git commit -m "feat(analytics): 방문 한 줄 보내기와 쿠키 동의 띠

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 개인정보 처리방침에 적는다

**Files:**
- Modify: `apps/web/app/_landing/legal/documents.ts` (`PRIVACY_DOC.body` 문자열 여섯 군데)
- Modify: `apps/web/app/_landing/legal/__tests__/launch-ready.test.ts` (기존 시험 둘 수정 + 시험 하나 추가)

**Interfaces:**
- Consumes: `ANALYTICS_KEEP_DAYS` (Task 2), `CONSENT_COOKIE`·`VISITOR_COOKIE`·`ANALYTICS_COOKIE_DAYS` (Task 3), `page-view-tracker.tsx` (Task 6)

> 문서는 코드에 맞춘다(메모리 「약관은 코드에 맞춘다」). **기존 약속 「방문 분석·광고 목적의 쿠키를 사용하지 않습니다」가 바뀐다** — 그 문장을 지키던 시험도 새 약속에 맞게 고친다(외부 분석 도구 패키지 금지는 그대로). **시행일은 사용자 결정 ①** — 아래 `{배포일}` 은 이 단계에서 `date '+%Y년 %-m월 %-d일'` 출력으로 바꿔 적고, 실제 배포가 다른 날이면 배포 직전에 다시 고친다. `{배포일}` 글자가 남은 채로 커밋하지 않는다.

- [ ] **Step 1: 실패하는 시험**

`launch-ready.test.ts` 맨 위 import 들 옆에:

```ts
import { ANALYTICS_KEEP_DAYS } from "../../../../lib/analytics/retention";
import { ANALYTICS_COOKIE_DAYS, CONSENT_COOKIE, VISITOR_COOKIE } from "../../../../lib/analytics/consent";
```

「쿠키」 describe 의 「코드가 심는 쿠키를 모두 적는다」 반복 목록에 둘을 더한다:

```ts
    for (const 이름 of ["sb-", SESSION_START_COOKIE, 프로젝트쿠키, CONSENT_COOKIE, VISITOR_COOKIE]) {
```

「분석·광고 쿠키를 안 쓴다고 적고, 실제로 그런 도구가 없다」 시험을 이렇게 바꾼다(제목·첫 기대값만, 패키지 검사는 그대로):

```ts
  /** 광고 쿠키를 안 쓰고 외부 분석 도구도 없다. 방문 분석 쿠키는 우리 것(fx_vid) 하나, 동의한 경우에만. */
  it("광고 쿠키를 안 쓴다고 적고, 외부 분석·광고 도구가 없다", () => {
    expect(방침).toContain("광고 목적의 쿠키를 사용하지 않습니다");
    expect(방침).toContain("동의한 경우에만 저장");
```

그 시험 바로 뒤에 추가:

```ts
  /** 방문 통계를 적었으면, 적은 대로 동작해야 한다(계획 2026-10-06 site-analytics). */
  it("방문 통계의 보유기간·쿠키 기간·저장하지 않는 것이 코드와 같다", () => {
    expect(방침).toContain("| 서비스 이용 통계 |");
    expect(방침).toContain(`수집일부터 ${ANALYTICS_KEEP_DAYS}일`);
    expect(방침).toContain(`| ${VISITOR_COOKIE} (쿠키) |`);
    expect(방침).toContain(`| ${CONSENT_COOKIE} (쿠키) |`);
    expect(방침).toContain(`${ANALYTICS_COOKIE_DAYS}일`);
    expect(방침).toContain("「방문 통계 설정」");

    const 보내기 = read(web, "app", "_components", "page-view-tracker.tsx");
    for (const 저장 of ["document.cookie", "localStorage", "sessionStorage", "indexedDB"]) {
      expect(보내기, `방문 통계 보내기가 ${저장} 를 쓴다 — 처리방침 제11조를 고친다`).not.toContain(저장);
    }
    const 띠 = read(web, "app", "_components", "consent-banner.tsx");
    expect(띠, "동의 띠의 안내 문구가 처리방침과 다르다").toContain("거부해도 모든 기능을 그대로 쓸 수 있습니다");
  });
```

Run: `pnpm --filter web exec vitest run app/_landing/legal` → FAIL.

- [ ] **Step 2: 처리방침 문구를 고친다**

`documents.ts` 의 `PRIVACY_DOC.body` 안에서 여섯 군데를 바꾼다. (한 줄짜리 긴 문자열이다 — Edit 로 정확히 바꾼다. `\n` 은 소스에 적힌 그대로의 두 글자다.)

(a) 시행일:
- 찾기: `시행일: 2026년 10월 2일\n\n## 1. 개인정보의 처리 목적·항목·보유기간`
- 바꾸기: `시행일: {배포일}\n\n## 1. 개인정보의 처리 목적·항목·보유기간`

(b) 제1조 표 마지막 줄(「보안·오류 대응」) 뒤에 한 줄:
- 찾기: `서버 저장 공간 한도 안에서 오래된 것부터 자동 삭제 |\n\n회원가입과 서비스 제공에 필요한`
- 바꾸기: `서버 저장 공간 한도 안에서 오래된 것부터 자동 삭제 |\n| 서비스 이용 통계 | 방문자 수, 들어온 경로, 다시 방문하는지, 많이 쓰는 화면과 기능을 파악하여 서비스를 개선 | 방문한 화면의 주소(주소 뒤에 붙는 조회 값과 개별 작업 번호는 지우고 저장), 들어오기 직전 사이트의 도메인 이름, 광고 링크의 꼬리표(utm_source·utm_medium·utm_campaign), 기기 종류(휴대폰·태블릿·컴퓨터)와 브라우저 종류, 접속 일시, 회원 식별번호(로그인한 경우). IP 주소와 브라우저 정보는 저장하지 않고, 날마다 새로 만드는 무작위 값과 섞어 되돌릴 수 없게 바꾼 값만 저장하며, 그 무작위 값은 다음 날 지웁니다. 방문 통계 쿠키(fx_vid)에 동의한 경우에만 그 쿠키의 번호도 되돌릴 수 없게 바꾸어 함께 저장합니다 | 수집일부터 365일. 지나면 자동 삭제. 방문 통계 쿠키를 거부하면 그 번호는 바로 삭제 |\n\n회원가입과 서비스 제공에 필요한`

(c) 처리 근거:
- 찾기: `연락처(선택)는 같은 항 제1호에 따라 동의를 받아 처리하며, 동의하지 않아도 가입과 서비스 이용에 제한이 없습니다.`
- 바꾸기: `연락처(선택)는 같은 항 제1호에 따라 동의를 받아 처리하며, 동의하지 않아도 가입과 서비스 이용에 제한이 없습니다. 방문 통계 쿠키(fx_vid)도 같은 항 제1호에 따라 동의를 받은 경우에만 처리하며, 동의하지 않아도 서비스 이용에 제한이 없습니다.`

(d) 제11조 첫 문장:
- 찾기: `회사는 서비스 제공에 필요한 다음 저장 기능만 사용합니다.`
- 바꾸기: `회사는 다음 저장 기능을 사용합니다. 이 가운데 fx_vid 는 이용자가 동의한 경우에만 저장합니다.`

(e) 제11조 표에 두 줄(`mcs_project` 줄 뒤):
- 찾기: `| mcs_project (쿠키) | 마지막으로 연 프로젝트 기억 | 30일 |\n`
- 바꾸기: `| mcs_project (쿠키) | 마지막으로 연 프로젝트 기억 | 30일 |\n| fx_consent (쿠키) | 방문 통계 쿠키에 동의했는지 거부했는지 기억 | 365일 |\n| fx_vid (쿠키) | 방문 통계에 동의한 경우에만 저장. 같은 브라우저가 다시 방문했는지 알아보는 무작위 번호 | 365일. 「방문 통계 설정」에서 거부하면 바로 삭제 |\n`

(f) 제11조 끝 문장:
- 찾기: `회사는 방문 분석·광고 목적의 쿠키를 사용하지 않습니다.`
- 바꾸기: `회사는 광고 목적의 쿠키를 사용하지 않습니다. 방문 분석 쿠키(fx_vid)는 처음 방문할 때 화면 아래 안내에서 동의한 경우에만 저장하며, 첫 화면 아래 또는 「계정」 화면의 「방문 통계 설정」에서 언제든 거부로 바꿀 수 있습니다. 거부하면 저장된 번호를 지우고, 그 번호로 남은 방문 기록에서도 번호를 지웁니다. 동의하지 않아도 제1조의 「서비스 이용 통계」는 쿠키나 브라우저 저장소 없이 하루 단위로만 처리합니다.`

(g) 제13조:
- 찾기: `- 공고일: 2026년 10월 2일\n- 시행일: 2026년 10월 2일\n- 변경 내용: 간편가입(Google·카카오)으로 받는 항목과 만 14세 확인 자리, 연락처(선택) 항목을 추가함. 국외 이전 표의 Supabase 이전 국가를 실제 저장 위치인 일본(도쿄)로 바로잡음\n- 이전 처리방침: 2026년 10월 1일·9월 29일 시행본 등`
- 바꾸기: `- 공고일: {배포일}\n- 시행일: {배포일}\n- 변경 내용: 「서비스 이용 통계」 항목과 방문 통계 쿠키(fx_consent·fx_vid, 동의한 경우에만)를 추가함\n- 이전 처리방침: 2026년 10월 2일·10월 1일·9월 29일 시행본 등`

(찾기 문자열이 master 의 현재 본문과 한 글자라도 다르면 멈추고 현재 본문을 읽은 뒤 같은 뜻으로 맞춘다. 다른 터미널이 처리방침을 고쳤을 수 있다.)

- [ ] **Step 3: 통과 확인 — 법률 문서 시험 전체**

Run: `pnpm --filter web exec vitest run app/_landing/legal` → 전부 PASS. 날짜 관련 다른 시험(시행일 형식 등)이 깨지면 그 시험이 요구하는 형식에 맞춘다(그 시험은 고치지 않는다).

- [ ] **Step 4: git 밖 사본 맞추기(사람 몫)**

`frontend/법률문서/` 의 처리방침 txt 를 같은 문구로 옮긴다(`documents.ts` 머리말: 그 폴더는 git 밖이라 시험이 못 본다). 옮겼다고 사용자에게 보고한다.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/_landing/legal/documents.ts apps/web/app/_landing/legal/__tests__/launch-ready.test.ts
git commit -m "docs(legal): 처리방침에 서비스 이용 통계와 방문 통계 쿠키를 적는다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 1단계 검증·리뷰·배포

- [ ] **Step 1: CI 전체를 로컬에서**(메모리 「PR 전 CI 전체를 로컬에서」)

```bash
pnpm -r typecheck
pnpm test
TEST_PG_BIN="C:/Program Files/PostgreSQL/17/bin" pnpm test:credit-db
TEST_PG_BIN="C:/Program Files/PostgreSQL/17/bin" pnpm test:readiness-fixes
```

Expected: 전부 실패 0. 숫자를 그대로 보고한다.

- [ ] **Step 2: 독립 리뷰 둘을 나란히** — `code-reviewer`, `security-reviewer`(공개 API 둘·쿠키·개인정보). 지적 반영 뒤 VCS diff 로 확인.

- [ ] **Step 3: 뮤테이션 확인** — 아래를 하나씩 되돌려 시험이 **실패하는지** 본 뒤 원복한다.
  - `normalizePath` 의 `split(/[?#]/)` 를 지운다 → normalize·route 시험 실패해야 함
  - SQL 의 `delete from analytics_salts where day < v_day;` 를 지운다 → 「drops the old salt」 실패해야 함
  - SQL `analytics_forget` 의 `update …` 를 `return 0;` 으로 → 「refusing forgets」 실패해야 함
  - 동의 API `refuse` 에서 `forgetCookie` 실패 검사를 지운다 → 「잊기가 실패하면 503」 실패해야 함
  - `/api/track` `visitorCookie` 의 동의 검사(`!== "yes"`)를 지운다 → 「거부 — 번호가 남아 있어도」 실패해야 함
  - 동의 띠의 「거부」 단추 `variant` 를 `default` 로 → 「같은 모양」 실패해야 함

- [ ] **Step 4: PR** — `git diff origin/master...HEAD` 전체를 읽고 PR 본문에 시험 계획 포함, `git push -u origin feat/site-analytics`.

- [ ] **Step 5: 배포**(사용자가 「배포해 주세요」라고 할 때만, `docs/DEPLOY.md` 「매 배포」를 열어서)
  1. **사용자가** Supabase SQL 편집기에서 `202610060001_site_analytics.sql` 실행 → 「방문 통계 표 둘과 함수 여섯을 만들었습니다」 확인
  2. 앱 배포(문서 절차 그대로)
  3. 확인: 서비스 active, 로컬 200, `current` 가 새 릴리스, 빌드 안에 `서비스 이용 통계`·`방문 통계 설정` 문구 존재
  4. 운영 확인(사용자와 함께): 휴대폰 시크릿 창으로 첫 화면 → 동의 띠가 뜨는지 → 「동의」 → SQL 편집기에서
     `select path, entry, cookie_key is not null as linked, created_at from analytics_page_views order by id desc limit 5;`
     → 첫 화면 줄까지 `linked = true` 인지, IP 가 없는지 본다. 「방문 통계 설정」 → 「거부」 → 같은 쿼리에서 `linked` 가 모두 false 로 바뀌는지 본다.

---

# 2단계 — 보기

> 1단계 배포 뒤 시작한다. 시작 전 이 문서와 1단계에서 실제로 병합된 코드를 다시 읽는다.

### Task 9: 보고 함수 둘

**Files:**
- Create: `supabase/migrations/202610060002_site_analytics_report.sql`
- Create: `scripts/tests/site-analytics-report.test.mjs`
- Modify: `apps/web/lib/analytics/__tests__/site-analytics-migration.test.ts` (두 번째 파일 시험 추가)
- Modify: `package.json` (`test:credit-db` 끝에 ` scripts/tests/site-analytics-report.test.mjs`)

**Interfaces:**
- Consumes: `analytics_page_views`(Task 1), 기존 `profiles(id,email,display_name,role,created_at,signup_provider,referrer_input)`, 기존 `ai_cost_events(user_id,operation,failed,created_at)`
- Produces:
  - `public.admin_site_traffic(p_days integer default 30, p_now timestamptz default now()) returns jsonb` — 키: `days, today_visitors, visitor_days, views, members, sessions, avg_session_seconds, avg_views_per_session, consent_rate, known_browsers, returning_browsers, daily[{day,visitors,members,views,signups}], sources[], campaigns[], landing_pages[], pages[], devices[], browsers[]` (목록 원소는 모두 `{key, views, visitors}`)
  - `public.admin_site_people(p_days integer default 30, p_now timestamptz default now()) returns jsonb` — 키: `days, active_members, new_members, with_referral, by_provider[{key,members}], signup_sources[{key,members}], features[{key,calls,users,failed}], top_members[{id,email,name,views,calls,last_seen}]`
  - 둘 다 service_role 만

- [ ] **Step 1: 실패하는 시험**

`scripts/tests/site-analytics-report.test.mjs`:

```js
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { testPostgres } from '../lib/test-credit-postgres.mjs';

/*
  202610060002 — 방문 분석 보고 둘(계획 2026-10-06 site-analytics, 2단계).
  한국 시각으로 자르고, 관리자는 뺀다(같은 날 로그인 전 방문, 같은 쿠키 번호의 다른 날 방문까지).
  김은 10/2 유튜브 광고로 처음 왔고(동의해서 번호 '1'), 10/6 인스타 광고로 다시 와서 가입했다.
*/
const MIGRATIONS = ['202610060001_site_analytics.sql', '202610060002_site_analytics_report.sql'];
const ADMIN = '94000000-0000-4000-8000-000000000001';
const KIM = '94000000-0000-4000-8000-000000000002';
const LEE = '94000000-0000-4000-8000-000000000003';
const PARK = '94000000-0000-4000-8000-000000000004';
const NOW = '2026-10-06 12:00:00+09';
const V = (c) => c.repeat(64);
let db;
const json = async (q) => JSON.parse(await db.sql(q));
const traffic = (days = 7) => json(`select admin_site_traffic(${days}, '${NOW}'::timestamptz);`);
const people = (days = 7) => json(`select admin_site_people(${days}, '${NOW}'::timestamptz);`);

before(async () => {
  db = await testPostgres();
  await db.migrate(MIGRATIONS);
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values
      ('${ADMIN}','a@example.invalid',now()),('${KIM}','kim@example.invalid',now()),
      ('${LEE}','lee@example.invalid',now()),('${PARK}','park@example.invalid',now());
    update profiles set status='active', role='admin', created_at='2026-01-01' where id='${ADMIN}';
    update profiles set status='active', created_at='2026-10-06 00:30:00+09', signup_provider='kakao', referrer_input='카페' where id='${KIM}';
    update profiles set status='active', created_at='2026-08-01', signup_provider=null where id='${LEE}';
    update profiles set status='active', created_at='2026-10-04 15:00:00+09' where id='${PARK}';
    insert into analytics_page_views(created_at, visitor, cookie_key, user_id, path, referrer_host, utm_source, utm_campaign, device, browser, entry) values
      -- 관리자: 로그인 전 + 로그인 뒤(같은 visitor), 그리고 다른 날 같은 쿠키 번호 — 셋 다 빠져야 한다
      ('2026-10-06 09:00:00+09', '${V('a')}', '${V('9')}', null,      '/',        null, null, null, 'desktop','chrome', true),
      ('2026-10-06 09:01:00+09', '${V('a')}', '${V('9')}', '${ADMIN}', '/create',  null, null, null, 'desktop','chrome', false),
      ('2026-10-03 21:00:00+09', '${V('8')}', '${V('9')}', null,      '/guide',   null, null, null, 'desktop','chrome', true),
      -- 김: 10/2 유튜브(번호 1) → 10/6 인스타로 다시 와서 가입. 10:00·10:10 한 세션, 11:00 새 세션
      ('2026-10-02 20:00:00+09', '${V('f')}', '${V('1')}', null,      '/',        null, 'youtube', null, 'mobile','kakaotalk', true),
      ('2026-10-06 10:00:00+09', '${V('b')}', '${V('1')}', null,      '/',        null, 'instagram', 'launch', 'mobile','kakaotalk', true),
      ('2026-10-06 10:10:00+09', '${V('b')}', '${V('1')}', '${KIM}',  '/create',  null, null, null, 'mobile','kakaotalk', false),
      ('2026-10-06 11:00:00+09', '${V('b')}', '${V('1')}', '${KIM}',  '/library', null, null, null, 'mobile','kakaotalk', true),
      -- 손님: 한국 0시 30분 — 「오늘」이다(UTC 로는 어제). 동의 안 함
      ('2026-10-06 00:30:00+09', '${V('c')}', null,        null,      '/guide',   'search.naver.com', null, null, 'desktop','chrome', true),
      -- 이: 어제 한국 23:30, 직접 방문. 동의 안 함
      ('2026-10-05 23:30:00+09', '${V('d')}', null,        '${LEE}',  '/',        null, null, null, 'desktop','edge', true),
      -- 창 밖(8일 전)
      ('2026-09-28 10:00:00+09', '${V('e')}', null,        null,      '/',        null, null, null, 'desktop','chrome', true);
    insert into ai_cost_events(created_at, user_id, operation, provider, model, usd, usd_basis, failed) values
      ('2026-10-06 10:20:00+09', '${KIM}',  'poster',  'fal', 'm', 1, 'tokens', false),
      ('2026-10-06 10:21:00+09', '${KIM}',  'poster',  'fal', 'm', 1, 'tokens', true),
      ('2026-10-05 20:00:00+09', '${LEE}',  'sns:plan','openai','m', 1, 'tokens', false),
      ('2026-10-06 09:05:00+09', '${ADMIN}','poster',  'fal', 'm', 1, 'tokens', false);`);
});
after(async () => { await db?.close(); });

test('counts by the Korean day and leaves admins out entirely', async () => {
  const r = await traffic();
  assert.equal(r.days, 7);
  assert.equal(r.daily.length, 7);
  assert.deepEqual(r.daily.at(-1), { day: '2026-10-06', visitors: 2, members: 1, views: 4, signups: 1 });
  assert.deepEqual(r.daily.at(-2), { day: '2026-10-05', visitors: 1, members: 1, views: 1, signups: 0 });
  assert.deepEqual(r.daily.at(-3), { day: '2026-10-04', visitors: 0, members: 0, views: 0, signups: 1 });
  assert.deepEqual(r.daily.at(-4), { day: '2026-10-03', visitors: 0, members: 0, views: 0, signups: 0 });
  assert.deepEqual(r.daily.at(-5), { day: '2026-10-02', visitors: 1, members: 0, views: 1, signups: 0 });
  assert.equal(r.today_visitors, 2);
  assert.equal(r.visitor_days, 4);
  assert.equal(r.views, 6);
  assert.equal(r.members, 2);
  assert.equal(r.pages.find((p) => p.key === '/create').views, 1);  // 관리자 /create 빠짐
  assert.equal(r.pages.find((p) => p.key === '/guide').views, 1);   // 관리자 쿠키의 10/3 /guide 빠짐
});

test('splits sessions after 30 quiet minutes', async () => {
  const r = await traffic();
  // b: [10:00,10:10] [11:00], c, d, f → 5 세션, 길이 600·0·0·0·0
  assert.equal(r.sessions, 5);
  assert.equal(r.avg_session_seconds, 120);
  assert.equal(Number(r.avg_views_per_session), 1.2);
});

test('consented browsers are followed across days', async () => {
  const r = await traffic();
  assert.equal(r.known_browsers, 1);       // 번호 '1' (관리자 번호 '9' 는 빠짐)
  assert.equal(r.returning_browsers, 1);   // 번호 '1' 이 10/2 와 10/6 에
  assert.equal(Number(r.consent_rate), 0.5); // 하루 방문자 b·c·d·f 중 b·f
});

test('sources come from the first screen only: utm first, then referrer, else direct', async () => {
  const r = await traffic();
  assert.deepEqual(r.sources.map((s) => [s.key, s.views]).sort(),
    [['(direct)', 2], ['instagram', 1], ['search.naver.com', 1], ['youtube', 1]]);
  assert.deepEqual(r.campaigns.map((s) => s.key), ['launch']);
  assert.deepEqual(r.devices.map((d) => [d.key, d.visitors]).sort(), [['desktop', 2], ['mobile', 2]]);
});

test('people: active members, providers, features without admins', async () => {
  const r = await people();
  assert.equal(r.active_members, 2);
  assert.equal(r.new_members, 1);
  assert.equal(r.with_referral, 1);
  assert.deepEqual(r.by_provider.map((p) => [p.key, p.members]).sort(), [['email', 1], ['kakao', 1]]);
  assert.deepEqual(r.features.map((f) => [f.key, f.calls, f.users, f.failed]), [['poster', 2, 1, 1], ['sns:plan', 1, 1, 0]]);
  assert.equal(r.top_members[0].email, 'kim@example.invalid');
  assert.equal(r.top_members[0].views, 2);
  assert.equal(r.top_members[0].calls, 2);
});

test('a new member is credited to the first touch, days before signup, through the cookie', async () => {
  const r = await people();
  // 김: 같은 날만 보면 instagram 이지만 쿠키로 10/2 youtube 까지 이어진다. 박: 방문 기록 없음.
  assert.deepEqual(r.signup_sources.map((s) => [s.key, s.members]).sort(), [['(unknown)', 1], ['youtube', 1]]);
});

test('an empty window still gives a full calendar and zeros', async () => {
  const r = await json(`select admin_site_traffic(3, '2027-01-10 12:00:00+09'::timestamptz);`);
  assert.equal(r.daily.length, 3);
  assert.equal(r.views, 0);
  assert.equal(r.avg_session_seconds, 0);
  assert.equal(Number(r.consent_rate), 0);
  assert.deepEqual(r.sources, []);
});

test('members and visitors cannot call the reports', async () => {
  for (const role of ['anon', 'authenticated']) {
    for (const fn of ['admin_site_traffic', 'admin_site_people']) {
      assert.equal(await db.sql(`select has_function_privilege('${role}', 'public.${fn}(integer,timestamptz)', 'execute');`), 'f');
    }
  }
});
```

Run: `TEST_PG_BIN="C:/Program Files/PostgreSQL/17/bin" node --test scripts/tests/site-analytics-report.test.mjs` → FAIL(파일 없음).

- [ ] **Step 2: 보고 함수를 쓴다**

`supabase/migrations/202610060002_site_analytics_report.sql`:

```sql
-- 방문 분석 보고 둘(계획 2026-10-06 site-analytics, 2단계).
--
-- ⚠ 공유 DB — 새 함수 둘만 더한다. 기존 admin_cost_*·admin_ai_cost_report 는 건드리지 않는다.
-- ⚠ 순서 — 202610060001 뒤, 앱보다 먼저.
--
-- 「오늘」은 **한국 시각**이다. 관리자는 뺀다 — 관리자 줄과 같은 visitor(같은 날·같은 기기)의 로그인 전 줄,
-- 관리자 줄과 같은 cookie_key 의 다른 날 줄까지.
-- visitor_days 는 「하루 방문자의 합」이다(같은 사람이 이틀 오면 2). 여러 날을 잇는 숫자(known_/returning_browsers)는
-- 쿠키에 동의한 브라우저만 센다 — consent_rate 를 같이 보여 그 비율을 알게 한다. 회원은 user_id 로 정확하다.

create or replace function public.admin_site_traffic(
  p_days integer default 30,
  p_now timestamptz default now()
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select least(greatest(coalesce(p_days, 30), 1), 366) as days,
           date_trunc('day', p_now at time zone 'Asia/Seoul') as today_local
  ),
  win as (
    select b.*, (b.today_local - make_interval(days => b.days - 1)) at time zone 'Asia/Seoul' as window_start
    from bounds b
  ),
  admin_rows as (
    select a.visitor, a.cookie_key, a.created_at
    from analytics_page_views a
    join profiles p on p.id = a.user_id
    where p.role = 'admin'
  ),
  admin_visitors as (
    select distinct r.visitor from admin_rows r cross join win w
    where r.created_at >= w.window_start and r.created_at <= p_now
  ),
  admin_keys as (
    select distinct r.cookie_key from admin_rows r where r.cookie_key is not null
  ),
  v as (
    select e.visitor, e.cookie_key, e.user_id, e.path, e.referrer_host, e.utm_source, e.utm_campaign,
           e.device, e.browser, e.entry, e.created_at,
           (e.created_at at time zone 'Asia/Seoul')::date as day
    from analytics_page_views e
    cross join win w
    where e.created_at >= w.window_start and e.created_at <= p_now
      and e.visitor not in (select visitor from admin_visitors)
      and (e.cookie_key is null or e.cookie_key not in (select cookie_key from admin_keys))
  ),
  gaps as (
    select v.visitor, v.created_at,
           v.created_at - lag(v.created_at) over (partition by v.visitor order by v.created_at) as gap
    from v
  ),
  numbered as (
    select g.visitor, g.created_at,
           sum(case when g.gap is null or g.gap > interval '30 minutes' then 1 else 0 end)
             over (partition by g.visitor order by g.created_at rows unbounded preceding) as session_no
    from gaps g
  ),
  sessions as (
    select n.visitor, n.session_no, count(*) as views,
           extract(epoch from max(n.created_at) - min(n.created_at)) as seconds
    from numbered n
    group by n.visitor, n.session_no
  ),
  calendar as (
    select g::date as day
    from win w, generate_series(w.today_local - make_interval(days => w.days - 1), w.today_local, interval '1 day') g
  ),
  per_day as (
    select v.day, count(distinct v.visitor) as visitors, count(distinct v.user_id) as members, count(*) as views
    from v group by v.day
  ),
  signups as (
    select (p.created_at at time zone 'Asia/Seoul')::date as day, count(*) as n
    from profiles p cross join win w
    where p.role <> 'admin' and p.created_at >= w.window_start and p.created_at <= p_now
    group by 1
  ),
  entries as (
    select v.*, coalesce(v.utm_source, v.referrer_host, '(direct)') as source
    from v where v.entry
  ),
  returning_keys as (
    select v.cookie_key from v where v.cookie_key is not null
    group by v.cookie_key having count(distinct v.day) >= 2
  )
  select jsonb_build_object(
    'days', (select days from win),
    'today_visitors', coalesce((select pd.visitors from per_day pd, win w where pd.day = w.today_local::date), 0),
    'visitor_days', coalesce((select sum(visitors) from per_day), 0),
    'views', (select count(*) from v),
    'members', (select count(distinct user_id) from v),
    'sessions', (select count(*) from sessions),
    'avg_session_seconds', coalesce((select round(avg(seconds)) from sessions), 0),
    'avg_views_per_session', coalesce((select round(avg(views), 1) from sessions), 0),
    'consent_rate', coalesce((
      select round(count(distinct visitor) filter (where cookie_key is not null)::numeric / nullif(count(distinct visitor), 0), 3)
      from v), 0),
    'known_browsers', (select count(distinct cookie_key) from v),
    'returning_browsers', (select count(*) from returning_keys),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
               'day', c.day, 'visitors', coalesce(pd.visitors, 0), 'members', coalesce(pd.members, 0),
               'views', coalesce(pd.views, 0), 'signups', coalesce(s.n, 0)) order by c.day)
      from calendar c left join per_day pd on pd.day = c.day left join signups s on s.day = c.day), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('key', x.k, 'views', x.views, 'visitors', x.visitors) order by x.views desc, x.k)
      from (select source as k, count(*) as views, count(distinct visitor) as visitors
              from entries group by source order by count(*) desc, source limit 20) x), '[]'::jsonb),
    'campaigns', coalesce((
      select jsonb_agg(jsonb_build_object('key', x.k, 'views', x.views, 'visitors', x.visitors) order by x.views desc, x.k)
      from (select utm_campaign as k, count(*) as views, count(distinct visitor) as visitors
              from entries where utm_campaign is not null group by utm_campaign order by count(*) desc, utm_campaign limit 20) x), '[]'::jsonb),
    'landing_pages', coalesce((
      select jsonb_agg(jsonb_build_object('key', x.k, 'views', x.views, 'visitors', x.visitors) order by x.views desc, x.k)
      from (select path as k, count(*) as views, count(distinct visitor) as visitors
              from entries group by path order by count(*) desc, path limit 20) x), '[]'::jsonb),
    'pages', coalesce((
      select jsonb_agg(jsonb_build_object('key', x.k, 'views', x.views, 'visitors', x.visitors) order by x.views desc, x.k)
      from (select path as k, count(*) as views, count(distinct visitor) as visitors
              from v group by path order by count(*) desc, path limit 30) x), '[]'::jsonb),
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object('key', x.k, 'views', x.views, 'visitors', x.visitors) order by x.visitors desc, x.k)
      from (select device as k, count(*) as views, count(distinct visitor) as visitors from v group by device) x), '[]'::jsonb),
    'browsers', coalesce((
      select jsonb_agg(jsonb_build_object('key', x.k, 'views', x.views, 'visitors', x.visitors) order by x.visitors desc, x.k)
      from (select browser as k, count(*) as views, count(distinct visitor) as visitors from v group by browser) x), '[]'::jsonb)
  );
$$;

revoke all on function public.admin_site_traffic(integer, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_site_traffic(integer, timestamptz) to service_role;

create or replace function public.admin_site_people(
  p_days integer default 30,
  p_now timestamptz default now()
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select least(greatest(coalesce(p_days, 30), 1), 366) as days,
           date_trunc('day', p_now at time zone 'Asia/Seoul') as today_local
  ),
  win as (
    select b.*, (b.today_local - make_interval(days => b.days - 1)) at time zone 'Asia/Seoul' as window_start
    from bounds b
  ),
  members as (
    select p.id, p.email, p.display_name, p.created_at, p.signup_provider, p.referrer_input
    from profiles p where p.role <> 'admin'
  ),
  seen as (
    select e.user_id, count(*) as views, max(e.created_at) as last_seen
    from analytics_page_views e cross join win w
    where e.user_id is not null and e.created_at >= w.window_start and e.created_at <= p_now
    group by e.user_id
  ),
  calls as (
    select c.user_id, c.operation, c.failed
    from ai_cost_events c
    join members m on m.id = c.user_id
    cross join win w
    where c.created_at >= w.window_start and c.created_at <= p_now
  ),
  call_totals as (select user_id, count(*) as calls from calls group by user_id),
  active as (
    select m.*, coalesce(s.views, 0) as views, coalesce(t.calls, 0) as calls, s.last_seen
    from members m
    left join seen s on s.user_id = m.id
    left join call_totals t on t.user_id = m.id
    where s.user_id is not null or t.user_id is not null
  ),
  joined as (
    select m.id from members m cross join win w
    where m.created_at >= w.window_start and m.created_at <= p_now
  ),
  -- 가입자의 첫 유입: 그 회원이 로그인한 채 남긴 visitor(같은 날) 또는 cookie_key(여러 날)와 같은 첫 화면 줄 중 가장 이른 것.
  touches as (
    select j.id, e.created_at, coalesce(e.utm_source, e.referrer_host, '(direct)') as source
    from joined j
    join analytics_page_views e on e.entry and e.created_at <= p_now and (
         e.visitor in (select x.visitor from analytics_page_views x where x.user_id = j.id)
      or e.cookie_key in (select x.cookie_key from analytics_page_views x where x.user_id = j.id and x.cookie_key is not null))
  ),
  first_touch as (
    select distinct on (j.id) j.id, coalesce(t.source, '(unknown)') as source
    from joined j left join touches t on t.id = j.id
    order by j.id, t.created_at nulls last
  )
  select jsonb_build_object(
    'days', (select days from win),
    'active_members', (select count(*) from active),
    'new_members', (select count(*) from active a, win w where a.created_at >= w.window_start),
    'with_referral', (select count(*) from active where nullif(btrim(referrer_input), '') is not null),
    'by_provider', coalesce((
      select jsonb_agg(jsonb_build_object('key', x.k, 'members', x.n) order by x.n desc, x.k)
      from (select coalesce(signup_provider, 'email') as k, count(*) as n from active group by 1) x), '[]'::jsonb),
    'signup_sources', coalesce((
      select jsonb_agg(jsonb_build_object('key', x.source, 'members', x.n) order by x.n desc, x.source)
      from (select source, count(*) as n from first_touch group by source) x), '[]'::jsonb),
    'features', coalesce((
      select jsonb_agg(jsonb_build_object('key', x.operation, 'calls', x.calls, 'users', x.users, 'failed', x.failed) order by x.calls desc, x.operation)
      from (select operation, count(*) as calls, count(distinct user_id) as users, count(*) filter (where failed) as failed
              from calls group by operation order by count(*) desc, operation limit 30) x), '[]'::jsonb),
    'top_members', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'email', x.email, 'name', x.display_name,
                                          'views', x.views, 'calls', x.calls, 'last_seen', x.last_seen) order by x.views + x.calls desc, x.email)
      from (select * from active order by views + calls desc, email limit 10) x), '[]'::jsonb)
  );
$$;

revoke all on function public.admin_site_people(integer, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_site_people(integer, timestamptz) to service_role;

do $$
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('admin_site_traffic', 'admin_site_people')) <> 2 then
    raise exception 'admin_site_traffic·admin_site_people 가 하나씩이 아닙니다';
  end if;
  raise notice '방문 분석 보고 함수 둘을 만들었습니다.';
end $$;
```

- [ ] **Step 3: 통과 확인**

Run: `TEST_PG_BIN="C:/Program Files/PostgreSQL/17/bin" node --test scripts/tests/site-analytics-report.test.mjs` → PASS 8/8. 기대값이 어긋나면 **시험 기대값을 맞추기 전에** 손으로 줄을 세어 어느 쪽이 맞는지 먼저 판단한다(이 계획의 기대값은 위 고정 자료로 손으로 센 것이다).

- [ ] **Step 4: 계약 시험에 두 번째 파일**

`site-analytics-migration.test.ts` 끝에:

```ts
describe("보고 함수 파일", () => {
  const report = code("202610060002_site_analytics_report.sql");

  it("admin_site_traffic·admin_site_people 둘만 정의하고 표를 바꾸지 않는다", () => {
    expect(defined(report)).toEqual(["admin_site_people", "admin_site_traffic"]);
    expect(report).not.toMatch(/\b(alter|drop)\s+table\b/i);
  });

  it("서비스 권한만 부른다", () => {
    for (const fn of ["admin_site_traffic", "admin_site_people"]) {
      expect(revoked(report, fn), fn).toBe(true);
      expect(granted(report, fn), fn).toBe(true);
    }
  });
});
```

Run: `pnpm --filter web exec vitest run lib/analytics/__tests__/site-analytics-migration.test.ts` → PASS.

- [ ] **Step 5: `package.json` 의 `test:credit-db` 에 새 시험 추가 후 커밋**

```bash
git add supabase/migrations/202610060002_site_analytics_report.sql scripts/tests/site-analytics-report.test.mjs apps/web/lib/analytics/__tests__/site-analytics-migration.test.ts package.json
git commit -m "feat(analytics): 방문 분석 보고 함수 둘

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 보고 읽기

**Files:**
- Create: `apps/web/lib/analytics/report.ts`
- Test: `apps/web/lib/analytics/__tests__/report.test.ts`

**Interfaces:**
- Consumes: RPC `admin_site_traffic`, `admin_site_people` (Task 9)
- Produces:

```ts
export interface Slice { key: string; views: number; visitors: number }
export interface DailyVisit { day: string; visitors: number; members: number; views: number; signups: number }
export interface SiteTraffic {
  days: number; todayVisitors: number; visitorDays: number; views: number; members: number;
  sessions: number; avgSessionSeconds: number; avgViewsPerSession: number;
  consentRate: number; knownBrowsers: number; returningBrowsers: number;
  daily: DailyVisit[]; sources: Slice[]; campaigns: Slice[]; landingPages: Slice[]; pages: Slice[]; devices: Slice[]; browsers: Slice[];
}
export interface FeatureUse { key: string; calls: number; users: number; failed: number }
export interface MemberUse { id: string; email: string; name: string | null; views: number; calls: number; lastSeen: string | null }
export interface SitePeople {
  days: number; activeMembers: number; newMembers: number; withReferral: number;
  byProvider: Array<{ key: string; members: number }>; signupSources: Array<{ key: string; members: number }>;
  features: FeatureUse[]; topMembers: MemberUse[];
}
export function parseSiteTraffic(raw: unknown): SiteTraffic
export function parseSitePeople(raw: unknown): SitePeople
export async function getSiteTraffic(days: number): Promise<SiteTraffic | null>
export async function getSitePeople(days: number): Promise<SitePeople | null>
```

- [ ] **Step 1: 실패하는 시험**

`apps/web/lib/analytics/__tests__/report.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
let rpcResult: { data: unknown; error: { message: string } | null } = { data: null, error: null };
vi.mock("../../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc: async () => rpcResult }),
}));
const { getSiteTraffic, parseSitePeople, parseSiteTraffic } = await import("../report");

describe("parseSiteTraffic", () => {
  it("DB 이름(snake_case)을 화면 이름으로, 숫자 문자열을 숫자로", () => {
    const r = parseSiteTraffic({
      days: 7, today_visitors: "2", visitor_days: 4, views: 6, members: 2, sessions: 5,
      avg_session_seconds: "120", avg_views_per_session: "1.2",
      consent_rate: "0.500", known_browsers: 1, returning_browsers: 1,
      daily: [{ day: "2026-10-06", visitors: 2, members: 1, views: 4, signups: 1 }],
      sources: [{ key: "(direct)", views: 2, visitors: 2 }], campaigns: [], landing_pages: [], pages: [], devices: [], browsers: [],
    });
    expect(r).toMatchObject({ todayVisitors: 2, avgSessionSeconds: 120, avgViewsPerSession: 1.2, consentRate: 0.5, returningBrowsers: 1 });
    expect(r.daily[0]).toEqual({ day: "2026-10-06", visitors: 2, members: 1, views: 4, signups: 1 });
    expect(r.sources[0]).toEqual({ key: "(direct)", views: 2, visitors: 2 });
  });
  it("빈 값·이상한 값은 0·빈 목록 — 없는 숫자를 지어내지 않는다", () => {
    const r = parseSiteTraffic(null);
    expect(r.views).toBe(0);
    expect(r.daily).toEqual([]);
    expect(parseSiteTraffic({ views: "NaN" }).views).toBe(0);
  });
});

describe("parseSitePeople", () => {
  it("회원 줄의 이름·마지막 방문이 없으면 null, 가입자 첫 유입을 옮긴다", () => {
    const r = parseSitePeople({
      top_members: [{ id: "u", email: "e", name: null, views: 1, calls: 0, last_seen: null }],
      signup_sources: [{ key: "youtube", members: "1" }],
    });
    expect(r.topMembers[0]).toEqual({ id: "u", email: "e", name: null, views: 1, calls: 0, lastSeen: null });
    expect(r.signupSources).toEqual([{ key: "youtube", members: 1 }]);
    expect(r.features).toEqual([]);
  });
});

describe("getSiteTraffic", () => {
  it("함수가 없으면(마이그레이션 전) null — 탭은 열린다", async () => {
    rpcResult = { data: null, error: { message: "function admin_site_traffic does not exist" } };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await getSiteTraffic(30)).toBeNull();
    warn.mockRestore();
  });
});
```

Run: `pnpm --filter web exec vitest run lib/analytics/__tests__/report.test.ts` → FAIL(모듈 없음).

- [ ] **Step 2: 구현**

`apps/web/lib/analytics/report.ts`:

```ts
import "server-only";

import { createSupabaseAdminClient } from "../supabase/admin";

/**
 * **방문 분석 보고**(계획 2026-10-06 site-analytics, 2단계). RPC 가 준 jsonb 를 화면 모양으로 바꾼다.
 * 모르는 칸은 0·빈 목록 — 없는 숫자를 지어내지 않는다(`lib/ai-control/report.ts` 와 같은 판단).
 */

export interface Slice { key: string; views: number; visitors: number }
export interface DailyVisit { day: string; visitors: number; members: number; views: number; signups: number }
export interface SiteTraffic {
  days: number; todayVisitors: number; visitorDays: number; views: number; members: number;
  sessions: number; avgSessionSeconds: number; avgViewsPerSession: number;
  consentRate: number; knownBrowsers: number; returningBrowsers: number;
  daily: DailyVisit[]; sources: Slice[]; campaigns: Slice[]; landingPages: Slice[]; pages: Slice[]; devices: Slice[]; browsers: Slice[];
}
export interface FeatureUse { key: string; calls: number; users: number; failed: number }
export interface MemberUse { id: string; email: string; name: string | null; views: number; calls: number; lastSeen: string | null }
export interface SitePeople {
  days: number; activeMembers: number; newMembers: number; withReferral: number;
  byProvider: Array<{ key: string; members: number }>; signupSources: Array<{ key: string; members: number }>;
  features: FeatureUse[]; topMembers: MemberUse[];
}

type Row = Record<string, unknown>;
const n = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const rows = (value: unknown): Row[] => (Array.isArray(value) ? value : []) as Row[];
const obj = (raw: unknown): Row => (raw && typeof raw === "object" ? raw : {}) as Row;
const textOrNull = (value: unknown) => (typeof value === "string" && value ? value : null);
const slices = (value: unknown): Slice[] =>
  rows(value).map((row) => ({ key: String(row.key ?? ""), views: n(row.views), visitors: n(row.visitors) }));
const memberCounts = (value: unknown) => rows(value).map((row) => ({ key: String(row.key ?? ""), members: n(row.members) }));

export function parseSiteTraffic(raw: unknown): SiteTraffic {
  const row = obj(raw);
  return {
    days: n(row.days),
    todayVisitors: n(row.today_visitors),
    visitorDays: n(row.visitor_days),
    views: n(row.views),
    members: n(row.members),
    sessions: n(row.sessions),
    avgSessionSeconds: n(row.avg_session_seconds),
    avgViewsPerSession: n(row.avg_views_per_session),
    consentRate: n(row.consent_rate),
    knownBrowsers: n(row.known_browsers),
    returningBrowsers: n(row.returning_browsers),
    daily: rows(row.daily).map((d) => ({
      day: String(d.day ?? ""), visitors: n(d.visitors), members: n(d.members), views: n(d.views), signups: n(d.signups),
    })),
    sources: slices(row.sources),
    campaigns: slices(row.campaigns),
    landingPages: slices(row.landing_pages),
    pages: slices(row.pages),
    devices: slices(row.devices),
    browsers: slices(row.browsers),
  };
}

export function parseSitePeople(raw: unknown): SitePeople {
  const row = obj(raw);
  return {
    days: n(row.days),
    activeMembers: n(row.active_members),
    newMembers: n(row.new_members),
    withReferral: n(row.with_referral),
    byProvider: memberCounts(row.by_provider),
    signupSources: memberCounts(row.signup_sources),
    features: rows(row.features).map((f) => ({ key: String(f.key ?? ""), calls: n(f.calls), users: n(f.users), failed: n(f.failed) })),
    topMembers: rows(row.top_members).map((m) => ({
      id: String(m.id ?? ""), email: String(m.email ?? ""), name: textOrNull(m.name),
      views: n(m.views), calls: n(m.calls), lastSeen: textOrNull(m.last_seen),
    })),
  };
}

/** 못 읽으면 null — 탭은 「준비 전」으로 열린다. 던지면 관리자 화면 전체가 500 이 된다. */
async function readReport<T>(fn: string, days: number, parse: (raw: unknown) => T): Promise<T | null> {
  try {
    const { data, error } = await createSupabaseAdminClient().rpc(fn, { p_days: days });
    if (error) throw new Error(error.message);
    return parse(data);
  } catch (error) {
    console.warn(`[analytics] ${fn} 를 읽지 못했습니다`, { message: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export const getSiteTraffic = (days: number) => readReport("admin_site_traffic", days, parseSiteTraffic);
export const getSitePeople = (days: number) => readReport("admin_site_people", days, parseSitePeople);
```

- [ ] **Step 3: 통과 확인 후 커밋**

Run: `pnpm --filter web exec vitest run lib/analytics/__tests__/report.test.ts` → PASS.

```bash
git add apps/web/lib/analytics/report.ts apps/web/lib/analytics/__tests__/report.test.ts
git commit -m "feat(analytics): 방문 분석 보고를 읽는다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 관리자 「방문 분석」 탭

**Files:**
- Modify: `apps/web/app/admin/admin-tabs.tsx` (`ADMIN_TABS` 에 한 줄, 머리 주석 「세 탭」→「네 탭」)
- Modify: `apps/web/app/admin/__tests__/admin-tabs.test.ts` (탭 이름 목록 기대값 + 시험 하나)
- Create: `apps/web/app/admin/analytics/page.tsx`
- Create: `apps/web/app/admin/analytics/range.ts`
- Create: `apps/web/app/admin/analytics/labels.ts`
- Create: `apps/web/app/admin/analytics/traffic-panel.tsx`
- Create: `apps/web/app/admin/analytics/sources-panel.tsx`
- Create: `apps/web/app/admin/analytics/people-panel.tsx`
- Test: `apps/web/app/admin/__tests__/analytics-panels.test.tsx`

**Interfaces:**
- Consumes: `SiteTraffic`, `SitePeople`, `getSiteTraffic`, `getSitePeople` (Task 10), `pruneAnalytics` (Task 4), `aiOperationLabel` (`app/admin/system/ai-labels.ts`)
- Produces:
  - `range.ts`: `ANALYTICS_RANGES = [7, 30, 90] as const`, `pickDays(raw: string | undefined): number`
  - `labels.ts`: `sourceLabel`, `deviceLabel`, `browserLabel`, `providerLabel` — 모두 `(key: string) => string`
  - `TrafficPanel({ report }: { report: SiteTraffic | null })`, `duration(seconds: number): string`, `SourcesPanel({ report }: { report: SiteTraffic | null })`, `PeoplePanel({ report }: { report: SitePeople | null })`

> 화면 작업이다. 시작 전에 `frontend-design`·`dataviz` 스킬을 읽고, 기존 `@fixup/ui` `Card` 를 쓴다. 생김새는 `system/ai-usage-panel.tsx` 와 맞춘다(같은 표 스타일). 새 차트 라이브러리를 넣지 않는다.

- [ ] **Step 1: 탭 시험부터 고친다(실패 확인)**

`admin-tabs.test.ts` 의 기대값을:

```ts
    expect(ADMIN_TABS.map((tab) => tab.label)).toEqual(["회원 관리", "시스템 관리", "비용 전략", "방문 분석"]);
```

같은 파일에 하나 추가:

```ts
  it("방문 분석 주소는 방문 분석 탭이다", () => {
    expect(activeAdminTab("/admin/analytics")).toBe("/admin/analytics");
  });
```

Run: `pnpm --filter web exec vitest run app/admin/__tests__/admin-tabs.test.ts` → FAIL.

- [ ] **Step 2: 탭 한 줄**

`admin-tabs.tsx`:

```ts
export const ADMIN_TABS = [
  { href: "/admin", label: "회원 관리" },
  { href: "/admin/system", label: "시스템 관리" },
  { href: "/admin/cost-lab", label: "비용 전략" },
  { href: "/admin/analytics", label: "방문 분석" },
] as const;
```

머리 주석 첫 줄 `관리자 화면의 세 탭(2026-09-22 사용자 요청).` → `관리자 화면의 네 탭(2026-09-22 사용자 요청, 「방문 분석」은 2026-10-06).`

Run 위 시험 → PASS.

- [ ] **Step 3: 패널 시험**

`apps/web/app/admin/__tests__/analytics-panels.test.tsx`:

```tsx
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * **방문 분석 화면이 무엇을 말하나**(계획 2026-10-06 site-analytics).
 * 준비 전 안내, 「하루 단위」·동의율 한계 문구, 이름표, 가입자 첫 유입, 회원·기능 표.
 */
vi.mock("server-only", () => ({}));
const { TrafficPanel } = await import("../analytics/traffic-panel");
const { SourcesPanel } = await import("../analytics/sources-panel");
const { PeoplePanel } = await import("../analytics/people-panel");
const { pickDays } = await import("../analytics/range");

const traffic = {
  days: 7, todayVisitors: 2, visitorDays: 4, views: 6, members: 2, sessions: 5, avgSessionSeconds: 150, avgViewsPerSession: 1.2,
  consentRate: 0.5, knownBrowsers: 1, returningBrowsers: 1,
  daily: [{ day: "2026-10-05", visitors: 1, members: 1, views: 1, signups: 0 }, { day: "2026-10-06", visitors: 2, members: 1, views: 4, signups: 1 }],
  sources: [{ key: "(direct)", views: 2, visitors: 2 }, { key: "instagram", views: 1, visitors: 1 }],
  campaigns: [{ key: "launch", views: 1, visitors: 1 }], landingPages: [{ key: "/", views: 3, visitors: 3 }],
  pages: [{ key: "/create", views: 1, visitors: 1 }], devices: [{ key: "mobile", views: 3, visitors: 1 }], browsers: [{ key: "kakaotalk", views: 3, visitors: 1 }],
};
const people = {
  days: 7, activeMembers: 2, newMembers: 1, withReferral: 1, byProvider: [{ key: "kakao", members: 1 }],
  signupSources: [{ key: "youtube", members: 1 }, { key: "(unknown)", members: 1 }],
  features: [{ key: "poster", calls: 2, users: 1, failed: 1 }],
  topMembers: [{ id: "u1", email: "kim@example.invalid", name: "김", views: 2, calls: 2, lastSeen: "2026-10-06T02:00:00+00:00" }],
};

describe("TrafficPanel", () => {
  it("준비 전이면 무엇을 먼저 해야 하는지 말한다", () => {
    expect(renderToStaticMarkup(<TrafficPanel report={null} />)).toContain("202610060002");
  });
  it("오늘 방문자·평균 머문 시간·동의율·하루 단위 한계를 보인다", () => {
    const html = renderToStaticMarkup(<TrafficPanel report={traffic} />);
    expect(html).toContain("오늘 방문자");
    expect(html).toContain("2분 30초");
    expect(html).toContain("50%");
    expect(html).toContain("하루 단위");
  });
});

describe("SourcesPanel", () => {
  it("직접 방문·기기·브라우저를 우리말로", () => {
    const html = renderToStaticMarkup(<SourcesPanel report={traffic} />);
    expect(html).toContain("직접 방문");
    expect(html).toContain("휴대폰");
    expect(html).toContain("카카오톡");
  });
});

describe("PeoplePanel", () => {
  it("기능 이름표·회원 이메일·가입 방법·가입자 첫 유입", () => {
    const html = renderToStaticMarkup(<PeoplePanel report={people} />);
    expect(html).toContain("포스터 · 그림");
    expect(html).toContain("kim@example.invalid");
    expect(html).toContain("카카오");
    expect(html).toContain("가입자가 처음 들어온 경로");
    expect(html).toContain("youtube 1명");
    expect(html).toContain("확인 못 함");
  });
  it("준비 전이면 null 을 받아도 깨지지 않는다", () => {
    expect(renderToStaticMarkup(<PeoplePanel report={null} />)).toContain("읽지 못했습니다");
  });
});

describe("pickDays", () => {
  it.each([["7", 7], ["30", 30], ["90", 90], [undefined, 30], ["365", 30], ["abc", 30]])("%s → %s", (raw, expected) =>
    expect(pickDays(raw)).toBe(expected));
});
```

Run: `pnpm --filter web exec vitest run app/admin/__tests__/analytics-panels.test.tsx` → FAIL.

- [ ] **Step 4: 구현 — 작은 파일들**

`apps/web/app/admin/analytics/range.ts`:

```ts
/** 보기 기간. 주소의 `?days=` 는 이 셋만 받는다 — 아무 수나 받으면 1년치를 매번 훑게 된다. */
export const ANALYTICS_RANGES = [7, 30, 90] as const;

export function pickDays(raw: string | undefined): number {
  const value = Number(raw);
  return (ANALYTICS_RANGES as readonly number[]).includes(value) ? value : 30;
}
```

`apps/web/app/admin/analytics/labels.ts`:

```ts
/** 방문 분석 이름표. 모르는 키는 그대로 보인다 — 지어낸 이름으로 덮지 않는다(`system/ai-labels.ts` 와 같은 판단). */
const SOURCE: Record<string, string> = {
  "(direct)": "직접 방문 (주소 입력·즐겨찾기·메신저 앱)",
  "(unknown)": "확인 못 함 (기록 전 방문·다른 기기·동의 안 함)",
};
const DEVICE: Record<string, string> = { mobile: "휴대폰", tablet: "태블릿", desktop: "컴퓨터" };
const BROWSER: Record<string, string> = {
  chrome: "크롬", safari: "사파리", edge: "엣지", firefox: "파이어폭스", samsung: "삼성 인터넷",
  kakaotalk: "카카오톡 앱 안", naver: "네이버 앱 안", other: "기타",
};
const PROVIDER: Record<string, string> = { email: "이메일", google: "Google", kakao: "카카오" };

export const sourceLabel = (key: string) => SOURCE[key] ?? key;
export const deviceLabel = (key: string) => DEVICE[key] ?? key;
export const browserLabel = (key: string) => BROWSER[key] ?? key;
export const providerLabel = (key: string) => PROVIDER[key] ?? key;
```

`apps/web/app/admin/analytics/traffic-panel.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@fixup/ui";
import type { DailyVisit, SiteTraffic } from "../../../lib/analytics/report";

const count = (value: number) => value.toLocaleString("ko-KR");
const percent = (ratio: number) => `${Math.round(ratio * 100)}%`;

export function duration(seconds: number): string {
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  return minutes ? `${minutes}분 ${total % 60}초` : `${total}초`;
}

/**
 * **얼마나 오나**(계획 2026-10-06 site-analytics). 숫자 여덟과 일별 막대.
 * 섞어 쓰기의 한계를 화면에 적는다 — 비회원은 하루 단위, 여러 날은 쿠키에 동의한 브라우저만.
 */
export function TrafficPanel({ report }: { report: SiteTraffic | null }) {
  return (
    <Card>
      <CardHeader><CardTitle>방문</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {report ? <TrafficNumbers report={report} /> : (
          <p className="text-sm text-muted-foreground">
            방문 보고를 읽지 못했습니다. Supabase 에 `202610060002_site_analytics_report.sql` 을 먼저 적용해야 합니다.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function TrafficNumbers({ report }: { report: SiteTraffic }) {
  const tiles: Array<[string, string]> = [
    ["오늘 방문자", count(report.todayVisitors)],
    [`최근 ${report.days}일 방문(하루 단위 합)`, count(report.visitorDays)],
    [`최근 ${report.days}일 들어온 회원`, count(report.members)],
    ["화면 본 횟수", count(report.views)],
    ["한 번 올 때 머문 시간(평균)", duration(report.avgSessionSeconds)],
    ["한 번 올 때 본 화면(평균)", String(report.avgViewsPerSession)],
    ["방문 통계 쿠키 동의율", percent(report.consentRate)],
    ["여러 날 다시 온 브라우저(동의자)", `${count(report.returningBrowsers)} / ${count(report.knownBrowsers)}`],
  ];
  return (
    <>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-lg border p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <DailyBars daily={report.daily} />
      <p className="text-xs text-muted-foreground">
        비회원은 하루 단위로만 같은 사람을 알아봅니다(같은 사람이 이틀 오면 2). 여러 날을 잇는 숫자는 방문 통계 쿠키에
        동의한 브라우저만 셉니다 — 동의율이 낮으면 실제보다 작습니다. 회원은 기간 전체에서 한 번만 셉니다. 관리자 방문은 뺐습니다.
      </p>
      <DailyTable daily={report.daily} />
    </>
  );
}

function DailyBars({ daily }: { daily: DailyVisit[] }) {
  const max = Math.max(1, ...daily.map((day) => day.visitors));
  return (
    <div className="flex h-32 items-end gap-px" role="img" aria-label={`일별 방문자 ${daily.length}일`}>
      {daily.map((day) => (
        <div
          key={day.day}
          title={`${day.day} · 방문 ${day.visitors} · 회원 ${day.members} · 가입 ${day.signups}`}
          className="flex-1 rounded-t-sm bg-primary/70"
          style={{ height: `${Math.max(2, (day.visitors / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function DailyTable({ daily }: { daily: DailyVisit[] }) {
  return (
    <details>
      <summary className="cursor-pointer text-sm font-medium">일별 표</summary>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            {["날짜", "방문자", "회원", "화면", "가입"].map((h) => <th key={h} className="py-1 pr-3 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {[...daily].reverse().map((day) => (
            <tr key={day.day} className="border-t">
              <td className="py-1 pr-3">{day.day}</td>
              <td className="py-1 pr-3">{count(day.visitors)}</td>
              <td className="py-1 pr-3">{count(day.members)}</td>
              <td className="py-1 pr-3">{count(day.views)}</td>
              <td className="py-1">{count(day.signups)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
```

`apps/web/app/admin/analytics/sources-panel.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@fixup/ui";
import type { Slice, SiteTraffic } from "../../../lib/analytics/report";
import { browserLabel, deviceLabel, sourceLabel } from "./labels";

/** **어디서 와서 어디를 보나**(계획 2026-10-06 site-analytics). 유입은 첫 화면 줄만 센다. */
export function SourcesPanel({ report }: { report: SiteTraffic | null }) {
  if (!report) return null;
  return (
    <Card>
      <CardHeader><CardTitle>들어온 경로와 많이 본 화면</CardTitle></CardHeader>
      <CardContent className="grid gap-6 xl:grid-cols-2">
        <SliceTable title="들어온 경로" rows={report.sources} label={sourceLabel} first="경로" />
        <SliceTable title="광고 캠페인(utm_campaign)" rows={report.campaigns} label={(key) => key} first="캠페인" />
        <SliceTable title="처음 연 화면" rows={report.landingPages} label={(key) => key} first="화면" />
        <SliceTable title="많이 본 화면" rows={report.pages} label={(key) => key} first="화면" />
        <SliceTable title="기기" rows={report.devices} label={deviceLabel} first="기기" />
        <SliceTable title="브라우저" rows={report.browsers} label={browserLabel} first="브라우저" />
      </CardContent>
    </Card>
  );
}

function SliceTable({ title, rows, label, first }: { title: string; rows: Slice[]; label: (key: string) => string; first: string }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      {rows.length ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 pr-3 font-medium">{first}</th>
              <th className="py-1 pr-3 font-medium">횟수</th>
              <th className="py-1 font-medium">방문자</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t">
                <td className="break-all py-1 pr-3">{label(row.key)}</td>
                <td className="py-1 pr-3">{row.views.toLocaleString("ko-KR")}</td>
                <td className="py-1">{row.visitors.toLocaleString("ko-KR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="text-sm text-muted-foreground">기록이 없습니다.</p>}
    </div>
  );
}
```

`apps/web/app/admin/analytics/people-panel.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@fixup/ui";
import type { SitePeople } from "../../../lib/analytics/report";
import { aiOperationLabel } from "../system/ai-labels";
import { providerLabel, sourceLabel } from "./labels";

const count = (value: number) => value.toLocaleString("ko-KR");
const seen = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" }) : "—";
const list = (items: Array<{ key: string; members: number }>, label: (key: string) => string) =>
  items.length ? items.map((item) => `${label(item.key)} ${count(item.members)}명`).join(" · ") : "기록 없음";

/**
 * **누가 무엇을 쓰나**(계획 2026-10-06 site-analytics). 기능은 이미 쌓이고 있는 AI 호출 기록
 * (`ai_cost_events`, 2026-09-30 부터)으로 센다 — 새로 모으지 않는다.
 */
export function PeoplePanel({ report }: { report: SitePeople | null }) {
  return (
    <Card>
      <CardHeader><CardTitle>회원과 기능</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        {report ? <PeopleBody report={report} /> : <p className="text-sm text-muted-foreground">회원 보고를 읽지 못했습니다.</p>}
      </CardContent>
    </Card>
  );
}

function PeopleBody({ report }: { report: SitePeople }) {
  const tiles: Array<[string, number]> = [
    [`최근 ${report.days}일 활동 회원`, report.activeMembers],
    ["그중 새로 가입", report.newMembers],
    ["그중 추천코드 입력", report.withReferral],
  ];
  return (
    <>
      <dl className="grid gap-3 sm:grid-cols-3">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-lg border p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold">{count(value)}</dd>
          </div>
        ))}
      </dl>
      <div className="space-y-1 text-sm">
        <p>가입 방법: {list(report.byProvider, providerLabel)}</p>
        <p>가입자가 처음 들어온 경로: {list(report.signupSources, sourceLabel)}</p>
      </div>
      <Table
        title="많이 쓴 기능(AI 호출 기준)"
        head={["기능", "횟수", "쓴 회원", "실패"]}
        rows={report.features.map((f) => [aiOperationLabel(f.key), count(f.calls), count(f.users), count(f.failed)])}
      />
      <Table
        title="많이 쓴 회원(상위 10)"
        head={["회원", "화면", "AI 호출", "마지막 방문"]}
        rows={report.topMembers.map((m) => [m.name ? `${m.name} (${m.email})` : m.email, count(m.views), count(m.calls), seen(m.lastSeen)])}
      />
    </>
  );
}

function Table({ title, head, rows }: { title: string; head: string[]; rows: string[][] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      {rows.length ? (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground">{head.map((h) => <th key={h} className="py-1 pr-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.join("|")} className="border-t">{row.map((cell, i) => <td key={i} className="break-all py-1 pr-3">{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      ) : <p className="text-sm text-muted-foreground">기록이 없습니다.</p>}
    </div>
  );
}
```

`apps/web/app/admin/analytics/page.tsx`:

```tsx
import Link from "next/link";
import { pruneAnalytics } from "../../../lib/analytics/record";
import { getSitePeople, getSiteTraffic } from "../../../lib/analytics/report";
import { PeoplePanel } from "./people-panel";
import { ANALYTICS_RANGES, pickDays } from "./range";
import { SourcesPanel } from "./sources-panel";
import { TrafficPanel } from "./traffic-panel";

export const dynamic = "force-dynamic";

/**
 * 방문 분석 탭(`/admin/analytics`, 계획 2026-10-06 site-analytics).
 * 관리자 확인은 `admin/layout.tsx` 의 `requireAdmin()` 이 한다. 열 때마다 보유기간 지난 줄을 지운다
 * (기다리지 않는다 — 못 지워도 화면은 열린다).
 */
export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = pickDays((await searchParams).days);
  void pruneAnalytics();
  const [traffic, people] = await Promise.all([getSiteTraffic(days), getSitePeople(days)]);
  return (
    <div className="space-y-6">
      <nav className="flex gap-2 text-sm" aria-label="보기 기간">
        {ANALYTICS_RANGES.map((range) => (
          <Link
            key={range}
            href={`/admin/analytics?days=${range}`}
            aria-current={range === days ? "page" : undefined}
            className={`rounded-md border px-3 py-1 ${range === days ? "bg-foreground text-background" : "hover:bg-muted"}`}
          >
            최근 {range}일
          </Link>
        ))}
      </nav>
      <TrafficPanel report={traffic} />
      <SourcesPanel report={traffic} />
      <PeoplePanel report={people} />
    </div>
  );
}
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm --filter web exec vitest run app/admin` → 전부 PASS.

- [ ] **Step 6: 눈으로 확인** — 로컬은 Supabase 가 비어 있어(`CLAUDE.md` 「로컬 확인」) 「읽지 못했습니다」 안내가 보이는 것이 정상이다. `run` 스킬로 `/admin/analytics` 를 열어 화면이 깨지지 않는지, 첫 화면에서 동의 띠가 뜨는지, 휴대폰 폭(390px)에서 가로 스크롤이 없는지 스크린샷으로 본다(브라우저 도구는 한 번에 하나씩). **dev 서버를 띄운 워크트리에서 빌드하지 않는다.**

- [ ] **Step 7: 커밋**

```bash
git add apps/web/app/admin/admin-tabs.tsx apps/web/app/admin/__tests__/admin-tabs.test.ts apps/web/app/admin/__tests__/analytics-panels.test.tsx apps/web/app/admin/analytics
git commit -m "feat(admin): 방문 분석 탭

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: 2단계 검증·리뷰·배포

- [ ] **Step 1:** Task 8 Step 1 의 네 명령 전부 다시 실행, 실패 0 확인.
- [ ] **Step 2:** `code-reviewer` + `database-reviewer`(보고 SQL 성능·정확성 — 특히 `touches` 의 하위 질의와 `not in` 이 1년치 자료에서 몇 초 걸리는지) 나란히. 지적 반영.
- [ ] **Step 3: 뮤테이션 확인**
  - SQL `admin_visitors` 조건(`e.visitor not in …`)을 지운다 → 「leaves admins out」 실패해야 함
  - SQL `admin_keys` 조건을 지운다 → 「/guide 1」 단언 실패해야 함
  - `v.day` 계산의 `at time zone 'Asia/Seoul'` 를 지운다 → 「Korean day」 실패해야 함
  - `interval '30 minutes'` 를 `'2 hours'` 로 → 「splits sessions」 실패해야 함
  - `touches` 의 `or e.cookie_key in (…)` 를 지운다 → 「first touch … through the cookie」 실패해야 함(youtube → instagram)
  - `labels.ts` 의 `(direct)` 줄을 지운다 → 패널 시험 실패해야 함
- [ ] **Step 4: PR** (`git diff origin/master...HEAD` 전체 확인, 시험 계획 포함)
- [ ] **Step 5: 배포**(사용자 요청 시, `docs/DEPLOY.md`): SQL `202610060002` 먼저 → 앱 → 확인 4종 + 빌드 안에 `방문 분석` 문구 → 운영 `/admin/analytics` 를 사용자와 함께 열어 1단계 이후 쌓인 숫자와 동의율이 보이는지 본다.

---

# 3단계 — 평가(별도 계획)

1·2단계 배포 뒤 **최소 2주** 데이터가 쌓이면 실제 숫자를 보고 새 계획을 쓴다. 지금 정해 둔 후보:

- **가입 깔때기:** 첫 방문 → 가입 화면 → 가입 완료 → 첫 생성(AI 호출) → 다음 주 재방문, 단계별 이탈률
- **유입별 성과:** 「유튜브 광고로 처음 온 사람 중 몇 %가 가입·생성까지 갔나」(2단계의 가입자 첫 유입을 깔때기로 넓힌다)
- **주간 재방문(코호트):** 가입 주별로 1~4주 뒤에도 쓰는 회원 비율
- **기간 비교:** 이번 주 vs 지난주 증감(방문·가입·활동 회원·기능 호출·동의율)

이 단계가 「분석 → 개선 → 평가」의 평가 부분이다. 개선은 숫자를 보고 사람이 정한다(코드가 아니다).

---

## 사용자 결정 대기 (기본값으로 계획을 썼다)

| # | 결정 | 기본값(이 계획) | 다르게 하면 |
|---|---|---|---|
| ① | 처리방침 변경 시행일 | 배포일 당일 | 외부 회원이 이미 있으면 미리 공지 후 시행(제13조). |
| ② | 원본 보관 기간 | 365일 | `ANALYTICS_KEEP_DAYS` 와 문구만 바뀐다 |
| ③ | 방문 통계 쿠키(`fx_vid`·`fx_consent`) 기간 | 365일 | `ANALYTICS_COOKIE_DAYS` 와 문구만 바뀐다 |
| ④ | 「어디에서」의 뜻 | 어느 **화면·기기·유입 경로**에서 | 지역(시·도)까지 원하면 IP→지역 변환이 필요하다(무료 DB 는 라이선스·갱신 부담) — 별도 판단 |
| ⑤ | 법률 확인(변호사) | 아래 둘을 확인받기 전까지는 이 설계대로 | ⓐ 자사 분석 쿠키에 동의 띠가 꼭 필요한지(이 계획은 받는 쪽 — 보수적) ⓑ **거부한 사람을 쿠키 없이 하루 단위로 세는 것**이 괜찮은지. ⓑ가 안 된다고 하면 `/api/track` 에서 `fx_consent=0` 이면 기록하지 않도록 한 줄 바꾸고, 하루 방문자 수는 「거부한 사람 제외」가 된다 |
