import { authenticateApiMember } from "../../../../lib/membership/api";
import { easyStoreForUser } from "../../../../lib/easy/store";
import { cardnewsProject, draftCardnews, startCardnews } from "../../../../lib/easy/cardnews-steps";
import { EasyStepError } from "../../../../lib/easy/relay";
import { withLlmMeter } from "../../../../lib/llm/meter";
import { resolveTextModel } from "@fixup/shared";
import { createEasyChatProvider } from "../../../../lib/easy/chat-provider";
import { readCardOptions } from "../../../easy/cardnews-options";
import { redraftInput } from "../../../easy/cardnews-redraft";
import { draftFailureMessage } from "../../../easy/cardnews-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 조건을 바꾸면 원고를 다시 쓴다(1~2분).
export const maxDuration = 300;

/**
 * **「이대로 만들기」와 조건 바꾸기**(2단계 설계 §7 · §8).
 *
 * 둘 다 **이 대화가 만든 원고**에만 한다. 대화 줄이 그 작업을 가리키는지 먼저 본다.
 * 크레딧은 카드뉴스 `generate` 가 잡는다. 아무것도 지우지 않는다(2026-09-30 사용자 결정).
 */
export async function POST(request: Request) {
  return withLlmMeter(() => act(request));
}

/**
 * **서버 쪽 고장은 원문 대신 쉬운 말로**(2026-09-30 실제 생성). 그림 서비스 잔액이 떨어지자
 * 「Forbidden」이 그대로 떴다. 원문은 운영자가 볼 서버 기록에 남긴다. 크레딧 부족(402) ·
 * 권한(403) · 이미 만드는 중(409) 같은 안내는 뜻이 있어 그대로 전한다.
 *
 * 「값은 나가지 않았습니다」가 맞는 까닭: 카드뉴스 만들기는 제출이 실패하면 잡아 둔 장을
 * 돌려주고 답한다(`api/sns/projects/[id]/generate/route.ts` 의 `catch`).
 */
function 고장났다(action: "generate" | "redraft", projectId: string, error: unknown) {
  console.error(`[easy] 카드뉴스 ${action} 실패 project=${projectId}`, error);
  return Response.json({
    ok: false,
    message: action === "generate"
      ? "카드를 만들기 시작하지 못했습니다. 값은 나가지 않았습니다. 잠시 뒤 다시 눌러 주세요."
      : "원고를 다시 쓰지 못했습니다. 잠시 뒤 다시 해 주세요.",
  }, { status: 500 });
}

function fail(message: string, status: number) {
  return Response.json({ ok: false, message, retryable: false }, { status });
}

async function act(request: Request): Promise<Response> {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  const input = await request.json().catch(() => ({}));
  const conversationId = typeof input.conversationId === "string" ? input.conversationId : "";
  const projectId = typeof input.projectId === "string" ? input.projectId : "";
  const action = input.action === "generate" || input.action === "redraft" ? input.action : "";
  if (!conversationId || !projectId || !action) return fail("무엇을 할지 알려 주세요.", 400);

  const store = easyStoreForUser(auth.member.userId);
  if (!(await store.getConversation(conversationId))) return fail("대화를 찾을 수 없습니다.", 404);
  const rows = await store.listMessages(conversationId);
  if (!rows.some((row) => row.role === "image" && row.workId === projectId)) return fail("이 대화의 원고가 아닙니다.", 404);
  const project = await cardnewsProject(auth.member.userId, projectId);
  if (!project) return fail("카드뉴스 원고를 찾을 수 없습니다.", 404);

  try {
    if (action === "generate") {
      if (project.status !== "copy_ready") return fail("원고 단계에서만 만들 수 있습니다.", 400);
      if (!(project.data.flow?.cards ?? []).length) return fail("원고가 없어 만들 수 없습니다.", 400);
      await startCardnews(request, projectId);
      return Response.json({ ok: true, started: true });
    }

    // 다시 쓴 원고도 빈 마지막 장을 채운다(2026-09-30 사용자 결정 B).
    const provider = createEasyChatProvider(
      process.env, resolveTextModel(typeof input.textModel === "string" ? input.textModel : undefined),
    );
    const { projectId: 새것, project: 새작업 } = await draftCardnews(
      request, redraftInput(project, { options: readCardOptions(input.options) }), (text) => provider.writeEnding(text),
    );
    const flow = 새작업.data.flow;
    if (!flow?.cards.length) {
      // 원고 0장은 조용히 끝내지 않는다(설계 §9). 채팅 턴과 같은 말이다.
      const 까닭 = [...(flow?.planningIssues ?? []), ...(flow?.copyIssues ?? [])];
      const saved = await store.appendMessage({
        conversationId,
        role: "assistant",
        body: draftFailureMessage(까닭),
      });
      return Response.json({ ok: true, talked: true, message: saved });
    }
    const row = await store.appendMessage({ conversationId, role: "image", workId: 새것 });
    return Response.json({ ok: true, cardnews: { rowId: row.id, project: 새작업 }, message: row });
  } catch (error) {
    if (error instanceof EasyStepError && error.status < 500) {
      return Response.json({
        ok: false, step: error.step, message: error.message,
        // 402·403 은 다시 눌러도 같은 곳에서 막힌다.
        retryable: error.status !== 402 && error.status !== 403,
      }, { status: error.status });
    }
    return 고장났다(action, projectId, error);
  }
}
