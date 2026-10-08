-- 속도형(nano-banana-2.1) 단가를 단가표에 넣는다.
--
-- **코드보다 먼저 적용한다.** 집계가 `left join model_prices` 라 행이 없으면
-- 그 사이 만든 그림이 $0 으로 남는다(202609100001 머리 주석).
--
-- 값은 실측 전 어림이다. fal 은 토큰으로 매긴다 — 공표 2K $0.059(생성)·
-- $0.063(참고 2장 편집)은 짧은 프롬프트 기준이고 우리 것은 길다. 위쪽 값으로 둔다.
-- 실측하면 이 행과 sns-core 의 flatUsd 를 함께 고친다.
insert into public.model_prices (model, label, unit_cost_usd, note) values
  ('nano-banana-2.1', 'Nano Banana 2.1', 0.09000,
   '실측 전 어림(2026-10-08). fal 토큰 과금 — 공표 2K $0.059·편집 $0.063 위로 잡음. 회원 이름: 속도형.')
on conflict (model) do nothing;
