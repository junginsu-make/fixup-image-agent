-- 참고 이미지를 팀 것으로 좁힌다. **팀에 묶인 것만.**
--
--   팀이 안 붙은 것   누구나 본다. 공용 창고다
--   내 팀 것          팀원 전원이 본다
--   남의 팀 것        안 보인다
--   운영자            전부 본다 (서버 권한으로 읽어 이 정책을 안 탄다)
--
-- ── 왜 이렇게 갈리나 ──────────────────────────────────────────────
--
-- 2026-09-04 에 참고 이미지를 회원 전원 공용으로 열었다(202609040010). 이유가
-- 분명했다 — 참고 이미지는 「따라 그릴 본보기」라, 한 사람이 올린 것을 남이 못
-- 쓰면 같은 그림을 사람 수만큼 다시 올려야 한다.
--
-- 팀이 생기면 그 이유가 **팀 것에 한해서** 뒤집힌다. 팀에 묶인 본보기는 어떤
-- 브랜드를 준비 중인지가 드러나는 것이라 남의 팀에 보이면 안 된다. 하지만
-- 어디에도 안 묶인 본보기는 여전히 공용 창고다 — 좁힐 이유가 없다.
--
-- ── 배포하는 날 아무것도 안 잃는다 ────────────────────────────────
--
-- 팀이 붙는 것은 두 순간뿐이다. 팀에 배정될 때 그 사람이 올려 둔 것이 함께
-- 옮겨 가고, 그 뒤로 올리는 것에 도장이 찍힌다(202609070004). 그래서 팀을
-- 안 쓰는 동안에는 **모든 줄의 팀이 비어 있고**, 이 규칙이 지금과 똑같은
-- 답을 낸다. 따로 안전장치를 둘 필요가 없다.
--
-- 좁아지는 것은 **사람을 팀에 넣는 순간**이다. 그때 그 사람이 올려 둔
-- 본보기가 팀 것이 되어 팀 밖에서 안 보인다. 배정 화면이 넣기 전에 몇 건이
-- 함께 가는지 보여 준다 — 조용히 좁히면 고장 신고가 들어온다.
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
    -- 어디에도 안 묶인 본보기는 공용 창고다. 이 줄이 「팀을 쓰기 전에는
    -- 지금과 똑같다」를 만든다 — 팀이 없으면 모든 줄이 이쪽으로 떨어진다.
    when row_team_id is null then true
    -- 내 것은 늘 보인다. 팀에서 빠졌거나 손으로 팀을 고친 줄이 있어도 자기
    -- 본보기가 사라지지는 않는다.
    when row_user_id = (select auth.uid()) then true
    else row_team_id = (select team_id from public.team_members where user_id = (select auth.uid()))
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
