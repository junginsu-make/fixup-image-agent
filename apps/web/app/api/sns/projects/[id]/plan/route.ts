import { authenticateApiMember, reserveAiUsage, settleAiUsage } from "../../../../../../lib/membership/api";
import { freeCreditPlan } from "../../../../../../lib/membership/credit-ledger";
import { llmSettleCost, withLlmMeter } from "../../../../../../lib/llm/meter";
import { snsFlowStoreForUser, snsWriteDenied } from "../../../../../../lib/sns-flow-store";
import { createActualPlanningFlow } from "../../../../../../lib/sns/actual-flow";
import { createSourceAdapters } from "../../../../../../lib/sns/source-adapters";
import { createSnsPlanningProviders, SnsProviderConfigurationError } from "../../../../../../lib/sns/providers";
import { refreshProjectAssetUrls, replaceSnsCardRows } from "../../../../../../lib/sns/runtime";
import { snsFailure } from "../../../failure";
import { errorLogText } from "../../../../../../lib/easy/log-text";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    let project = await (await snsFlowStoreForUser(auth.member.userId)).get(id);
    if (!project) return Response.json({ ok: false, message: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    project = await refreshProjectAssetUrls(project);
    return Response.json({ ok: true, project });
  } catch (error) {
    // 남의 작업이라 못 고치는 것이면 500 이 아니라 403 으로 답한다.
    const denied = snsWriteDenied(error);
    if (denied) return denied;
    return snsFailure("작업 읽기", error, "프로젝트를 불러오지 못했습니다.", 500);
  }
}

/**
 * 기획·원고를 만든다. **웹검색 조사·Apify·글 모델을 부르는, 값이 나가는 길이다.**
 *
 * 설계 2026-09-30 §3.1: 회원이 부르는 유료 AI 는 예약을 먼저 거친다. 새 작업
 * 이름을 만들지 않고 카드뉴스 칸(`sns_image`)에 `sns:{id}:plan` 으로 넣는다 —
 * 크레딧은 0 장이다(D1). 크레딧이 없거나 운영자가 멈췄으면 예약에서 막힌다.
 */
export async function POST(request: Request, context: Context) {
  // 이 요청에서 글 모델에 쓴 돈을 잰다. 정산에 싣는다.
  return withLlmMeter(() => plan(request, context));
}

async function plan(request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  /** `catch` 에서도 닫아야 하므로 밖에 둔다. 안 닫으면 예약이 만료까지 남는다. */
  let reservation: { userId: string; requestId: string } | null = null;
  try {
    const { id } = await context.params;
    const store = await snsFlowStoreForUser(auth.member.userId);
    const project = await store.get(id);
    if (!project) return Response.json({ ok: false, message: "프로젝트를 찾을 수 없습니다." }, { status: 404 });

    const reserved = await reserveAiUsage(request, "sns_image", 0, freeCreditPlan(`sns:${id}:plan`));
    if (!reserved.ok) return reserved.response;
    reservation = { userId: reserved.userId, requestId: reserved.requestId };

    const flow = await createActualPlanningFlow(project, createSnsPlanningProviders(), createSourceAdapters());
    await replaceSnsCardRows(auth.member.userId, id, flow);
    const saved = await store.save(id, flow, "copy_ready");
    await settleAiUsage(reservation, true, 0, undefined, llmSettleCost());
    return Response.json({ ok: true, project: saved });
  } catch (error) {
    // 실패해도 닫는다. 이미 부른 값은 원가로 남긴다.
    // 닫기가 흔들려도(RPC) 아래 우리 JSON 을 돌려준다. 안 그러면 Next 기본 500 이 나간다(오류 원문 가리기 Task 3).
    if (reservation) {
      try {
        await settleAiUsage(reservation, false, 0, "sns_plan_failed", llmSettleCost());
      } catch (closeError) {
        console.error("[sns] 기획 예약 닫기 실패", errorLogText(closeError));
      }
    }
    // 남의 작업이라 못 고치는 것이면 500 이 아니라 403 으로 답한다.
    const denied = snsWriteDenied(error);
    if (denied) return denied;
    // 설정 오류는 503 을 지키되 환경변수 이름은 서버 기록에만 남긴다.
    const status = error instanceof SnsProviderConfigurationError ? error.status : 500;
    return snsFailure("기획 · 원고", error, "기획과 원고를 만들지 못했습니다.", status);
  }
}
