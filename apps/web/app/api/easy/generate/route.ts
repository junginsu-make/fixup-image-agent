import { DEFAULT_TEXT_MODEL, resolveTextModel } from "@fixup/shared";
import { authenticateApiMember } from "../../../../lib/membership/api";
import { easyStoreForUser } from "../../../../lib/easy/store";
import { createEasyChatProvider } from "../../../../lib/easy/chat-provider";
import { stepIdempotencyKey } from "../../../../lib/easy/step-key";
import { easyChatPrompt, readEasyDecision } from "../../../easy/chat";
import { EASY_DEFAULT_RATIO, easyAsk } from "../../../easy/ask";
import { easyTitle } from "../../../easy/title";
import { POST as createProject } from "../../poster/projects/route";
import { POST as runPlan } from "../../poster/projects/[id]/plan/route";
import { POST as submitGenerate } from "../../poster/projects/[id]/generate/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
 * 라우트 하나를 부른다.
 *
 * **쿠키를 물려준다.** 세 라우트가 각자 `authenticateApiMember` 로 회원을
 * 확인하고 저장소도 회원 권한으로 연다. 원래 요청의 헤더를 그대로 넘겨야 그
 * 확인이 같은 사람으로 통과한다.
 *
 * **요청 식별자만 갈아 끼운다**(2026-09-21 운영 409).
 *
 * 세 라우트 중 **둘이 각자 예약한다** — 기획과 생성이다. 예약은 같은 식별자를
 * 두 번 받으면 `duplicate_request` 로 거절하므로, 그대로 물려주면 **두 번째
 * 단계가 반드시 막힌다.**
 *
 * 포스터 화면은 이 함정에 안 빠진다. 기획과 생성이 사용자의 서로 다른 누름이고
 * 누를 때마다 새 열쇠가 나가기 때문이다. Easy 는 한 번 누르면 셋이 이어 도는
 * 구조라 **우리가 갈라 줘야 한다.**
 */
function relay(request: Request, url: string, body: unknown, step: string): Request {
  const headers = new Headers(request.headers);
  const 바깥열쇠 = headers.get("x-idempotency-key");
  // 바깥 열쇠가 없으면 갈라 줄 것도 없다. 안쪽이 400 으로 막고 그것이 맞다.
  if (바깥열쇠) headers.set("x-idempotency-key", stepIdempotencyKey(바깥열쇠, step));

  return new Request(new URL(url, request.url), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/** 라우트의 답을 읽는다. 실패하면 그 라우트가 준 말을 그대로 올린다. */
async function read(response: Response, step: string) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) {
    /*
     * **오류를 뭉개지 않는다**(설계 §5-3). 「문제가 생겼습니다」로 덮으면
     * 사용자는 무엇을 고쳐야 할지 모르고, 같은 것을 또 눌러 값만 나간다.
     * 어디서 실패했는지와 그 라우트가 준 말을 함께 올린다.
     */
    throw new EasyStepError(step, body.message ?? `${step} 단계가 실패했습니다.`, response.status);
  }
  return body;
}

class EasyStepError extends Error {
  constructor(readonly step: string, message: string, readonly status: number) {
    super(message);
    this.name = "EasyStepError";
  }
}

export async function POST(request: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  const input = await request.json().catch(() => ({}));
  const conversationId = typeof input.conversationId === "string" ? input.conversationId : "";
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  if (!conversationId) return fail("어느 대화인지 알려 주세요.", 400);
  if (!prompt) return fail("무엇을 만들지 적어 주세요.", 400);

  const store = easyStoreForUser(auth.member.userId);
  const conversation = await store.getConversation(conversationId);
  if (!conversation) return fail("대화를 찾을 수 없습니다.", 404);

  /*
   * **고른 모델을 믿지 않는다.** 목록에 없는 id 가 오면 기본으로 떨어진다 —
   * 값을 모르는 모델을 부르면 원가를 못 세고, 셈이 틀린 채로 돌아간다.
   */
  const textModel = resolveTextModel(
    typeof input.textModel === "string" ? input.textModel : undefined,
  );
  const referenceIds: string[] = Array.isArray(input.referenceIds) ? input.referenceIds : [];
  const preservedIds: string[] = Array.isArray(input.preservedIds) ? input.preservedIds : [];
  const personIds: string[] = Array.isArray(input.personIds) ? input.personIds : [];

  const 붙인수 = referenceIds.length + preservedIds.length + personIds.length;

  try {
    /*
     * ⓪ **말인가 주문인가.**
     *
     * 값이 나가기 전에 가른다. 여기서 안 가르면 「안녕하세요」 한 마디에
     * 그림값이 나간다.
     *
     * **지난 대화를 같이 준다.** 「그거 말고 다른 걸로」 같은 말은 앞을 봐야
     * 뜻이 선다. 이번 말은 아직 안 남겼으므로 그대로 다 준다.
     */
    const 지난줄 = await store.listMessages(conversationId);
    const decision = readEasyDecision(
      await createEasyChatProvider(process.env, textModel).decide(
        easyChatPrompt(
          지난줄.map((row) => ({ id: row.id, role: row.role, body: row.body })),
          prompt,
          /*
           * **붙인 것이 있는지 알려 준다.** 안 알려 주면 「이걸로 하나 그려줘」를
           * 되묻는다 — 「이걸로」가 무엇인지 모르니 물을 수밖에 없다
           * (2026-09-21 실측).
           */
          붙인수,
        ),
      ),
    );

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

    if (decision.wants === "image" && 고르기.asks) {
      return Response.json({ ok: true, asked: true, textModel });
    }

    // 사용자가 친 말을 남긴다. 아래가 실패해도 대화에는 그 말이 있어야
    // 무엇을 하려 했는지 알 수 있다.
    await store.appendMessage({ conversationId, role: "user", body: prompt });

    // 제목이 비어 있으면 이 말로 짓는다. 첫 프롬프트 한 번만이다(설계 §4-1).
    if (!conversation.title) await store.renameConversation(conversationId, easyTitle(prompt));

    if (decision.wants === "talk") {
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

    // ① 프로젝트
    const created = await read(await createProject(relay(request, "/api/poster/projects", {
      title: easyTitle(prompt) || "Easy",
      // 말 속에 있던 것 · 물어서 고른 것 · 기본값 차례다(`ask.ts`).
      ratio: 고르기.ratio,
      look: 고르기.look,
      modelId: typeof input.imageModel === "string" ? input.imageModel : undefined,
      variants: VARIANTS,
      instruction: prompt,
      referenceIds,
      preservedIds,
      personIds,
      // AI 가 다듬는다. 그것이 이 모드의 값어치다(설계 §9).
      promptMode: "assisted",
      attachmentOrder: [...referenceIds, ...preservedIds],
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
    await store.appendMessage({ conversationId, role: "image", workId: projectId });

    return Response.json({
      ok: true,
      projectId,
      submission: submitted.submission,
      textModel,
      ratio: 고르기.ratio,
      look: 고르기.look,
      ...(submitted.notice ? { notice: submitted.notice } : {}),
    });
  } catch (error) {
    if (error instanceof EasyStepError) {
      /*
       * **세 갈래를 가려 말한다**(설계 §5-3). 어느 쪽이냐에 따라 할 일이
       * 다르다 — 크레딧·권한이면 다시 눌러도 또 막힌다.
       */
      return Response.json({
        ok: false,
        step: error.step,
        message: error.message,
        // 402·403 은 다시 눌러도 같은 곳에서 막힌다. 화면이 단추를 안 낸다.
        retryable: error.status !== 402 && error.status !== 403,
      }, { status: error.status });
    }
    return fail(error instanceof Error ? error.message : "만들지 못했습니다.");
  }
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
