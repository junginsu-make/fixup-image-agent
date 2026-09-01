import { z } from "zod";
import { authenticateApiMember } from "../../../../../../../lib/membership/api";
import { snsFlowStoreForUser } from "../../../../../../../lib/sns-flow-store";
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
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "원고를 저장하지 못했습니다." }, { status: 500 });
  }
}

export async function POST(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
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
      const flow = await startQueuedFlow(project, currentFlow, dependencies, { cardIndexes: [index] });
      const saved = await store.save(params.id, flow, "generating");
      return Response.json({ ok: true, project: saved });
    });
  } catch (error) {
    const status = error instanceof SnsProviderConfigurationError ? error.status : 500;
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "카드를 다시 만들지 못했습니다." }, { status });
  }
}
