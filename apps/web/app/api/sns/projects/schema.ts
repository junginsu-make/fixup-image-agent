import { IMAGE_LOOKS } from "@fixup/sns-core";
import { z } from "zod";

/**
 * 사용자가 직접 친 지시의 길이 상한.
 *
 * 상한이 필요한 이유는 이 값이 **프롬프트 맨 앞과 맨 뒤 두 번** 들어가기
 * 때문이다. 본문을 통째로 붙여 넣으면 정작 원고와 레퍼런스 지시가 뒤로
 * 밀린다. 2000자면 「배경은 밤, 창밖에 네온」 같은 실제 쓰임에는 남는다.
 */
const USER_INSTRUCTION_MAX = 2000;

const AttachmentSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["keep_identity", "place_as_is", "style_reference", "ending"]),
  assetPath: z.string().min(1),
  url: z.string().min(1),
  role: z.enum(["cover", "body", "ending"]).optional(),
  subject: z.enum(["person", "object"]).optional(),
  bodySlot: z.number().int().optional(),
}).strict();

const SourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string().trim().min(1) }).strict(),
  z.object({ kind: z.literal("youtube"), url: z.string().url() }).strict(),
  z.object({ kind: z.literal("web"), url: z.string().url() }).strict(),
  z.object({ kind: z.literal("question"), question: z.string().trim().min(1) }).strict(),
]);

export const ProjectInputSchema = z.object({
  candidateId: z.string().uuid().optional(),
  title: z.string().trim().min(1),
  source: SourceSchema,
  toneNote: z.string().trim().optional(),
  attachments: z.array(AttachmentSchema),
  ratio: z.enum(["4:5", "1:1", "9:16", "16:9"]),
  cardCountMode: z.enum(["auto", "fixed"]).default("auto"),
  cardCount: z.number().int().min(4).max(8).optional(),
  language: z.enum(["ko", "en", "ja", "zh"]),
  modelId: z.enum(["gpt-image-2", "nano-banana-pro", "nano-banana-2", "nano-banana"]).default("gpt-image-2"),
  // 안 보내면 auto — 예전에 만든 화면과 이미 저장된 작업이 그대로 돈다.
  look: z.enum(IMAGE_LOOKS).default("auto"),
  userInstruction: z.string().trim().max(USER_INSTRUCTION_MAX).optional(),
}).strict().superRefine((value, context) => {
  if (value.cardCountMode === "fixed" && value.cardCount === undefined) {
    context.addIssue({ code: "custom", path: ["cardCount"], message: "고정 장수를 골라 주세요." });
  }
  if (value.cardCountMode === "auto" && value.cardCount !== undefined) {
    context.addIssue({ code: "custom", path: ["cardCount"], message: "AI 추천에서는 고정 장수를 보내지 않습니다." });
  }
});

export type ProjectInput = z.infer<typeof ProjectInputSchema>;
export type ProjectSource = z.infer<typeof SourceSchema>;
