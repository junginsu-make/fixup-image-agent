import {
  easyAvailableWants, easyChatPrompt, readEasyDecision,
  type EasyChoices, type EasyDecision, type EasyWant,
} from "../../app/easy/chat";
import type { EasyMessage } from "../../app/easy/turn";

/**
 * **「쉽게」 한 턴의 판단**(2026-10-06 설계 A1 · A3).
 *
 * 라우트에 두면 값으로 못 잰다. 여기서는 글 모델을 부르는 함수를 받아 쓴다 — 예약 ·
 * 정산은 라우트가 이 함수를 감싸서 한다.
 *
 *   A1  선택지는 `easyAvailableWants` 가 정한 것만 넘긴다(프롬프트도 같은 목록)
 *   A3  talk 인데 답이 비면 한 번 더 묻는다. 그래도 비면 빈 답 그대로 — 라우트가 기본 문장을 쓴다
 */
export interface EasyJudgeInput {
  decide: (prompt: string, wants: readonly EasyWant[]) => Promise<unknown>;
  history: readonly EasyMessage[];
  prompt: string;
  /** 지금 붙어 있는 사진 장수. */
  attachmentCount: number;
  choices: EasyChoices;
  /**
   * 「이미지 한 장 · 카드뉴스」 단추로 갈래를 골랐다(설계 A2). 라우트가 판단의 갈래를
   * 버리므로 talk 재질문(A3)을 하지 않는다 — 버릴 답에 값만 한 번 더 나간다(최종 리뷰).
   * 비율 · 그림체를 말에서 읽으려고 판단은 한 번 한다.
   */
  kindPicked?: boolean;
}

export async function judgeEasyTurn(input: EasyJudgeInput): Promise<EasyDecision> {
  const { hasDraft, made, madeImage } = input.choices;
  const wants = easyAvailableWants(input.choices);
  const ask = async (retry: boolean) => readEasyDecision(
    await input.decide(
      easyChatPrompt(input.history, input.prompt, input.attachmentCount, hasDraft, made, madeImage, { retry }),
      wants,
    ),
    { canRevise: hasDraft, made, editableImage: madeImage },
  );

  const first = await ask(false);
  if (input.kindPicked || first.wants !== "talk" || first.reply) return first;
  /*
   * **다시 물은 답은 talk 이고 글이 있을 때만 쓴다.** 다른 갈래로 바뀌면 사용자가 말한
   * 적 없는 만들기로 값이 나갈 수 있다 — 그때는 처음 답(빈 talk)을 그대로 둔다.
   */
  const again = await ask(true);
  return again.wants === "talk" && again.reply ? again : first;
}
