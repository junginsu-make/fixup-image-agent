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
