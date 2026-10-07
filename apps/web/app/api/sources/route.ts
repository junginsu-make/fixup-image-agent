import { disabledRouteResponse } from "../../../lib/access/disabled-api";
import { authenticateApiMember } from "../../../lib/membership/api";
import { errorLogText } from "../../../lib/easy/log-text";
import { sourceServiceForUser } from "../../../lib/repository-factory";
import { SourceInputSchema } from "./schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // 꺼 둔 화면의 API 다. 미들웨어는 `/api/` 를 등록부보다 먼저 통과시킨다.
  const disabled = disabledRouteResponse("/sources");
  if (disabled) return disabled;

  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    return Response.json({ ok: true, sources: await (await sourceServiceForUser(auth.member.userId)).list() });
  } catch (error) {
    // 데이터베이스 원문은 서버 기록에만 남긴다(2026-10-07).
    console.error("[sources] 소스를 불러오지 못했습니다.", errorLogText(error));
    return Response.json({ ok: false, message: "소스를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  // 꺼 둔 화면의 API 다. 미들웨어는 `/api/` 를 등록부보다 먼저 통과시킨다.
  const disabled = disabledRouteResponse("/sources");
  if (disabled) return disabled;

  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  const parsed = SourceInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ ok: false, message: "소스 입력을 확인해 주세요.", issues: parsed.error.issues }, { status: 400 });
  try {
    const source = await (await sourceServiceForUser(auth.member.userId)).create(auth.member.userId, parsed.data);
    return Response.json({ ok: true, source }, { status: 201 });
  } catch (error) {
    // 데이터베이스 원문은 서버 기록에만 남긴다(2026-10-07).
    console.error("[sources] 소스를 등록하지 못했습니다.", errorLogText(error));
    return Response.json({ ok: false, message: "소스를 등록하지 못했습니다." }, { status: 500 });
  }
}
