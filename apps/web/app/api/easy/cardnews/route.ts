import { authenticateApiMember } from "../../../../lib/membership/api";
import { easyStoreForUser } from "../../../../lib/easy/store";
import { cardnewsProject, draftCardnews, startCardnews, type EasyCardnewsProject } from "../../../../lib/easy/cardnews-steps";
import { captionCard, editCard, redoCard } from "../../../../lib/easy/cardnews-after-steps";
import { EasyStepError } from "../../../../lib/easy/relay";
import { withLlmMeter } from "../../../../lib/llm/meter";
import { resolveTextModel } from "@fixup/shared";
import { createEasyChatProvider } from "../../../../lib/easy/chat-provider";
import { isMade, type CopyPatch } from "../../../easy/cardnews-after";
import { readCardOptions } from "../../../easy/cardnews-options";
import { redraftInput } from "../../../easy/cardnews-redraft";
import { draftFailureMessage } from "../../../easy/cardnews-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 조건을 바꾸면 원고를 다시 쓴다(1~2분).
export const maxDuration = 300;

/**
 * **「이대로 만들기」 · 조건 바꾸기**(2단계 설계 §7 · §8)와 **만든 카드뉴스 손보기**
 * (3단계 설계 §6 — 한 장 글 고치기 · 한 장 다시 만들기 · 게시글).
 *
 * 모두 **이 대화가 만든 원고**에만 한다. 대화 줄이 그 작업을 가리키는지 먼저 본다.
 * 크레딧은 카드뉴스 라우트가 잡는다. 아무것도 지우지 않는다(2026-09-30 사용자 결정).
 */
export async function POST(request: Request) {
  return withLlmMeter(() => act(request));
}

const 할일들 = ["generate", "redraft", "edit", "redo", "caption"] as const;
type 할일 = (typeof 할일들)[number];

/**
 * **서버 쪽 고장은 원문 대신 쉬운 말로**(2026-09-30 실제 생성). 그림 서비스 잔액이 떨어지자
 * 「Forbidden」이 그대로 떴다. 원문은 운영자가 볼 서버 기록에 남긴다. 크레딧 부족(402) ·
 * 권한(403) · 이미 만드는 중(409) 같은 안내는 뜻이 있어 그대로 전한다.
 *
 * 「값은 나가지 않았습니다」가 맞는 까닭: 카드뉴스 만들기는 제출이 실패하면 잡아 둔 장을
 * 돌려주고 답한다(`api/sns/projects/[id]/generate/route.ts` 의 `catch`, 한 장도 같다).
 */
const 고장말: Record<할일, string> = {
  generate: "카드를 만들기 시작하지 못했습니다. 값은 나가지 않았습니다. 잠시 뒤 다시 눌러 주세요.",
  redraft: "원고를 다시 쓰지 못했습니다. 잠시 뒤 다시 해 주세요.",
  edit: "글을 고치지 못했습니다. 잠시 뒤 다시 해 주세요.",
  redo: "그 장을 다시 만들기 시작하지 못했습니다. 값은 나가지 않았습니다. 잠시 뒤 다시 눌러 주세요.",
  caption: "게시글을 쓰지 못했습니다. 잠시 뒤 다시 해 주세요.",
};

function 고장났다(action: 할일, projectId: string, error: unknown) {
  console.error(`[easy] 카드뉴스 ${action} 실패 project=${projectId}`, error);
  return Response.json({ ok: false, message: 고장말[action] }, { status: 500 });
}

function fail(message: string, status: number) {
  return Response.json({ ok: false, message, retryable: false }, { status });
}

interface 맥락 {
  request: Request;
  input: Record<string, unknown>;
  userId: string;
  conversationId: string;
  project: EasyCardnewsProject;
  store: ReturnType<typeof easyStoreForUser>;
}

async function act(request: Request): Promise<Response> {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  const input = await request.json().catch(() => ({}));
  const conversationId = typeof input.conversationId === "string" ? input.conversationId : "";
  const projectId = typeof input.projectId === "string" ? input.projectId : "";
  const action = (할일들 as readonly unknown[]).includes(input.action) ? input.action as 할일 : undefined;
  if (!conversationId || !projectId || !action) return fail("무엇을 할지 알려 주세요.", 400);

  const store = easyStoreForUser(auth.member.userId);
  if (!(await store.getConversation(conversationId))) return fail("대화를 찾을 수 없습니다.", 404);
  const rows = await store.listMessages(conversationId);
  if (!rows.some((row) => row.role === "image" && row.workId === projectId)) return fail("이 대화의 원고가 아닙니다.", 404);
  const project = await cardnewsProject(auth.member.userId, projectId);
  if (!project) return fail("카드뉴스 원고를 찾을 수 없습니다.", 404);

  const ctx: 맥락 = { request, input, userId: auth.member.userId, conversationId, project, store };
  try {
    if (action === "generate") return await generate(ctx);
    if (action === "redraft") return await redraft(ctx);
    if (action === "caption") return Response.json({ ok: true, project: await captionCard(request, projectId) });
    const index = typeof input.index === "number" && Number.isInteger(input.index) && input.index > 0 ? input.index : 0;
    if (!index) return fail("몇 번 장인지 알려 주세요.", 400);
    return action === "edit" ? await edit(ctx, index) : await redo(ctx, index);
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

async function generate({ request, project }: 맥락): Promise<Response> {
  /*
   * **만든 작업은 전체 만들기를 거절한다**(3단계 §6-1). 한 장 글을 저장하면 카드뉴스 라우트가
   * 상태를 `copy_ready` 로 되돌려(`cards/[index]/route.ts:58`), 아래 상태 검사만으로는
   * 통과해 전 장을 다시 만들고 전 장 값이 나간다.
   */
  if (isMade(project)) return fail("이미 만든 카드뉴스입니다. 장마다 「다시 만들기」를 써 주세요.", 409);
  if (project.status !== "copy_ready") return fail("원고 단계에서만 만들 수 있습니다.", 400);
  if (!(project.data.flow?.cards ?? []).length) return fail("원고가 없어 만들 수 없습니다.", 400);
  await startCardnews(request, project.id);
  return Response.json({ ok: true, started: true });
}

function 글모델(input: Record<string, unknown>) {
  return createEasyChatProvider(process.env, resolveTextModel(typeof input.textModel === "string" ? input.textModel : undefined));
}

async function redraft({ request, input, conversationId, project, store }: 맥락): Promise<Response> {
  // 다시 쓴 원고도 빈 마지막 장을 채운다(2026-09-30 사용자 결정 B).
  const provider = 글모델(input);
  const { projectId: 새것, project: 새작업 } = await draftCardnews(
    request, redraftInput(project, { options: readCardOptions(input.options) }), (text) => provider.writeEnding(text),
  );
  const flow = 새작업.data.flow;
  if (!flow?.cards.length) {
    // 원고 0장은 조용히 끝내지 않는다(설계 §9). 채팅 턴과 같은 말이다.
    const 까닭 = [...(flow?.planningIssues ?? []), ...(flow?.copyIssues ?? [])];
    const saved = await store.appendMessage({ conversationId, role: "assistant", body: draftFailureMessage(까닭) });
    return Response.json({ ok: true, talked: true, message: saved });
  }
  const row = await store.appendMessage({ conversationId, role: "image", workId: 새것 });
  return Response.json({ ok: true, cardnews: { rowId: row.id, project: 새작업 }, message: row });
}

/** **한 장 글 고치기**(3단계 §6-2). 칸으로 온 글이나 말. 무료다. */
async function edit({ request, input, conversationId, project, store }: 맥락, index: number): Promise<Response> {
  const copy = input.copy && typeof input.copy === "object" ? input.copy as CopyPatch : undefined;
  const words = typeof input.words === "string" ? input.words : undefined;
  // 글 모델은 말로 고칠 때만 만든다. 칸으로 고치는 것은 글 모델 없이도 되어야 한다.
  const got = await editCard(request, project, index, { ...(copy ? { copy } : {}), ...(words ? { words } : {}) },
    words ? (text) => 글모델(input).editCard(text) : undefined);
  const message = await store.appendMessage({ conversationId, role: "assistant", body: `${index}번 장 글을 고쳤습니다.` });
  return Response.json({ ok: true, project: got.project, needsRedraw: got.needsRedraw, message });
}

/** **한 장 다시 만들기**(3단계 §6-3). 앞 그림을 보관한 뒤. 그 장만큼 크레딧. */
async function redo({ request, input, userId, conversationId, project, store }: 맥락, index: number): Promise<Response> {
  const note = typeof input.note === "string" ? input.note : undefined;
  const got = await redoCard(request, userId, project, index, note);
  const 보관 = got.archived ? ` 앞 그림은 라이브러리에 「${got.archived.title}」으로 보관했습니다.` : "";
  const message = await store.appendMessage({
    conversationId, role: "assistant", body: `${index}번 장을 다시 만들고 있습니다.${보관}`,
  });
  return Response.json({ ok: true, project: got.project, message });
}
