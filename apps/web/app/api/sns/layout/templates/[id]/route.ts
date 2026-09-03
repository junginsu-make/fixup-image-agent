import { templateById } from "@fixup/layout-core";
import { authenticateApiMember } from "../../../../../../lib/membership/api";
import { deleteTemplate } from "../../../../../../lib/layout/template-store";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  // 코드에 있는 기본 뼈대는 지울 수 없다. 지운 척하고 새로고침하면 돌아온다.
  if (templateById(id)) {
    return Response.json({ ok: false, message: "기본 뼈대는 지울 수 없습니다." }, { status: 400 });
  }

  try {
    await deleteTemplate(auth.member.userId, id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "뼈대를 지우지 못했습니다." },
      { status: 500 },
    );
  }
}
