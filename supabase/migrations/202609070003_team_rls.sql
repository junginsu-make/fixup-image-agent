-- 팀이 서로의 작업물을 볼 수 있게 한다.
--
-- **오늘은 아무 일도 안 일어난다.** `team_id` 가 전부 `null` 이고, 그때
-- `same_team()` 은 「내 것인가」를 묻는다 — 지금 정책과 똑같은 답이다.
-- 팀이 배정되는 날부터 달라진다.
--
-- ── 기존 정책을 하나도 건드리지 않는다 ────────────────────────────
--
-- 처음에는 `for all` 정책의 조건을 갈아끼우려 했다. 그러면 표마다 SELECT·
-- INSERT·UPDATE·DELETE 를 따로 쪼개야 하고, 여덟 표면 정책이 서른 개가 넘는다.
-- 이 일에서 가장 위험한 자리에 손으로 적을 것이 서른 개면 하나는 틀린다.
--
-- 대신 **읽기 정책을 하나씩 더한다.** 같은 명령에 걸린 허용 정책이 여럿이면
-- 포스트그레스가 OR 로 합친다. 그래서
--
--   기존 정책        내 것이면 읽기·쓰기·지우기 전부           (그대로)
--   더하는 정책      같은 팀 것이면 **읽기만**                  (새로)
--
-- 이 되고, 쓰기와 지우기는 손대지 않은 채 읽기만 넓어진다.
--
-- ── 팀원이 남의 것을 지우면 안 된다 ───────────────────────────────
--
-- 읽기만 넓히는 것이 그 판단이다. 팀장과 운영자가 지우는 길은 서버 권한으로
-- 따로 나 있어(`deleteAnyWork`) 이 정책을 타지 않는다. 회원 세션으로 오는
-- 지우기는 지금처럼 자기 것만이다.
--
-- 팀원이 서로의 작업을 **고치는** 것도 아직 막힌다. 열어 줄지는 팀을 실제로
-- 써 보고 정할 일이지, 여기서 조용히 정할 일이 아니다.
--
-- 설계: 팀 워크스페이스 구현 설계 (2026-09-07)

-- ── 판정 함수 ─────────────────────────────────────────────────────
--
-- 정책마다 `join` 을 적지 않고 함수 하나를 부른다. 같은 join 을 열 곳에
-- 복사해 넣으면 한 곳만 고치는 날이 온다.
--
-- `security definer` 인 이유. `team_members` 는 회원에게 select 를 안 열었다
-- (표를 만들 때 권한을 회수했다). 이 함수가 소유자 권한으로 돌아야 그 표를
-- 읽을 수 있고, 그래서 회원 브라우저에 표를 열지 않고도 판정이 된다.
--
-- `search_path` 를 못 박는 것은 `security definer` 함수의 기본이다. 안 박으면
-- 부르는 쪽이 스키마를 바꿔치기해 다른 `team_members` 를 읽히게 할 수 있다.
create or replace function public.same_team(row_team_id uuid, row_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- 팀이 붙은 줄이면 내 팀인지 본다.
    when row_team_id is not null then
      row_team_id = (
        select team_id from public.team_members
        where user_id = (select auth.uid())
      )
    -- 팀이 없는 줄이면 내 것인지 본다. **오늘은 전부 이 길로 간다.**
    else row_user_id = (select auth.uid())
  end;
$$;

-- 함수는 열어 준다. 정책 안에서 불리므로 회원 권한으로 실행된다.
grant execute on function public.same_team(uuid, uuid) to authenticated;

-- ── 부모 표: 자기 칸으로 판정한다 ─────────────────────────────────
drop policy if exists "team reads sns projects" on public.sns_projects;
create policy "team reads sns projects"
  on public.sns_projects for select to authenticated
  using (public.same_team(team_id, user_id));

drop policy if exists "team reads poster projects" on public.poster_projects;
create policy "team reads poster projects"
  on public.poster_projects for select to authenticated
  using (public.same_team(team_id, user_id));

drop policy if exists "team reads library items" on public.library_items;
create policy "team reads library items"
  on public.library_items for select to authenticated
  using (public.same_team(team_id, user_id));

drop policy if exists "team reads characters" on public.characters;
create policy "team reads characters"
  on public.characters for select to authenticated
  using (public.same_team(team_id, user_id));

drop policy if exists "team reads reference sets" on public.reference_sets;
create policy "team reads reference sets"
  on public.reference_sets for select to authenticated
  using (public.same_team(team_id, user_id));

-- ── 자식 표: 부모를 통해 판정한다 ─────────────────────────────────
--
-- 자식에는 `team_id` 를 안 달았다. 양쪽에 달면 둘이 어긋나는 날이 오고,
-- 그때 어느 쪽이 맞는지 정할 근거가 없다.
drop policy if exists "team reads sns cards" on public.sns_cards;
create policy "team reads sns cards"
  on public.sns_cards for select to authenticated
  using (exists (
    select 1 from public.sns_projects parent
    where parent.id = project_id
      and public.same_team(parent.team_id, parent.user_id)
  ));

drop policy if exists "team reads poster images" on public.poster_images;
create policy "team reads poster images"
  on public.poster_images for select to authenticated
  using (exists (
    select 1 from public.poster_projects parent
    where parent.id = project_id
      and public.same_team(parent.team_id, parent.user_id)
  ));

drop policy if exists "team reads library images" on public.library_images;
create policy "team reads library images"
  on public.library_images for select to authenticated
  using (exists (
    select 1 from public.library_items parent
    where parent.id = item_id
      and public.same_team(parent.team_id, parent.user_id)
  ));

drop policy if exists "team reads character views" on public.character_views;
create policy "team reads character views"
  on public.character_views for select to authenticated
  using (exists (
    select 1 from public.characters parent
    where parent.id = character_id
      and public.same_team(parent.team_id, parent.user_id)
  ));

-- ── 참고 이미지는 이번에 안 좁힌다 ────────────────────────────────
--
-- 지금은 「회원 전원이 읽는다」(`using (true)`)다. 팀이 생기면 그것이
-- 모순된다 — 남의 팀 본보기가 보이면 안 된다. 참고 이미지는 따라 그릴
-- 본보기라, 어떤 브랜드를 준비 중인지가 그대로 드러난다.
--
-- 그런데 **지금 좁히면 가져가는 것만 있고 주는 것이 없다.** 팀이 아직
-- 아무에게도 없어서, 좁히는 순간 쓰던 본보기가 사라진 것으로 보일 뿐이다.
--
-- 팀을 실제로 배정하는 단계에서 함께 좁힌다. 그때는 팀 공용이 대신 열리므로
-- 잃는 것과 얻는 것이 같이 온다. **그 배포에는 공지가 필요하다** — 조용히
-- 좁히면 고장 신고가 들어온다.
