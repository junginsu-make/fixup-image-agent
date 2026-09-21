import { authenticateApiMember } from "../../../../../lib/membership/api";
import { easyStoreForUser } from "../../../../../lib/easy/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

function fail(error: unknown, fallback: string) {
  return Response.json(
    { ok: false, message: error instanceof Error ? error.message : fallback },
    { status: 500 },
  );
}

/** 대화 하나와 그 줄들. */
export async function GET(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const store = easyStoreForUser(auth.member.userId);
    const conversation = await store.getConversation(id);
    if (!conversation) {
      return Response.json({ ok: false, message: "대화를 찾을 수 없습니다." }, { status: 404 });
    }
    return Response.json({
      ok: true,
      conversation,
      messages: await store.listMessages(id),
    });
  } catch (error) {
    return fail(error, "대화를 읽지 못했습니다.");
  }
}

/**
 * 대화를 지운다.
 *
 * **남으므로 지울 수 있어야 한다**(설계 §11-③). 앞 판은 브라우저에만 뒀고
 * 그때의 위험은 「사라진다」였는데, 표에 남기기로 하면서 반대가 됐다 — 사용자가
 * 친 말에 제품명·행사명이 들어간다.
 *
 * **그림은 안 지운다.** 라이브러리에 남는다 — 대화 줄은 `work_id` 로 가리키기만
 * 했다(설계 §4-1). 대화를 정리하다가 만든 그림이 사라지면 안 된다.
 */
export async function DELETE(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const store = easyStoreForUser(auth.member.userId);
    /*
     * **정말 지워졌는지 보고 답한다.** RLS 가 0줄로 막아도 supabase-js 는
     * 오류를 안 준다 — 그래서 「지웠다」고 답해 놓고 화면에서만 사라지는 일이
     * 생긴다(2026-09-15 포스터 삭제 사고).
     */
    if (!await store.removeConversation(id)) {
      return Response.json({ ok: false, message: "대화를 찾을 수 없습니다." }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return fail(error, "대화를 지우지 못했습니다.");
  }
}
