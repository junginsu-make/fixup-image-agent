import { optionsOfProject, projectSpecFrom, type CardOptions } from "./cardnews-options";
import type { CardnewsProjectLike } from "./cardnews-view";

/**
 * **원고를 다시 쓸 입력**(2단계 설계 §7). 카드뉴스에는 작업 입력을 고치는 라우트가
 * 없어 새 작업을 만든다. **앞 작업은 지우지 않는다**(2026-09-30 사용자 결정).
 *
 * 말(「더 짧게, 20대 말투로」)은 말투 칸(`toneNote`)에 더한다. 원고 쓰기가 그 칸을
 * 읽는다(`lib/sns/actual-flow.ts` 의 `writeCopy`).
 */
export function redraftInput(
  old: Pick<CardnewsProjectLike, "ratio" | "language" | "modelId" | "cardCountMode" | "cardCount" | "toneNote"> & {
    title: string;
    data: CardnewsProjectLike["data"] & { userInstruction?: string; attachmentIntents?: unknown };
  },
  change: { words?: string; options?: Partial<CardOptions> },
) {
  const options = { ...optionsOfProject(old), ...change.options };
  const toneNote = [old.toneNote ?? "", change.words ?? ""].map((one) => one.trim()).filter(Boolean).join("\n");
  return {
    title: old.title,
    source: old.data.source,
    ...(toneNote ? { toneNote } : {}),
    attachments: old.data.attachments,
    ...(old.data.attachmentIntents ? { attachmentIntents: old.data.attachmentIntents } : {}),
    ...projectSpecFrom(options),
    ...(old.data.userInstruction ? { userInstruction: old.data.userInstruction } : {}),
  };
}
