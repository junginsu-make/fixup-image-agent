import { authenticateApiMember } from "../../../../lib/membership/api";
import { easyStoreForUser } from "../../../../lib/easy/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 내 쉽게 대화가 만든 작업의 id (2026-09-22 라이브러리 필터).
 *
 * 쉽게와 다양하게는 같은 포스터 작업으로 저장된다. 라이브러리가 이 목록으로 둘을 가른다.
 *
 * **자기 것만 준다.** 관리자의 「전체 회원 보기」는 `api/admin/works` 가 따로 싣는다 —
 * 한 주소에서 물음표 하나로 「전부」와 「내 것」을 가르지 않는다(그 파일의 주석).
 */
export async function GET() {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const workIds = await easyStoreForUser(auth.member.userId).listWorkIds();
    return Response.json({ ok: true, workIds });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "쉽게 작업 목록을 읽지 못했습니다." },
      { status: 500 },
    );
  }
}
