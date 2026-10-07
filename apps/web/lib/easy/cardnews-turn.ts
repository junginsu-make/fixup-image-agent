import { sayBody } from "../../app/easy/row-marks";
import type { EasyChosen } from "../../app/easy/ask-chain";
import { easyTitle } from "../../app/easy/title";
import { UNUSABLE_PHOTO } from "../../app/easy/photo-check";
import { readChosenRoles } from "../../app/easy/photo-roles";
import { runPhotoTurn } from "../../app/easy/photo-turn";
import { NOT_MINE, NO_REFERENCE, cardAttachmentsFrom, readChosenSlots, slotsFromWords } from "../../app/easy/cardnews-attachments";
import { pickCardSource } from "../../app/easy/cardnews-source";
import { cardOptionsFrom, projectSpecFrom, readCardOptions } from "../../app/easy/cardnews-options";
import { redraftInput } from "../../app/easy/cardnews-redraft";
import { draftFailureMessage } from "../../app/easy/cardnews-view";
import { resultLabel } from "../../app/easy/image-numbers";
import { SAY_CARDNEWS, SAY_REVISE, aiText, photoQuestion, sayText } from "../../app/easy/turn-words";
import { isWebSourceEnabled } from "../sns/feature";
import { askTurn, type AskTurnContext } from "./ask-turn";
import { draftCardnews, type lastCardnewsProject } from "./cardnews-steps";
import type { createEasyChatProvider } from "./chat-provider";
import { readEasyPhotos } from "./read-photos";
import { 멈춘다 } from "./stop";
import type { easyStoreForUser } from "./store";

/**
 * **카드뉴스 원고 턴**(2단계 설계 §3 · §5 · §7 · §9).
 *
 * 원고까지만 쓴다. 원고는 공짜고, 크레딧은 화면의 「이대로 만들기」가 따로 부르는
 * 카드뉴스 `generate` 가 잡는다. 멈추면 아무것도 안 남기고, 물으면 사용자 줄 + 물음 줄을 남긴다(2차 D1).
 */
export async function cardnewsTurn(ctx: {
  request: Request;
  userId: string;
  store: ReturnType<typeof easyStoreForUser>;
  conversation: { title?: string | null };
  conversationId: string;
  prompt: string;
  textModel: string;
  wants: "cardnews" | "revise";
  사진들: Array<{ id: string; title?: string | null; url?: string | null; storagePath: string }>;
  붙인것: string[];
  input: Record<string, unknown>;
  decision: { wants: string; reply: string; ratio?: string; look?: string };
  provider: ReturnType<typeof createEasyChatProvider>;
  고칠원고: Awaited<ReturnType<typeof lastCardnewsProject>>;
  /** 물음 줄을 남길 때(2차 D1). */
  물음: AskTurnContext;
  /** 물을 때의 판단(말에 있던 비율 · 그림체). */
  말한것: { ratio?: string; look?: string };
  /** 이번 턴의 고른 값(단추 · 이어진 물음, 2차 D1). */
  고른: EasyChosen;
  /** 만들 때 쓰는 지시 = 처음 말 + 답들(답이 아니면 이번 말). */
  지시: string;
  /** 사용자 줄에 남길 글. */
  userBody: string;
  /** 남길 원고 줄의 결과물 번호(2차 D2 — 화면의 「카드뉴스 N」). */
  결과번호: number;
}): Promise<Response> {
  // 따라 만들 카드뉴스를 요청한다. 요청도 대화에 남는다(2차 D1). 문장은 고정이다.
  const 레퍼런스요청 = () => askTurn(ctx.물음, {
    kind: "reference", text: NO_REFERENCE, data: { wants: "cardnews", ids: ctx.붙인것, ...ctx.말한것 },
  }, { needReference: true });
  let 입력: unknown;
  let photoRoles: Array<{ id: string; role: string }> = [];

  if (ctx.wants === "revise" && ctx.고칠원고) {
    // 고치기: 앞 원고의 조건 · 첨부 그대로, 말만 더한다(설계 §7). 앞 작업은 그대로 둔다.
    입력 = redraftInput(ctx.고칠원고, { words: ctx.지시 });
  } else {
    if (!ctx.붙인것.length) return 레퍼런스요청();

    /*
     * **무엇으로 쓸지를 사진보다 먼저 본다.** 기사 주소처럼 못 쓰는 것이면 여기서
     * 멈춘다. 사진을 먼저 읽으면 어차피 멈출 턴에 읽기값이 나간다.
     */
    const 내용 = pickCardSource(ctx.지시, { webEnabled: isWebSourceEnabled() });
    if (!내용.ok) return 멈춘다(내용.message);

    const options = cardOptionsFrom({
      said: { ratio: ctx.decision.ratio, look: ctx.decision.look },
      chosen: readCardOptions(ctx.input.cardOptions),
      imageModel: typeof ctx.input.imageModel === "string" ? ctx.input.imageModel : undefined,
    });
    const 판단 = await runPhotoTurn(
      {
        photos: ctx.사진들,
        words: ctx.지시,
        mode: "cardnews",
        chosen: readChosenRoles(ctx.고른.photoRoles, ctx.붙인것, { cardnews: true }),
        previous: readChosenRoles(ctx.input.previousRoles, ctx.붙인것, { cardnews: true }),
        ratio: options.ratio,
        imageModel: options.modelId,
      },
      { read: (photos) => readEasyPhotos(photos), judge: (text) => ctx.provider.decideRoles(text) },
    );
    if (판단.kind === "stop") return 멈춘다(판단.message);
    if (판단.kind === "ask") {
      return await askTurn(ctx.물음, {
        kind: "photo",
        text: photoQuestion(판단.reason),
        data: { wants: "cardnews", reason: 판단.reason, mode: "cardnews", rows: 판단.rows, ids: ctx.붙인것, ...ctx.말한것 },
      }, { photoAsk: { reason: 판단.reason, rows: 판단.rows, mode: "cardnews" } });
    }
    const 첨부 = cardAttachmentsFrom({
      userId: ctx.userId,
      photos: ctx.사진들,
      rows: 판단.rows,
      slots: { ...slotsFromWords(ctx.지시, ctx.붙인것), ...readChosenSlots(ctx.고른.photoSlots, ctx.붙인것) },
    });
    if (!첨부.ok && 첨부.reason === "no_reference") return 레퍼런스요청();
    if (!첨부.ok) return 멈춘다(첨부.reason === "not_mine" ? NOT_MINE : UNUSABLE_PHOTO);

    photoRoles = 판단.rows;
    입력 = {
      title: easyTitle(ctx.지시) || "카드뉴스",
      source: 내용.source,
      attachments: 첨부.attachments,
      ...projectSpecFrom(options),
      ...(판단.attachmentIntent ? { userInstruction: 판단.attachmentIntent.slice(0, 2000) } : {}),
    };
  }

  await ctx.store.appendMessage({ conversationId: ctx.conversationId, role: "user", body: ctx.userBody });
  if (!ctx.conversation.title) await ctx.store.renameConversation(ctx.conversationId, easyTitle(ctx.prompt));

  // 빈 마지막 장은 고른 글 모델이 정리 문장으로 채운다(2026-09-30 사용자 결정 B).
  const { projectId, project } = await draftCardnews(ctx.request, 입력, (text) => ctx.provider.writeEnding(text));
  const flow = project.data.flow;
  if (!flow?.cards.length) {
    /*
     * **원고 0장은 조용히 끝내지 않는다**(설계 §9). 카드뉴스 원고 라우트는 이때도
     * `ok` 다. 까닭을 말하고, 작업은 지우지 않는다(2026-09-30 사용자 결정).
     */
    const 까닭 = [...(flow?.planningIssues ?? []), ...(flow?.copyIssues ?? [])];
    const saved = await ctx.store.appendMessage({
      conversationId: ctx.conversationId,
      role: "assistant",
      body: draftFailureMessage(까닭),
    });
    return Response.json({ ok: true, talked: true, message: saved, textModel: ctx.textModel });
  }
  /*
   * 일하는 턴의 AI 말(2차 D4). 화면은 이 응답이 온 뒤에야 이 말을 붙인다 — 원고(1~2분)가 다 된 뒤라 다 된 원고를
   * 보여 주는 말이다(Task 9 리뷰). 그래서 원고가 있을 때만 남긴다. 0장 · 실패면 안 남기고, 실패 줄은 사용자 줄
   * 뒤에 그대로 남는다(`failure-row.ts`).
   */
  const 머리말 = await ctx.store.appendMessage({
    conversationId: ctx.conversationId,
    role: "assistant",
    body: sayBody(sayText(aiText(ctx.decision, ctx.wants), ctx.wants === "revise" ? SAY_REVISE : SAY_CARDNEWS)),
  });
  const row = await ctx.store.appendMessage({ conversationId: ctx.conversationId, role: "image", workId: projectId });
  return Response.json({
    ok: true, cardnews: { rowId: row.id, project }, message: row, say: 머리말, photoRoles, textModel: ctx.textModel,
    // 원고 고치기는 붙인 사진을 안 쓴다 — 화면이 첨부를 내리지 않게 알린다(최종 수정 8).
    ...(ctx.wants === "revise" && ctx.고칠원고 ? { revised: true } : {}),
    // 화면의 「카드뉴스 N」(2차 D2). 이미지와 같은 결과물 번호다.
    resultLabel: resultLabel("cardnews", ctx.결과번호),
  });
}
