import { planPoster, planReferences, readReferenceGrammar } from "@fixup/poster-core";
import { authenticateApiMember } from "../../../../../../lib/membership/api";
import { posterStoresForUser } from "../../../../../../lib/poster/stores";
import {
  createPosterGrammarReader,
  createPosterPlanningProviders,
  PosterProviderConfigurationError,
} from "../../../../../../lib/poster/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * 레퍼런스에서 문법을 읽고 슬롯 초안을 채운다.
 *
 * 둘 다 실패해도 던지지 않는다. 빈 슬롯과 이유를 저장하고 사람이 채운다.
 */
export async function POST(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const stores = posterStoresForUser(auth.member.userId);
    const project = await stores.projects.get(id);
    if (!project) return Response.json({ ok: false, message: "포스터 작업을 찾을 수 없습니다." }, { status: 404 });

    /**
     * 문법은 「따라 만들기」에서만 읽는다 — 지킬 그림에는 레이아웃 문법이 없다.
     * 기획에는 **첨부한 것 전부**를 넘긴다. 지켜야 할 인물이 있는지도 알아야
     * 칸을 제대로 채운다.
     */
    const references = await stores.references.byIds(project.data.referenceIds);
    const preserved = await stores.references.byIds(project.data.preservedIds ?? []);
    const grammar = await readReferenceGrammar(
      references
        .filter((reference) => Boolean(reference.url))
        .map((reference) => ({ id: reference.id, title: reference.title ?? "레퍼런스", url: reference.url! })),
      createPosterGrammarReader(),
    );

    const providers = createPosterPlanningProviders();
    const plan = await planPoster(
      {
        instruction: project.data.instruction,
        ratio: project.ratio,
        references: planReferences(project.data, [...references, ...preserved], grammar.summaries),
        attachmentIntent: project.data.attachmentIntent,
      },
      providers.primary,
      providers.backup,
    );

    // 문법에서 읽은 "어떻게 보이나" 를 초기값으로 깔고, 기획이 채운 값이 이긴다.
    const seed = Object.values(grammar.grammars)[0];
    const slots = {
      ...plan.slots,
      typeInteraction: plan.slots.typeInteraction ?? seed?.typeInteraction ?? null,
      dominantColor: plan.slots.dominantColor || seed?.dominantColor || "",
      accentColor: plan.slots.accentColor || seed?.accentColor || "",
    };

    const saved = await stores.projects.update(id, {
      status: "ready",
      data: { ...project.data, slots, grammarIssues: [...grammar.issues, ...plan.issues] },
    });
    return Response.json({ ok: true, project: saved, issues: [...grammar.issues, ...plan.issues] });
  } catch (error) {
    if (error instanceof PosterProviderConfigurationError) {
      return Response.json({ ok: false, message: error.message, missing: error.missing }, { status: 503 });
    }
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "기획하지 못했습니다." },
      { status: 500 },
    );
  }
}
