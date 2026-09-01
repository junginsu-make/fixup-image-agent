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
  slots: PosterSlots;
}

export interface PosterEditJob extends PosterJobInput {
  parentImageId: string;
  editInstruction: string;
}

export function planEditJob(input: EditJobInput): PosterEditJob {
  const instruction = input.instruction.trim();
  if (!instruction) throw new Error("무엇을 고칠지 적어 주세요. 비어 있으면 같은 것을 또 만듭니다.");

  return {
    projectId: input.projectId,
    parentImageId: input.parentImageId,
    editInstruction: instruction,
    modelId: input.modelId,
    ratioId: input.ratioId,
    // 수정은 한 장만 만든다. 세 장을 또 받으면 고르는 일이 반복된다.
    variants: 1,
    slots: {
      ...input.slots,
      // 사용자가 적은 수정 지시를 장면 설명 뒤에 붙인다.
      action: [input.slots.action, instruction].filter((part) => part.trim()).join(". "),
    },
    referenceUrls: [input.parentUrl],
    preservedUrls: [],
  };
}
