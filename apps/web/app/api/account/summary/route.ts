import { authenticateApiMember } from "../../../../lib/membership/api";
import { getAccountSummary } from "../../../../lib/membership/account-summary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  const auth = await authenticateApiMember();
  if (!auth.ok) { auth.response.headers.set("Cache-Control", "private, no-store"); return auth.response; }
  try { return Response.json(await getAccountSummary(auth.member.userId), { headers }); }
  catch {
    console.error("[account] 잔액 조회 실패");
    return Response.json({ ok: false, code: "account_unavailable", message: "크레딧을 확인하지 못했습니다. 다시 확인해 주세요." }, { status: 503, headers });
  }
}
