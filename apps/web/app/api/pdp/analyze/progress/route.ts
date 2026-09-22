import { PLAN_STAGE_LABEL } from "@fixup/pdp-core";
import { authenticateApiMember } from "../../../../../lib/membership/api";
import { readPlanStage } from "../../../../../lib/pdp/plan-progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * **기획이 지금 어디쯤인가.**
 *
 * 화면이 기다리는 동안 몇 초마다 물어본다. 답은 한 낱말과 그것을 옮긴 한
 * 문장이다.
 *
 * ── 모르면 모른다고 한다 ───────────────────────────────────
 *
 * 아직 첫 단계에 못 들어갔거나, 오래됐거나, 남의 번호면 `stage: null` 이다.
 * 그때 화면은 예전처럼 한 줄짜리 안내로 버틴다 — **지어내지 않는다.**
 *
 * ── 한도를 안 먹인다 ───────────────────────────────────────
 *
 * 모델을 안 부르고 메모리 한 칸을 읽는다. 여기에 사용량 예약을 걸면 기다리는
 * 것만으로 그 사람의 시간당 한도가 닳는다.
 */
export async function GET(req: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  const id = new URL(req.url).searchParams.get("id");
  const stage = readPlanStage(id, auth.member.userId);

  return Response.json(
    {
      ok: true,
      stage,
      message: stage ? PLAN_STAGE_LABEL[stage] : null,
    },
    // 이 값은 1초만 지나도 옛것이다. 중간에서 아무도 들고 있지 않게 한다.
    { headers: { "Cache-Control": "no-store" } },
  );
}
