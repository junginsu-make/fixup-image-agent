-- qwen-image-2-pro 단가를 공표값으로 고친다. $0.0675 → $0.075
--
-- 바로 앞 마이그레이션(202609100001)에서 이 행을 채우면서 **재지도 읽지도 않고**
-- seedream 과 같은 등급이라는 이유로 $0.0675 를 적었다. 그날 fal 모델 페이지를
-- 확인해 보니 공표값이 $0.075 다 — text-to-image·edit 두 페이지 모두 같다.
--
--   https://fal.ai/models/fal-ai/qwen-image-2/pro/text-to-image
--   https://fal.ai/models/fal-ai/qwen-image-2/pro/edit
--   "Your request will cost $0.075 per image."  (2026-09-10 확인)
--
-- 11% 적게 잡혀 있었다. 집계가 조회 시점에 조인하므로 **지난 기록의 금액도 함께
-- 맞춰진다.**
--
-- 앞 마이그레이션을 고치지 않고 새 파일로 두는 이유: 그쪽은 이미 운영에 적용됐다.
-- 파일을 고치면 새로 만드는 환경만 $0.075 가 되고 운영은 $0.0675 로 남아 갈린다.
--
-- 같은 값이 코드 쪽에도 있다(`apps/web/lib/credit-cost.ts` 의 `FLAT_USD`).
-- 그쪽은 **회원 차감**에 쓰인다 — 이 표는 우리 원가 집계에만 쓴다. 둘 다 고쳤다.
--
-- 나머지 넷은 다시 확인했고 맞다 (2026-09-10, fal 모델 페이지):
--   nano-banana-pro   $0.15
--   nano-banana-2     $0.08 × 2K 배율 1.5 = $0.12
--   seedream-5-pro    $0.0675 (총 픽셀 1536×1536 이하 구간). 참조를 더 붙이면
--                     장당 $0.0045 씩 붙는데 그건 안 세고 있다 — 별건이다.
--   gpt-image-2.5     $0.21072 (1024²·max)

update public.model_prices
   set unit_cost_usd = 0.07500,
       note          = 'fal 공개 단가 $0.075/장 (2026-09-10 확인, t2i·edit 동일). 이전 $0.0675 는 재지 않고 seedream 등급에서 옮겨 적은 값이었다.',
       updated_at    = now()
 where model = 'qwen-image-2-pro';
