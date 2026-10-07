import { AD_QUESTION, adGuideBody } from "../../app/easy/ad-ask";
import { AD_GUIDE_FALLBACK, adGuidePrompt, readAdGuide } from "../../app/easy/ad-guide";
import { easyTitle } from "../../app/easy/title";
import type { easyStoreForUser } from "./store";

/**
 * **광고 물음 · 규격 안내 턴**(2026-10-06 설계 A5).
 *
 * 둘 다 사용자 말 + 도우미 줄을 남기고 끝낸다. **남겨야** 단추 대신 말로 답해도, 새로고침
 * 뒤에 답해도 앞 물음을 알고 판단한다. 화면은 지금 「말로 답한 턴」을 받는 꼴
 * (`talked` · `message`)을 그대로 받는다.
 */
export interface AdTurnContext {
  store: ReturnType<typeof easyStoreForUser>;
  conversation: { title?: string | null };
  conversationId: string;
  prompt: string;
  textModel: string;
}

async function 말과답을남긴다(ctx: AdTurnContext, body: string): Promise<Response> {
  await ctx.store.appendMessage({ conversationId: ctx.conversationId, role: "user", body: ctx.prompt });
  if (!ctx.conversation.title) await ctx.store.renameConversation(ctx.conversationId, easyTitle(ctx.prompt));
  const saved = await ctx.store.appendMessage({ conversationId: ctx.conversationId, role: "assistant", body });
  return Response.json({ ok: true, talked: true, message: saved, textModel: ctx.textModel });
}

/** 「광고 이미지? 규격별?」을 묻는다. 글 모델을 안 부른다 — 값도 예약도 없다. */
export function adQuestionTurn(ctx: AdTurnContext): Promise<Response> {
  return 말과답을남긴다(ctx, AD_QUESTION);
}

/** 규격 안내를 남긴다. 화면은 이 줄에 「광고소재 열기」를 단다. */
export function adGuideTurn(ctx: AdTurnContext & { guide: string }): Promise<Response> {
  return 말과답을남긴다(ctx, adGuideBody(ctx.guide));
}

/**
 * 안내 글을 쓴다. 사실은 `ad-guide.ts` 가 넣고, 비면 코드가 쓴 안내로 대신한다.
 *
 * **던지지 않는다**(최종 리뷰 2026-10-06). 글 모델이 실패해도(시간 초과 · 업체 오류) 같은
 * 사실을 코드가 쓴 안내(`AD_GUIDE_FALLBACK`)로 남긴다 — 안내 글 하나 때문에 대화가 오류로
 * 멈추면 사용자는 「광고소재」로 가는 길도 못 받는다.
 */
export async function writeAdGuide(
  write: (prompt: string) => Promise<unknown>,
  input: { prompt: string; imageCount: number },
): Promise<string> {
  try {
    return readAdGuide(await write(adGuidePrompt(input)));
  } catch {
    return AD_GUIDE_FALLBACK;
  }
}
