import { disabledRouteResponse } from "../../../../lib/access/disabled-api";
import { authenticateApiMember } from "../../../../lib/membership/api";
import { errorLogText } from "../../../../lib/easy/log-text";
import { sourceServiceForUser } from "../../../../lib/repository-factory";
import { SourcePatchSchema } from "../schema";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  // 꺼 둔 화면의 API 다. 미들웨어는 `/api/` 를 등록부보다 먼저 통과시킨다.
  const disabled = disabledRouteResponse("/sources");
  if (disabled) return disabled;

  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  const parsed = SourcePatchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ ok: false, message: "바꿀 값을 확인해 주세요.", issues: parsed.error.issues }, { status: 400 });
  try {
    const { id } = await context.params;
    return Response.json({ ok: true, source: await (await sourceServiceForUser(auth.member.userId)).update(id, parsed.data) });
  } catch (error) {
    // 데이터베이스 원문은 서버 기록에만 남긴다(2026-10-07).
    console.error("[sources] 소스를 수정하지 못했습니다.", errorLogText(error));
    return Response.json({ ok: false, message: "소스를 수정하지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  // 꺼 둔 화면의 API 다. 미들웨어는 `/api/` 를 등록부보다 먼저 통과시킨다.
  const disabled = disabledRouteResponse("/sources");
  if (disabled) return disabled;

  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    await (await sourceServiceForUser(auth.member.userId)).remove(id);
    return Response.json({ ok: true });
  } catch (error) {
    // 데이터베이스 원문은 서버 기록에만 남긴다(2026-10-07).
    console.error("[sources] 소스를 삭제하지 못했습니다.", errorLogText(error));
    return Response.json({ ok: false, message: "소스를 삭제하지 못했습니다." }, { status: 500 });
  }
}
