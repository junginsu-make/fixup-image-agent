import type { OrderedAttachment } from "@fixup/shared";
import type { PosterJobInput } from "./generate";
import type { PosterSlots } from "./schemas";

/**
 * 변형 선택과 수정 루프.
 *
 * 세 장을 받아 하나를 고르고, 고른 것을 기준으로 고쳐 나간다.
 * 수정과 다른 비율 재생성 모두 **고른 이미지를 레퍼런스로 삼는다** —
 * 처음부터 다시 만들면 애써 고른 것이 사라진다.
 */

export interface SelectableImage {
  id: string;
  variantIndex: number;
  selected: boolean;
}

export type SelectionStep =
  | { action: "unselect"; projectId: string }
  | { action: "select"; imageId: string };

/**
 * **먼저 풀고 나서 건다.**
 *
 * DB 의 부분 유니크 인덱스(프로젝트당 selected 하나)가 지연 검사를 못 한다.
 * 새로 걸면서 기존 것을 푸는 식이면 순서에 따라 제약 위반이 난다.
 */
export function planSelection(
  projectId: string,
  images: SelectableImage[],
  imageId: string,
): SelectionStep[] {
  const target = images.find((image) => image.id === imageId);
  if (!target) throw new Error("이 프로젝트에 없는 이미지입니다.");
  if (target.selected) return [];
  return [
    { action: "unselect", projectId },
    { action: "select", imageId },
  ];
}

export function canEdit(images: SelectableImage[]): boolean {
  return images.some((image) => image.selected);
}

export interface EditJobInput {
  projectId: string;
  parentImageId: string;
  /** 고른 이미지의 URL. 이걸 레퍼런스로 넣어야 애써 고른 것이 유지된다. */
  parentUrl: string;
  instruction: string;
  modelId: string;
  ratioId: string;
  /**
   * `match-source` 로 만든 작업을 고칠 때 쓸 크기.
   *
   * **이 필드가 없어서 수정이 거절됐다.** `ratioId` 는 프로젝트의 것을 그대로
   * 쓰므로 `match-source` 가 들어가는데, 크기가 없으면 `buildPosterJob` 이
   * 「첨부한 그림의 크기를 읽지 못해」로 거절한다(설계 §10 3-b).
   */
  sourceSize?: { width: number; height: number };
  slots: PosterSlots;
  /*
   * 아래는 **원래 작업이 정한 것** — 그림만 봐서는 못 지키는 것들이다.
   * 옛 호출에는 없다. 없으면 지킬 대상 없이 고친다.
   */
  /** 원래 작업의 첨부(화면 차례). 지킬 대상만 다시 붙는다(`edit-job.ts`). */
  attachments?: OrderedAttachment[];
  /** 차례가 없는 옛 작업용 — `buildPosterJob` 과 같은 뜻이다. */
  preservedUrls?: string[];
  personUrls?: string[];
  restyledUrls?: string[];
}

export interface PosterEditJob extends PosterJobInput {
  parentImageId: string;
  editInstruction: string;
  /** 고칠 그림을 fal 에 올린 주소. 프롬프트의 `Image 1` 이다. */
  editSourceUrl: string;
}

export function planEditJob(input: EditJobInput): PosterEditJob {
  const instruction = input.instruction.trim();
  if (!instruction) throw new Error("무엇을 고칠지 적어 주세요. 비어 있으면 같은 것을 또 만듭니다.");

  return {
    projectId: input.projectId,
    parentImageId: input.parentImageId,
    editInstruction: instruction,
    editSourceUrl: input.parentUrl,
    modelId: input.modelId,
    ratioId: input.ratioId,
    ...(input.sourceSize ? { sourceSize: input.sourceSize } : {}),
    // 수정은 한 장만 만든다. 세 장을 또 받으면 고르는 일이 반복된다.
    variants: 1,
    /*
     * **지시를 장면 칸에 끼워 넣지 않는다.** 전에는 `action` 끝에 붙였고, 그
     * 자리에서 지시가 묻혀 안 먹혔다(2026-09-29 사용자 보고). 지시는
     * `editInstruction` 으로 가고 프롬프트 양끝에 선다(`edit-prompt.ts`).
     */
    slots: input.slots,
    /*
     * **안전망.** 조립은 `buildPosterEditJob` 이 하고 이 값을 쓰지 않는다. 누가
     * 조립을 안 넘기고 `submitPoster(planEditJob(…))` 로 부르면 처음 만들기 조립을
     * 타는데, 그때도 지시가 양끝에는 서게 한다(2026-09-29 독립 리뷰).
     */
    userInstruction: instruction,
    // 고칠 그림은 언제나 붙는다. 조립은 `buildPosterEditJob` 이 한다.
    referenceUrls: [input.parentUrl],
    attachments: input.attachments ?? [],
    preservedUrls: input.preservedUrls ?? [],
    personUrls: input.personUrls ?? [],
    restyledUrls: input.restyledUrls ?? [],
  };
}
