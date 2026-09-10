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
  /**
   * 사람은 그대로 두되 **그림 느낌만** 바꿔도 되나 (설계 §4-3).
   *
   * `keep_identity` + `subject: "person"` 일 때만 뜻이 있다. 없으면 지금까지처럼
   * 그림 느낌까지 고정한다 — 옛 작업에는 이 값이 없다.
   */
  restyle: z.boolean().optional(),
  bodySlot: z.number().int().optional(),
}).strict();

/**
 * 자리마다 「이 그림들을 어떻게 쓸까요」.
 *
 * **한 칸으로 묶지 않는다.** 표지와 속지는 원하는 것이 다르다 — 표지는 「크게,
 * 사람은 가운데」, 속지는 「사람은 작게, 글자 자리를 비워」. 하나로 묶으면 이
 * 둘을 못 나눈다(2026-09-08 사용자 결정).
 *
 * 이미지 만들기는 결과가 한 장이라 칸이 하나면 됐다. 카드뉴스는 자리가 셋이다.
 */
const AttachmentIntentsSchema = z.object({
  cover: z.string().trim().max(USER_INSTRUCTION_MAX).default(""),
  body: z.string().trim().max(USER_INSTRUCTION_MAX).default(""),
  ending: z.string().trim().max(USER_INSTRUCTION_MAX).default(""),
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
  /** 자리마다 사용자가 적은 말. 옛 작업에는 없다 — 없으면 지금까지 그대로다. */
  attachmentIntents: AttachmentIntentsSchema.default({ cover: "", body: "", ending: "" }),
  ratio: z.enum(["4:5", "1:1", "9:16", "16:9"]),
  cardCountMode: z.enum(["auto", "fixed"]).default("auto"),
  cardCount: z.number().int().min(4).max(8).optional(),
  language: z.enum(["ko", "en", "ja", "zh"]),
  /**
   * **목록에서 id 를 빼지 않는다.** 저장된 작업이 그 시점의 id 를 들고 있고,
   * 화면이 작업을 열어 그 값을 되보내는 순간 400 이 난다 — 기본을 되돌리는
   * 일이 「옛 작업을 못 여는 사고」로 바뀐다. 되돌릴 때는 `.default` 만 옮긴다.
   *
   * 이 목록은 `@fixup/sns-core` 의 `IMAGE_MODELS` 와 같아야 한다.
   * `__tests__/sns-project-schema.test.ts` 가 그 관계를 잠근다.
   */
  modelId: z.enum([
    "gpt-image-2.5-flare",
    "gpt-image-2.5-sunburst",
    "gpt-image-2",
    "nano-banana-pro",
    "nano-banana-2",
    "nano-banana",
  ]).default("gpt-image-2.5-flare"),
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
