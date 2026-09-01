import { authenticateApiMember } from "../../../../lib/membership/api";
import { posterStoresForUser } from "../../../../lib/poster/stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const references = await posterStoresForUser(auth.member.userId).references.list();
    return Response.json({ ok: true, references });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "레퍼런스를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
