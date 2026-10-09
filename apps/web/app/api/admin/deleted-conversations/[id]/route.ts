import { z } from "zod";
import { authenticateApiAdmin } from "../../../../../lib/membership/api";
import { purgeDeletedConversation, readDeletedConversation } from "../../../../../lib/easy/deleted-conversations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * **회원이 지운 쉽게 대화 — 관리자만**(2026-10-08 사용자 결정 — 계획 2단계). 「회원이 삭제한 자료」 화면이 내용을
 * 열고(GET) 완전히 지운다(DELETE). 살아 있는 대화는 이 주소로 열리지도 지워지지도 않는다.
 */
const NOT_FOUND = { ok: false, message: "지운 대화를 찾지 못했습니다." };

async function guard(context: Context): Promise<{ id: string } | { response: Response }> {
  const auth = await authenticateApiAdmin();
  if (!auth.ok) return { response: auth.response };
  const { id } = await context.params;
  // id 모양이 아니면 DB 에 묻지 않는다 — 묻으면 22P02 로 500 이 난다.
  if (!z.string().uuid().safeParse(id).success) return { response: Response.json(NOT_FOUND, { status: 400 }) };
  return { id };
}

function failed(error: unknown, message: string) {
  // DB 원문(표·칸 이름)은 화면에 보내지 않는다.
  console.error("[admin:deleted-conversations]", error instanceof Error ? error.message : error);
  return Response.json({ ok: false, message }, { status: 500 });
}

export async function GET(_request: Request, context: Context) {
  const checked = await guard(context);
  if ("response" in checked) return checked.response;
  try {
    const messages = await readDeletedConversation(checked.id);
    if (!messages) return Response.json(NOT_FOUND, { status: 404 });
    return Response.json({ ok: true, messages });
  } catch (error) {
    return failed(error, "대화 내용을 불러오지 못했습니다.");
  }
}

export async function DELETE(_request: Request, context: Context) {
  const checked = await guard(context);
  if ("response" in checked) return checked.response;
  try {
    if (!await purgeDeletedConversation(checked.id)) return Response.json(NOT_FOUND, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    return failed(error, "대화를 지우지 못했습니다.");
  }
}
