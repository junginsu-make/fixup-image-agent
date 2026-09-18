import { DEFAULT_TEXT_MODEL, resolveTextModel } from "@fixup/shared";
import { authenticateApiMember } from "../../../../lib/membership/api";
import { easyStoreForUser } from "../../../../lib/easy/store";
import { easyTitle } from "../../../easy/title";
import { POST as createProject } from "../../poster/projects/route";
import { POST as runPlan } from "../../poster/projects/[id]/plan/route";
import { POST as submitGenerate } from "../../poster/projects/[id]/generate/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Easy 모드: 한 줄 → 그림 한 장 (설계 §8).
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

/** 기본값 — 고를 것을 없앴으므로 나머지는 여기서 정한다(설계 §9). */
const RATIO = "1:1";
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
 */
function relay(request: Request, url: string, body: unknown): Request {
  return new Request(new URL(url, request.url), {
    method: "POST",
    headers: request.headers,
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

  try {
    // 사용자가 친 말을 먼저 남긴다. 아래가 실패해도 대화에는 그 말이 있어야
    // 무엇을 하려 했는지 알 수 있다.
    await store.appendMessage({ conversationId, role: "user", body: prompt });

    // 제목이 비어 있으면 이 말로 짓는다. 첫 프롬프트 한 번만이다(설계 §4-1).
    if (!conversation.title) await store.renameConversation(conversationId, easyTitle(prompt));

    // ① 프로젝트
    const created = await read(await createProject(relay(request, "/api/poster/projects", {
      title: easyTitle(prompt) || "Easy",
      ratio: RATIO,
      modelId: typeof input.imageModel === "string" ? input.imageModel : undefined,
      variants: VARIANTS,
      instruction: prompt,
      referenceIds,
      preservedIds,
      personIds,
      // AI 가 다듬는다. 그것이 이 모드의 값어치다(설계 §9).
      promptMode: "assisted",
      attachmentOrder: [...referenceIds, ...preservedIds],
    })), "기획 준비");

    const projectId = created.project?.id as string | undefined;
    if (!projectId) throw new EasyStepError("기획 준비", "작업을 만들지 못했습니다.", 500);
    const params = Promise.resolve({ id: projectId });

    // ② 기획 — 붙인 그림을 읽고 칸을 채운다
    await read(await runPlan(relay(request, `/api/poster/projects/${projectId}/plan`, {}), { params }), "기획");

    // ③ 제출 — 그림은 화면이 `status` 로 받아 간다
    const submitted = await read(
      await submitGenerate(relay(request, `/api/poster/projects/${projectId}/generate`, {}), { params }),
      "그림 만들기",
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
  return Response.json({ ok: true, ratio: RATIO, variants: VARIANTS, textModel: DEFAULT_TEXT_MODEL });
}
