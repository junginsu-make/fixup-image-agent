import { authenticateApiMember } from "../../../../../../lib/membership/api";
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
      const saved = await store.save(id, flow, hasActiveQueuedGeneration(flow) ? "generating" : "ready");
      return Response.json({ ok: true, project: saved, active: hasActiveQueuedGeneration(flow) });
    });
  } catch (error) {
    const status = error instanceof SnsProviderConfigurationError ? error.status : 502;
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "fal 상태를 확인하지 못했습니다." }, { status });
  }
}
