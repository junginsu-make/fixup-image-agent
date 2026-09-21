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
 * 그래서 이 목록은 **단가표에 있는 것만** 담는다. 설계 §5-4 가 적은 여덟 개가
 * 2026-09-21 에 다 들어왔다 — 단가표를 공식 문서로 대조해 고치면서 넷
 * (fable-5·gpt-6-astra·terra·luna)을 함께 채웠다.
 */

/** 어느 SDK 로 부르나. 목록에 업체가 섞여 있으므로 갈라야 한다. */
export type TextModelVendor = "anthropic" | "openai";

export interface TextModel {
  /** `LLM_PRICES` 의 열쇠와 같아야 한다. 시험이 지킨다. */
  id: string;
  /**
   * **부를 SDK.**
   *
   * 이 칸이 없으면 고른 모델이 실제로 안 불린다 — 2026-09-18 에 실제로 그랬다.
   * 드롭다운은 값을 받아 되돌려주기만 하고, 기획은 환경변수가 정한 모델로
   * 갔다. **고르는 척만 하는 화면**이었다.
   */
  vendor: TextModelVendor;
  /**
   * 그 업체 안에서의 **등급**.
   *
   * 값을 화면에서 뺐으므로(2026-09-21 사용자) 무엇이 위인지 알 길이 이것뿐이다.
   * 업체마다 이름 규칙이 달라 이름만으로는 못 가린다 — 「Sol」과 「Opus」 중
   * 어느 쪽이 위인지는 아무도 모른다.
   */
  tier: "빠름" | "표준" | "고급" | "최상";
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
  /*
    ── Anthropic ────────────────────────────────────────────
    **업체별로 묶고, 그 안에서 등급 순으로 둔다**(2026-09-21 사용자).

    값 순으로 섞어 놓으면 「Claude 중에 뭐가 있나」를 찾을 수 없다. 사람은
    업체를 먼저 떠올리고 그 안에서 고른다.
  */
  {
    id: "claude-haiku-4-5",
    vendor: "anthropic",
    tier: "빠름",
    label: "Claude Haiku 4.5",
    note: "가장 빠릅니다. 간단한 지시에",
  },
  {
    id: "claude-sonnet-5",
    vendor: "anthropic",
    tier: "표준",
    label: "Claude Sonnet 5",
    note: "기본. 지금 기획이 쓰는 모델입니다",
  },
  {
    id: "claude-fable-5",
    vendor: "anthropic",
    tier: "고급",
    label: "Claude Fable 5",
    note: "글을 길고 짜임새 있게 씁니다",
  },
  {
    id: "claude-opus-5",
    vendor: "anthropic",
    tier: "최상",
    label: "Claude Opus 5",
    note: "가장 깊이 생각합니다. 복잡한 지시에",
  },

  /* ── OpenAI ─────────────────────────────────────────────── */
  {
    id: "gpt-5.6-luna",
    vendor: "openai",
    tier: "빠름",
    label: "GPT-5.6 Luna",
    note: "가장 빠릅니다",
  },
  {
    id: "gpt-5.6-terra",
    vendor: "openai",
    tier: "표준",
    label: "GPT-5.6 Terra",
    note: "고르게 씁니다",
  },
  {
    id: "gpt-5.6-sol",
    vendor: "openai",
    tier: "고급",
    label: "GPT-5.6 Sol",
    note: "지시를 꼼꼼히 따릅니다",
  },
  {
    id: "gpt-6-astra",
    vendor: "openai",
    tier: "최상",
    label: "GPT-6 Astra",
    note: "가장 깊이 생각합니다",
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
 * 드롭다운에 낼 목록. **적어 둔 차례 그대로** 낸다.
 *
 * 전에는 값 순으로 세웠는데, 값을 화면에서 빼면서(2026-09-21 사용자) 그 차례가
 * 아무 뜻이 없어졌다. 업체가 섞여 「Claude 중에 뭐가 있나」를 찾을 수 없었다.
 *
 * 이제 `TEXT_MODELS` 에 적힌 차례가 그대로 화면의 차례다 — 업체별로 묶이고
 * 그 안에서 등급 순이다.
 *
 * **값은 여전히 붙여 준다.** 화면이 안 보일 뿐이고, 원가를 세는 쪽
 * (`cost.ts`)은 이 값을 쓴다.
 */
export function textModelChoices(): TextModelChoice[] {
  return TEXT_MODELS.map((model): TextModelChoice => ({
    ...model,
    // 표에서 가져온다. 여기서 손으로 적으면 두 벌이 된다.
    price: priceOf(model.id),
    isDefault: model.id === DEFAULT_TEXT_MODEL,
  }));
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

/**
 * 이 모델을 **어느 SDK 로** 부르나.
 *
 * **모르는 이름은 기본 모델의 업체로 떨어진다.** 지어내면 없는 SDK 를 부르고,
 * 그 실패가 화면에는 「기획이 안 됐다」로만 보인다.
 */
export function textModelVendor(id: string): TextModelVendor {
  const found = TEXT_MODELS.find((model) => model.id === id);
  if (found) return found.vendor;
  return TEXT_MODELS.find((model) => model.id === DEFAULT_TEXT_MODEL)!.vendor;
}
