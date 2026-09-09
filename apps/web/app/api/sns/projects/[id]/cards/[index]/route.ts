import { z } from "zod";
import { creditUnits, llmCostUsd } from "@fixup/shared";
import { authenticateApiMember, finalizeAiUsage, reserveAiUsage } from "../../../../../../../lib/membership/api";
import { estimateCost } from "../../../../../../sns/cost-estimate";
import { snsFlowStoreForUser, snsWriteDenied } from "../../../../../../../lib/sns-flow-store";
import { snsSubmittedGenerationRequestStoreForUser } from "../../../../../../../lib/sns-generation-store";
import { createSnsGenerationProviders, SnsProviderConfigurationError } from "../../../../../../../lib/sns/providers";
import { createQueuedGenerationDependencies, refreshProjectAssetUrls } from "../../../../../../../lib/sns/runtime";
import { hasActiveQueuedGeneration, startQueuedFlow } from "../../../../../../../lib/sns/queued-flow";
import { withSnsProjectLock } from "../../../../../../../lib/sns/project-lock";
import { updateFlowCopy } from "../../../../flow-service";

type Context = { params: Promise<{ id: string; index: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CopyPatchSchema = z.object({
  headline: z.string().optional(),
  body: z.string().optional(),
  accent: z.string().optional(),
  footnote: z.string().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "바꿀 원고를 하나 이상 보내 주세요.");

function cardIndex(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export async function PATCH(request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  const parsed = CopyPatchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ ok: false, message: "원고 입력을 확인해 주세요.", issues: parsed.error.issues }, { status: 400 });
  try {
    const params = await context.params;
    const index = cardIndex(params.index);
    if (!index) return Response.json({ ok: false, message: "카드 번호가 올바르지 않습니다." }, { status: 400 });
    const store = await snsFlowStoreForUser(auth.member.userId);
    const project = await store.get(params.id);
    if (!project?.data.flow) return Response.json({ ok: false, message: "원고를 찾을 수 없습니다." }, { status: 404 });
    const flow = updateFlowCopy(project.data.flow, index, parsed.data);
    const saved = await store.save(params.id, flow, "copy_ready");
    return Response.json({ ok: true, project: saved });
  } catch (error) {
    // 남의 작업이라 못 고치는 것이면 500 이 아니라 403 으로 답한다.
    const denied = snsWriteDenied(error);
    if (denied) return denied;
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "원고를 저장하지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  /** `catch` 에서도 봐야 한다 — 제출이 실패하면 묶인 장을 돌려줘야 한다. */
  let reservation: { userId: string; requestId: string } | null = null;
  try {
    const params = await context.params;
    const index = cardIndex(params.index);
    if (!index) return Response.json({ ok: false, message: "카드 번호가 올바르지 않습니다." }, { status: 400 });
    return await withSnsProjectLock(params.id, async () => {
      const store = await snsFlowStoreForUser(auth.member.userId);
      let project = await store.get(params.id);
      if (!project?.data.flow) return Response.json({ ok: false, message: "결과를 찾을 수 없습니다." }, { status: 404 });
      if (hasActiveQueuedGeneration(project.data.flow)) return Response.json({ ok: false, message: "다른 카드가 생성 중입니다." }, { status: 409 });
      const providers = createSnsGenerationProviders();
      project = await refreshProjectAssetUrls(project);
      const currentFlow = project.data.flow;
      if (!currentFlow) return Response.json({ ok: false, message: "결과를 찾을 수 없습니다." }, { status: 404 });
      const dependencies = await createQueuedGenerationDependencies({
          userId: auth.member.userId,
          project,
          requestStore: snsSubmittedGenerationRequestStoreForUser(auth.member.userId),
          providers,
        });
      dependencies.checkpoint = async (flow) => { await store.save(params.id, flow, "generating"); };

      /**
       * **다시 만들기도 돈이다.**
       *
       * 이 길에는 예약도 확정도 없었다. 결과판에서 카드 하나를 다시 만들면 fal
       * 요청 한 건이 실제로 과금되는데 장부에는 한 줄도 안 남았다. 게다가
       * `startQueuedFlow` 가 `generation` 을 통째로 새로 만들어서, 남아 있던
       * `reservationId` 까지 지워 확정 경로마저 끊었다.
       *
       * 그 한 장 값만 잡는다. 전체로 잡으면 나머지 장수가 괜히 묶인다.
       */
      const estimate = estimateCost({
        ratio: project.ratio,
        modelId: project.modelId,
        totalCards: currentFlow.cards.length,
        attachments: project.data.attachments,
        onlyCardIndexes: [index],
      });
      // 이 카드의 장면 프롬프트 한 번. 원고 기획은 다시 하지 않는다.
      const llm = llmCostUsd({ planCalls: estimate.generatedCount });
      const reserved = await reserveAiUsage(request, "sns_image", creditUnits(estimate.usd + llm));
      if (!reserved.ok) return reserved.response;
      reservation = { userId: reserved.userId, requestId: reserved.requestId };

      const flow = await startQueuedFlow(project, currentFlow, dependencies, { cardIndexes: [index] });
      /**
       * **열쇠는 `startQueuedFlow` 뒤에 적는다.**
       *
       * 그 함수가 `generation` 을 새로 만들기 때문에, 먼저 적으면 지워진다.
       * 기준선도 함께 적는다 — `costs` 는 쌓이기만 하므로 지금까지 쓴 값을
       * 적어 두어야 이번에 늘어난 만큼만 받는다.
       */
      const marked = flow.generation
        ? {
          ...flow,
          generation: {
            ...flow.generation,
            reservationId: reserved.requestId,
            costBaselineUsd: currentFlow.costs.reduce((sum, entry) => sum + (entry.costUsd ?? 0), 0),
          },
        }
        : flow;
      const saved = await store.save(params.id, marked, "generating");
      return Response.json({ ok: true, project: saved });
    });
  } catch (error) {
    // 제출이 실패했으면 돈이 안 나갔다. 안 풀면 만료될 때까지 한도에서 빠져 있는다.
    // **응답을 정하기 전에 한다.** 여기서 일찍 빠져나가면 장이 묶인 채 남는다.
    if (reservation) {
      try { await finalizeAiUsage(reservation, false, 0, "sns_card_retry_failed"); } catch { /* 아래 원인이 우선이다 */ }
    }
    // 남의 작업이라 못 고치는 것이면 500 이 아니라 403 으로 답한다.
    const denied = snsWriteDenied(error);
    if (denied) return denied;
    const status = error instanceof SnsProviderConfigurationError ? error.status : 500;
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "카드를 다시 만들지 못했습니다." }, { status });
  }
}
