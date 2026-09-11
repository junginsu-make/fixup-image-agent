import "server-only";
import { planPoster, readPeople, readReferenceGrammar } from "@fixup/poster-core";
import { creditUnits, llmCostUsd, planReferences } from "@fixup/shared";
import { authenticateApiMember } from "../membership/api";
import { assertProjectWrite, projectWriteDeniedResponse } from "../generation/ownership";
import { generationFailureResponse } from "../generation/run-store";
import { runLlmOperation } from "../generation/llm-operation";
import { posterStoresForUser } from "./stores";
import { createPosterGrammarReader, createPosterPeopleReader, createPosterPlanningProviders } from "./providers";

export async function durablePosterPlanning(request: Request, id: string): Promise<Response> {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const userId = auth.member.userId;
    await assertProjectWrite(userId, "poster", id);
    const stores = posterStoresForUser(userId);
    const project = await stores.projects.get(id);
    if (!project) return Response.json({ ok: false, message: "포스터 작업을 찾을 수 없습니다." }, { status: 404 });
    const references = await stores.references.byIds(project.data.referenceIds);
    const preserved = await stores.references.byIds(project.data.preservedIds ?? []);
    const personIds = new Set(project.data.personIds ?? []);
    const grammarInputs = references.filter(r => Boolean(r.url)).map(r => ({ id: r.id, title: r.title ?? "레퍼런스", url: r.url! }));
    const peopleInputs = preserved.filter(r => Boolean(r.url) && personIds.has(r.id)).map(r => ({ id: r.id, title: r.title ?? "사진", url: r.url! }));
    const maximumReads = grammarInputs.length + peopleInputs.length;
    const result = await runLlmOperation(request, userId, {
      operation: "poster_plan", resourceType: "poster", resourceId: id,
      units: creditUnits(llmCostUsd({ planCalls: 1, visionReads: maximumReads })),
      identity: { instruction: project.data.instruction, ratio: project.ratio, referenceIds: project.data.referenceIds,
        preservedIds: project.data.preservedIds, personIds: project.data.personIds, attachmentIntent: project.data.attachmentIntent },
      models: [process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5", process.env.OPENAI_VISION_MODEL?.trim() || process.env.OPENAI_DRAFT_MODEL?.trim() || "gpt-5.6-sol"],
      maxCalls: maximumReads + 2,
    }, async () => {
      // Admission precedes grammar/people reads, which are themselves paid calls.
      const grammar = await readReferenceGrammar(grammarInputs, createPosterGrammarReader());
      const crowd = await readPeople(peopleInputs, createPosterPeopleReader());
      const providers = createPosterPlanningProviders();
      const planned = await planPoster({ instruction: project.data.instruction, ratio: project.ratio,
        references: planReferences(project.data, [...references, ...preserved], grammar.summaries, crowd.people),
        attachmentIntent: project.data.attachmentIntent,
      }, providers.primary, providers.backup);
      const seed = Object.values(grammar.grammars)[0];
      return {
        baseRevision: project.updatedAt,
        slots: { ...planned.slots, typeInteraction: planned.slots.typeInteraction ?? seed?.typeInteraction ?? null,
          dominantColor: planned.slots.dominantColor || seed?.dominantColor || "", accentColor: planned.slots.accentColor || seed?.accentColor || "" },
        issues: [...grammar.issues, ...crowd.issues, ...planned.issues],
      };
    });
    const saved = await stores.projects.update(id, { status: "ready", data: { ...project.data, slots: result.slots, grammarIssues: result.issues } }, result.baseRevision);
    return Response.json({ ok: true, project: saved, issues: result.issues });
  } catch (error) {
    const failure = generationFailureResponse(error) ?? projectWriteDeniedResponse(error);
    if (failure) return failure;
    return Response.json({ ok: false, message: "기획하지 못했습니다." }, { status: 500 });
  }
}
