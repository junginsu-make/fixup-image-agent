import { authenticateApiMember } from "../../../../../../lib/membership/api";
import { isLocalStoreEnabled } from "../../../../../../lib/local-store";
import { snsFlowStoreForUser } from "../../../../../../lib/sns-flow-store";
import { snsGenerationRequestStoreForUser } from "../../../../../../lib/sns-generation-store";
import { generateActualFlow } from "../../../../../../lib/sns/actual-flow";
import { createSnsGenerationProviders, SnsProviderConfigurationError } from "../../../../../../lib/sns/providers";
import { createActualGenerationDependencies, refreshProjectAssetUrls } from "../../../../../../lib/sns/runtime";
import { generateLocalFlow } from "../../../local-fake-flow";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const store = await snsFlowStoreForUser(auth.member.userId);
    let project = await store.get(id);
    if (!project?.data.flow) return Response.json({ ok: false, message: "먼저 기획과 원고를 만들어 주세요." }, { status: 409 });
    const local = isLocalStoreEnabled();
    const providers = local ? undefined : createSnsGenerationProviders();
    if (!local) project = await refreshProjectAssetUrls(project);
    const currentFlow = project.data.flow;
    if (!currentFlow) return Response.json({ ok: false, message: "먼저 기획과 원고를 만들어 주세요." }, { status: 409 });
    const flow = local
      ? await generateLocalFlow(project, currentFlow)
      : await generateActualFlow(project, currentFlow, await createActualGenerationDependencies({
        userId: auth.member.userId,
        project,
        requestStore: snsGenerationRequestStoreForUser(auth.member.userId),
        providers: providers!,
      }));
    const saved = await store.save(id, flow, "ready");
    return Response.json({ ok: true, project: saved });
  } catch (error) {
    const status = error instanceof SnsProviderConfigurationError ? error.status : 500;
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "카드 이미지를 만들지 못했습니다." }, { status });
  }
}
