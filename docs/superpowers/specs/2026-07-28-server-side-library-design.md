# 사용자별 서버 라이브러리 (프로젝트 I)

작성일: 2026-07-28

## 왜 필요한가

지금 라이브러리는 **서버가 아니라 브라우저**에 있다.

```
apps/web/lib/library.ts
  "통합 라이브러리 — 두 도구의 IndexedDB 저장소를 읽기 전용으로 합쳐 보여준다"
```

IndexedDB 는 그 브라우저 안에만 있는 저장소다. 그래서 이런 일이 실제로 일어난다.

| 상황 | 지금 결과 |
|---|---|
| 회사 PC 에서 만들고 집에서 접속 | 안 보임 |
| 한 PC 를 두 사람이 씀 | **서로의 작업물이 보인다** |
| 브라우저 데이터 삭제 | **전부 사라진다** |

마지막이 특히 나쁘다. 크레딧을 써서 만든 결과가 브라우저 청소 한 번에 없어진다.
"사용자마다 구분되어야 한다"는 요구는 지금 구조로는 아예 성립하지 않는다 —
구분 단위가 사용자가 아니라 브라우저다.

## 지금 있는 것 (2026-07-28 확인)

| 자산 | 상태 |
|---|---|
| Supabase 인증 | 동작 중 |
| `public.profiles` | `auth.users` 참조, RLS 적용 |
| `public.generation_events` | 사용량 기록, RLS 적용 |
| **Supabase Storage 버킷** | **0개** — 만들어야 한다 |
| 서버측 결과 저장 | **없음** |

RLS 정책 패턴은 기존 것을 그대로 따른다: `using ((select auth.uid()) = user_id)`.

## 설계

### 1. 이미지는 Storage, 메타데이터는 테이블

이미지를 Postgres 에 base64 로 넣지 않는다. 섹션 이미지 한 장이 2~5MB라
작업 하나에 30MB가 넘는다. 행 하나가 그만큼 커지면 목록 조회조차 느려진다.

- **이미지** → Supabase Storage 버킷 `library`
- **메타데이터** → `public.library_items` (제목, 도구, 섹션 수, 만든 시각)

### 2. 경로 자체에 소유자를 박는다

Storage 경로를 `{user_id}/{item_id}/{index}.png` 로 둔다.

경로 첫 칸이 소유자라, Storage 정책을 경로만 보고 쓸 수 있다.

```sql
(storage.foldername(name))[1] = (select auth.uid())::text
```

파일명에 사용자를 안 박고 테이블만 대조하면, 정책을 한 번 잘못 쓰는 순간
남의 파일이 통째로 열린다. 경로에 박아두면 그런 실수가 어렵다.

### 3. 비공개 버킷 + 서명 URL

버킷은 **비공개**로 만든다. 공개 버킷은 URL 만 알면 누구나 본다 — 상세페이지는
출시 전 기획물이라 공개되면 안 된다.

조회할 때 짧은 수명(1시간)의 서명 URL 을 발급한다.

### 4. 저장은 사용자가 명시적으로

만들 때마다 자동 저장하지 않는다. 실험 삼아 돌린 것까지 전부 쌓이면 목록이
쓰레기로 찬다. 편집기에서 **"라이브러리에 저장"** 을 눌렀을 때만 올린다.

기존 IndexedDB 초안은 그대로 둔다. 브라우저 안에서 작업 중인 것과, 서버에
보관하기로 한 것은 다른 개념이다.

### 5. 기존 화면은 두 곳을 합쳐 보여준다

`/library` 는 지금도 두 IndexedDB 저장소를 합쳐 보여준다. 여기에 서버
라이브러리를 더한다. 항목마다 **어디에 있는지**(이 브라우저 / 내 계정)를
표시한다. 안 그러면 브라우저를 지웠을 때 무엇이 사라지는지 알 수 없다.

## 스키마

```sql
create table public.library_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  tool        text not null check (tool in ('create', 'redesign')),
  aspect_ratio text,
  image_count integer not null default 0 check (image_count >= 0),
  cover_path  text,                        -- Storage 경로
  created_at  timestamptz not null default now()
);

create table public.library_images (
  id        uuid primary key default gen_random_uuid(),
  item_id   uuid not null references public.library_items(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  position  integer not null,
  path      text not null,                 -- {user_id}/{item_id}/{position}.png
  mime_type text not null default 'image/png',
  created_at timestamptz not null default now(),
  unique (item_id, position)
);
```

`library_images` 에도 `user_id` 를 둔다. 정규화로만 보면 중복이지만, RLS 정책이
조인 없이 성립해야 빠르고 실수가 적다.

**삭제 시 Storage 정리**는 애플리케이션이 한다. `on delete cascade` 는 행만
지우고 파일은 남긴다 — 지웠다고 생각한 이미지가 Storage 에 남는 것이 가장 나쁘다.

## 하지 않는 것

- **자동 저장** — 목록이 쓰레기로 찬다. 누를 때만 저장한다
- **IndexedDB 폐기** — 작업 중 초안은 브라우저에 두는 편이 빠르다
- **공유 링크** — 수요가 확인된 뒤에
- **용량 제한** — 지금 사용자가 한 명이다. 늘어나면 그때 넣는다

## 단계

| 단계 | 내용 | 검증 |
|---|---|---|
| I1 | 마이그레이션 + Storage 버킷 + RLS | 다른 사용자로 남의 것이 안 보이는지 |
| I2 | 저장·조회·삭제 API | 실제 이미지로 왕복 |
| I3 | 편집기 "라이브러리에 저장" + `/library` 표시 | 브라우저로 끝까지 |
| I4 | 개선 과정에서 만든 이미지를 마스터 계정에 넣기 | 화면에 보이는지 |

RLS 는 만들자마자 **다른 사용자로 실제로 접근해 봐서** 막히는지 확인한다.
정책을 썼다는 것과 막힌다는 것은 다르다.
