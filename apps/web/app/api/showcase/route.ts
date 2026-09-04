import { listPublicShowcase } from "./store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 첫 화면 갤러리 목록. **로그인 없이 읽는다.**
 *
 * 관리자가 켠 것만 나간다. 소유자·원본 id·저장 경로는 담지 않는다 —
 * 지나가는 누구나 읽는 응답이다.
 *
 * 관리하는 길은 여기가 아니라 `/api/showcase/manage` 다. 한 주소에서
 * 물음표 하나로 갈리게 두면, 언젠가 그 조건이 어긋나 꺼 놓은 것이 공개된다.
 */
export async function GET() {
  return Response.json({ ok: true, items: await listPublicShowcase() });
}
