import { runLlmOperation } from "../../../../../../lib/generation/llm-operation";
import { generationFailureResponse, useDurableGeneration as durableGenerationEnabled } from "../../../../../../lib/generation/run-store";
import { snsModelSnapshot } from "../../../../../../lib/sns/providers";
import { assertProjectWrite, projectWriteDeniedResponse } from "../../../../../../lib/generation/ownership";
import { authenticateApiMember } from "../../../../../../lib/membership/api";
import { snsFlowStoreForUser, snsWriteDenied } from "../../../../../../lib/sns-flow-store";
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
    // 남의 작업이라 못 고치는 것이면 500 이 아니라 403 으로 답한다.
    const denied = snsWriteDenied(error);
    if (denied) return denied;
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "프로젝트를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    await assertProjectWrite(auth.member.userId, "sns", id);
    const store = await snsFlowStoreForUser(auth.member.userId);
    const project = await store.get(id);
    if (!project) return Response.json({ ok: false, message: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    const planned = await runLlmOperation(_request, auth.member.userId, {operation:"sns_plan",resourceType:"sns",resourceId:id,identity:{source:project.data.source,attachments:project.data.attachments.map(({url:_u,...a})=>a),modelId:project.modelId,ratio:project.ratio,language:project.language,cardCount:project.cardCount,toneNote:project.toneNote,userInstruction:project.data.userInstruction,attachmentIntents:project.data.attachmentIntents},models:[...Object.values(snsModelSnapshot()),process.env.OPENAI_RESEARCH_MODEL??process.env.OPENAI_DRAFT_MODEL??"gpt-5.6-sol"],maxCalls:5,maxToolCalls:3,isSuccess:value=>value.flow.cards.length>0}, async () => ({flow:await createActualPlanningFlow(project, createSnsPlanningProviders(), createSourceAdapters()),baseRevision:project.updatedAt}));
    const flow = planned.flow;
    const saved = await store.save(id, flow, "copy_ready", planned.baseRevision);
    if (!durableGenerationEnabled()) await replaceSnsCardRows(auth.member.userId, id, flow);
    return Response.json({ ok: true, project: saved });
  } catch (error) {
    const limited = generationFailureResponse(error);
    if (limited) return limited;
    const writeDenied = projectWriteDeniedResponse(error);
    if (writeDenied) return writeDenied;
    // 남의 작업이라 못 고치는 것이면 500 이 아니라 403 으로 답한다.
    const denied = snsWriteDenied(error);
    if (denied) return denied;
    const status = error instanceof SnsProviderConfigurationError ? error.status : 500;
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "기획과 원고를 만들지 못했습니다." }, { status });
  }
}
