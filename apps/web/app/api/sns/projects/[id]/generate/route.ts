import { assertProjectWrite, projectWriteDeniedResponse } from "../../../../../../lib/generation/ownership";
import { beginSnsRun } from "../../../../../../lib/generation/sns-execution";
import { useDurableGeneration, generationFailureResponse } from "../../../../../../lib/generation/run-store";
import { publicRun } from "../../../../../../lib/generation/types";
import { creditUnits, llmCostUsd } from "@fixup/shared";
import { authenticateApiMember, finalizeAiUsage, reserveAiUsage } from "../../../../../../lib/membership/api";
import { estimateCost } from "../../../../../sns/cost-estimate";
import { snsFlowStoreForUser, snsWriteDenied } from "../../../../../../lib/sns-flow-store";
import { snsSubmittedGenerationRequestStoreForUser } from "../../../../../../lib/sns-generation-store";
import { createSnsGenerationProviders, SnsProviderConfigurationError } from "../../../../../../lib/sns/providers";
import { createQueuedGenerationDependencies, refreshProjectAssetUrls } from "../../../../../../lib/sns/runtime";
import { hasActiveQueuedGeneration, startQueuedFlow } from "../../../../../../lib/sns/queued-flow";
import { withSnsProjectLock } from "../../../../../../lib/sns/project-lock";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  /** `catch` 에서도 봐야 한다 — 실패하면 묶인 장을 돌려줘야 한다. */
  let reservation: { userId: string; requestId: string } | null = null;
  try {
    const { id } = await context.params;
    await assertProjectWrite(auth.member.userId, "sns", id);
    return await withSnsProjectLock(id, async () => {
      const store = await snsFlowStoreForUser(auth.member.userId);
      let project = await store.get(id);
      if (!project?.data.flow) return Response.json({ ok: false, message: "먼저 기획과 원고를 만들어 주세요." }, { status: 409 });
      if (useDurableGeneration()) {
        const run = await beginSnsRun(request, auth.member.userId, project);
        return Response.json({ ok: true, project: await store.get(id), run: publicRun(run) });
      }
      if (hasActiveQueuedGeneration(project.data.flow)) return Response.json({ ok: false, message: "이미 생성 중인 카드가 있습니다." }, { status: 409 });
      const providers = createSnsGenerationProviders();
      project = await refreshProjectAssetUrls(project);
      const currentFlow = project.data.flow;
      if (!currentFlow) return Response.json({ ok: false, message: "먼저 기획과 원고를 만들어 주세요." }, { status: 409 });
      const dependencies = await createQueuedGenerationDependencies({
        userId: auth.member.userId,
        project,
        requestStore: snsSubmittedGenerationRequestStoreForUser(auth.member.userId),
        providers,
      });
      dependencies.checkpoint = async (flow) => { await store.save(id, flow, "generating"); };
      /**
       * **돈이 나가기 전에 장부에 자리를 잡는다.**
       *
       * 지금까지 카드뉴스는 장부에 한 줄도 안 남겼다 — 개인 한도에도 안 걸리고
       * 팀 크레딧에서도 안 빠졌다(2026-09-08 운영 확인, $3.315 가 장부 밖).
       *
       * 장은 **실제 단가에서 나온다**(`creditUnits`). 화면이 「예상 비용」으로
       * 이미 보여 주는 그 숫자를 그대로 쓴다 — 다른 식으로 세면 화면과 장부가
       * 갈린다.
       *
       * **확정은 여기서 안 한다.** 카드는 하나씩 만들어지고 실패하는 장이
       * 생기므로, 실제로 몇 장이 나왔는지는 `status` 가 안다.
       */
      const estimate = estimateCost({
        ratio: project.ratio,
        modelId: project.modelId,
        totalCards: currentFlow.cards.length,
        attachments: project.data.attachments,
        /**
         * **틀을 함께 넘긴다.** 여기서는 카드에 어떤 틀이 붙었는지 안다.
         *
         * 넘기지 않으면 카드당 요청 한 번으로 세는데, 그림 칸이 셋인 세트는
         * 실제로 세 번 간다. 예약이 모자라면 넘치는 지출은 확정 때 상한에
         * 깎여 장부에서 사라진다.
         */
        cards: currentFlow.cards.map((card) => ({ index: card.index, layout: card.layout })),
      });
      // 원고 기획 한 번 + 카드마다 장면 프롬프트 한 번.
      const llm = llmCostUsd({ planCalls: 1 + estimate.generatedCount });
      const reserved = await reserveAiUsage(request, "sns_image", creditUnits(estimate.usd + llm));
      if (!reserved.ok) return reserved.response;
      reservation = { userId: reserved.userId, requestId: reserved.requestId };

      const flow = await startQueuedFlow(project, currentFlow, dependencies);
      /**
       * 예약 열쇠를 흐름에 적어 둔다 — 확정이 다른 HTTP 요청에서 일어난다.
       *
       * **흐름 안에 둔다.** 저장소에 새 함수를 만들면 로컬·운영 두 벌을 다
       * 고쳐야 하는데, 흐름은 이미 통째로 저장된다.
       */
      /**
       * **기준선을 함께 적는다.**
       *
       * `flow.costs` 는 쌓이기만 하고 안 비워진다 — 다시 만들기를 누르면 옛 값이
       * 남아 있다. 확정에서 합계를 그냥 쓰면 **이미 낸 것을 또 받는다.**
       * 여기서 지금까지 쓴 값을 적어 두고, 그 뒤로 늘어난 만큼만 받는다.
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
      const saved = await store.save(id, marked, "generating");
      return Response.json({ ok: true, project: saved });
    });
  } catch (error) {
    const generationFailure = generationFailureResponse(error);
    if (generationFailure) return generationFailure;
    const writeDenied = projectWriteDeniedResponse(error);
    if (writeDenied) return writeDenied;
    // 제출이 실패했으면 돈이 안 나갔다. 묶어 둔 장을 돌려준다.
    // **응답을 정하기 전에 한다.** 여기서 일찍 빠져나가면 장이 묶인 채 남는다.
    if (reservation) {
      try { await finalizeAiUsage(reservation, false, 0, "sns_submit_failed"); } catch { /* 아래 원인이 우선이다 */ }
    }
    // 남의 작업이라 못 고치는 것이면 500 이 아니라 403 으로 답한다.
    const denied = snsWriteDenied(error);
    if (denied) return denied;
    const status = error instanceof SnsProviderConfigurationError ? error.status : 500;
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "카드 이미지를 만들지 못했습니다." }, { status });
  }
}
