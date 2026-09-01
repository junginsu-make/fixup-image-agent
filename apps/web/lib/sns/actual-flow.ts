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

function sourceText(project: SnsProjectRecord): string {
  const source = project.data.source;
  if (source.kind === "text") return source.text;
  if (source.kind === "question") return `질문: ${source.question}`;
  return `가져올 주소: ${source.url}`;
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
): Promise<SnsFlowState> {
  const planned = await planCards({
    sourceText: sourceText(project),
    slots: project.slotPlan,
    toneNote: project.toneNote,
    language: project.language,
  }, providers.planningPrimary, providers.planningBackup);
  const written = await writeCopy({
    sourceText: sourceText(project),
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
