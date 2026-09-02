import { writeCaption } from "@fixup/sns-core";
import { authenticateApiMember } from "../../../../../../lib/membership/api";
import { snsFlowStoreForUser } from "../../../../../../lib/sns-flow-store";
import { createSnsPlanningProviders, SnsProviderConfigurationError } from "../../../../../../lib/sns/providers";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * 인스타그램에 붙일 게시글 문구를 쓴다.
 *
 * 카드가 다 나온 뒤에 부른다. 원고를 고치면 다시 부르면 된다 — 자동으로
 * 따라가게 만들면 고칠 때마다 모델을 부르게 되고, 그만큼 돈이 나간다.
 */
export async function POST(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const store = await snsFlowStoreForUser(auth.member.userId);
    const project = await store.get(id);
    if (!project?.data.flow) return Response.json({ ok: false, message: "결과를 찾을 수 없습니다." }, { status: 404 });

    const providers = createSnsPlanningProviders();
    const result = await writeCaption(
      {
        title: project.title,
        cards: project.data.flow.cards.map((card) => card.copy),
        toneNote: project.toneNote,
        language: project.language,
      },
      providers.captionPrimary,
      providers.captionBackup,
    );

    const flow = { ...project.data.flow, caption: result.caption, captionIssues: result.issues };
    const saved = await store.save(id, flow, project.status);
    return Response.json({ ok: true, project: saved });
  } catch (error) {
    const status = error instanceof SnsProviderConfigurationError ? error.status : 500;
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "게시글 문구를 만들지 못했습니다." },
      { status },
    );
  }
}
