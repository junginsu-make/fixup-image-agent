import { z } from "zod";

/**
 * 미리보기에 넣어 볼 원고.
 *
 * 실제로는 이미 만든 원고(`CardCopy`)가 칸에 꽂힌다. 여기서 받는 것은
 * 「길이가 맞는지 보려고」 사람이 직접 넣어 보는 값이라 전부 없어도 된다.
 * 카드 한 장 미리보기와 세트 미리보기가 같은 모양을 써야 해서 여기 둔다.
 */
export const PreviewCopySchema = z.object({
  headline: z.string().max(400).default(""),
  body: z.string().max(2000).optional(),
  accent: z.string().max(400).optional(),
  footnote: z.string().max(400).optional(),
});

export type PreviewCopyInput = z.infer<typeof PreviewCopySchema>;
