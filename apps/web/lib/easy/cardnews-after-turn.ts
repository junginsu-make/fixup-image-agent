import { ASK_CARD_NUMBER, STILL_GENERATING, cardAt, isGenerating } from "../../app/easy/cardnews-after";
import type { EasyDecision } from "../../app/easy/chat";
import { captionCard, editCard } from "./cardnews-after-steps";
import { cardnewsProject, type EasyCardnewsProject } from "./cardnews-steps";
import type { createEasyChatProvider } from "./chat-provider";
import type { easyStoreForUser } from "./store";
import { aiText, askText, sayText } from "../../app/easy/turn-words";
import { ASK_ANSWER_NOTE } from "../../app/easy/ask-chain";
import { askTurn, type AskTurnContext } from "./ask-turn";

/**
 * **채팅에서 말로 만든 카드뉴스를 손본다**(3단계 설계 §5 · §6-5).
 *
 * - 「3번 다시 그려줘」 → 확인 줄만 돌려준다. **아무 라우트도 안 부르고 아무것도 안 남긴다.**
 *   값은 사용자가 확인 줄의 단추를 눌러야 나간다(사용자 결정 2026-10-01)
 * - 「3번 더 짧게」 → 그 장 글만 고친다(무료)
 * - 「올릴 글 써줘」 → 게시글 · 「다 받을게」 → 화면이 받는다
 * - 번호가 없거나 없는 번호면 몇 번인지 묻는다 — 물음 줄을 남기고 장 번호 단추를 단다(2차 D1)
 */
export async function cardAfterTurn(ctx: {
  request: Request;
  userId: string;
  store: ReturnType<typeof easyStoreForUser>;
  conversationId: string;
  prompt: string;
  /** 사용자 줄에 남길 글(단추 답이면 고른 값 표시가 붙는다, 2차 D1). 없으면 `prompt`. */
  userBody?: string;
  textModel: string;
  wants: "card_redo" | "card_text" | "caption" | "download";
  decision: EasyDecision;
  provider: ReturnType<typeof createEasyChatProvider>;
  project: EasyCardnewsProject;
  rows: ReadonlyArray<{ id: string; role: string; workId?: string | null }>;
  /** 2차 D1: 몇 번 장인지 물을 때 물음 줄을 남긴다. */
  물음: AskTurnContext;
}): Promise<Response> {
  const { conversationId, project, store, textModel } = ctx;
  // 카드뉴스 라우트가 준 작업은 옛 그림 주소를 품는다. 다시 읽어 새로 서명한 것을 준다(독립 리뷰).
  const 다시읽는다 = async (fallback: unknown) => (await cardnewsProject(ctx.userId, project.id)) ?? fallback;
  // 화면이 단추를 달 줄. 같은 작업을 가리키는 마지막 줄이다.
  const rowId = [...ctx.rows].reverse().find((row) => row.role === "image" && row.workId === project.id)?.id ?? "";

  if (ctx.wants === "download") return Response.json({ ok: true, download: { rowId }, textModel });

  /*
   * **일이 끝난 뒤에 남긴다**(미뤄 둔 것 5). 먼저 남기면 게시글 · 글 고치기가 실패했을 때
   * 답 없는 말만 대화에 남았다.
   */
  const 주고받기를남긴다 = async (answer: string) => {
    await store.appendMessage({ conversationId, role: "user", body: ctx.userBody ?? ctx.prompt });
    return store.appendMessage({ conversationId, role: "assistant", body: answer });
  };
  // 남기지 않는 답에는 id 를 안 준다. 빈 id 는 화면이 두 답을 같은 줄로 본다(미뤄 둔 것 1).
  const 말로만 = (body: string) => Response.json({ ok: true, talked: true, message: { role: "assistant", body }, textModel });
  if (ctx.wants === "caption") {
    const 고친작업 = await captionCard(ctx.request, project.id);
    // 끝 문장은 AI 가 쓴 말이 먼저(2차 D4), 비면 고정 문장.
    const message = await 주고받기를남긴다(sayText(aiText(ctx.decision, ctx.wants), "게시글을 썼습니다. 카드뉴스 밑에서 복사할 수 있습니다."));
    return Response.json({ ok: true, caption: { rowId, project: await 다시읽는다(고친작업) }, message, textModel });
  }

  const index = ctx.decision.card;
  // 답 표시(`answer`)는 바라는 점이 아니다(Task 10 고침 3). 물음 줄 · 확인 줄 · 글 고치기에 새지 않게 뺀다.
  const 바라는점 = ctx.decision.note === ASK_ANSWER_NOTE ? "" : ctx.decision.note ?? "";
  if (!index || !cardAt(project, index)) {
    /*
     * **몇 번 장인지 묻는다**(2차 D1 · D4). 물음도 대화에 남고 장 번호 단추를 단다. 문장은 AI 가 쓴
     * 물음이 먼저, 없으면 고정. 그때의 판단(갈래 · 바라는 점)을 적어 단추 답은 판단 없이 간다.
     */
    return askTurn(ctx.물음, {
      kind: "card",
      text: askText(aiText(ctx.decision, ctx.wants), ASK_CARD_NUMBER),
      data: {
        wants: ctx.wants,
        count: project.data.flow?.cards.length ?? 0,
        ...(바라는점 ? { note: 바라는점 } : {}),
      },
    });
  }
  if (ctx.wants === "card_redo") {
    /*
     * 물음의 답이면 사용자 줄을 남겨 물음을 닫는다(Task 10 고침 1). 안 남기면 새로고침 뒤 단추가 다시 살고 다음 말이
     * 옛 바라는 점의 답으로 읽힌다. 고른 값 표시는 안 붙인다 — 붙이면 화면이 실패한 단추 답으로 보고 단추를 다시 단다.
     * 값은 여전히 확인 단추에서만 나간다.
     */
    if (ctx.물음.cont) await store.appendMessage({ conversationId, role: "user", body: ctx.물음.prompt });
    return Response.json({ ok: true, cardAsk: { rowId, index, ...(바라는점 ? { note: 바라는점 } : {}) }, textModel });
  }

  // 만드는 중에 고치면 진행이 끊긴다(독립 리뷰). 아무것도 남기지 않고 답만 한다.
  if (isGenerating(project)) return 말로만(STILL_GENERATING);
  const got = await editCard(ctx.request, project, index, { words: 바라는점 || ctx.prompt },
    (text) => ctx.provider.editCard(text));
  const message = await 주고받기를남긴다(sayText(aiText(ctx.decision, ctx.wants), `${index}번 장 글을 고쳤습니다.`));
  return Response.json({
    ok: true, cardEdited: { rowId, project: await 다시읽는다(got.project), index, needsRedraw: got.needsRedraw }, message, textModel,
  });
}
