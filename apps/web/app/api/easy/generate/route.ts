import { DEFAULT_TEXT_MODEL, resolveTextModel } from "@fixup/shared";
import { authenticateApiMember, reserveAiUsage, settleAiUsage } from "../../../../lib/membership/api";
import { freeCreditPlan } from "../../../../lib/membership/credit-ledger";
import { easyStoreForUser } from "../../../../lib/easy/store";
import { createEasyChatProvider } from "../../../../lib/easy/chat-provider";
import { EasyStepError, read, relay } from "../../../../lib/easy/relay";
import { failureRowMessage, trackUserTurn } from "../../../../lib/easy/failure-row";
import { withRowJob } from "../../../easy/row-image";
import type { EasyDecision } from "../../../easy/chat";
import { judgeEasyTurn } from "../../../../lib/easy/judge";
import { EASY_DEFAULT_RATIO, easyAsk } from "../../../easy/ask";
import { easyTitle } from "../../../easy/title";
import { DETAIL_PAGE_GUIDE } from "../../../easy/detail-page";
import { readEasyPhotos } from "../../../../lib/easy/read-photos";
import { llmSettleCost, readLlmMeter, withLlmMeter } from "../../../../lib/llm/meter";
import { posterReferencesByIds } from "../../../../lib/poster/references";
import { teamIdOf } from "../../../../lib/teams/store";
import { UNUSABLE_PHOTO, isPhotoId, missingIds, uniqueIds } from "../../../easy/photo-check";
import { readChosenRoles } from "../../../easy/photo-roles";
import { runPhotoTurn } from "../../../easy/photo-turn";
import { easyRoleSummary } from "../../../easy/options";
import { isWebSourceEnabled } from "../../../../lib/sns/feature";
import { draftCardnews, lastCardnewsProject } from "../../../../lib/easy/cardnews-steps";
import { NOT_MINE, cardAttachmentsFrom, readChosenSlots, slotsFromWords } from "../../../easy/cardnews-attachments";
import { pickCardSource } from "../../../easy/cardnews-source";
import { cardOptionsFrom, projectSpecFrom, readCardOptions } from "../../../easy/cardnews-options";
import { redraftInput } from "../../../easy/cardnews-redraft";
import { draftFailureMessage } from "../../../easy/cardnews-view";
import { isMade } from "../../../easy/cardnews-after";
import { cardAfterTurn } from "../../../../lib/easy/cardnews-after-turn";
import { countEasyImages, imageEditTurn, lastEasyImage } from "../../../../lib/easy/image-edit-turn";
import { AD_ANSWER_NOTE, adImageInstruction, easyAdStep } from "../../../easy/ad-ask";
import { adGuideTurn, adQuestionTurn, writeAdGuide } from "../../../../lib/easy/ad-turn";
import { POST as createProject } from "../../poster/projects/route";
import { POST as runPlan } from "../../poster/projects/[id]/plan/route";
import { POST as submitGenerate } from "../../poster/projects/[id]/generate/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** 카드뉴스 원고는 1~2분 걸린다. 카드뉴스 원고 라우트와 같은 값이다(2단계 §3). */
export const maxDuration = 300;

/**
 * Easy 모드: 한 줄 → **말 또는 그림** (설계 §8).
 *
 * ── 친 말이 전부 주문은 아니다 ────────────────────────────────
 *
 * 2026-09-21 사용자 — 「이지 모드 채팅창은 기본 LLM 이 탑재되어 꼭 이미지만이
 * 아니라 사용자와 AI 가 대화 할 수 있어야 합니다.」
 *
 * 그전에는 친 말이 **전부** 그림 주문이었다. 「안녕하세요」도 그림을 만들었다 —
 * 값이 나가고, 엉뚱한 그림이 나오고, 물어본 것에는 아무도 답하지 않았다.
 *
 * 이제 **먼저 가른다.** 주문이면 아래 세 라우트로 가고, 아니면 답만 적는다.
 * 가르는 판단은 `app/easy/chat.ts` 가 값으로 재고, 부르는 일은 여기서 한다.
 *
 * ── 새 생성 경로를 만들지 않는다 ──────────────────────────────
 *
 * 프로젝트를 만들고 · 기획을 돌리고 · 생성을 제출하는 **세 라우트를 그대로
 * 부른다.** HTTP 로 돌아 나가지 않고 그 라우트의 함수를 직접 부른다 — 같은
 * 코드라는 것이 보장되어야 하기 때문이다.
 *
 * 2026-09-02 설계가 같은 것을 못 박았고 그 까닭은 여전하다 — 같은 일을 하는
 * 기계가 둘이 되면 실측으로 다듬은 문구를 양쪽에 유지해야 하고, 하나는 곧
 * 낡는다. 오늘(2026-09-17~18) 하루 종일 고친 것이 전부 그 문구들이다.
 *
 * ── 여기서 그림을 기다리지 않는다 ─────────────────────────────
 *
 * 마지막 라우트는 **제출만** 한다. 결과는 화면이 기존 `status` 라우트에 물어
 * 받는다 — 포스터 화면이 하는 것과 같다. 여기서 기다리면 요청이 몇 분 열려
 * 있게 되고, 그 사이 화면을 떠난 사람은 결과를 잃는다.
 */

/**
 * 기본값 — 고를 것을 없앴으므로 나머지는 여기서 정한다(설계 §9).
 *
 * **비율은 더 이상 여기서 못 박지 않는다**(2026-09-21 사용자 — 「지금은 무조건
 * 1:1로만 나옵니다」). 말 속에 있으면 그것, 물어서 고르면 그것, 아무것도
 * 없으면 `ask.ts` 의 기본값이다.
 */
const VARIANTS = 1;

function fail(message: string, status = 500) {
  return Response.json({ ok: false, message }, { status });
}

/**
 * **값이 나가기 전에 멈춘다**(설계 §2-3 ⓪ · §2-6 ⓒ).
 *
 * 다시 눌러도 같은 곳에서 막히므로 `retryable: false` 다 — 화면이 「다시 보내면
 * 값이 또 듭니다」를 띄우지 않는다. 실제로 아무 값도 안 나갔다.
 */
function 멈춘다(message: string) {
  return Response.json({ ok: false, message, retryable: false }, { status: 400 });
}

/**
 * 판단 · 읽기에 실제로 쓴 값을 서버 기록에 한 줄 남긴다(설계 §2-9 B).
 *
 * 장부에 싣는 것은 새 작업 종류(마이그레이션)가 필요해 후속으로 미뤘다. 그때까지
 * 운영자가 journalctl 에서 볼 수 있게 한다. 이메일은 남기지 않는다.
 */
function 값을적는다(userId: string) {
  const 잰값 = readLlmMeter();
  if (!잰값.metered || 잰값.calls === 0) return;
  console.info(`[easy] 판단·읽기 user=${userId} calls=${잰값.calls} usd=${잰값.usd.toFixed(4)}`);
}


/**
 * **계량기 안에서 돈다**(설계 §2-9 B). 판단 · 읽기의 토큰은 공용 어댑터가 이미
 * 적는데(`lib/llm/structured.ts`), 계량기 밖에서 부르면 그 값이 버려진다.
 * 안에서 부르는 기획 라우트는 제 계량기를 따로 연다 — 두 번 세지 않는다.
 */
export async function POST(request: Request) {
  return withLlmMeter(() => turn(request));
}

async function turn(request: Request): Promise<Response> {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  const input = await request.json().catch(() => ({}));
  const conversationId = typeof input.conversationId === "string" ? input.conversationId : "";
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  if (!conversationId) return fail("어느 대화인지 알려 주세요.", 400);
  if (!prompt) return fail("무엇을 만들지 적어 주세요.", 400);

  // 사용자 말 뒤에 답 없이 실패하면 실패 안내를 남길 수 있게 지켜본다(2026-10-06 설계 B4).
  const 지킴 = trackUserTurn(easyStoreForUser(auth.member.userId));
  const store = 지킴.store;
  const conversation = await store.getConversation(conversationId);
  if (!conversation) return fail("대화를 찾을 수 없습니다.", 404);

  /*
   * **고른 모델을 믿지 않는다.** 목록에 없는 id 가 오면 기본으로 떨어진다 —
   * 값을 모르는 모델을 부르면 원가를 못 세고, 셈이 틀린 채로 돌아간다.
   */
  const textModel = resolveTextModel(
    typeof input.textModel === "string" ? input.textModel : undefined,
  );
  /*
   * **붙인 사진 전부, 붙인 순서.** 이름은 `referenceIds` 지만 뜻은 「따라 만들기」가
   * 아니다 — 옛 화면이 그 이름으로 보내므로 이름만 그대로 둔다. 역할은 아래에서
   * 정한다(설계 §2-3). 같은 id 는 한 번만 센다(§2-1 — 두 번 세던 것).
   */
  const 붙인것 = uniqueIds(input.referenceIds);
  const 붙인수 = 붙인것.length;
  if (붙인것.some((id) => !isPhotoId(id))) return 멈춘다(UNUSABLE_PHOTO);

  try {
    /*
     * ⓪ **사진 확인**(설계 §2-3). 이미지 만들기와 같은 함수 · 같은 회원 기준으로
     * 읽고, **요청한 사진이 전부 나왔는지** 센다. 조회는 볼 수 없는 id 를 오류
     * 없이 빼므로, 세지 않으면 사진이 빠지거나 번호가 당겨진다.
     */
    const 사진들 = 붙인수
      ? await posterReferencesByIds({
        userId: auth.member.userId,
        role: auth.member.profile.role,
        teamId: await teamIdOf(auth.member.userId),
      }, 붙인것)
      : [];
    if (missingIds(붙인것, 사진들).length) return 멈춘다(UNUSABLE_PHOTO);
    const 고른역할 = readChosenRoles(input.photoRoles, 붙인것);
    // 지난 역할도 고른 값과 같은 검사를 한다 — ⓪ 목록 밖 · 모르는 역할 · 겹친 id 는 버린다.
    const 지난역할 = readChosenRoles(input.previousRoles, 붙인것);
    const provider = createEasyChatProvider(process.env, textModel);

    /*
     * ⓑ1 **말인가 주문인가.**
     *
     * 값이 나가기 전에 가른다. 여기서 안 가르면 「안녕하세요」 한 마디에
     * 그림값이 나간다.
     *
     * **지난 대화를 같이 준다.** 「그거 말고 다른 걸로」 같은 말은 앞을 봐야
     * 뜻이 선다. 이번 말은 아직 안 남겼으므로 그대로 다 준다.
     *
     * **판정이 끝나면 바로 닫는다.** 되묻기·대화·주문 — 어느 끝으로 가든 판정
     * 예약은 여기서 끝난다. 주문이면 기획·생성이 각자 따로 예약한다.
     */
    const 지난줄 = await store.listMessages(conversationId);
    // 고칠 원고가 있을 때만 「고치기」를 안다(2단계 §7). 없으면 고치기는 말로 읽는다.
    const 고칠원고 = await lastCardnewsProject(auth.member.userId, 지난줄);
    // 그 원고로 카드를 만들었나. 만들었을 때만 다시 그리기 · 게시글 · 받기를 안다(3단계 §5).
    const 만들었나 = Boolean(고칠원고 && isMade(고칠원고));
    // 이 대화의 마지막 결과가 이미지 한 장이면 그것을 이어서 고친다(2026-10-06).
    const 고칠그림 = await lastEasyImage(auth.member.userId, 지난줄);

    /*
     * **「광고 소재」는 코드가 먼저 본다**(2026-10-06 설계 A5). 물을 때는 글 모델을 안
     * 부르고 물음 줄만 남긴다 — 값도 예약도 없다. 단추 글 · 규격 낱말이면 아래 판단이
     * 글 모델 없이 갈래를 정한다.
     */
    const 광고 = easyAdStep(prompt, 지난줄);
    if (광고 === "ask") return await adQuestionTurn({ store, conversation, conversationId, prompt, textModel });

    /*
     * **판정도 값이 나간다 — 예약부터**(설계 2026-09-30 §3.1).
     *
     * 기존 작업 이름(`poster_image`) + `easy:decide`, 0 크레딧(D1). 크레딧이 없거나
     * 운영자가 멈췄으면 여기서 막혀 글 모델을 안 부른다. 열쇠는 단계마다 가른다 —
     * 바깥 열쇠를 그대로 쓰면 뒤의 기획·생성 예약이 `duplicate_request` 로 막힌다.
     *
     * **`relay` 를 그대로 빌린다** — 다른 라우트를 부르는 것은 아니지만, 헤더의
     * 요청 식별자를 단계별로 가르는 일은 똑같다. 이것이 네 번째 단계(`decide`)다.
     */
    const 판정예약 = await reserveAiUsage(
      relay(request, "/api/easy/generate", {}, "decide"), "poster_image", 0, freeCreditPlan("easy:decide"),
    );
    if (!판정예약.ok) return 판정예약.response;

    /*
     * **갈래를 단추로 골랐나**(2026-10-06 설계 A2, 최종 리뷰). 화면은 「이미지 한 장 ·
     * 카드뉴스」 단추로 고른 턴에만 `kindPicked` 를 싣는다. 물음 뒤 **말로** 답한 턴도
     * 갈래를 이어 싣지만(`continuingKind`) 그것은 고른 것이 아니다 — 그 말이 질문이면
     * 질문에 답해야 한다.
     */
    const 고른갈래 = input.kind === "image" || input.kind === "cardnews" ? input.kind as "image" | "cardnews" : undefined;
    const 골랐나 = Boolean(고른갈래) && input.kindPicked === true;

    let decision: EasyDecision;
    let 광고안내 = "";
    try {
      // 한 턴의 판단 — 선택지(A1) · 빈 답 재질문(A3)은 `lib/easy/judge.ts` 가 한다.
      decision = await judgeEasyTurn({
        decide: (text, wants) => provider.decide(text, wants),
        history: 지난줄.map((row) => ({ id: row.id, role: row.role, body: row.body })),
        prompt,
        /*
         * **붙인 것이 있는지 알려 준다.** 안 알려 주면 「이걸로 하나 그려줘」를
         * 되묻는다 — 「이걸로」가 무엇인지 모르니 물을 수밖에 없다
         * (2026-09-21 실측).
         */
        attachmentCount: 붙인수,
        choices: { hasDraft: Boolean(고칠원고), made: 만들었나, madeImage: Boolean(고칠그림) },
        // 골랐으면 판단의 갈래는 버려진다 — 빈 talk 재질문을 안 한다(A3 · 최종 리뷰).
        kindPicked: 골랐나,
        adStep: 광고,
      });
      /*
       * **규격 안내는 글 모델이 우리 기능의 사실로 쓴다**(A5). 판정과 같은 예약 안에서
       * 부른다 — 크레딧이 없거나 운영자가 멈췄으면 여기도 막힌다.
       *
       * **갈래를 단추로 골랐으면 쓰지 않는다**(최종 리뷰) — 아래에서 고른 갈래가 이겨 이 글은
       * 버려진다. 이미지 수는 서로 다른 포스터 작업만 센다(`countEasyImages` — 고친 줄 ·
       * 카드뉴스 · 지운 작업을 세면 「광고소재」에서 고를 수 있는 수와 어긋난다). 글 모델이
       * 실패해도 `writeAdGuide` 가 코드가 쓴 안내로 대신한다 — 대화가 멈추지 않는다.
       */
      if (decision.wants === "ad_specs" && !골랐나) {
        광고안내 = await writeAdGuide((text) => provider.writeAdGuide(text), {
          prompt,
          imageCount: await countEasyImages(auth.member.userId, 지난줄),
        });
      }
    } catch (error) {
      await settleAiUsage(판정예약, false, 0, "easy_decide_failed", llmSettleCost());
      throw error;
    }
    await settleAiUsage(판정예약, true, 0, undefined, llmSettleCost());

    /*
     * **단추로 고른 갈래는 늘 이긴다**(2026-10-06 설계 A2). 전에는 판단이 image ·
     * cardnews · either 일 때만 이겨서, 다시 판단한 모델이 고치기나 말을 고르면 단추를
     * 눌러도 고정 문장이 되풀이됐다. **고른 것이 아니라 이어 온 갈래**(말로 한 답)는
     * 예전 규칙 그대로다(2단계 §4) — 말 · 상세페이지 · 고치기에는 안 끼어든다.
     */
    const wants = 고른갈래 && (골랐나 || ["image", "cardnews", "either"].includes(decision.wants))
      ? 고른갈래
      : decision.wants;
    // 한 장인지 여러 장인지 모르면 묻고 아무것도 안 남긴다(2단계 §4).
    if (wants === "either") return Response.json({ ok: true, kindAsk: true, textModel });
    // 규격별 이미지는 여기서 안 만든다. 「광고소재」 안내를 남기고 끝낸다(A5).
    if (wants === "ad_specs") {
      return await adGuideTurn({ store, conversation, conversationId, prompt, textModel, guide: 광고안내 });
    }
    // 만든 카드뉴스 손보기(3단계). 판단 읽기가 원고 · 만든 카드가 있을 때만 이 갈래를 준다.
    if ((wants === "card_redo" || wants === "card_text" || wants === "caption" || wants === "download") && 고칠원고) {
      return await cardAfterTurn({
        request, userId: auth.member.userId, store, conversationId, prompt, textModel, wants, decision, provider,
        project: 고칠원고, rows: 지난줄,
      });
    }
    // 마지막으로 만든 이미지 한 장 고치기(2026-10-06). 판단 읽기가 고칠 그림이 있을 때만 이 갈래를 준다.
    if (wants === "image_edit" && 고칠그림) {
      return await imageEditTurn({
        request, userId: auth.member.userId, store, conversationId, prompt, textModel,
        target: 고칠그림, rows: 지난줄, attachments: 붙인것,
      });
    }

    /*
     * ⓵ **비율·결을 한 번 물어볼까** (2026-09-21 사용자).
     *
     * 묻기로 했으면 **아무것도 안 남기고** 그대로 돌려준다. 그림도 안 만들고
     * 대화 줄도 안 쌓는다 — 물어만 보고 사용자가 답을 안 하고 떠나면 **아무
     * 일도 일어나지 않은 것**이 맞다. 남겨 두면 답 없는 물음만 쌓인다.
     *
     * 판단은 `ask.ts` 가 값으로 한다. 여기서 하면 못 잰다.
     */
    const 고르기 = easyAsk({
      attachmentCount: 붙인수,
      chosenRatio: typeof input.ratio === "string" ? input.ratio : undefined,
      chosenLook: typeof input.look === "string" ? input.look : undefined,
      saidRatio: decision.ratio,
      saidLook: decision.look,
    });

    if (wants === "image" && 고르기.asks) {
      return Response.json({ ok: true, asked: true, textModel });
    }

    if (wants === "cardnews" || wants === "revise") {
      return await cardnewsTurn({
        request, userId: auth.member.userId, store, conversation, conversationId, prompt, textModel,
        wants, 사진들, 붙인것, input, decision, provider, 고칠원고,
      });
    }

    /*
     * **광고 물음에 답해 만드는 이미지는 물음 앞의 말로 그린다**(A5). 단추만 눌렀으면 그
     * 말 그대로, 말로 답했으면 그 말 + 답. 물음 뒤가 아니면 이번 말 그대로다.
     *
     * **답일 때만 잇는다**(최종 리뷰 2026-10-06) — 「광고 이미지 만들기」 단추를 눌렀거나,
     * 판단 모델이 이 말을 물음의 답이라고 `note` 에 표시했을 때. 물음 뒤에 「그건 됐고 고양이
     * 포스터 만들어줘」라고 했는데 처음 말을 붙이면 엉뚱한 것을 그린다.
     */
    const 답했나 = 광고 === "image" || decision.note === AD_ANSWER_NOTE;
    const 지시 = adImageInstruction(지난줄, prompt, 답했나) ?? prompt;

    /*
     * ⓒ → ⓐ → ⓑ2 → ⓓ **사진이 붙은 그림 턴**(설계 §2-3).
     *
     * 말을 남기기 **전에** 한다. 묻거나 멈추면 아무것도 안 남긴다 — 비율 물음과
     * 같다. 말 턴 · 상세페이지 안내 턴은 여기 오지 않으므로 사진을 안 읽는다.
     */
    const 사진판단 = wants === "image" && 붙인수
      ? await runPhotoTurn(
        {
          photos: 사진들,
          words: 지시,
          chosen: 고른역할,
          previous: 지난역할,
          ratio: 고르기.ratio,
          imageModel: typeof input.imageModel === "string" ? input.imageModel : undefined,
        },
        { read: (photos) => readEasyPhotos(photos), judge: (text) => provider.decideRoles(text) },
      )
      : undefined;
    if (사진판단?.kind === "stop") return 멈춘다(사진판단.message);
    if (사진판단?.kind === "ask") {
      return Response.json({ ok: true, photoAsk: { reason: 사진판단.reason, rows: 사진판단.rows }, textModel });
    }
    const 칸 = 사진판단?.fields;

    // 사용자가 친 말을 남긴다. 아래가 실패해도 대화에는 그 말이 있어야
    // 무엇을 하려 했는지 알 수 있다.
    await store.appendMessage({ conversationId, role: "user", body: prompt });

    // 제목이 비어 있으면 이 말로 짓는다. 첫 프롬프트 한 번만이다(설계 §4-1).
    if (!conversation.title) await store.renameConversation(conversationId, easyTitle(prompt));

    if (wants === "talk") {
      /*
       * **답만 적고 끝낸다.** 그림을 안 만들었으므로 값도 거의 안 든다 —
       * 화면이 「약 N장」을 적던 자리도 그래서 「그림을 만들면」으로 바뀌었다.
       */
      const saved = await store.appendMessage({
        conversationId,
        role: "assistant",
        body: decision.reply || "무엇을 만들어 드릴까요?",
      });
      return Response.json({ ok: true, talked: true, message: saved, textModel });
    }

    if (wants === "detail_page") {
      /*
       * **상세페이지는 여기서 안 만든다**(설계 §2-7, 2026-09-30 사용자 결정).
       *
       * 안내 한 줄을 남기고 끝낸다. 사진을 읽지도 값이 나가지도 않는다.
       * 화면은 이 문장이 달린 줄에 「상세페이지 만들기 열기」를 단다.
       */
      const saved = await store.appendMessage({ conversationId, role: "assistant", body: DETAIL_PAGE_GUIDE });
      return Response.json({ ok: true, talked: true, message: saved, textModel });
    }

    // ① 프로젝트
    const created = await read(await createProject(relay(request, "/api/poster/projects", {
      title: easyTitle(지시) || "Easy",
      // 말 속에 있던 것 · 물어서 고른 것 · 기본값 차례다(`ask.ts`).
      ratio: 고르기.ratio,
      look: 고르기.look,
      modelId: typeof input.imageModel === "string" ? input.imageModel : undefined,
      variants: VARIANTS,
      instruction: 지시,
      referenceIds: 칸?.referenceIds ?? [],
      preservedIds: 칸?.preservedIds ?? [],
      personIds: 칸?.personIds ?? [],
      restyledIds: 칸?.restyledIds ?? [],
      // AI 가 다듬는다. 그것이 이 모드의 값어치다(설계 §9).
      promptMode: "assisted",
      // **붙인 순서 그대로**(설계 §2-6). 전에는 따라 만들기를 앞으로 당겼다.
      attachmentOrder: 칸?.attachmentOrder ?? [],
      // 말과 최종 역할이 맞을 때만 말 전체, 아니면 빈 글(설계 §2-6).
      attachmentIntent: 사진판단?.attachmentIntent ?? "",
    }, "project")), "기획 준비");

    const projectId = created.project?.id as string | undefined;
    if (!projectId) throw new EasyStepError("기획 준비", "작업을 만들지 못했습니다.", 500);
    const params = Promise.resolve({ id: projectId });

    // ② 기획 — 붙인 그림을 읽고 칸을 채운다
    /*
     * **고른 글 모델을 넘긴다.** 안 넘기면 드롭다운이 모양만 있고 환경변수가
     * 정한 모델로 간다 — 2026-09-18 에 실제로 그랬다(설계 §5-4).
     */
    await read(
      await runPlan(relay(request, `/api/poster/projects/${projectId}/plan`, { textModel }, "plan"), { params }),
      "기획",
    );

    // ③ 제출 — 그림은 화면이 `status` 로 받아 간다
    const submitted = await read(
      await submitGenerate(relay(request, `/api/poster/projects/${projectId}/generate`, {}, "generate"), { params }),
      "이미지 만들기",
    );

    /*
     * **그림 자리를 대화에 남긴다.** `work_id` 는 포스터 **작업**을 가리킨다 —
     * 라이브러리의 작업물 탭이 세는 단위가 그것이고, 그림은 그 아래 달린다.
     * 그림 id 를 적으면 대화를 다시 열 때 그것만으로 주소를 찾을 길이 없다
     * (`PosterImageStore` 에 `byIds` 가 없다).
     *
     * **제출한 직후에 남긴다.** 결과를 기다려 남기면, 화면을 떠난 사람의 대화에
     * 그 그림이 안 들어간다.
     */
    // 받을 정보를 함께 적는다 — 화면을 떠났다 다시 열어도 이어 받는다(2026-10-06 설계 B3).
    await store.appendMessage({ conversationId, role: "image", workId: projectId, body: withRowJob("", submitted.submission) });

    return Response.json({
      ok: true,
      projectId,
      submission: submitted.submission,
      textModel,
      ratio: 고르기.ratio,
      look: 고르기.look,
      // 만든 조건에 곧바로 적는다. 다시 열 때는 `load.ts` 가 같은 함수로 읽는다.
      roles: 칸 ? easyRoleSummary(칸) : "",
      // 화면이 들고 있다가 다음 그림 턴에 지난 역할로 보낸다(설계 §2-4 차례 3).
      photoRoles: 사진판단?.rows ?? [],
      ...(submitted.notice ? { notice: submitted.notice } : {}),
    });
  } catch (error) {
    /*
     * 사용자 말을 남긴 뒤 실패했으면 그 안내도 대화에 남긴다(B4). 우리가 알고 낸 실패면
     * 크레딧 · 권한 안내만 그대로, 나머지는 일반 문장 — 안쪽 라우트의 날것 오류 글(표 이름
     * 등)은 대화에 남기지 않는다(`failureRowMessage`, 리뷰 2026-10-06).
     */
    await 지킴.leaveFailure(conversationId, failureRowMessage(error));
    if (error instanceof EasyStepError) {
      /*
       * **세 갈래를 가려 말한다**(설계 §5-3). 어느 쪽이냐에 따라 할 일이
       * 다르다 — 크레딧·권한이면 다시 눌러도 또 막힌다.
       */
      return Response.json({
        ok: false,
        step: error.step,
        message: error.message,
        ...(error.code ? { code: error.code, usage: error.usage } : {}),
        // 402·403 은 다시 눌러도 같은 곳에서 막힌다. 안쪽이 「안 풀린다」고 한 것(멈춤 503)도 같다.
        retryable: error.retryable && error.status !== 402 && error.status !== 403,
      }, { status: error.status });
    }
    return fail(error instanceof Error ? error.message : "만들지 못했습니다.");
  } finally {
    값을적는다(auth.member.userId);
  }
}

/**
 * **카드뉴스 원고 턴**(2단계 설계 §3 · §5 · §7 · §9).
 *
 * 원고까지만 쓴다. 원고는 공짜고, 크레딧은 화면의 「이대로 만들기」가 따로 부르는
 * 카드뉴스 `generate` 가 잡는다. 묻거나 멈추면 아무것도 안 남긴다(1단계와 같다).
 */
async function cardnewsTurn(ctx: {
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
  decision: { ratio?: string; look?: string };
  provider: ReturnType<typeof createEasyChatProvider>;
  고칠원고: Awaited<ReturnType<typeof lastCardnewsProject>>;
}): Promise<Response> {
  const 레퍼런스요청 = () => Response.json({ ok: true, needReference: true, textModel: ctx.textModel });
  let 입력: unknown;
  let photoRoles: Array<{ id: string; role: string }> = [];

  if (ctx.wants === "revise" && ctx.고칠원고) {
    // 고치기: 앞 원고의 조건 · 첨부 그대로, 말만 더한다(설계 §7). 앞 작업은 그대로 둔다.
    입력 = redraftInput(ctx.고칠원고, { words: ctx.prompt });
  } else {
    if (!ctx.붙인것.length) return 레퍼런스요청();

    /*
     * **무엇으로 쓸지를 사진보다 먼저 본다.** 기사 주소처럼 못 쓰는 것이면 여기서
     * 멈춘다. 사진을 먼저 읽으면 어차피 멈출 턴에 읽기값이 나간다.
     */
    const 내용 = pickCardSource(ctx.prompt, { webEnabled: isWebSourceEnabled() });
    if (!내용.ok) return 멈춘다(내용.message);

    const options = cardOptionsFrom({
      said: { ratio: ctx.decision.ratio, look: ctx.decision.look },
      chosen: readCardOptions(ctx.input.cardOptions),
      imageModel: typeof ctx.input.imageModel === "string" ? ctx.input.imageModel : undefined,
    });
    const 판단 = await runPhotoTurn(
      {
        photos: ctx.사진들,
        words: ctx.prompt,
        mode: "cardnews",
        chosen: readChosenRoles(ctx.input.photoRoles, ctx.붙인것, { cardnews: true }),
        previous: readChosenRoles(ctx.input.previousRoles, ctx.붙인것, { cardnews: true }),
        ratio: options.ratio,
        imageModel: options.modelId,
      },
      { read: (photos) => readEasyPhotos(photos), judge: (text) => ctx.provider.decideRoles(text) },
    );
    if (판단.kind === "stop") return 멈춘다(판단.message);
    if (판단.kind === "ask") {
      return Response.json({
        ok: true, photoAsk: { reason: 판단.reason, rows: 판단.rows, mode: "cardnews" }, textModel: ctx.textModel,
      });
    }
    const 첨부 = cardAttachmentsFrom({
      userId: ctx.userId,
      photos: ctx.사진들,
      rows: 판단.rows,
      slots: { ...slotsFromWords(ctx.prompt, ctx.붙인것), ...readChosenSlots(ctx.input.photoSlots, ctx.붙인것) },
    });
    if (!첨부.ok && 첨부.reason === "no_reference") return 레퍼런스요청();
    if (!첨부.ok) return 멈춘다(첨부.reason === "not_mine" ? NOT_MINE : UNUSABLE_PHOTO);

    photoRoles = 판단.rows;
    입력 = {
      title: easyTitle(ctx.prompt) || "카드뉴스",
      source: 내용.source,
      attachments: 첨부.attachments,
      ...projectSpecFrom(options),
      ...(판단.attachmentIntent ? { userInstruction: 판단.attachmentIntent.slice(0, 2000) } : {}),
    };
  }

  await ctx.store.appendMessage({ conversationId: ctx.conversationId, role: "user", body: ctx.prompt });
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
  const row = await ctx.store.appendMessage({ conversationId: ctx.conversationId, role: "image", workId: projectId });
  return Response.json({ ok: true, cardnews: { rowId: row.id, project }, message: row, photoRoles, textModel: ctx.textModel });
}

/** 화면이 기본값을 물어볼 자리. 두 벌로 적지 않게 여기서 준다. */
export async function GET() {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  return Response.json({
    ok: true,
    ratio: EASY_DEFAULT_RATIO,
    variants: VARIANTS,
    textModel: DEFAULT_TEXT_MODEL,
  });
}
