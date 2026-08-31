-- 전용 캐릭터와 일반 라이브러리 결과물을 구분한다.
--
-- 캐릭터 생성 결과는 characters/character_views에 저장된 뒤 다운로드·열람을 위해
-- 라이브러리에도 복사된다. 출처가 없으면 인물 사진 선택창과 캐릭터 선택창 양쪽에
-- 같은 캐릭터가 나타난다. source_id에는 전용 원본 id를 남기되, 원본 삭제 후에도
-- 라이브러리 결과물을 보존해야 하므로 FK로 묶지 않는다.

alter table public.library_items
  add column if not exists source_type text,
  add column if not exists source_id uuid;

-- 기존 캐릭터 자동 저장물은 이 고정 제목 형식으로만 만들어졌다. 런타임에서 제목을
-- 계속 해석하지 않고, 마이그레이션 시 한 번만 출처를 복원한다.
update public.library_items
set source_type = 'character'
where source_type is null
  and tool = 'create'
  and title like '% (캐릭터)';

update public.library_items
set source_type = 'generation'
where source_type is null;

alter table public.library_items
  alter column source_type set default 'generation',
  alter column source_type set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'library_items_source_type_check'
      and conrelid = 'public.library_items'::regclass
  ) then
    alter table public.library_items
      add constraint library_items_source_type_check
      check (source_type in ('generation', 'character'));
  end if;
end
$$;

create index if not exists library_items_user_source_created_idx
  on public.library_items (user_id, source_type, created_at desc);
