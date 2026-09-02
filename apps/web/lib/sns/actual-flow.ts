import {
  groupAttachments,
  layoutCards,
  planCards,
  writeCopy,
  type CardPlan,
  type CopyProvider,
  type PlanProvider,
} from "@fixup/sns-core";
import type { SnsFlowCard, SnsFlowState } from "../../app/api/sns/flow-service";
import type { SnsProjectRecord } from "../../app/api/sns/projects/project-service";
import { resolveSourceText, type ResolvedSource, type SourceResolverDependencies } from "./source-resolver";

/**
 * 내용을 **실제로 가져온다.**
 *
 * 예전에는 주소를 문자열로 넘겨 LLM 이 내용을 지어냈다. 이제 유튜브 자막·웹
 * 본문·검색 결과를 가져와서 넘긴다. 못 가져오면 기획을 시작하지 않는다.
 */
async function resolveSource(
  project: SnsProjectRecord,
  resolver: SourceResolverDependencies,
): Promise<ResolvedSource> {
  return resolveSourceText(project.data.source, resolver);
}

export interface ActualPlanningProviders {
  planningPrimary: PlanProvider;
  planningBackup: PlanProvider;
  copyPrimary: CopyProvider;
  copyBackup: CopyProvider;
}

export async function createActualPlanningFlow(
  project: SnsProjectRecord,
  providers: ActualPlanningProviders,
  resolver: SourceResolverDependencies,
): Promise<SnsFlowState> {
  const source = await resolveSource(project, resolver);
  // 내용을 못 가져왔으면 여기서 멈춘다. 진행하면 LLM 이 지어낸다.
  if (!source.text) {
    return { stage: "copy", planningIssues: source.issues, copyIssues: [], cards: [], costs: [] };
  }

  const planned = await planCards({
    sourceText: source.text,
    slots: project.slotPlan,
    toneNote: project.toneNote,
    language: project.language,
  }, providers.planningPrimary, providers.planningBackup);
  const written = await writeCopy({
    sourceText: source.text,
    plans: planned.cards,
    toneNote: project.toneNote,
    language: project.language,
  }, providers.copyPrimary, providers.copyBackup);

  if (!planned.cards.length || !written.copies.length) {
    return { stage: "copy", planningIssues: planned.issues, copyIssues: written.issues, cards: [], costs: [] };
  }

  const grouped = groupAttachments(project.data.attachments);
  const total = project.cardCountMode === "fixed"
    ? project.cardCount!
    : planned.cards.length + grouped.placeAsIs.length + 1;
  const layout = layoutCards({
    total,
    placeAsIs: grouped.placeAsIs.map((item) => ({ id: item.id, bodySlot: item.bodySlot })),
    hasEndingImage: Boolean(grouped.ending),
  });
  if (layout.issues.length) {
    return {
      stage: "copy",
      planningIssues: [...planned.issues, ...layout.issues.map((issue) => `Task 4 자리 계산 오류: ${issue}`)],
      copyIssues: written.issues,
      cards: [],
      costs: [],
    };
  }

  let generatedOffset = 0;
  const cards: SnsFlowCard[] = layout.map((slot) => {
    const isPlanned = slot.kind === "cover" || slot.kind === "generated" && slot.role === "body";
    const plan = isPlanned ? planned.cards[generatedOffset] : undefined;
    const copy = isPlanned ? written.copies[generatedOffset++] : undefined;
    const attachment = slot.attachmentId
      ? project.data.attachments.find((item) => item.id === slot.attachmentId)
      : slot.kind === "ending_image" ? grouped.ending : undefined;
    const normalizedPlan: CardPlan | undefined = plan
      ? { ...plan, index: slot.index }
      : slot.kind === "generated"
        ? { index: slot.index, role: "body", intent: "핵심 내용을 마무리한다", visualBrief: "시리즈를 마무리하는 엔딩 장면" }
        : undefined;
    return {
      index: slot.index,
      kind: slot.kind === "cover" ? "generated" : slot.kind,
      role: slot.role,
      copy: copy
        ? { ...copy, index: slot.index }
        : { index: slot.index, headline: slot.role === "ending" ? "핵심 내용을 기억해 주세요" : "사용자 원본" },
      plan: normalizedPlan,
      attachmentId: attachment?.id,
      assetUrl: attachment?.url,
      assetPath: attachment?.assetPath,
      status: "pending",
    };
  });
  return { stage: "copy", planningIssues: planned.issues, copyIssues: written.issues, cards, costs: [] };
}
