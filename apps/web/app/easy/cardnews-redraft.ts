import { optionsOfProject, projectSpecFrom, type CardOptions } from "./cardnews-options";
import type { CardnewsProjectLike } from "./cardnews-view";

/** 카드뉴스 입력의 추가 지시 상한(`app/api/sns/projects/schema.ts` 의 값과 같다). */
const USER_INSTRUCTION_MAX = 2000;

/**
 * **원고를 다시 쓸 입력**(2단계 설계 §7). 카드뉴스에는 작업 입력을 고치는 라우트가
 * 없어 새 작업을 만든다. **앞 작업은 지우지 않는다**(2026-09-30 사용자 결정).
 *
 * 말(「더 짧게」 · 「더 밝게」)은 말투 칸(`toneNote`)과 추가 지시(`userInstruction`)에
 * 둘 다 더한다. 말투 칸은 원고 쓰기만, 추가 지시는 그림만 읽는다(설계 §7).
 */
export function redraftInput(
  old: Pick<CardnewsProjectLike, "ratio" | "language" | "modelId" | "cardCountMode" | "cardCount" | "toneNote"> & {
    title: string;
    data: CardnewsProjectLike["data"] & { userInstruction?: string; attachmentIntents?: unknown };
  },
  change: { words?: string; options?: Partial<CardOptions> },
) {
  const options = { ...optionsOfProject(old), ...change.options };
  const 잇는다 = (앞: string | null | undefined) =>
    [앞 ?? "", change.words ?? ""].map((one) => one.trim()).filter(Boolean).join("\n");
  const toneNote = 잇는다(old.toneNote);
  // 새 말을 남기고 앞을 자른다. 카드뉴스 입력의 추가 지시는 2000자까지다(`schema.ts`).
  const userInstruction = 잇는다(old.data.userInstruction).slice(-USER_INSTRUCTION_MAX);
  return {
    title: old.title,
    source: old.data.source,
    ...(toneNote ? { toneNote } : {}),
    attachments: old.data.attachments,
    ...(old.data.attachmentIntents ? { attachmentIntents: old.data.attachmentIntents } : {}),
    ...projectSpecFrom(options),
    ...(userInstruction ? { userInstruction } : {}),
  };
}
