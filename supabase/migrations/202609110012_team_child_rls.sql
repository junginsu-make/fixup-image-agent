-- The parent gained its own project_id (the team's folder). Unqualified
-- project_id now binds to that inner column instead of the outer child.
begin;
drop policy if exists "team reads sns cards" on public.sns_cards;
create policy "team reads sns cards" on public.sns_cards for select to authenticated using (
  exists(select 1 from public.sns_projects parent
    where parent.id=public.sns_cards.project_id and public.same_team(parent.team_id,parent.user_id))
);
drop policy if exists "team reads poster images" on public.poster_images;
create policy "team reads poster images" on public.poster_images for select to authenticated using (
  exists(select 1 from public.poster_projects parent
    where parent.id=public.poster_images.project_id and public.same_team(parent.team_id,parent.user_id))
);
commit;
