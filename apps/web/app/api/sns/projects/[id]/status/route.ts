import { creditUnits, llmCostUsd } from "@fixup/shared";
import { authenticateApiMember, finalizeAiUsage } from "../../../../../../lib/membership/api";
import { snsFlowStoreForUser } from "../../../../../../lib/sns-flow-store";
import { snsSubmittedGenerationRequestStoreForUser } from "../../../../../../lib/sns-generation-store";
import { createSnsGenerationProviders, SnsProviderConfigurationError } from "../../../../../../lib/sns/providers";
import { createQueuedGenerationDependencies, refreshProjectAssetUrls } from "../../../../../../lib/sns/runtime";
import { hasActiveQueuedGeneration, pollQueuedFlow } from "../../../../../../lib/sns/queued-flow";
import { withSnsProjectLock } from "../../../../../../lib/sns/project-lock";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    return await withSnsProjectLock(id, async () => {
      const store = await snsFlowStoreForUser(auth.member.userId);
      let project = await store.get(id);
      if (!project?.data.flow) return Response.json({ ok: false, message: "생성 흐름을 찾을 수 없습니다." }, { status: 404 });
      if (!hasActiveQueuedGeneration(project.data.flow)) return Response.json({ ok: true, project, active: false });
      const providers = createSnsGenerationProviders();
      project = await refreshProjectAssetUrls(project);
      const dependencies = await createQueuedGenerationDependencies({
        userId: auth.member.userId,
        project,
        requestStore: snsSubmittedGenerationRequestStoreForUser(auth.member.userId),
        providers,
      });
      dependencies.checkpoint = async (flow) => {
        await store.save(id, flow, hasActiveQueuedGeneration(flow) ? "generating" : "ready");
      };
      const flow = await pollQueuedFlow(project, project.data.flow!, dependencies);
      const active = hasActiveQueuedGeneration(flow);

      /**
       * **다 끝났으면 그때 장부를 확정한다.**
       *
       * 예약은 만들기 요청이 「추정 비용」으로 잡아 뒀다. 카드는 하나씩 만들어지고
       * 실패하는 장이 생기므로, **실제로 나온 장의 값**으로 다시 센다.
       *
       * **열쇠를 지운다.** 남겨 두면 다음 만들기가 옛 열쇠로 확정한다.
       *
       * 확정이 실패해도 결과는 돌려준다 — 카드는 이미 저장됐고, 묶인 장은 예약이
       * 만료되면 풀린다. 여기서 막으면 사용자가 만든 카드를 못 본다.
       */
      let settled = flow;
      const reservationId = flow.generation?.reservationId;
      if (!active && reservationId) {
        /**
         * **이번에 늘어난 만큼만 받는다.**
         *
         * `flow.costs` 는 쌓이기만 한다. 합계를 그냥 쓰면 다시 만들기를 누를
         * 때마다 옛 값을 또 받는다.
         */
        const total = flow.costs.reduce((sum, entry) => sum + (entry.costUsd ?? 0), 0);
        const spent = Math.max(0, total - (flow.generation?.costBaselineUsd ?? 0));
        /**
         * 이번에 고른 장 중 실제로 나온 것. 옛 카드는 안 센다.
         *
         * **검수에 걸린 장도 나온 장이다.** `review_required` 는 그림이 이미
         * 만들어졌고 fal 값도 다 나간 상태이고, 원고와 글자가 다르다는 것은 이
         * 도구의 정상 결과다. 예전에는 `"done"` 만 세어서, 여섯 장이 모두 검수에
         * 걸리면 `made` 가 0 이 됐다. 그러면 `finalize_generation` 이
         * `consumed_units` 를 0 으로 만들어 이미 나간 비용이 통째로 사라졌다.
         * 표지 한 장이 그대로 놓이는 구성이냐에 따라 과금 여부가 갈리기까지 했다.
         */
        const picked = new Set(flow.generation?.selectedCardIndexes ?? []);
        const made = flow.cards.filter(
          (card) => picked.has(card.index) && (card.status === "done" || card.status === "review_required"),
        ).length;
        try {
          await finalizeAiUsage(
            { userId: auth.member.userId, requestId: reservationId },
            made > 0,
            creditUnits(spent + llmCostUsd({ planCalls: 1 + made })),
          );
        } catch {
          // 삼킨다. 사용자가 만든 카드를 못 보는 것이 더 나쁘다.
        }
        settled = {
          ...flow,
          generation: { ...flow.generation!, reservationId: undefined, costBaselineUsd: undefined },
        };
      }

      const saved = await store.save(id, settled, active ? "generating" : "ready");
      return Response.json({ ok: true, project: saved, active });
    });
  } catch (error) {
    const status = error instanceof SnsProviderConfigurationError ? error.status : 502;
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "fal 상태를 확인하지 못했습니다." }, { status });
  }
}
