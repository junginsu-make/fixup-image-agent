-- 리디자인이 gpt-image-2.5 로 옮겨 간다. 단가도 그 모델의 표를 따른다.
--
-- 그동안 리디자인만 OpenAI 를 직접 불러 **한 세대 이전 모델**(gpt-image-2)에
-- 묶여 있었다. 카드뉴스·포스터·이미지·캐릭터는 전부 fal 을 거쳐
-- gpt-image-2.5 를 `max` 품질로 쓴다.
--
-- 옮기면 셋이 한꺼번에 좋아진다.
--
--   모델   gpt-image-2  →  gpt-image-2.5
--   품질   high         →  max
--   단가   $0.21        →  $0.165        ← 더 좋은데 더 싸다
--
-- $0.165 는 그 모델 단가표에서 우리 출력 크기(1152×2048)가 붙는 행이다
-- (`GPT25_MAX` 의 1024×1536 = $0.16464). **다른 도구가 같은 크기에 내는 값과
-- 같다.**
--
-- 코드에도 같은 값이 있다(`apps/web/lib/credit-cost.ts`). 갈라지면 차감과
-- 원가 장부가 어긋난다.

update public.model_prices
set unit_cost_usd = 0.16500,
    note = 'gpt-image-2.5 (max) · fal 경유. GPT25_MAX 표의 1024×1536 행. 2026-09-11 에 2.5 로 옮기며 $0.21 에서 내림',
    updated_at = now()
where model = 'redesign-openai';
