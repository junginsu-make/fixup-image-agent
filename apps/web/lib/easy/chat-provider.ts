import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { textModelVendor } from "@fixup/shared";
import { EASY_LOOKS, EASY_RATIOS } from "../../app/easy/ask";
import {
  AnthropicStructuredProvider,
  OpenAIStructuredProvider,
  type StructuredSpec,
} from "../llm/structured";

/**
 * Easy 모드의 **말하는 쪽**.
 *
 * 2026-09-21 사용자 — 「이지 모드 채팅창은 기본 LLM 이 탑재되어 꼭 이미지만이
 * 아니라 사용자와 AI 가 대화 할 수 있어야 합니다.」
 *
 * ── 왜 기획 제공자를 안 쓰나 ─────────────────────────────────
 *
 * `createPosterPlanningProviders` 는 **포스터 기획 칸을 채우는** 틀
 * (`PLAN_SPEC`)에 묶여 있다. 여기서 돌려받아야 하는 것은 그 칸들이 아니라
 * 「말인가 주문인가」와 「말이면 무슨 답인가」 둘이다.
 *
 * 그러니 틀이 다르다. 같은 이름을 억지로 쓰면 한쪽을 고칠 때 다른 쪽이 깨진다.
 * **부르는 방식**(업체 가르기 · 구조화 응답)은 그대로 공용 어댑터를 쓴다.
 *
 * ── 고른 글 모델로 부른다 ────────────────────────────────────
 *
 * 입력창 위 드롭다운에서 고른 그 모델이다. 안 그러면 「고르는 척만 하는
 * 화면」이 된다 — 2026-09-18 에 기획 쪽에서 실제로 그랬다.
 */

const EASY_CHAT_SPEC: StructuredSpec = {
  name: "easy_turn",
  description: "사용자의 마지막 말이 그림 주문인지 가리고, 아니면 답을 쓴다.",
  schema: {
    type: "object",
    properties: {
      /*
       * **틀에 없으면 아무리 시켜도 안 온다.** 구조화 응답은 이 틀에 없는 칸을
       * 버린다 — 2026-09-17 에 `invented` 로 한 번, `hasText` 로 또 한 번
       * 당했다. 둘 다 프롬프트에만 적혀 있었다.
       */
      wants: { type: "string", enum: ["image", "talk"] },
      reply: { type: "string" },
      /*
       * **말 속에 있을 때만 채운다.** 빈 글이 「없다」는 뜻이다.
       *
       * `required` 에 넣는 까닭은 하나다 — 구조화 응답은 안 채운 칸을 그냥
       * 빼 버려서, 모델이 「없음」을 말할 길이 없으면 아무 값이나 채운다.
       */
      ratio: { type: "string", enum: ["", ...EASY_RATIOS.map((one) => one.id)] },
      /*
        **`auto` 는 안 준다.** 그것은 「안 골랐다」는 뜻의 기본값이라, 고를 거리로
        주면 모델이 그것을 골라 놓고 「말했다」가 된다 — 그러면 안 묻는다.
      */
      look: { type: "string", enum: ["", ...EASY_LOOKS.filter((one) => one.id !== "auto").map((one) => one.id)] },
    },
    required: ["wants", "reply", "ratio", "look"],
  },
};

export class EasyChatConfigurationError extends Error {
  constructor(readonly missing: string) {
    super(`${missing} 가 없어 대화를 할 수 없습니다.`);
    this.name = "EasyChatConfigurationError";
  }
}

/**
 * 한 번 물어볼 제공자.
 *
 * **예비를 두지 않는다.** 기획은 실패하면 값이 이미 나가는 중이라 예비가
 * 받아야 하지만, 이쪽은 아직 아무것도 안 만든 자리다. 실패하면 실패했다고
 * 말하고 사용자가 다시 치면 된다 — 조용히 다른 모델로 넘어가면 「내가 고른
 * 것과 다른 모델이 답했다」가 눈에 안 띄게 일어난다.
 */
export function createEasyChatProvider(
  environment: Record<string, string | undefined> = process.env,
  textModel?: string,
) {
  const vendor = textModel ? textModelVendor(textModel) : "anthropic";

  if (vendor === "openai") {
    const key = environment.OPENAI_API_KEY?.trim();
    if (!key) throw new EasyChatConfigurationError("OPENAI_API_KEY");
    const openai = new OpenAI({ apiKey: key, maxRetries: 2, timeout: 60_000 });
    return {
      decide: (prompt: string) =>
        new OpenAIStructuredProvider(openai, textModel!, EASY_CHAT_SPEC).generate(prompt),
    };
  }

  const key = environment.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new EasyChatConfigurationError("ANTHROPIC_API_KEY");
  const anthropic = new Anthropic({ apiKey: key, maxRetries: 2, timeout: 60_000 });
  return {
    decide: (prompt: string) =>
      new AnthropicStructuredProvider(
        anthropic,
        textModel ?? environment.ANTHROPIC_MODEL?.trim() ?? "claude-sonnet-5",
        EASY_CHAT_SPEC,
      ).generate(prompt),
  };
}
