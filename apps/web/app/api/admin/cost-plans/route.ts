import { authenticateApiMember } from "../../../../lib/membership/api";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { canOpenCostLab } from "../../../../lib/admin/cost-lab";
import { planRowsToSave } from "../../../../lib/admin/cost-plan-save";
import { validatePlanInputs } from "../../../../lib/admin/cost-forecast/subscription-plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 비용 전략에서 정한 플랜을 **실제 구독 플랜으로 저장한다**(2026-09-23 사용자
 * 요청).
 *
 * 저장하면 `subscription_plans` 가 바뀌고, 회원 관리 화면은 그 표를 읽으므로
 * **등급을 줄 때 여기 값이 그대로 쓰인다.**
 *
 * ── 문을 두 번 잠근다 ──────────────────────────────────────
 *
 * 미들웨어의 `/admin` 규칙이 먼저 막지만 여기서도 다시 본다. 이 저장소는
 * 미들웨어가 조용히 비껴가는 일을 두 번 겪었다(정적 자산 matcher 의 `woff2`
 * 누락, `LOCAL_AUTH_BYPASS=1`). 문서를 내주는 라우트와 같은 판단
 * (`canOpenCostLab`)을 쓴다 — 두 벌로 적으면 한쪽만 고치는 날이 온다.
 *
 * **데이터베이스가 세 번째 문이다.** `credit_admin_plan` 이 안에서
 * `credit_require_admin(p_actor)` 를 부르고, 바꾼 내역을
 * `credit_admin_events` 에 남긴다.
 *
 * ── 이미 구독 중인 회원 ────────────────────────────────────
 *
 * **플랜 정의만 바꾼다.** 이미 지급된 이번 달 크레딧은 건드리지 않는다.
 * 회원에게 크레딧을 손으로 더 주는 길은 그대로다(회원 관리의 「크레딧 지급」).
 */

function 못들어옴() {
  // 403 은 「여기 뭔가 있다」를 알려 준다. 문서 라우트와 같은 결로 404 다.
  return new Response("찾을 수 없습니다.", { status: 404 });
}

async function 문지기() {
  const auth = await authenticateApiMember();
  if (!auth.ok) return null;
  if (!canOpenCostLab({ role: auth.member.profile.role })) return null;
  return auth.member;
}

/** 지금 저장돼 있는 플랜. 화면이 「저장된 값과 같은가」를 보여 줄 수 있게 한다. */
export async function GET() {
  const member = await 문지기();
  if (!member) return 못들어옴();

  const { data, error } = await createSupabaseAdminClient()
    .from("subscription_plans")
    .select("id,name,monthly_units,price_krw,active")
    .order("price_krw");

  if (error) {
    return Response.json({ ok: false, message: `저장된 플랜을 읽지 못했습니다: ${error.message}` }, { status: 500 });
  }

  return Response.json({ ok: true, plans: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const member = await 문지기();
  if (!member) return 못들어옴();

  let rows;
  try {
    const body = (await request.json()) as { plans?: unknown };
    // 값이 말이 되는지는 계산 쪽이 가린다. 두 벌로 적지 않는다.
    rows = planRowsToSave(validatePlanInputs(body?.plans));
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "플랜 값이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const db = createSupabaseAdminClient();
  const saved: string[] = [];
  for (const row of rows) {
    const { error } = await db.rpc("credit_admin_plan", {
      p_id: row.id, p_name: row.name, p_units: row.monthly_units,
      p_price: row.price_krw, p_active: row.active, p_actor: member.userId,
    });
    if (error) {
      /*
        **어디까지 갔는지 말한다.** 셋 중 둘만 들어간 채로 「실패」만 알리면,
        운영자는 지금 어떤 상태인지 모른 채 다시 누르게 된다.
      */
      return Response.json(
        {
          ok: false,
          saved,
          message: saved.length
            ? `${saved.join("·")}까지 저장하고 ${row.name}에서 멈췄습니다: ${error.message}`
            : `저장하지 못했습니다: ${error.message}`,
        },
        { status: 500 },
      );
    }
    saved.push(row.name);
  }

  return Response.json({ ok: true, saved, plans: rows });
}
