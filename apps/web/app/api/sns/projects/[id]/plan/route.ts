import { authenticateApiMember } from "../../../../../../lib/membership/api";
import { snsFlowStoreForUser } from "../../../../../../lib/sns-flow-store";
import { createActualPlanningFlow } from "../../../../../../lib/sns/actual-flow";
import { createSourceAdapters } from "../../../../../../lib/sns/source-adapters";
import { createSnsPlanningProviders, SnsProviderConfigurationError } from "../../../../../../lib/sns/providers";
import { refreshProjectAssetUrls, replaceSnsCardRows } from "../../../../../../lib/sns/runtime";

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
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "프로젝트를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const store = await snsFlowStoreForUser(auth.member.userId);
    const project = await store.get(id);
    if (!project) return Response.json({ ok: false, message: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    const flow = await createActualPlanningFlow(project, createSnsPlanningProviders(), createSourceAdapters());
    await replaceSnsCardRows(auth.member.userId, id, flow);
    const saved = await store.save(id, flow, "copy_ready");
    return Response.json({ ok: true, project: saved });
  } catch (error) {
    const status = error instanceof SnsProviderConfigurationError ? error.status : 500;
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "기획과 원고를 만들지 못했습니다." }, { status });
  }
}
