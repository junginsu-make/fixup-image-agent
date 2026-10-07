import { DEFAULT_TEXT_MODEL, resolveTextModel } from "@fixup/shared";
import { authenticateApiMember, reserveAiUsage, settleAiUsage } from "../../../../lib/membership/api";
import { freeCreditPlan } from "../../../../lib/membership/credit-ledger";
import { easyStoreForUser } from "../../../../lib/easy/store";
import { EasyConversationMissingError } from "../../../../lib/easy/store-core";
import { createEasyChatProvider } from "../../../../lib/easy/chat-provider";
import { EasyStepError, relay } from "../../../../lib/easy/relay";
import { failureRowMessage, trackUserTurn } from "../../../../lib/easy/failure-row";
import { errorLogText } from "../../../../lib/easy/log-text";
import { plainTyped, withPick } from "../../../easy/row-marks";
import { askChain, buttonDecision, readButtonAnswer, settleTypedAnswer } from "../../../easy/ask-chain";
import type { EasyDecision } from "../../../easy/chat";
import { EASY_DEFAULT_RATIO } from "../../../easy/ask";
import { llmSettleCost, readLlmMeter, withLlmMeter } from "../../../../lib/llm/meter";
import { posterReferencesByIds } from "../../../../lib/poster/references";
import { teamIdOf } from "../../../../lib/teams/store";
import { UNUSABLE_PHOTO, isPhotoId, missingIds, uniqueIds } from "../../../easy/photo-check";
import { lastCardnewsProject } from "../../../../lib/easy/cardnews-steps";
import { isMade } from "../../../easy/cardnews-after";
import { VARIANTS } from "../../../../lib/easy/image-turn";
import { easyAdStep } from "../../../easy/ad-ask";
import { adQuestionTurn } from "../../../../lib/easy/ad-turn";
import { loadEasyImages } from "../../../../lib/easy/image-list";
import { decideTurn } from "../../../../lib/easy/decide-turn";
import { answerTurn } from "../../../../lib/easy/branch-turn";
import { 멈춘다 } from "../../../../lib/easy/stop";

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

/** 한 번에 받는 말 길이(최종 수정 9). */
const PROMPT_LIMIT = 2000;
const PROMPT_TOO_LONG = `말은 ${PROMPT_LIMIT}자까지 보낼 수 있습니다.`;

function fail(message: string, status = 500, extra: Record<string, unknown> = {}) {
  return Response.json({ ok: false, message, ...extra }, { status });
}

/**
 * **사용자 줄을 남기기 전에 끝난 실패를 알린다**(후속 Task 9 고침 1 · 2). 판단 전이든 뒤든(입력 검사 · 판정 예약 거절 · 판단
 * 실패 · 사진 멈춤 · 저장 전 예외) 서버에는 이 말의 줄이 없어, 새로고침하면 앞 꼬리 그대로다 — 앞이 물음이면 단추가 다시 뜬다.
 * 화면이 그때 제 줄을 빼 같게 한다. 응답 본문에 칸 하나만 더하고 다른 칸 · 상태 코드는 그대로다(회원 층 응답도 같은 JSON 이다).
 */
async function 안남긴실패(response: Response, 남겼나: () => boolean): Promise<Response> {
  if (response.ok || 남겼나()) return response;
  const body: unknown = await response.clone().json().catch(() => undefined);
  if (!body || typeof body !== "object" || Array.isArray(body)) return response;
  return Response.json({ ...body, userUnsaved: true }, { status: response.status });
}

/** 지킴(`trackUserTurn`)은 회원을 확인한 뒤에 만들어진다. 그 전에 끝난 턴은 「안 남김」이다. */
function 사용자줄기록() {
  let 남겼나 = () => false;
  return {
    지켜본다<T extends { savedUser(): boolean }>(지킴: T): T {
      남겼나 = () => 지킴.savedUser();
      return 지킴;
    },
    남겼나: () => 남겼나(),
  };
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
  return withLlmMeter(async () => {
    const 기록 = 사용자줄기록();
    return 안남긴실패(await turn(request, 기록.지켜본다), 기록.남겼나);
  });
}

async function turn(request: Request, 지켜본다: ReturnType<typeof 사용자줄기록>["지켜본다"]): Promise<Response> {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  const input = await request.json().catch(() => ({}));
  const conversationId = typeof input.conversationId === "string" ? input.conversationId : "";
  // 친 말에 섞인 표시 글자는 풀어 둔다 — 단추 답으로 읽히지 않게(2차 §3-0, Review Focus 3).
  const prompt = typeof input.prompt === "string" ? plainTyped(input.prompt.trim()) : "";
  if (!conversationId) return fail("어느 대화인지 알려 주세요.", 400);
  if (!prompt) return fail("무엇을 만들지 적어 주세요.", 400);
  // 아주 긴 말은 예약 · 판단 전에 막는다(최종 수정 9, 보안 리뷰). 값이 안 든다.
  if (prompt.length > PROMPT_LIMIT) return 멈춘다(PROMPT_TOO_LONG);

  // 사용자 말 뒤에 답 없이 실패하면 실패 안내를 남길 수 있게 지켜본다(2026-10-06 설계 B4).
  const 지킴 = 지켜본다(trackUserTurn(easyStoreForUser(auth.member.userId)));
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
  const 보낸사진 = uniqueIds(input.referenceIds);
  if (보낸사진.some((id) => !isPhotoId(id))) return 멈춘다(UNUSABLE_PHOTO);

  try {
    const 지난줄 = await store.listMessages(conversationId);
    /*
     * **단추로 한 답**(2026-10-07 2차 D1). 화면은 처음 말을 다시 보내지 않고 단추 글 · 물음 줄 id ·
     * 고른 값만 보낸다. **지금 마지막 물음 줄의 단추일 때만** 받는다 — 지난 물음의 단추로 지금 맥락과
     * 다른 지시에 값이 나가지 않게(Review Focus 1). 물음 줄의 판단을 만들 수 있으면 판단 모델을 다시
     * 안 부른다(`buttonDecision`). 고른 값이 모자라면 말로 본다.
     */
    const 단추답 = readButtonAnswer(input, 지난줄);
    const 단추판단 = 단추답 ? buttonDecision(단추답) : undefined;
    const 고른단추 = 단추판단 ? 단추답?.pick : undefined;
    // 말로 답할 수 있는 마지막 물음. 답인지는 판단 모델이 `note` 로 알려 준다.
    const 물음사슬 = askChain(지난줄);
    /*
     * ⓪ **사진 확인**(설계 §2-3). 이미지 만들기와 같은 함수 · 같은 회원 기준으로
     * 읽고, **요청한 사진이 전부 나왔는지** 센다. 조회는 볼 수 없는 id 를 오류
     * 없이 빼므로, 세지 않으면 사진이 빠지거나 번호가 당겨진다.
     *
     * **새로고침 뒤에 답하면 화면에 첨부가 없다**(2차 D1). 그때는 물음 줄에 적어 둔 사진을 쓴다 —
     * 단추 답은 여기서, 말로 한 답은 판단 뒤 답으로 읽혔을 때만(아래 `정한사진`).
     */
    const 사진을정한다 = async (ids: readonly string[]) => {
      const photos = ids.length
        ? await posterReferencesByIds({
          userId: auth.member.userId,
          role: auth.member.profile.role,
          teamId: await teamIdOf(auth.member.userId),
        }, [...ids])
        : [];
      return missingIds(ids, photos).length ? undefined : { ids: [...ids], photos };
    };
    const 이을사진 = (물음사슬?.photoIds ?? []).filter(isPhotoId);
    const 처음사진 = await 사진을정한다(보낸사진.length || !단추판단 ? 보낸사진 : 이을사진);
    if (!처음사진) return 멈춘다(UNUSABLE_PHOTO);
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
    // 고칠 원고가 있을 때만 「고치기」를 안다(2단계 §7). 없으면 고치기는 말로 읽는다.
    const 고칠원고 = await lastCardnewsProject(auth.member.userId, 지난줄);
    // 그 원고로 카드를 만들었나. 만들었을 때만 다시 그리기 · 게시글 · 받기를 안다(3단계 §5).
    const 만들었나 = Boolean(고칠원고 && isMade(고칠원고));
    // 이 대화의 결과물(번호 · 갈래 · 상태 · 그림, 2차 D2). 판단 모델에 목록으로 준다. 못 읽어도 턴은 간다.
    const 이미지들 = await loadEasyImages(auth.member.userId, 지난줄);

    /*
     * **「광고 소재」는 코드가 먼저 본다**(2026-10-06 설계 A5). 물을 때는 글 모델을 안
     * 부르고 물음 줄만 남긴다 — 값도 예약도 없다. 단추 글 · 규격 낱말이면 아래 판단이
     * 글 모델 없이 갈래를 정한다.
     */
    // 단추 답은 물음 줄이 갈래를 안다 — 광고 낱말을 다시 보지 않는다.
    const 광고 = 단추판단 ? undefined : easyAdStep(prompt, 지난줄);
    if (광고 === "ask") return await adQuestionTurn({ store, conversation, conversationId, prompt, textModel });

    // 옛 화면이 싣는 「갈래를 단추로 골랐다」(1차 A2). 판단 모델의 빈 talk 재질문을 막는 데만 쓴다.
    const 옛골랐나 = (input.kind === "image" || input.kind === "cardnews") && input.kindPicked === true;

    /*
     * **판정도 값이 나간다 — 예약부터**(설계 2026-09-30 §3.1).
     *
     * 기존 작업 이름(`poster_image`) + `easy:decide`, 0 크레딧(D1). 크레딧이 없거나
     * 운영자가 멈췄으면 여기서 막혀 글 모델을 안 부른다. 열쇠는 단계마다 가른다 —
     * 바깥 열쇠를 그대로 쓰면 뒤의 기획·생성 예약이 `duplicate_request` 로 막힌다.
     * 대신 부르는 세 라우트와 같은 규칙으로 요청 식별자를 가른다. 이것이 네 번째 단계(`decide`)다.
     *
     * **단추 답도 이 예약은 한다**(2차 최종 리뷰 4). 글 모델만 안 부른다 — 운영자 멈춤 · 크레딧 확인이 그대로
     * 걸리고, 뒤의 사진 읽기 · 역할 판단 · 끝 장 글의 원가가 이 예약(`bindAiCaller`)에 묶인다.
     */
    const 판정예약 = await reserveAiUsage(
      relay(request, "/api/easy/generate", {}, "decide"), "poster_image", 0, freeCreditPlan("easy:decide"),
    );
    if (!판정예약.ok) return 판정예약.response;

    let decision: EasyDecision;
    let 광고안내 = "";
    try {
      // 판단 · 규격 안내 · 보고 답하기는 `lib/easy/decide-turn.ts` 가 한다(2026-10-07 후속 Task 10 — 동작 그대로 옮겼다).
      ({ decision, 광고안내 } = await decideTurn({
        auth, 단추판단, 고칠원고, 만들었나, 이미지들, provider, 지난줄, prompt, 처음사진, 이을사진, 옛골랐나, 광고,
      }));
    } catch (error) {
      await settleAiUsage(판정예약, false, 0, "easy_decide_failed", llmSettleCost());
      throw error;
    }
    await settleAiUsage(판정예약, true, 0, undefined, llmSettleCost());

    /*
     * **말로 한 답의 갈래 정리**(2차 최종 리뷰 6). 바로 앞 물음의 갈래로 판단을 한 번 더 본다 — 모양 물음
     * 뒤에는 모양을 다시 안 묻고, 갈래 물음 뒤 또 either 면 한 장으로, 번호 · 장 물음 바로 뒤 그 갈래면
     * note 가 없어도 답이다(`settleTypedAnswer`). 단추 답은 물음 줄의 판단이라 안 건다.
     */
    const 말답 = 단추판단 ? undefined : settleTypedAnswer(물음사슬?.ask, decision);
    if (말답) decision = 말답.decision;

    // 답 읽기 · 묻기 · 고치기 · 만들기 갈래는 `lib/easy/branch-turn.ts` 가 한다(2026-10-07 후속 Task 10 — 동작 그대로 옮겼다).
    return await answerTurn({
      request, auth, store, conversation, conversationId, prompt, textModel, input, provider, decision, 광고안내, 말답,
      고칠원고, 이미지들, 지난줄, 단추판단, 고른단추, 광고, 물음사슬, 보낸사진, 이을사진, 사진을정한다, 처음사진,
    });
  } catch (error) {
    return await 실패를알린다(error, 지킴, conversationId, prompt);
  } finally {
    값을적는다(auth.member.userId);
  }
}

/**
 * 턴이 던진 오류를 응답으로 바꾼다(2026-10-07 후속 Task 10 — `turn()` 의 `catch` 본문을 동작 그대로 옮겼다).
 * `catch` 는 `turn()` 에 그대로 있고 이것을 `return await` 로 부른다 — `finally` 의 값 기록은 전처럼 이 뒤다.
 */
async function 실패를알린다(
  error: unknown,
  지킴: Pick<ReturnType<typeof trackUserTurn>, "leaveFailure">,
  conversationId: string,
  prompt: string,
): Promise<Response> {
  /*
   * 사용자 말을 남긴 뒤 실패했으면 그 안내도 대화에 남긴다(B4). 우리가 알고 낸 실패면
   * 크레딧 · 권한 안내만 그대로, 나머지는 일반 문장 — 안쪽 라우트의 날것 오류 글(표 이름
   * 등)은 대화에 남기지 않는다(`failureRowMessage`, 리뷰 2026-10-06).
   */
  const 실패한말 = await 지킴.leaveFailure(conversationId, failureRowMessage(error));
  /*
   * 답으로 읽은 말 답(`typed` 표시) 뒤에 실패 줄을 남겼으면 알린다(후속 Task 9). 새로고침 뒤에는 그 물음에 단추가
   * 다시 뜨니, 화면도 제 줄에 같은 표시를 달아 그 자리에서 단추를 다시 단다. 응답의 다른 칸은 그대로다.
   * 사용자 줄을 남기기 전에 실패했으면 `POST` 가 `userUnsaved` 를 싣는다(고침 1 · 2).
   */
  const 말답표시 = 실패한말 === withPick(prompt, { typed: true }) ? { typedAnswer: true } : {};
  if (error instanceof EasyStepError) {
    /*
     * **세 갈래를 가려 말한다**(설계 §5-3). 어느 쪽이냐에 따라 할 일이
     * 다르다 — 크레딧·권한이면 다시 눌러도 또 막힌다.
     */
    // 코드 없고 다시 눌러 풀릴 5xx 는 안쪽 라우트의 날것 글(표 이름 등)이다. 서버 기록에만(후속 Task 1 수정 1).
    // 안쪽이 우리 문장이라고 표시한 것(포스터 생성의 계정 풀 문장 등)은 그대로 보인다(최종 수정 L1).
    const 가림 = error.status >= 500 && !error.code && error.retryable && !error.userFacing;
    if (가림) console.error(`[easy] ${error.step} 실패`, errorLogText(error));
    return Response.json({
      ok: false,
      step: error.step,
      message: 가림 ? "만들지 못했습니다." : error.message,
      ...(error.code ? { code: error.code, usage: error.usage } : {}),
      // 402·403 은 다시 눌러도 같은 곳에서 막힌다. 안쪽이 「안 풀린다」고 한 것(멈춤 503)도 같다.
      retryable: error.retryable && error.status !== 402 && error.status !== 403,
      ...말답표시,
    }, { status: error.status });
  }
  // 「대화를 찾을 수 없습니다.」는 우리가 쓴 안내라 그대로. 나머지 원문은 서버 기록에만(2026-10-07 후속 Task 1).
  if (error instanceof EasyConversationMissingError) return fail(error.message, 500, 말답표시);
  console.error("[easy] 만들기 실패", errorLogText(error));
  return fail("만들지 못했습니다.", 500, 말답표시);
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
