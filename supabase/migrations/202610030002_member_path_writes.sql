-- 회원은 그림 저장 위치 칸을 쓰지 못한다. 2026-10-03 보안 리뷰.
--
-- 라이브러리·캐릭터 각도·스타일 참고 줄의 위치(path) 칸을 회원이 자기 토큰으로
-- (PostgREST 를 직접 불러) 아무 글자로나 쓸 수 있었다. 행 정책은 「내 줄인가」만
-- 보고 위치가 누구 것인지는 안 본다. 서버는 그 위치를 서버 권한으로 서명·다운로드·
-- 삭제하므로, 남의 위치를 적어 두면 남의 그림이 열리거나(생성 재료로도) 지워졌다.
-- 2026-10-03 운영 확인: 위치가 주인 폴더 밖인 줄 0건 — 악용 흔적은 없다.
--
-- ── 무엇을 바꾸나 ─────────────────────────────────────────────────
--
-- 1. 네 표에서 회원(authenticated)·비회원(anon)의 INSERT·UPDATE 를 거둔다.
--    앱은 이 네 표를 **서버 권한(service role)으로만** 쓴다(2026-10-03 전수 확인) —
--    거둬도 깨지는 화면이 없다. 읽기·지우기(SELECT·DELETE)는 그대로 둔다.
--    참고 이미지 표(202608310003·202609160002)와 같은 방식이다.
--
-- 2. 카드뉴스 카드(sns_cards)는 거두지 않는다. 카드뉴스 생성이 **회원 토큰으로**
--    그림 위치를 쓴다(lib/sns/runtime.ts updateCard). 대신 위치 모양을 묶는다 —
--    비었거나, 그 줄 주인의 폴더(`<user_id>/`)로 시작하고 `..`·`%`·역슬래시·공백·
--    제어 문자가 없어야 한다. 퍼센트·탭은 저장소 주소에서 `..` 로 풀려 폴더를
--    빠져나간다(storage-js 가 위치를 인코딩 없이 주소에 붙인다).
--
-- 3. `sns_cards.thumb_path` 회원 UPDATE 권한을 **저장소에 적는다.** 운영에는 이미
--    있다(2026-10-03 확인) — 카드뉴스 생성이 이 칸을 쓰는데 저장소 기록에만 없었다.
--    운영에서는 아무것도 안 바뀐다. 이 칸도 2 의 모양 규칙을 함께 받는다.
--
-- ⚠ 언제 돌리나: 아무 때나 된다. 앱 배포 전·후 상관없다.
-- 여러 번 돌려도 같다. **두 덩어리로 돈다** — 1(권한 회수)이 먼저 끝나고, 2(카드 모양
-- 규칙)는 따로 돈다. 지금 있는 카드 줄 중 하나라도 2 의 규칙에 안 맞으면 2 만 실패하고
-- 되돌려진다 — 1 은 이미 적용돼 남는다. 그때는 오류 문구를 그대로 알려 주면 된다.

-- ── 1. 네 표의 회원 쓰기 회수 ──────────────────────────────────────
begin;

revoke insert, update on public.library_items from authenticated, anon;
revoke insert, update on public.library_images from authenticated, anon;
revoke insert, update on public.character_views from authenticated, anon;
revoke insert, update on public.style_references from authenticated, anon;

grant update (thumb_path) on public.sns_cards to authenticated;

commit;

-- ── 2. 카드 그림 위치는 주인 폴더 안 ───────────────────────────────
begin;

alter table public.sns_cards drop constraint if exists sns_cards_asset_path_own;
alter table public.sns_cards add constraint sns_cards_asset_path_own check (
  asset_path is null
  or (left(asset_path, 37) = user_id::text || '/'
      and asset_path !~ '\.\.|%|\\|[[:space:][:cntrl:]]')
);

alter table public.sns_cards drop constraint if exists sns_cards_thumb_path_own;
alter table public.sns_cards add constraint sns_cards_thumb_path_own check (
  thumb_path is null
  or (left(thumb_path, 37) = user_id::text || '/'
      and thumb_path !~ '\.\.|%|\\|[[:space:][:cntrl:]]')
);

commit;

-- ── 확인 ──────────────────────────────────────────────────────────
--
--   select t, r,
--          has_table_privilege(r, 'public.' || t, 'INSERT') as 표_추가,
--          has_table_privilege(r, 'public.' || t, 'UPDATE') as 표_수정,
--          has_any_column_privilege(r, 'public.' || t, 'INSERT') as 칸_추가,
--          has_any_column_privilege(r, 'public.' || t, 'UPDATE') as 칸_수정
--     from unnest(array['library_items','library_images','character_views','style_references']) t,
--          unnest(array['authenticated','anon']) r;
--   -- 여덟 줄 모두 넷 다 false 여야 한다. 표 단위 권한만 보면 칸 단위·물려받은 권한을 놓친다
--   -- (운영은 저장소 기록에 없는 칸 권한이 이미 하나 있었다).
--
--   select conname from pg_constraint
--    where conrelid = 'public.sns_cards'::regclass and conname like 'sns_cards_%_path_own';
--   -- 두 줄.
--
-- ── 되돌리기 ──────────────────────────────────────────────────────
--
--   grant insert, update on public.library_items, public.library_images,
--     public.character_views, public.style_references to authenticated, anon;
--   alter table public.sns_cards drop constraint if exists sns_cards_asset_path_own;
--   alter table public.sns_cards drop constraint if exists sns_cards_thumb_path_own;
