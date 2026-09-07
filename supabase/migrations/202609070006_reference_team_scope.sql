-- 참고 이미지를 팀 것으로 좁힌다.
--
-- **이 단계에서만 무언가 사라진다.** 나머지 다섯 단계는 「오늘은 아무 일도
-- 안 일어난다」였는데 여기는 다르다. 그래서 마지막에 뒀다.
--
-- ── 왜 좁히나 ─────────────────────────────────────────────────────
--
-- 2026-09-04 에 참고 이미지를 회원 전원 공용으로 열었다(202609040010). 이유가
-- 분명했다 — 참고 이미지는 「따라 그릴 본보기」라, 한 사람이 올린 것을 남이 못
-- 쓰면 같은 그림을 사람 수만큼 다시 올려야 한다.
--
-- 팀이 생기면 그 이유가 뒤집힌다. 본보기는 **어떤 브랜드를 준비 중인지가
-- 그대로 드러나는 것**이라, 남의 팀 것이 보이면 안 된다.
--
-- ── 설계와 다르게 한 것 ───────────────────────────────────────────
--
-- 설계(결정 1)는 「팀이 없는 사람은 자기 것만 본다」로 못 박았다. 그대로 하면
-- **이 마이그레이션을 돌리는 날 전원이 서로의 본보기를 잃는다** — 지금은 팀이
-- 하나도 없기 때문이다. 팀을 만들기도 전에 잃는 것은 설계가 노린 것이 아니다.
--
-- 그래서 **팀이 하나라도 생긴 뒤부터** 좁힌다. 팀이 없는 회사에서는 지금과
-- 똑같이 전원 공용이다. 첫 팀을 만드는 순간이 「이제 나눠 쓰겠다」고 정하는
-- 순간이고, 좁아지는 것도 그때다.
--
-- **그래도 공지는 필요하다.** 첫 팀을 만들면 그날 사람들의 화면에서 남의
-- 본보기가 사라진다. 조용히 좁히면 고장 신고가 들어온다.
--
-- 설계: 팀 워크스페이스 구현 설계 (2026-09-07) 결정 1

-- ── 판정 ──────────────────────────────────────────────────────────
--
-- `security definer` 로 만든다. `teams` 와 `team_members` 는 회원에게 권한을
-- 회수해 두었으므로(1단계), 소유자 권한으로 돌아야 그 표를 읽는다. RLS 정책
-- 식은 묻는 사람의 권한으로 돌기 때문에 여기서 함수를 거치지 않으면 못 읽는다.
--
-- `search_path` 를 못 박는 것은 그 종류 함수의 기본이다.
create or replace function public.reference_visible(row_team_id uuid, row_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- 팀을 안 쓰는 회사는 지금과 같다. 나눌 상대가 없는데 나누면 잃기만 한다.
    when not exists (select 1 from public.teams where deleted_at is null) then true
    -- 내 것은 팀이 안 붙어 있어도 늘 보인다. 방금 올려 도장이 아직 안 찍힌
    -- 것이 내 눈앞에서 사라지면 안 된다.
    when row_user_id = (select auth.uid()) then true
    when row_team_id is not null then
      row_team_id = (select team_id from public.team_members where user_id = (select auth.uid()))
    -- 팀은 쓰는데 이 줄에도 나에게도 팀이 없다 — 남의 개인 것이다.
    else false
  end;
$$;

revoke all on function public.reference_visible(uuid, uuid) from public, anon;
grant execute on function public.reference_visible(uuid, uuid) to authenticated;

-- ── 정책 ──────────────────────────────────────────────────────────
--
-- 2026-09-04 의 `using (true)` 를 갈아 끼운다. **읽기 정책만 바꾼다** —
-- 「내 것이면 전부」인 기존 정책(`members manage own reference images`)은 그대로
-- 두고, 포스트그레스가 둘을 OR 로 합친다. 고치고 지우는 것은 여전히 올린
-- 사람만 한다.
drop policy if exists "members read all reference images" on public.reference_images;

create policy "team reads reference images"
  on public.reference_images
  for select
  to authenticated
  using (public.reference_visible(team_id, user_id));

-- ── 세트 항목은 그대로 둔다 ───────────────────────────────────────
--
-- 2026-09-04 에 「세트가 내 것이면 어떤 그림이든 넣을 수 있다」로 열어 두었다.
-- 그 조건을 지금 좁히지 않는다 — 애초에 못 보는 그림은 고를 수가 없어서
-- 화면으로는 닿지 않고, 이미 만들어 둔 세트에 남의 팀 그림이 들어 있다면
-- 그것을 막는 순간 그 세트가 조용히 깨진다.

-- ── 되돌리기 ──────────────────────────────────────────────────────
--
-- drop policy if exists "team reads reference images" on public.reference_images;
-- create policy "members read all reference images"
--   on public.reference_images for select to authenticated using (true);
-- drop function if exists public.reference_visible(uuid, uuid);
