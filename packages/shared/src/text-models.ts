import { LLM_PRICES, priceOf, type TokenPrice } from "./llm-price";

/**
 * **글 모델 목록** — Easy 모드의 드롭다운이 쓴다 (설계 §5-4·§7).
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────
 *
 * 그림 모델은 `lib/studio/model-choice.ts` 가 이미 목록을 만든다 — 못 쓰는 것을
 * 걸러내고 값과 설명을 붙인다. 글 모델에는 그런 것이 없었다. 지금까지 화면에서
 * 글 모델을 고를 일이 없었기 때문이다(코드가 `claude-sonnet-5` 로 못 박았다).
 *
 * Easy 모드는 그것을 고르게 한다. 값 차이가 **열 배를 넘는데**(가장 싼 것 대비)
 * 그림값과 달리 고르는 사람이 그 차이를 모른다.
 *
 * ── 단가를 여기 안 적는다 ─────────────────────────────────────
 *
 * `LLM_PRICES` 가 이미 갖고 있다. 여기에 또 적으면 두 벌이 되고, 하나는 곧
 * 낡는다. 그리고 **낡은 쪽이 화면에 보인다** — 사용자가 보는 유일한 값 정보다.
 *
 * ── 값을 모르는 모델은 넣지 않는다 ────────────────────────────
 *
 * `priceOf` 는 모르는 모델에 「아는 것 중 가장 비싼 값」을 물린다. 셈이 틀리는
 * 쪽으로는 안전하지만 **화면에는 그 값이 진짜인 것처럼 보인다.** 설계 §5-4 가
 * 「값을 모르는 채로 넣지 않는다」고 못 박은 이유다. 시험이 이것을 지킨다.
 *
 * 그래서 이 목록은 **단가표에 있는 것만** 담는다. 설계 §5-4 는 여덟 개를
 * 적었는데, 그 중 넷(fable-5·gpt-6-astra·terra·luna)은 단가표에 아직 없다 —
 * 단가 수정이 들어오면 여기에 한 줄씩 더한다.
 */

export interface TextModel {
  /** `LLM_PRICES` 의 열쇠와 같아야 한다. 시험이 지킨다. */
  id: string;
  /** 드롭다운에 보이는 이름. **진짜 이름을 낸다**(설계 §5-1). */
  label: string;
  /** 한 줄 설명. 왜 이것을 고를까. */
  note: string;
}

/**
 * **진짜 이름을 낸다** — 이 화면에서만 푸는 예외다(설계 §5-1).
 *
 * `apps/web/lib/__tests__/model-name.test.ts` 가 회원이 보는 글에서 업체·모델
 * 이름을 막는다. 까닭은 「어떤 모델을 어디에 쓰는지」가 실측으로 쌓은 결론이고,
 * 화면에 적으면 가입 한 번으로 그것이 통째로 넘어가기 때문이다.
 *
 * Easy 모드를 예외로 두는 것은 **맞바꾼 결정**이다(2026-09-17 사용자). 고르게
 * 하면 아는 사람은 잘 고르고, 우리가 무엇을 쓰는지는 드러난다.
 *
 * **예외는 `app/easy` 로 한정한다.** 거기서 만든 값이 다른 화면으로 새면 안 되고,
 * 특히 **모델이 쓴 글**에 이름이 묻어 나가면 안 된다 — 2026-09-17 에 카드뉴스에서
 * 실제로 있었다(`stripModelMentions` 로 막았다).
 */
export const TEXT_MODELS: readonly TextModel[] = [
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    note: "가장 싸고 빠릅니다. 간단한 지시에",
  },
  {
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    note: "기본. 지금 기획이 쓰는 모델입니다",
  },
  {
    id: "gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    note: "다른 업체의 눈으로 씁니다",
  },
  {
    id: "claude-opus-5",
    label: "Claude Opus 5",
    note: "가장 비쌉니다. 복잡한 지시에",
  },
];

/**
 * 기본 글 모델. **지금 기획이 쓰는 것과 같게 둔다**(`PRIMARY_POSTER_MODEL`).
 *
 * 바꾸려면 근거가 있어야 한다(설계 §5-4). 이 저장소가 겪은 구조화 사고들은
 * 모델이 약해서가 아니라 **응답 틀이 막고 있어서**였다 — 모델을 올려도 그 종류는
 * 안 풀린다. 드롭다운에서 실제로 견준 뒤에 옮긴다.
 */
export const DEFAULT_TEXT_MODEL = "claude-sonnet-5";

export interface TextModelChoice extends TextModel {
  price: TokenPrice;
  isDefault: boolean;
}

/**
 * 드롭다운에 낼 목록. **싼 것부터** 낸다.
 *
 * 사용자가 값을 보고 고르는 자리이므로 목록의 차례가 그 판단을 돕는다. 출력
 * 단가로 세운다 — 이미지 프롬프트는 받는 글이 길고, 그쪽이 값을 가른다.
 */
export function textModelChoices(): TextModelChoice[] {
  return TEXT_MODELS
    .map((model): TextModelChoice => ({
      ...model,
      // 표에서 가져온다. 여기서 손으로 적으면 두 벌이 된다.
      price: priceOf(model.id),
      isDefault: model.id === DEFAULT_TEXT_MODEL,
    }))
    .sort((a, b) => a.price.outputPerMillion - b.price.outputPerMillion);
}

/**
 * 고른 모델이 쓸 수 있는 것인가.
 *
 * **화면이 보낸 값을 믿지 않는다.** 목록에 없는 id 가 오면 기본으로 떨어진다 —
 * 값을 모르는 모델을 부르면 원가를 못 세고, 셈이 틀린 채로 돌아간다.
 */
export function resolveTextModel(id: string | undefined): string {
  if (!id) return DEFAULT_TEXT_MODEL;
  return TEXT_MODELS.some((model) => model.id === id) && LLM_PRICES[id]
    ? id
    : DEFAULT_TEXT_MODEL;
}
