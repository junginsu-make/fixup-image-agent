import { askBody, type EasyAskKind } from "../../app/easy/row-marks";
import { easyTitle } from "../../app/easy/title";
import type { EasyStore } from "./store";

/**
 * **물음 턴을 대화에 남긴다**(2026-10-07 2차 설계 D1 · §3-1, 1차 `ad-turn.ts` 의 일반화).
 *
 * 사용자 줄 + 물음 줄 두 줄이다. 남겨야 새로고침해도 물음이 보이고, 단추 대신 말로 답해도 다음
 * 판단이 앞 물음을 안다. 물음 줄 자료에 그때의 판단(갈래 · 말한 비율 · 사진 id …)을 적어 두면
 * 단추 답은 판단 모델을 다시 안 부르고 바로 간다(`app/easy/ask-chain.ts` 의 `buttonDecision`).
 *
 * 값도 예약도 없다. 판정 예약은 이 앞에서 이미 닫혔다.
 */
export interface AskTurnContext {
  store: Pick<EasyStore, "appendMessage" | "renameConversation">;
  conversation: { title?: string | null };
  conversationId: string;
  /** 보일 말(단추 답이면 단추 글). 비어 있던 제목을 이것으로 짓는다. */
  prompt: string;
  /** 사용자 줄에 남길 글. 단추 답이면 `;pick=` 이 붙어 있다. */
  userBody: string;
  textModel: string;
  /** 이번 말이 앞 물음의 답이었나. 그러면 물음 줄에 `cont` 를 적어 사슬이 이어진다. */
  cont: boolean;
}

export async function askTurn(
  ctx: AskTurnContext,
  ask: { kind: EasyAskKind; text: string; data?: Record<string, unknown> },
  /** 옛 화면이 읽던 칸(`asked` · `kindAsk` · `photoAsk` · `needReference`). 배포 사이에도 깨지지 않게 싣는다. */
  legacy: Record<string, unknown> = {},
): Promise<Response> {
  const userMessage = await ctx.store.appendMessage({ conversationId: ctx.conversationId, role: "user", body: ctx.userBody });
  if (!ctx.conversation.title) await ctx.store.renameConversation(ctx.conversationId, easyTitle(ctx.prompt));
  const data = { ...(ctx.cont ? { cont: true } : {}), ...(ask.data ?? {}) };
  const message = await ctx.store.appendMessage({
    conversationId: ctx.conversationId, role: "assistant", body: askBody(ask.kind, ask.text, data),
  });
  return Response.json({ ok: true, ask: { kind: ask.kind }, message, userMessage, textModel: ctx.textModel, ...legacy });
}
