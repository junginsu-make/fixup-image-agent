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
set search_path = public, pg_temp
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
set search_path = public, pg_temp
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
