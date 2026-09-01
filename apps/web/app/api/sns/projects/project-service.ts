import { MAX_CARDS, modelById, planSlots, validateAttachments, type Attachment, type SlotPlan } from "@fixup/sns-core";
import type { ProjectInput, ProjectSource } from "./schema";

export interface SnsProjectCreateRecord {
  userId: string;
  candidateId?: string;
  title: string;
  status: "draft";
  ratio: ProjectInput["ratio"];
  language: ProjectInput["language"];
  modelId: ProjectInput["modelId"];
  cardCountMode: ProjectInput["cardCountMode"];
  cardCount?: number;
  toneNote?: string;
  data: {
    source: ProjectSource;
    attachments: Attachment[];
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
        data: { source: input.source, attachments: input.attachments },
        slotPlan,
      });
    },
  };
}
