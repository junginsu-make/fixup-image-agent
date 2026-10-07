import { MAX_CARDS, modelById, planSlots, validateAttachments, type Attachment, type ImageLook, type SlotPlan } from "@fixup/sns-core";
import type { ProjectInput, ProjectSource } from "./schema";
import { inOwnerFolder } from "../../../../lib/storage/owner-folder";
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
    /** 자리마다 사용자가 적은 말 (표지/속지/엔딩). 옛 작업에는 없다. */
    attachmentIntents?: { cover?: string; body?: string; ending?: string };
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
  /** `projectId` 가 있으면 그 갈래만. 없으면 전체. */
  list(projectId?: string | null): Promise<SnsProjectRecord[]>;
}

export class ProjectValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join("\n"));
    this.name = "ProjectValidationError";
  }
}

export function createProjectService(repository: SnsProjectRepository) {
  return {
    list: (projectId?: string | null) => repository.list(projectId),
    /** 첨부의 캐릭터 정보는 서버가 채운 것이다(`withCarriedCharacters`) — 입력 검사는 그 칸을 비운다. */
    async create(userId: string, input: Omit<ProjectInput, "attachments"> & { attachments: Attachment[] }): Promise<SnsProjectRecord> {
      const model = modelById(input.modelId);
      const totalCards = input.cardCountMode === "fixed" ? input.cardCount! : MAX_CARDS;
      const issues = validateAttachments(input.attachments, model.maxReferenceImages, totalCards);
      /*
        **첨부는 내 폴더 것만 받는다**(2026-09-28). 경로는 화면이 보낸 값이고,
        저장해 두면 열 때마다 서버 권한으로 서명된다 — 경로만 알면 남의 참고
        이미지·작업물이 열렸다(독립 리뷰). 저장 경로의 첫 칸이 소유자다
        (`docs/DEPLOY.md`). 누구 것인지는 알려 주지 않는다.
      */
      // `..`·역슬래시로 내 폴더에서 빠져나가는 경로도 막는다 — 앞머리만 보면 통과한다.
      // 서명 주소는 `%2e%2e` 를 `..` 로 풀고 탭을 지운다 — 주인 폴더 검사로 본다(2026-10-03).
      if (input.attachments.some((attachment) => !inOwnerFolder(attachment.assetPath, userId))) {
        issues.push("첨부 이미지를 찾을 수 없습니다. 다시 골라 주세요.");
      }
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
          // 자리마다 적은 말 (표지/속지/엔딩).
          attachmentIntents: input.attachmentIntents,
        },
        slotPlan,
      });
    },
  };
}
