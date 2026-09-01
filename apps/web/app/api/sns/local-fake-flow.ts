import {
  groupAttachments,
  layoutCards,
  modelById,
  planCards,
  selectReferencesForRole,
  unitPrice,
  writeCopy,
  CARD_RATIOS,
  type CardCopy,
  type CardPlan,
} from "@fixup/sns-core";
import type { SnsProjectRecord } from "./projects/project-service";
import { generateFlow, regenerateFlowCard, type FlowGenerationDependencies, type SnsFlowCard, type SnsFlowState } from "./flow-service";

function sourceText(project: SnsProjectRecord): string {
  const source = project.data.source;
  if (source.kind === "text") return source.text;
  if (source.kind === "question") return `질문: ${source.question}`;
  return `가져올 주소: ${source.url}`;
}

function fakePlanCards(count: number): CardPlan[] {
  return Array.from({ length: count }, (_unused, offset) => ({
    index: offset + 1,
    role: offset === 0 ? "cover" : "body",
    intent: offset === 0 ? "핵심 주제를 한눈에 보여준다" : `핵심 내용을 ${offset}번째로 설명한다`,
    visualBrief: offset === 0 ? "주제를 대표하는 표지 장면" : "내용 이해를 돕는 속지 장면",
  }));
}

function fakeCopies(plans: CardPlan[]): CardCopy[] {
  return plans.map((plan) => ({
    index: plan.index,
    headline: plan.role === "cover" ? "한 업무부터 시작하는 AI 자동화" : `${plan.index}번째 핵심 포인트`,
    body: plan.intent,
    accent: plan.role === "cover" ? "작게 시작하고 확인하기" : undefined,
    footnote: "로컬 가짜 원고",
  }));
}

export async function createLocalPlanningFlow(
  project: SnsProjectRecord,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<SnsFlowState> {
  const total = project.cardCountMode === "fixed" ? project.cardCount! : project.slotPlan.autoRange!.min;
  const placeAsIs = project.data.attachments
    .filter((attachment) => attachment.kind === "place_as_is")
    .map((attachment) => ({ id: attachment.id, bodySlot: attachment.bodySlot }));
  const hasEndingImage = project.data.attachments.some((attachment) => attachment.kind === "ending");
  const layout = layoutCards({ total, placeAsIs, hasEndingImage });
  const aiPlanCount = layout.filter((slot) => slot.kind === "cover" || slot.kind === "generated" && slot.role === "body").length;
  const scenario = environment.LOCAL_FAKE_AI_SCENARIO ?? "success";
  const primaryPlan = { generate: async () => {
    if (scenario === "fallback" || scenario === "failure") throw new Error("로컬 Claude 기획 실패");
    return { total, cards: fakePlanCards(aiPlanCount) };
  } };
  const backupPlan = { generate: async () => {
    if (scenario === "failure") throw new Error("로컬 OpenAI 기획 실패");
    return { total, cards: fakePlanCards(aiPlanCount) };
  } };
  const planned = await planCards({
    sourceText: sourceText(project),
    slots: project.cardCountMode === "fixed" ? project.slotPlan : { ...project.slotPlan, autoRange: { min: total, max: total } },
    toneNote: project.toneNote,
    language: project.language,
  }, primaryPlan, backupPlan);

  const primaryCopy = { generate: async () => {
    if (scenario === "fallback" || scenario === "failure") throw new Error("로컬 Claude 원고 실패");
    return { cards: fakeCopies(planned.cards) };
  } };
  const backupCopy = { generate: async () => {
    if (scenario === "failure") throw new Error("로컬 OpenAI 원고 실패");
    return { cards: fakeCopies(planned.cards) };
  } };
  const written = await writeCopy({
    sourceText: sourceText(project), plans: planned.cards,
    toneNote: project.toneNote, language: project.language,
  }, primaryCopy, backupCopy);

  let copyOffset = 0;
  const cards: SnsFlowCard[] = layout.map((slot) => {
    const attachment = slot.attachmentId
      ? project.data.attachments.find((item) => item.id === slot.attachmentId)
      : slot.kind === "ending_image"
        ? project.data.attachments.find((item) => item.kind === "ending")
        : undefined;
    const generatedCopy = slot.kind === "cover" || slot.kind === "generated" && slot.role === "body"
      ? written.copies[copyOffset++]
      : undefined;
    return {
      index: slot.index,
      kind: slot.kind === "cover" ? "generated" : slot.kind,
      role: slot.role,
      copy: generatedCopy ?? {
        index: slot.index,
        headline: slot.role === "ending" ? "핵심 내용을 기억해 주세요" : "사용자 원본",
        body: slot.role === "ending" ? "필요할 때 다시 확인하고 작은 업무부터 적용해 보세요." : undefined,
      },
      status: "pending",
      assetUrl: attachment?.url,
    };
  });

  return { stage: "copy", planningIssues: planned.issues, copyIssues: written.issues, cards, costs: [] };
}

function fakeGenerationDependencies(
  project: SnsProjectRecord,
  retryIndex?: number,
  environment: NodeJS.ProcessEnv = process.env,
): FlowGenerationDependencies {
  const grouped = groupAttachments(project.data.attachments);
  const ratio = CARD_RATIOS.find((item) => item.id === project.ratio)!;
  const model = modelById(project.modelId);
  return {
    async generate(card) {
      const failIndex = Number(environment.LOCAL_FAKE_FAL_UNCONFIRMED_INDEX ?? "0");
      if (!retryIndex && failIndex === card.index) throw new Error("로컬 fal 응답 전 실패");
      const references = selectReferencesForRole(grouped, card.role);
      const mode = references.length ? "i2i" : "t2i";
      return {
        assetUrl: `/demo-sections/${String(((card.index - 1) % 8) + 1).padStart(2, "0")}-${["hero","problem","benefit","usp","trust","howto","review","faq"][(card.index - 1) % 8]}.jpg`,
        costUsd: unitPrice(model, mode, ratio.pixel),
      };
    },
    async review(card) {
      if (retryIndex) return { decision: "pass", summary: "사람이 다시 만든 뒤 통과", issues: [] };
      if (card.index === 1) return { decision: "fail", summary: "제목을 사람이 확인해 주세요", issues: ["가짜 검수: 제목 자간 확인"] };
      if (card.index === 3) throw new Error("로컬 검수 모델 실패");
      return { decision: "pass", summary: "가짜 검수 통과", issues: [] };
    },
  };
}

export function generateLocalFlow(project: SnsProjectRecord, flow: SnsFlowState) {
  return generateFlow(flow, fakeGenerationDependencies(project));
}

export function regenerateLocalFlowCard(project: SnsProjectRecord, flow: SnsFlowState, cardIndex: number) {
  return regenerateFlowCard(flow, cardIndex, fakeGenerationDependencies(project, cardIndex));
}
