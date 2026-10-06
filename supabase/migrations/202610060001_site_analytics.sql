-- 방문 통계 — 표 하나와 함수 다섯(계획 2026-10-06 site-analytics, 1단계 수집 + 보안 검토 반영).
--
-- ⚠ 공유 DB — detail-page-studio 가 같은 Supabase 를 본다. **새 표·새 함수만 더한다.**
-- ⚠ 순서 — **이 파일 먼저, 그다음 앱.** 앱이 먼저 나가면 기록이 「함수 없음」으로 실패하고
--   경고만 남는다(화면은 안 막는다). 그동안의 방문이 빠질 뿐이다.
--
-- 섞어 쓰기(2026-10-06 사용자 결정):
--   visitor    — 모두. **앱이** IP·브라우저 정보를 서버 메모리에만 있는 그날의 무작위 열쇠로 HMAC 한 값
--                (lib/analytics/visitor.ts). DB 는 열쇠도, 원래 IP·브라우저 정보도 받지 않는다.
--                그래서 DB·백업을 통째로 가져가도 되돌릴 수 없다. 하루 안에서만 같은 사람이다.
--   cookie_key — 방문 통계 쿠키에 **동의한** 브라우저만. 쿠키 번호(fx_vid)의 sha256. 여러 날을 잇는다.
--                거부·철회하면 analytics_forget 이 모든 줄에서 지운다.
-- 원래 IP·브라우저 정보·쿠키 값은 어디에도 남지 않는다.

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
create index if not exists analytics_page_views_visitor_idx on public.analytics_page_views (visitor, created_at);
create index if not exists analytics_page_views_cookie_idx on public.analytics_page_views (cookie_key, created_at) where cookie_key is not null;
alter table public.analytics_page_views enable row level security;
revoke all on table public.analytics_page_views from public, anon, authenticated;

-- ── 내부: 쿠키 번호 → 저장할 값 ────────────────────────────────────
create or replace function public.analytics_cookie_key(p_cookie text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when nullif(btrim(coalesce(p_cookie, '')), '') is null then null
              else encode(sha256(convert_to(btrim(p_cookie), 'UTF8')), 'hex') end;
$$;
revoke all on function public.analytics_cookie_key(text) from public, anon, authenticated;

-- ── 한 줄 쓰기 ───────────────────────────────────────────────────
-- 한 방문자 값이 한국 날짜 하루에 500줄을 넘으면 조용히 버린다(열린 자리라 DB 를 부풀리는 장난을 막는다).
create or replace function public.analytics_record(
  p_visitor text,
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
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
begin
  if p_visitor is null or p_visitor !~ '^[0-9a-f]{64}$' then
    raise exception 'analytics_record: visitor must be 64 hex';
  end if;
  if (select count(*) from analytics_page_views
       where visitor = p_visitor
         and created_at >= date_trunc('day', p_now at time zone 'Asia/Seoul') at time zone 'Asia/Seoul') >= 500 then
    return;
  end if;
  -- 없는 회원 번호로 쓰기 전체가 실패하지 않게, 있는 회원만 적는다.
  select id into v_user from profiles where id = p_user;
  insert into analytics_page_views(
    created_at, visitor, cookie_key, user_id, path, referrer_host,
    utm_source, utm_medium, utm_campaign, device, browser, entry
  ) values (
    p_now, p_visitor, analytics_cookie_key(p_cookie),
    v_user, p_path, nullif(btrim(p_referrer_host), ''),
    nullif(btrim(p_utm_source), ''), nullif(btrim(p_utm_medium), ''), nullif(btrim(p_utm_campaign), ''),
    p_device, p_browser, coalesce(p_entry, false)
  );
end $$;
revoke all on function public.analytics_record(text,uuid,text,text,text,text,text,text,text,boolean,text,timestamptz) from public, anon, authenticated;
grant execute on function public.analytics_record(text,uuid,text,text,text,text,text,text,text,boolean,text,timestamptz) to service_role;

-- ── 동의: 같은 방문자의 최근 줄에 번호를 잇는다 ──────────────────────
-- 첫 화면(유입 경로가 실린 줄)은 동의 띠를 누르기 **전에** 적힌다. 잇지 않으면 「어디서 왔나」가 번호에서 빠진다.
-- 같은 IP·같은 브라우저(공용 와이파이 등)의 다른 사람 줄을 가져오지 않게 **최근 30분**, 그리고
-- **로그인 전 줄 또는 본인 줄**만 잇는다. 다른 회원의 줄은 절대 잇지 않는다.
create or replace function public.analytics_link_cookie(
  p_cookie text,
  p_visitor text,
  p_user uuid,
  p_now timestamptz default now()
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text := analytics_cookie_key(p_cookie);
  v_linked integer;
begin
  if v_key is null then
    raise exception 'analytics_link_cookie: cookie required';
  end if;
  update analytics_page_views
     set cookie_key = v_key
   where visitor = p_visitor
     and cookie_key is null
     and created_at >= p_now - interval '30 minutes'
     and created_at <= p_now
     and (user_id is null or user_id = p_user);
  get diagnostics v_linked = row_count;
  return v_linked;
end $$;
revoke all on function public.analytics_link_cookie(text, text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.analytics_link_cookie(text, text, uuid, timestamptz) to service_role;

-- ── 거부·철회: 그 번호를 모든 줄에서 지운다 ─────────────────────────
create or replace function public.analytics_forget(p_cookie text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
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
set search_path = public, pg_temp
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
         and p.proname in ('analytics_cookie_key', 'analytics_record',
                           'analytics_link_cookie', 'analytics_forget', 'analytics_prune')) <> 5 then
    raise exception '방문 통계 함수 다섯이 하나씩이 아닙니다';
  end if;
  raise notice '방문 통계 표 하나와 함수 다섯을 만들었습니다.';
end $$;

-- 확인(적용 뒤, 읽기만):
--   select to_regclass('public.analytics_page_views');
--   select has_table_privilege('anon', 'public.analytics_page_views', 'select');   -- false
