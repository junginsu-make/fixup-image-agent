import { withPick } from "../../app/easy/row-marks";
import {
  askInstruction, chosenFor,
  type EasyAnswerWay, type EasyAskChain, type EasyChosen, type EasyPick, type EasyTypedAnswer,
} from "../../app/easy/ask-chain";
import type { EasyDecision } from "../../app/easy/chat";
import type { EasyAdStep } from "../../app/easy/ad-ask";
import { easyAsk } from "../../app/easy/ask";
import { UNUSABLE_PHOTO } from "../../app/easy/photo-check";
import { readChosenRoles } from "../../app/easy/photo-roles";
import { nextResultNumber, resultLabel } from "../../app/easy/image-numbers";
import {
  KIND_QUESTION, RATIO_QUESTION, TARGET_QUESTION,
  aiText, askText, sayEditText, sayText,
} from "../../app/easy/turn-words";
import type { posterReferencesByIds } from "../poster/references";
import { adGuideTurn } from "./ad-turn";
import { askTurn, replyTurn, type AskTurnContext } from "./ask-turn";
import { cardAfterTurn } from "./cardnews-after-turn";
import type { lastCardnewsProject } from "./cardnews-steps";
import { cardnewsTurn } from "./cardnews-turn";
import type { createEasyChatProvider } from "./chat-provider";
import { pickEditTarget, targetAskNumbers } from "./edit-target";
import { imageEditTurn } from "./image-edit-turn";
import type { EasyImageFacts } from "./image-list";
import { imageTurn } from "./image-turn";
import { 멈춘다 } from "./stop";
import type { EasyStore } from "./store";

/*
 * 2026-10-07 후속 Task 10 — `app/api/easy/generate/route.ts` 의 `turn()` 에서 판정 정산 뒤를 동작 그대로 옮겼다.
 * 차례는 그대로다: 답 읽기(`answerTurn`) → 묻기 · 광고 안내 · 카드 손보기 · 고치기(`branchTurn`) → 모양 물음 ·
 * 카드뉴스 · 그림(`makeTurn`). 칸 이름은 라우트의 변수 이름 그대로다(옮긴 문장이 글자 그대로 남게). 여기서 던진
 * 오류는 라우트의 `catch` 가 받는다(실패 줄 · 가림이 그대로다).
 */

type 확인한사진 = { ids: string[]; photos: Awaited<ReturnType<typeof posterReferencesByIds>> };

/** 라우트가 판단까지 마치고 넘기는 것. */
interface TurnContext {
  request: Request;
  auth: { member: { userId: string } };
  store: EasyStore;
  conversation: { title?: string | null };
  conversationId: string;
  prompt: string;
  textModel: string;
  input: Record<string, unknown>;
  provider: ReturnType<typeof createEasyChatProvider>;
  decision: EasyDecision;
  광고안내: string;
  말답: EasyTypedAnswer | undefined;
  고칠원고: Awaited<ReturnType<typeof lastCardnewsProject>>;
  이미지들: EasyImageFacts;
  지난줄: Awaited<ReturnType<EasyStore["listMessages"]>>;
}

/** 답 읽기에만 쓰는 것(단추 답 · 물음 사슬 · 사진 확인). */
interface AnswerContext extends TurnContext {
  단추판단: EasyDecision | undefined;
  고른단추: EasyPick | undefined;
  광고: EasyAdStep | undefined;
  물음사슬: EasyAskChain | undefined;
  보낸사진: string[];
  이을사진: string[];
  사진을정한다: (ids: readonly string[]) => Promise<확인한사진 | undefined>;
  처음사진: 확인한사진;
}

/** 답 읽기가 정한 것. 갈래들이 함께 쓴다. */
interface BranchContext extends TurnContext {
  답방식: EasyAnswerWay;
  이음: EasyAskChain | undefined;
  붙인것: string[];
  붙인수: number;
  사진들: 확인한사진["photos"];
  고른: EasyChosen;
  고른역할: ReturnType<typeof readChosenRoles>;
  지난역할: ReturnType<typeof readChosenRoles>;
  지시: string;
  사용자글: string;
  wants: EasyDecision["wants"];
  물음맥락: AskTurnContext;
  말한것: { ratio?: string; look?: string };
}

/** 이번 말이 앞 물음의 답인가 · 쓸 사진 · 고른 값 · 실행할 갈래 · 물음 맥락을 정한다. */
export async function answerTurn(ctx: AnswerContext): Promise<Response> {
  const {
    store, conversation, conversationId, prompt, textModel, input, decision, 말답,
    단추판단, 고른단추, 광고, 물음사슬, 보낸사진, 이을사진, 사진을정한다, 처음사진,
  } = ctx;
  /*
   * **이번 말이 앞 물음의 답인가**(2차 D1). 단추 답(물음 줄 단추 · 광고 단추)이면 「단추」(사진 고르기 중
   * 말로 친 답은 「말」 — 그 말도 잇는다), 말로 한 답은 위 정리가 답이라고 본 때만 「말」. 답이면 물음을
   * 부른 처음 말 + 그 뒤의 답들로 만들고(`askInstruction`), 앞서 단추로 고른 값을 잇는다(`chosenFor`).
   * 답이 아니면 이번 말 그대로 — 새로 친 말에 옛 값 · 옛 사진이 몰래 붙지 않는다(Review Focus 5).
   */
  const 답방식: EasyAnswerWay = 단추판단 || 광고 === "image"
    ? (고른단추?.typed ? "typed" : "button")
    : 말답?.answered ? "typed" : "none";
  const 이음 = 답방식 === "none" ? undefined : 물음사슬;
  const 정한사진 = 답방식 === "typed" && !보낸사진.length && 이을사진.length ? await 사진을정한다(이을사진) : 처음사진;
  if (!정한사진) return 멈춘다(UNUSABLE_PHOTO);
  const 붙인것 = 정한사진.ids;
  const 붙인수 = 붙인것.length;
  const 사진들 = 정한사진.photos;
  const 고른 = chosenFor(input, 이음, 고른단추);
  const 고른역할 = readChosenRoles(고른.photoRoles, 붙인것);
  // 지난 역할도 고른 값과 같은 검사를 한다 — ⓪ 목록 밖 · 모르는 역할 · 겹친 id 는 버린다.
  const 지난역할 = readChosenRoles(input.previousRoles, 붙인것);
  const 고른갈래 = 고른.kind;
  /*
   * 고른 갈래가 판단을 이기는 것(1차 A2)은 **판단 모델이 다시 가른 턴**에만이다. 단추 답의 판단은 물음 줄의
   * 갈래 그대로고, 고칠 것이 사라져 사실 문장(talk)이 된 단추 답을 고른 갈래가 만들기로 되돌리면 값이 나간다
   * (2차 최종 리뷰 1).
   */
  const 골랐나 = Boolean(고른갈래) && 고른.kindPicked && !단추판단;
  const 지시 = askInstruction(이음, prompt, 답방식);
  /*
   * 단추 답이면 사용자 줄에 고른 값을 함께 적는다 — 다음 물음 · 실패 뒤 다시 답할 때 그 값을 잇는다. 답으로 본 말 답은
   * `typed` 표시만 적는다(최종 수정 2) — 뒤에서 실패해도 실패 짝을 건너뛰어 다시 보낸 말이 처음 말을 잇는다.
   */
  const 사용자글 = 고른단추 ? withPick(prompt, 고른단추) : 답방식 === "typed" ? withPick(prompt, { typed: true }) : prompt;

  /*
   * **단추로 고른 갈래는 늘 이긴다**(2026-10-06 설계 A2). 전에는 판단이 image ·
   * cardnews · either 일 때만 이겨서, 다시 판단한 모델이 고치기나 말을 고르면 단추를
   * 눌러도 고정 문장이 되풀이됐다. **고른 것이 아니라 이어 온 갈래**(말로 한 답)는
   * 예전 규칙 그대로다(2단계 §4) — 말 · 상세페이지 · 고치기에는 안 끼어든다.
   */
  const wants = 고른갈래 && (골랐나 || ["image", "cardnews", "either"].includes(decision.wants))
    ? 고른갈래
    : decision.wants;

  /*
   * **물음도 대화에 남긴다**(2026-10-07 사용자 결정 2차 D1 - 2단계 §4 · 설계 §2-5 의 「아무것도
   * 안 남긴다」를 바꿨다). 사용자 줄 + 물음 줄 두 줄이라 새로고침해도 물음이 보이고, 단추 대신 말로
   * 답해도 다음 판단이 앞 물음을 안다. 저장은 `lib/easy/ask-turn.ts` 가 한다. 값도 예약도 없다.
   * 이번 말이 앞 물음의 답이었으면 물음 줄에 `cont` 가 붙어 사슬이 이어진다(`app/easy/ask-chain.ts`).
   */
  const 물음맥락: AskTurnContext = {
    store, conversation, conversationId, prompt, userBody: 사용자글, textModel,
    cont: 답방식 !== "none",
  };
  // 물을 때의 판단(말에 있던 비율 · 그림체). 단추로 답하면 판단 모델 대신 이것을 쓴다(2차 D1).
  const 말한것 = { ...(decision.ratio ? { ratio: decision.ratio } : {}), ...(decision.look ? { look: decision.look } : {}) };

  return await branchTurn({
    ...ctx, 답방식, 이음, 붙인것, 붙인수, 사진들, 고른, 고른역할, 지난역할, 지시, 사용자글, wants, 물음맥락, 말한것,
  });
}

/** 번호 물음 · 갈래 물음 · 광고 규격 안내 · 카드뉴스 손보기 · 이미지 고치기. 어느 것도 아니면 `makeTurn`. */
async function branchTurn(ctx: BranchContext): Promise<Response> {
  const {
    request, auth, store, conversation, conversationId, prompt, textModel, provider, decision, 광고안내,
    고칠원고, 이미지들, 지난줄, 답방식, 이음, 붙인것, 지시, 사용자글, wants, 물음맥락, 말한것,
  } = ctx;
  /*
   * 고칠 이미지가 둘 이상인데 어느 것인지 모르면 AI 가 묻는다(2차 D2). 번호 단추를 단다. 실행하는 갈래(`wants`)로
   * 본다 — 고른 갈래가 이겨 image 로 가는 턴에서는 묻지 않는다. 물음 글은 AI 가 이 갈래로 쓴 물음이 먼저다.
   * 번호 물음에 말로 답했는데 번호가 없으면 마지막 이미지로 떨어뜨리지 않고 다시 묻는다.
   */
  const 번호물음뒤 = 답방식 === "typed" && 이음?.ask.kind === "target";
  const 고칠번호들 = targetAskNumbers({ wants, note: decision.note, target: decision.target }, 이미지들, {
    afterTargetAsk: 번호물음뒤,
  });
  if (고칠번호들) {
    // 붙인 사진(확인한 것)도 적는다 — 새로고침 뒤 번호 단추로 답해도 그 사진으로 고친다(최종 수정 3).
    const data = { numbers: 고칠번호들, ...(붙인것.length ? { ids: 붙인것 } : {}) };
    return await askTurn(물음맥락, { kind: "target", text: askText(aiText(decision, wants), TARGET_QUESTION), data });
  }
  // 한 장인지 여러 장인지 모르면 묻는다(2단계 §4). 물음 문장은 AI 가 이 갈래로 쓴 물음이 먼저다(2차 D4 · 최종 리뷰 b).
  if (wants === "either") {
    return await askTurn(물음맥락, { kind: "kind", text: askText(aiText(decision, wants), KIND_QUESTION), data: { ids: 붙인것, ...말한것 } }, { kindAsk: true });
  }
  // 규격별 이미지는 여기서 안 만든다. 「광고소재」 안내를 남기고 끝낸다(A5).
  if (wants === "ad_specs") {
    return await adGuideTurn({ store, conversation, conversationId, prompt, textModel, guide: 광고안내 });
  }
  // 만든 카드뉴스 손보기(3단계). 판단 읽기가 원고 · 만든 카드가 있을 때만 이 갈래를 준다.
  if ((wants === "card_redo" || wants === "card_text" || wants === "caption" || wants === "download") && 고칠원고) {
    return await cardAfterTurn({
      request, userId: auth.member.userId, store, conversationId, prompt: 지시, userBody: 사용자글, textModel, wants, decision, provider,
      project: 고칠원고, rows: 지난줄, 물음: 물음맥락,
    });
  }
  /*
   * **이 대화의 이미지 고치기**(2026-10-06, 2차 D2). 번호(target)로 고르면 그 줄의 그림을 고치고,
   * 말하지 않았으면 마지막 이미지다. 번호 단추 답도 누른 번호가 `target` 이다. 없는 번호 · 카드뉴스 번호 ·
   * 지운 결과 · 확인 못 한 것 · 못 만든 것 · 만드는 중이면 값 없이 코드가 쓴 사실 문장으로 답한다
   * (`lib/easy/edit-target.ts`).
   */
  if (wants === "image_edit" && 이미지들.madeImage) {
    // 번호 물음 뒤 번호 없는 답이면 마지막 이미지가 아니라 다 만든 하나 · 사실 문장이다(Task 8 고침 2).
    const 고칠것 = await pickEditTarget(auth.member.userId, 지난줄, 이미지들, decision.target, { afterTargetAsk: 번호물음뒤 });
    if (!고칠것.ok) return await replyTurn(물음맥락, 고칠것.message);
    return await imageEditTurn({
      request, userId: auth.member.userId, store, conversationId, prompt: 지시, userBody: 사용자글, textModel,
      target: 고칠것.target, rowId: 고칠것.rowId, rows: 지난줄, attachments: 붙인것,
      // 일하는 턴의 AI 말(2차 D4). 이 갈래로 쓴 말이 없으면(바꿔 읽은 갈래 · 빈 말) 번호를 말하는 코드 문장.
      say: sayText(aiText(decision, wants), sayEditText(고칠것.n)),
      // 새 고친 줄의 「이미지 N」(결과물 번호, 2차 D2).
      resultLabel: resultLabel("image", nextResultNumber(지난줄)),
    });
  }

  return await makeTurn(ctx);
}

/** 비율 · 결 물음 · 카드뉴스 원고 · 그림 턴. */
async function makeTurn(ctx: BranchContext): Promise<Response> {
  const {
    request, auth, store, conversation, conversationId, prompt, textModel, input, provider, decision, 말답,
    고칠원고, 지난줄, 붙인것, 붙인수, 사진들, 고른, 고른역할, 지난역할, 지시, 사용자글, wants, 물음맥락, 말한것,
  } = ctx;
  /*
   * ⓵ **비율·결을 한 번 물어볼까** (2026-09-21 사용자).
   *
   * 묻기로 했으면 그림을 안 만들고 사용자 줄 + 물음 줄을 남긴다(2026-10-07 2차 D1. 예전에는
   * 「답 없이 떠나면 아무 일도 없던 것」이라 안 남겼는데, 그러면 새로고침에 물음이 사라지고 말로
   * 답할 때 앞 물음을 몰랐다). 물음 문장은 AI 가 쓴 물음이 먼저, 없으면 고정 문장이다.
   *
   * 판단은 `ask.ts` 가 값으로 한다. 여기서 하면 못 잰다.
   */
  const 고르기 = easyAsk({
    attachmentCount: 붙인수,
    // 단추로 고른 것(이번 단추 · 이어진 물음의 단추), 없으면 옛 화면이 보낸 칸(2차 D1).
    chosenRatio: 고른.ratio,
    chosenLook: 고른.look,
    saidRatio: decision.ratio,
    saidLook: decision.look,
  });

  // 모양 물음 바로 뒤의 말이면 답이든 아니든 같은 물음을 또 하지 않는다 — 말한 비율이 없으면 정사각형(2차 최종 리뷰 6).
  if (wants === "image" && 고르기.asks && (말답?.askRatio ?? true)) {
    return await askTurn(물음맥락, { kind: "ratio", text: askText(aiText(decision, wants), RATIO_QUESTION), data: { wants: "image" } }, { asked: true });
  }

  if (wants === "cardnews" || wants === "revise") {
    return await cardnewsTurn({
      request, userId: auth.member.userId, store, conversation, conversationId, prompt, textModel,
      wants, 사진들, 붙인것, input, decision, provider, 고칠원고, 물음: 물음맥락, 말한것, 고른, 지시, userBody: 사용자글,
      결과번호: nextResultNumber(지난줄),
    });
  }

  // ⓒ 사진 역할부터 그림 제출까지는 `lib/easy/image-turn.ts` 가 한다(2026-10-07 후속 Task 6 — 동작 그대로 옮겼다).
  return await imageTurn({
    request, store, conversation, conversationId, prompt, textModel, wants, decision, input, provider,
    물음맥락, 사진들, 붙인것, 붙인수, 지시, 고른역할, 지난역할, 고르기, 말한것, 사용자글, 지난줄,
  });
}
