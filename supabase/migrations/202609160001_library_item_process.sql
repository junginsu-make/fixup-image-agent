-- 상세페이지 작업에도 **만든 과정**을 남긴다.
--
-- 카드뉴스(`sns_projects`)·포스터(`poster_projects`)는 기획안이 표에 통째로
-- 남아서 「과정 보기」가 성립했는데, 상세페이지는 `library_items` 에
-- 제목·비율·표지만 남았다. 그래서 눌러도 보여줄 것이 없었다(2026-09-16 확인).
--
-- 무엇을 담는지는 코드 한 곳(`app/api/library/work-process.ts`)이 정한다. 여기
-- 스키마는 「json 한 칸」까지만 안다 — 담을 것이 늘 때마다 마이그레이션을
-- 새로 하지 않기 위해서다.
--
-- **소급되지 않는다.** 이 칸이 생기기 전에 만든 작업은 `null` 로 남고, 화면이
-- 「과정이 남아 있지 않습니다」라고 말한다. 제목을 되짚어 과정을 복원하려는
-- 시도는 하지 않는다 — 없는 것을 지어내는 셈이다.
--
-- 기본값을 두지 않는 이유: `'{}'::jsonb` 를 기본으로 하면 옛 작업과 새 작업이
-- 구분되지 않아 화면이 빈 상자를 그리게 된다. 없으면 `null` 이어야 한다.

alter table public.library_items
  add column if not exists data jsonb;

comment on column public.library_items.data is
  '만든 과정(요약·섹션·심사·비율). 원본 사진은 담지 않는다 — base64 라 행이 무거워진다.';
