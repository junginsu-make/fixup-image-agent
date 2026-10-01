import { ASK_CARD_NUMBER, STILL_GENERATING, cardAt, isGenerating } from "../../app/easy/cardnews-after";
import type { EasyDecision } from "../../app/easy/chat";
import { captionCard, editCard } from "./cardnews-after-steps";
import { cardnewsProject, type EasyCardnewsProject } from "./cardnews-steps";
import type { createEasyChatProvider } from "./chat-provider";
import type { easyStoreForUser } from "./store";

/**
 * **채팅에서 말로 만든 카드뉴스를 손본다**(3단계 설계 §5 · §6-5).
 *
 * - 「3번 다시 그려줘」 → 확인 줄만 돌려준다. **아무 라우트도 안 부르고 아무것도 안 남긴다.**
 *   값은 사용자가 확인 줄의 단추를 눌러야 나간다(사용자 결정 2026-10-01)
 * - 「3번 더 짧게」 → 그 장 글만 고친다(무료)
 * - 「올릴 글 써줘」 → 게시글 · 「다 받을게」 → 화면이 받는다
 * - 번호가 없거나 없는 번호면 몇 번인지 되묻는다(남기지 않는다)
 */
export async function cardAfterTurn(ctx: {
  request: Request;
  userId: string;
  store: ReturnType<typeof easyStoreForUser>;
  conversationId: string;
  prompt: string;
  textModel: string;
  wants: "card_redo" | "card_text" | "caption" | "download";
  decision: EasyDecision;
  provider: ReturnType<typeof createEasyChatProvider>;
  project: EasyCardnewsProject;
  rows: ReadonlyArray<{ id: string; role: string; workId?: string | null }>;
}): Promise<Response> {
  const { conversationId, project, store, textModel } = ctx;
  // 카드뉴스 라우트가 준 작업은 옛 그림 주소를 품는다. 다시 읽어 새로 서명한 것을 준다(독립 리뷰).
  const 다시읽는다 = async (fallback: unknown) => (await cardnewsProject(ctx.userId, project.id)) ?? fallback;
  // 화면이 단추를 달 줄. 같은 작업을 가리키는 마지막 줄이다.
  const rowId = [...ctx.rows].reverse().find((row) => row.role === "image" && row.workId === project.id)?.id ?? "";

  if (ctx.wants === "download") return Response.json({ ok: true, download: { rowId }, textModel });

  const 말을남긴다 = () => store.appendMessage({ conversationId, role: "user", body: ctx.prompt });
  if (ctx.wants === "caption") {
    await 말을남긴다();
    const 고친작업 = await captionCard(ctx.request, project.id);
    const message = await store.appendMessage({ conversationId, role: "assistant", body: "게시글을 썼습니다. 카드뉴스 밑에서 복사할 수 있습니다." });
    return Response.json({ ok: true, caption: { rowId, project: await 다시읽는다(고친작업) }, message, textModel });
  }

  const index = ctx.decision.card;
  if (!index || !cardAt(project, index)) {
    return Response.json({ ok: true, talked: true, message: { id: "", role: "assistant", body: ASK_CARD_NUMBER }, textModel });
  }
  if (ctx.wants === "card_redo") {
    return Response.json({ ok: true, cardAsk: { rowId, index, ...(ctx.decision.note ? { note: ctx.decision.note } : {}) }, textModel });
  }

  if (isGenerating(project)) {
    // 남기기 전에 본다. 만드는 중에 고치면 진행이 끊기고, 실패하면 답 없는 말만 남는다(독립 리뷰).
    return Response.json({ ok: true, talked: true, message: { id: "", role: "assistant", body: STILL_GENERATING }, textModel });
  }
  await 말을남긴다();
  const got = await editCard(ctx.request, project, index, { words: ctx.decision.note || ctx.prompt },
    (text) => ctx.provider.editCard(text));
  const message = await store.appendMessage({ conversationId, role: "assistant", body: `${index}번 장 글을 고쳤습니다.` });
  return Response.json({
    ok: true, cardEdited: { rowId, project: await 다시읽는다(got.project), index, needsRedraw: got.needsRedraw }, message, textModel,
  });
}
