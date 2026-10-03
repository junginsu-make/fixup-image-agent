-- 한 번만 실행한다. 다시 실행하면 첫 문장에서 실패하고 전부 되돌려진다. 실행 전 `select to_regclass('public.pdp_documents')` 가 null 인지 확인.
-- 상세페이지 서버 문서. 사용자가 검토한 뒤 운영 SQL 편집기에서 적용한다.
begin;
-- 저장 때 계산하는 작은 목록 전용 요약. 목록 요청은 document를 전송하지 않는다.
create function public.pdp_document_summary(doc jsonb) returns jsonb
language sql immutable strict set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'title',doc->>'title','stage',doc->>'stage',
    'sectionCount',jsonb_array_length(coalesce(doc->'body'->'sections','[]'::jsonb)),
    'aspectRatio',doc->'body'->'settings'->>'aspectRatio',
    'imageCount',count(asset),'cover',(jsonb_agg(asset order by position) filter (where asset is not null))->0,
    'imageTags',coalesce(jsonb_agg(left(asset->>'legacyHash',8) order by position) filter (where asset->>'legacyHash' is not null),'[]'::jsonb))
  from (
    select doc->'assets'->(section->'generatedImage'->>'$asset') as asset,position
    from jsonb_array_elements(coalesce(doc->'body'->'sections','[]'::jsonb)) with ordinality as sections(section,position)
  ) images;
$$;
-- 요약은 서버 저장 때 DB 안에서만 계산한다. 회원·익명이 직접 부르지 못하게 한다(Supabase 기본 권한 회수).
revoke all on function public.pdp_document_summary(jsonb) from public, anon, authenticated;
grant execute on function public.pdp_document_summary(jsonb) to service_role;
-- 문서가 한 번이라도 가졌던 섹션 그림 지문(요약의 imageTags, sha1 앞 8자리)을 오래 전에 본 것부터 둔다.
-- 라이브러리는 여기 있는 지문의 옛 그림을 숨긴다(지금 있음 → 문서 카드가 보임 / 예전에 있음 → 문서가 일부러 뺌).
-- 한 번도 없던 지문은 보인다: 이관 전 옛 그림, 문서가 아직 못 받은 생성 결과. 최근 500개만 남긴다 — 놓친 지문은 숨기지 않고 보일 뿐이다.
create function public.pdp_held_image_tags(previous text[], doc jsonb) returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(array_agg(tag order by seen), '{}') from (
    select tag, max(seen) as seen from (
      select tag, n as seen from unnest(coalesce(previous, '{}')) with ordinality as earlier(tag, n)
      union all
      select tag, cardinality(coalesce(previous, '{}')) + n
        from jsonb_array_elements_text(public.pdp_document_summary(doc)->'imageTags') with ordinality as latest(tag, n)
    ) every_tag group by tag order by max(seen) desc limit 500
  ) kept;
$$;
revoke all on function public.pdp_held_image_tags(text[], jsonb) from public, anon, authenticated;
grant execute on function public.pdp_held_image_tags(text[], jsonb) to service_role;
create table public.pdp_documents (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  revision integer not null default 0 check (revision >= 0),
  document jsonb,
  summary jsonb generated always as (public.pdp_document_summary(document)) stored,
  source_draft_id text check (length(source_draft_id) <= 120),
  last_request_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  cleanup_pending boolean not null default false,
  -- 정리를 마지막으로 시도한 시각. 계속 실패하는 삭제가 뒤 건을 굶기지 않게 오래된 순으로 돈다.
  cleanup_attempted_at timestamptz,
  -- 관리자 사본의 원래 회원(사본의 사본이면 처음 회원). 서버만 적고, 그 회원이 떠날 때 사본도 지운다.
  copied_from_owner uuid,
  -- 문서가 가졌던 그림 지문(`pdp_held_image_tags`). 저장 함수만 고친다 — 요청이 보낸 값을 받지 않는다.
  held_image_tags text[] not null default '{}',
  unique (user_id, source_draft_id),
  constraint pdp_document_size check (document is null or (jsonb_typeof(document) = 'object' and octet_length(document::text) <= 1048576))
);
create table public.pdp_document_revisions (
  document_id uuid not null references public.pdp_documents(id) on delete cascade,
  revision integer not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  document jsonb not null,
  pinned boolean not null default false,
  created_at timestamptz not null,
  primary key (document_id, revision)
);
create index pdp_documents_user_updated on public.pdp_documents(user_id, updated_at desc) where deleted_at is null;
create index pdp_documents_copied_from_owner on public.pdp_documents(copied_from_owner) where copied_from_owner is not null;
alter table public.pdp_documents enable row level security;
alter table public.pdp_document_revisions enable row level security;
create policy "own active pdp documents" on public.pdp_documents for select to authenticated
  using (user_id = (select auth.uid()) and deleted_at is null);
create policy "own active pdp revisions" on public.pdp_document_revisions for select to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.pdp_documents d where d.id = document_id and d.user_id = (select auth.uid()) and d.deleted_at is null
  ));
revoke all on public.pdp_documents, public.pdp_document_revisions from anon, authenticated;
grant select on public.pdp_documents, public.pdp_document_revisions to authenticated;
grant select, insert, update, delete on public.pdp_documents, public.pdp_document_revisions to service_role;

-- 비교·이전 본 보관·갱신을 한 트랜잭션에서 한다. 회원은 호출할 수 없다.
create function public.pdp_document_write(p_user uuid, p_id uuid, p_action text, p_payload jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  r public.pdp_documents%rowtype;
  source_id text := nullif(p_payload->>'sourceDraftId', '');
begin
  if p_action = 'create' then
    select * into r from public.pdp_documents where id = p_id for update;
    if found then
      if r.user_id <> p_user or r.deleted_at is not null then return jsonb_build_object('status',404); end if;
      return jsonb_build_object('status',200,'record',to_jsonb(r));
    end if;
    insert into public.pdp_documents(id,user_id,source_draft_id,copied_from_owner)
      values(p_id,p_user,source_id,nullif(p_payload->>'copiedFromOwner','')::uuid)
      on conflict do nothing;
    select * into r from public.pdp_documents
      where id = p_id or (user_id=p_user and source_draft_id=source_id)
      order by (id = p_id) desc limit 1 for update;
    if not found or r.user_id <> p_user or r.deleted_at is not null then return jsonb_build_object('status',404); end if;
    return jsonb_build_object('status',200,'record',to_jsonb(r));
  end if;
  select * into r from public.pdp_documents where id=p_id and user_id=p_user for update;
  if not found then return jsonb_build_object('status',404); end if;
  if p_action = 'delete' then
    update public.pdp_documents set deleted_at=coalesce(deleted_at,now()),cleanup_pending=true where id=p_id returning * into r;
  elsif p_action = 'purge' then
    if r.deleted_at is null then return jsonb_build_object('status',409); end if;
    delete from public.pdp_document_revisions where document_id=p_id;
    -- ID만 남겨 오래된 창/브라우저 초안이 삭제한 내용을 되살리지 못하게 한다.
    update public.pdp_documents set document=null, last_request_id=null,cleanup_pending=false,copied_from_owner=null,held_image_tags='{}' where id=p_id returning * into r;
  elsif p_action = 'pin' then
    if r.deleted_at is not null then return jsonb_build_object('status',404); end if;
    -- 보관 지점은 버전이 새로운 5개만 남는다. 이미 더 새 보관 지점이 5개면 이 버전은 곧바로 밀려나므로
    -- 「보관됨(200)」 대신 409 로 알리고 아무것도 바꾸지 않는다. 없는 버전은 아래에서 404 다.
    if ((r.revision=(p_payload->>'revision')::integer and r.document is not null) or exists(
          select 1 from public.pdp_document_revisions where document_id=p_id and user_id=p_user and revision=(p_payload->>'revision')::integer))
       and (select count(*) from public.pdp_document_revisions where document_id=p_id and pinned
          and revision>(p_payload->>'revision')::integer)>=5 then
      return jsonb_build_object('status',409);
    end if;
    if r.revision=(p_payload->>'revision')::integer and r.document is not null then
      insert into public.pdp_document_revisions(document_id,revision,user_id,document,created_at,pinned)
        values(r.id,r.revision,r.user_id,r.document,r.updated_at,true)
        on conflict(document_id,revision) do update set pinned=true;
    else
      update public.pdp_document_revisions set pinned=true where document_id=p_id and user_id=p_user and revision=(p_payload->>'revision')::integer;
      if not found then return jsonb_build_object('status',404); end if;
    end if;
    update public.pdp_document_revisions set pinned=false where document_id=p_id and pinned
      and revision not in (select revision from public.pdp_document_revisions where document_id=p_id and pinned order by revision desc limit 5);
    delete from public.pdp_document_revisions where document_id=p_id and not pinned and revision not in
      (select revision from public.pdp_document_revisions where document_id=p_id and not pinned order by revision desc limit 20);
  elsif p_action = 'save' then
    if r.deleted_at is not null then return jsonb_build_object('status',404); end if;
    if octet_length((p_payload->'document')::text)>1048576 then return jsonb_build_object('status',413); end if;
    if r.last_request_id=(p_payload->>'requestId')::uuid then
      if r.document is distinct from p_payload->'document' then return jsonb_build_object('status',400); end if;
      return jsonb_build_object('status',200,'record',to_jsonb(r));
    end if;
    if r.revision is distinct from (p_payload->>'baseRevision')::integer then
      return jsonb_build_object('status',409,'record',to_jsonb(r));
    end if;
    if p_payload->>'requestId' is null
       or p_payload->'document'->>'id' is distinct from p_id::text
       or p_payload->'document'->>'schemaVersion' is distinct from '3' then
      return jsonb_build_object('status',400);
    end if;
    if r.document is not null then
      insert into public.pdp_document_revisions(document_id,revision,user_id,document,created_at)
        values(r.id,r.revision,r.user_id,r.document,r.updated_at) on conflict(document_id,revision) do nothing;
    end if;
    -- 복원·관리자 사본도 이 저장을 거친다. 가졌던 지문은 지난 목록 + 이번 문서에서 서버가 센다.
    update public.pdp_documents set revision=revision+1, document=p_payload->'document',
      updated_at=clock_timestamp(), last_request_id=(p_payload->>'requestId')::uuid,
      held_image_tags=public.pdp_held_image_tags(held_image_tags, p_payload->'document') where id=p_id returning * into r;
    delete from public.pdp_document_revisions where document_id=p_id and not pinned and revision not in
      (select revision from public.pdp_document_revisions where document_id=p_id and not pinned order by revision desc limit 20);
  else return jsonb_build_object('status',400);
  end if;
  return jsonb_build_object('status',200,'record',to_jsonb(r));
end;
$$;
revoke all on function public.pdp_document_write(uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.pdp_document_write(uuid,uuid,text,jsonb) to service_role;

-- 원본은 기존 라이브러리의 수정/삭제 경로와 분리한다. 회원 직접 쓰기 정책을 만들지 않는다.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('pdp-documents','pdp-documents',false,20971520,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;
commit;
