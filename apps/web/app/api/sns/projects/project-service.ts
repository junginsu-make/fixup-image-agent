import { MAX_CARDS, modelById, planSlots, validateAttachments, type Attachment, type ImageLook, type SlotPlan } from "@fixup/sns-core";
import type { ProjectInput, ProjectSource } from "./schema";
import type { SnsFlowState } from "../flow-service";

export interface SnsProjectCreateRecord {
  userId: string;
  candidateId?: string;
  title: string;
  status: "draft" | "planning" | "copy_ready" | "generating" | "ready" | "failed";
  ratio: ProjectInput["ratio"];
  language: ProjectInput["language"];
  modelId: ProjectInput["modelId"];
  cardCountMode: ProjectInput["cardCountMode"];
  cardCount?: number;
  toneNote?: string;
  /**
   * 결과 사용자 지시는 **여기 안에 둔다.** 열(column) 을 새로 파지 않는 이유는
   * 이미 저장된 작업이 그대로 열려야 하기 때문이다 — 없으면 `auto` 와 빈
   * 문자열로 읽힌다.
   */
  data: {
    source: ProjectSource;
    attachments: Attachment[];
    flow?: SnsFlowState;
    look?: ImageLook;
    userInstruction?: string;
  };
  slotPlan: SlotPlan;
}

export interface SnsProjectRecord extends SnsProjectCreateRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface SnsProjectRepository {
  create(row: SnsProjectCreateRecord): Promise<SnsProjectRecord>;
  list(): Promise<SnsProjectRecord[]>;
}

export class ProjectValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join("\n"));
    this.name = "ProjectValidationError";
  }
}

export function createProjectService(repository: SnsProjectRepository) {
  return {
    list: () => repository.list(),
    async create(userId: string, input: ProjectInput): Promise<SnsProjectRecord> {
      const model = modelById(input.modelId);
      const totalCards = input.cardCountMode === "fixed" ? input.cardCount! : MAX_CARDS;
      const issues = validateAttachments(input.attachments, model.maxReferenceImages, totalCards);
      const placeAsIsCount = input.attachments.filter((attachment) => attachment.kind === "place_as_is").length;
      const hasEndingImage = input.attachments.some((attachment) => attachment.kind === "ending");
      const slotPlan = planSlots({
        requested: input.cardCountMode === "fixed" ? input.cardCount : "auto",
        placeAsIsCount,
        hasEndingImage,
      });
      issues.push(...slotPlan.issues);
      if (issues.length) throw new ProjectValidationError([...new Set(issues)]);

      return repository.create({
        userId,
        candidateId: input.candidateId,
        title: input.title,
        status: "draft",
        ratio: input.ratio,
        language: input.language,
        modelId: input.modelId,
        cardCountMode: input.cardCountMode,
        cardCount: input.cardCount,
        toneNote: input.toneNote,
        data: {
          source: input.source,
          attachments: input.attachments,
          look: input.look,
          userInstruction: input.userInstruction,
        },
        slotPlan,
      });
    },
  };
}
