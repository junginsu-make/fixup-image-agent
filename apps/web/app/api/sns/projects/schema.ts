import { z } from "zod";

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
