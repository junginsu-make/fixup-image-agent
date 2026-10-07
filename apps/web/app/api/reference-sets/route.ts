import { authenticateApiMember } from "../../../lib/membership/api";
import { errorLogText } from "../../../lib/easy/log-text";
import { referenceSetStoreForUser } from "../../../lib/repository-factory";
import { SetInputSchema } from "./schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    return Response.json({ ok: true, sets: await (await referenceSetStoreForUser(auth.member.userId)).list() });
  } catch (error) {
    // 데이터베이스 원문은 서버 기록에만 남긴다(2026-10-07).
    console.error("[reference-sets] 참고 이미지 세트를 불러오지 못했습니다.", errorLogText(error));
    return Response.json({ ok: false, message: "참고 이미지 세트를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  const parsed = SetInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ ok: false, message: "세트 입력을 확인해 주세요.", issues: parsed.error.issues }, { status: 400 });
  try {
    const set = await (await referenceSetStoreForUser(auth.member.userId)).create(auth.member.userId, parsed.data);
    return Response.json({ ok: true, set }, { status: 201 });
  } catch (error) {
    // 데이터베이스 원문은 서버 기록에만 남긴다(2026-10-07).
    console.error("[reference-sets] 세트를 만들지 못했습니다.", errorLogText(error));
    return Response.json({ ok: false, message: "세트를 만들지 못했습니다." }, { status: 500 });
  }
}
