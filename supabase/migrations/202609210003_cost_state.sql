-- 비용을 모르는 것과 0원인 것을 가른다 (설계 §7.2·§8.4)
--
-- 설계 §7.2: 「비용 알 수 없음은 **0원이 아니라 unknown/pending** 이다.」
-- 설계 §8.4: 「최종 비용 기록이 실패한 경우도 **재처리 대상으로 남긴다.**
--             정산만 완료됐다고 원가 기록까지 완료됐다고 하지 않는다.」
--
-- `llm_usd` 는 `not null default 0` 이라(202609100004) 「모른다」를 담을 칸이
-- 없었다. 그래서 세 가지가 전부 0 으로 보였다.
--
--   ① 정말 0원인 것 (그림만 만든 요청)
--   ② 제공자가 사용량을 안 준 것
--   ③ 기록이 실패한 것
--
-- ③이 제일 나쁘다. **돈은 나갔는데 장부가 0 이다.** 그리고 그 요청은
-- 「정산 완료」로 닫혀서 아무도 다시 안 본다.
--
-- 칸을 하나 더해 셋을 가른다. 기존 행은 전부 `recorded` 로 둔다 — 지금까지
-- 적힌 0 이 실제 0 인지는 소급해서 알 수 없고, 모르는 것을 안다고 하지
-- 않으려면 그대로 두는 편이 낫다.

alter table public.generation_events
  add column if not exists cost_state text not null default 'recorded'
    check (cost_state in ('recorded', 'unknown', 'failed'));

comment on column public.generation_events.cost_state is
  'recorded = 원가를 적었다 · unknown = 제공자가 사용량을 안 줬다 · failed = 적다가 실패했다(재처리 대상)';

-- 재처리 대상을 찾는 질의에 붙는다. 대부분의 행은 `recorded` 라 부분 색인이
-- 훨씬 작다.
create index if not exists generation_events_cost_retry_idx
  on public.generation_events(created_at desc)
  where cost_state <> 'recorded';
