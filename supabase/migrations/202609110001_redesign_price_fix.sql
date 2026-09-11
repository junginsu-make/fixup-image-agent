-- 리디자인 · OpenAI 단가를 $0.19 → $0.02 로 내린다.
--
-- $0.19 는 잰 값이 아니었다. 이 표를 만든 마이그레이션(`202607280005`)이
-- 스스로 주석에 「청구서로 확인 후 조정」이라 적어 두고 그대로 굳었다.
--
-- 그런데 리디자인은 그림을 **`quality: "low"`** 로 부른다
-- (`packages/redesign-core/src/generate.ts` 의 `generateOpenAIImage`).
-- gpt-image-2 공개가는 저품질이 1024×1024 기준 $0.006 이고 어느 크기든
-- $0.01~0.02 대다. 고품질은 $0.211 다 — **우리는 고품질 값을 받고 저품질을
-- 만들어 주고 있었다.**
--
-- 우리 출력은 1152×2048 이라 위쪽을 잡아 $0.02 로 둔다. **청구서로 대조한
-- 값은 아직 아니다.** 대조 전까지는 조금 높게 둔다 — 적게 잡으면 우리가
-- 손해를 본다.
--
-- 코드에도 같은 값이 있다(`apps/web/lib/credit-cost.ts` 의 `FLAT_USD`).
-- **두 곳이 갈라지면 차감(코드)과 장부(이 표)가 어긋난다.** 한쪽만 고치지 않는다.

update public.model_prices
set unit_cost_usd = 0.02000,
    note = 'gpt-image-2 저품질(quality=low) 공개가 기준. 청구서 대조 전. 2026-09-11 에 $0.19 에서 내림',
    updated_at = now()
where model = 'redesign-openai';

-- Google 쪽은 그대로 둔다. 공개가가 해상도에 따라 $0.045~0.151 이고 지금 값
-- $0.13 은 그 범위 안이다. 해상도를 지정하지 않고 부르므로 위쪽을 잡아 둔다.
update public.model_prices
set note = 'gemini-3.1-flash-image-preview 공개가 $0.045~0.151 범위 안. 해상도 미지정이라 위쪽을 잡음',
    updated_at = now()
where model = 'redesign-google';
