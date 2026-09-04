-- 예약 한도를 함수만 올리고 **표를 안 올렸다.**
--
-- 2026-07-27 에 `reserve_generation` 의 검사를 10 에서 60 으로 올렸다. 그때
-- 주석에 「바뀌는 것은 아래 함수의 상한 한 곳뿐이다」라고 적었는데, 그 말이
-- 틀렸다. `generation_events.requested_units` 의 check 는 그대로 10 이었다.
--
-- 그래서 11 이상을 예약하면 이렇게 된다.
--
--   1. 함수의 검사는 통과한다 (60 이하니까)
--   2. 같은 함수가 표에 넣으려다 check 에 걸린다 (23514)
--   3. 사용자에게는 「사용량을 확인하지 못했습니다」만 뜬다
--
-- 실제로 2026-09-04 운영에서 캐릭터 각도를 만들다 막혔다. 정면 한 장은 되는데
-- 각도 여러 장은 안 되는 것이 이것이다 — 장수에 모델 가중치를 곱하면 금세
-- 10 을 넘는다(6장 × 가중치 4 = 24).
--
-- 함수와 같은 값으로 맞춘다. 두 곳이 갈리면 또 이런 일이 난다.

alter table public.generation_events
  drop constraint if exists generation_events_requested_units_check;

alter table public.generation_events
  add constraint generation_events_requested_units_check
  check (requested_units >= 0 and requested_units <= 60);

-- `consumed_units` 는 손대지 않는다. 그쪽은 `<= requested_units` 라 위 상한을
-- 따라 저절로 올라간다. 절대값으로 못 박으면 두 곳이 또 갈린다.
