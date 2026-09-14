import { authenticateApiMember } from "../../../../../../lib/membership/api";
import { isDurableGenerationEnabled, runForResource } from "../../../../../../lib/generation/run-store";
import { isTerminal, publicRun } from "../../../../../../lib/generation/types";
import { settleSnsReservation } from "../../../../../../lib/sns/settle";
import { snsFlowStoreForUser, snsWriteDenied } from "../../../../../../lib/sns-flow-store";
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
      if (isDurableGenerationEnabled()) {
        const run = await runForResource(project.userId,"sns",id);
        if (run?.state === "needs_reconciliation") return Response.json({ok:false,active:false,message:"생성 요청 상태를 확인 중입니다. 잠시 후 다시 확인해 주세요."},{status:409});
        return Response.json({ok:true,project:await refreshProjectAssetUrls(project),active:run?!isTerminal(run.state):false,...(run?{run:publicRun(run)}:{})});
      }
      /**
       * **도는 중이 아니어도 열쇠가 남아 있으면 마무리한다.**
       *
       * 예전에는 여기서 그냥 빠져나갔다. 그래서 사이드바 「중지」로 끝났거나
       * 그림 칸이 없어 제출 안에서 끝난 흐름은 예약이 영영 안 풀렸고, 이미
       * 나간 fal 값도 장부에 안 실렸다.
       */
      if (!hasActiveQueuedGeneration(project.data.flow)) {
        const settled = await settleSnsReservation(auth.member.userId, project.data.flow, project.modelId);
        if (settled === project.data.flow) return Response.json({ ok: true, project, active: false });
        return Response.json({ ok: true, project: await store.save(id, settled, "ready"), active: false });
      }
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
      const settled = active ? flow : await settleSnsReservation(auth.member.userId, flow, project.modelId);

      const saved = await store.save(id, settled, active ? "generating" : "ready");
      return Response.json({ ok: true, project: saved, active });
    });
  } catch (error) {
    // 남의 작업이라 못 고치는 것이면 500 이 아니라 403 으로 답한다.
    const denied = snsWriteDenied(error);
    if (denied) return denied;
    const status = error instanceof SnsProviderConfigurationError ? error.status : 502;
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "fal 상태를 확인하지 못했습니다." }, { status });
  }
}
