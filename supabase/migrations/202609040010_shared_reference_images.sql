-- 참고 이미지를 회원 공용 창고로 연다.
--
-- 참고 이미지는 "따라 그릴 본보기"다. 한 사람이 올린 본보기를 다른 사람이 못
-- 쓰면 같은 그림을 사람 수만큼 다시 올려야 한다. 반면 작업물은 각자의 결과라
-- 남에게 보이면 안 된다 — 그래서 이 둘의 경계를 여기서 가른다.
--
-- **읽기만 연다.** 고치고 지우는 것은 여전히 올린 사람만 한다. 남이 올린
-- 본보기를 지울 수 있으면, 그 그림을 쓰던 다른 사람의 작업이 조용히 깨진다.
--
-- 서버는 목록을 admin 클라이언트로 읽으므로 이 정책이 목록을 좌우하지는
-- 않는다. 그래도 여기서 함께 열어 둔다 — 나중에 화면이 세션 클라이언트로
-- 직접 읽게 바뀌어도 같은 규칙이 서고, 지우기는 지금도 세션 클라이언트를
-- 거치므로 이 층이 실제 방어선이다.

-- 기존 "members manage own reference images" (for all) 는 그대로 둔다.
-- 정책은 OR 로 합쳐지므로 select 만 넓어지고, update/delete 는 그 정책의
-- 소유자 조건만 남는다.
drop policy if exists "members read all reference images" on public.reference_images;
create policy "members read all reference images"
  on public.reference_images
  for select
  to authenticated
  using (true);

-- 세트 항목의 소유는 **세트**가 정한다.
--
-- 전에는 "세트도 내 것이고 그림도 내 것"이어야 했다. 그림이 공용이 된 지금
-- 그 조건을 그대로 두면, 남이 올린 본보기를 내 세트에 넣는 순간 RLS 가 막아
-- 저장이 조용히 실패한다. 그림이 실제로 있는지는 외래 키가 이미 보장한다.
drop policy if exists "members manage own reference set items" on public.reference_set_items;
create policy "members manage own reference set items"
  on public.reference_set_items
  for all
  to authenticated
  using (
    exists (
      select 1 from public.reference_sets s
      where s.id = set_id and (select auth.uid()) = s.user_id
    )
  )
  with check (
    exists (
      select 1 from public.reference_sets s
      where s.id = set_id and (select auth.uid()) = s.user_id
    )
  );
