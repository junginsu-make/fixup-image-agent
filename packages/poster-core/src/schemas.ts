import { z } from "zod";
import { IMAGE_MODELS, POSTER_RATIOS } from "@fixup/sns-core";
import { IMAGE_LOOKS } from "@fixup/shared";
import { MAX_VARIANTS, MIN_VARIANTS } from "./pricing";

/**
 * 포스터는 자유 문장이 아니라 **슬롯**으로 기획한다.
 *
 * 유형(영화·장소 홍보·공익·제품 광고)이 달라도 슬롯 구조는 그대로다.
 * 같은 칸에 다른 값이 들어갈 뿐이다.
 *
 * **글자수를 숫자로 못 박지 않는다.** 2026-08-20 결정이다 — 내용에 따라 적절한
 * 양이 달라지므로 LLM 이 판단하게 유도하고, 길면 그림 단계에서 작게 넣는다.
 * 개수 제한은 다르다. 곁텍스트는 화면에 놓을 자리가 정해져 있어 상한이 있다.
 */

/** 두 레퍼런스가 공유하는 가장 강한 특징. 문장에 묻어 두면 AI 가 자주 놓친다. */
export const TYPE_INTERACTIONS = ["통과", "뒤로", "가림", "감쌈"] as const;

export const MAX_SIDE_TEXTS = 8;

const text = z.string().default("");

export const PosterSlotsSchema = z.object({
  // 무엇을 말하나
  kind: text,
  headline: text,
  subline: text,
  sideTexts: z.array(z.string())
    .max(MAX_SIDE_TEXTS, `곁텍스트는 ${MAX_SIDE_TEXTS}개까지 넣을 수 있습니다.`)
    // 빈 줄이 프롬프트에 들어가면 모델이 빈 칸을 스스로 채운다.
    .transform((list) => list.filter((entry) => entry.trim().length > 0))
    .default([]),
  // 무엇이 보이나
  scene: text,
  subject: text,
  action: text,
  // 어떻게 보이나
  typeInteraction: z.enum(TYPE_INTERACTIONS).nullable().default(null),
  dominantColor: text,
  accentColor: text,
  forbidden: text,
}).strict();

export type PosterSlots = z.infer<typeof PosterSlotsSchema>;

/** 기획이 실패해도 사람이 채울 수 있어야 한다. 빈 슬롯이 유효한 상태다. */
export const EMPTY_SLOTS: PosterSlots = PosterSlotsSchema.parse({});

const POSTER_RATIO_IDS = POSTER_RATIOS.map((ratio) => ratio.id) as [string, ...string[]];
const MODEL_IDS = IMAGE_MODELS.map((model) => model.id) as [string, ...string[]];

export const PosterProjectInputSchema = z.object({
  title: z.string().trim().min(1),
  ratio: z.enum(POSTER_RATIO_IDS),
  modelId: z.enum(MODEL_IDS),
  variants: z.number().int().min(MIN_VARIANTS).max(MAX_VARIANTS),
  /** 사용자가 적는 한 줄. 나머지는 기획이 채운다. */
  instruction: z.string().trim().min(1),
  /** 따라 만들 기준. 없으면 만들 수 없다. */
  referenceIds: z.array(z.string().uuid()).min(1, "따라 만들 레퍼런스를 한 장 이상 골라 주세요."),
  /** 그대로 지킬 제품·인물. 선택이다. */
  preservedIds: z.array(z.string().uuid()).default([]),
  /**
   * preservedIds 중 사람인 것. 사람과 물건은 지키는 방법이 다르고, 얼굴이
   * 둘이면 모델이 절충해 제3의 인물을 만든다(2026-07-30 실측).
   * 비어 있으면 전부 물건으로 다룬다 — 옛 작업에는 이 값이 없다.
   */
  personIds: z.array(z.string().uuid()).default([]),
  /**
   * personIds 중 **그림 느낌만 바꿔도 되는** 것 (설계 §4-3).
   *
   * 「인물 지키기」는 그림 느낌까지 고정한다(`restyle` 을 금지한다). 「이 사람들을
   * 만화로」는 그 지시로도, 「따라 만들기」(사람을 새로 만든다)로도 표현이 안 됐다.
   * 옛 작업에는 이 값이 없다 — 없으면 지금까지처럼 그림 느낌까지 고정한다.
   */
  restyledIds: z.array(z.string().uuid()).default([]),
  /**
   * 그림의 결. 기본은 `auto` — 첨부한 그림의 결을 따라간다.
   *
   * 기본값이 auto 여야 지금까지 만들던 사람이 안 깨진다. 옛 작업에는 이 값이
   * 아예 없고, 그때도 같은 뜻으로 읽힌다.
   */
  look: z.enum(IMAGE_LOOKS).default("auto"),
  /**
   * 사용자가 직접 친 추가 지시. 비워 둘 수 있다.
   *
   * 기획이 채운 슬롯보다 세다 — 사람이 친 말이기 때문이다. 프롬프트의 맨 앞과
   * 맨 뒤 두 곳에 들어간다.
   */
  userInstruction: z.string().trim().default(""),
  /**
   * **고른 차례 그대로**의 첨부 id. 화면 ①②③ 이자 프롬프트의 `Image N` 이다.
   *
   * 옛 작업에는 없다. 없으면 서버가 `referenceIds` + `preservedIds` 를 이어
   * 붙여 만든다 — 그 작업들은 애초에 차례가 저장돼 있지 않아 그것 말고 방법이 없다.
   */
  attachmentOrder: z.array(z.string().uuid()).default([]),
  /**
   * 첨부한 그림들을 어떻게 쓸지. 사용자가 01에서 적는다.
   *
   * 역할 셋은 「무엇을 가져올지」를 묶음으로만 고르게 한다. 「①번 사람들을
   * ②번 느낌으로」처럼 갈라 가져오는 것은 어느 묶음에도 없어서 이 칸이 필요하다.
   */
  attachmentIntent: z.string().trim().default(""),
  /**
   * 광고 마스터의 **id**. 선택이다.
   *
   * **픽셀을 받지 않는다.** 자유 픽셀이면 경계가 없어 `{ 3840, 3840 }` 이
   * 8.29MP 를 만드는데 장부에는 자리표시 1088×1088 값이 남는다(설계 §10 3-b).
   * id 만 받으면 그 구멍이 존재하지 않는다.
   *
   * **`poster-core` 는 광고 규격을 모른다.** 아는 id 인지는 앱 쪽이 판단한다 —
   * 여기서 `z.enum` 을 걸면 이 꾸러미가 광고 목록에 묶인다.
   */
  adMasterId: z.string().max(64).optional(),
  slots: PosterSlotsSchema.optional(),
}).strict().superRefine((input, ctx) => {
  /**
   * **차례는 첨부 전부를 담아야 한다.**
   *
   * 담지 않으면 빠진 첨부가 조용히 사라진다 — 오류도 경고도 없이. 게다가
   * 장수 상한과 비용은 `referenceIds + preservedIds` 를 세는데 실제로 fal 에
   * 가는 것은 차례에 담긴 것뿐이라, 「7장이라 거절」해 놓고 정작 1장만 보내는
   * 조합이 만들어진다(2026-09-08 리뷰).
   *
   * 화면은 세 목록을 전부 차례에서 뽑으므로 이 조건을 늘 만족한다. 여기서
   * 막는 것은 낡은 화면·직접 친 요청처럼 **화면을 안 거친 것**이다.
   *
   * 차례가 비어 있으면 안 본다 — 옛 작업에는 애초에 없다.
   */
  if (!input.attachmentOrder.length) return;

  const attached = new Set([...input.referenceIds, ...input.preservedIds]);
  const ordered = new Set(input.attachmentOrder);
  const missing = [...attached].filter((id) => !ordered.has(id));
  const extra = [...ordered].filter((id) => !attached.has(id));

  if (missing.length || extra.length) {
    ctx.addIssue({
      code: "custom",
      path: ["attachmentOrder"],
      message: "첨부한 그림과 고른 차례가 어긋납니다. 화면을 새로고침한 뒤 다시 골라 주세요.",
    });
  }
});

export type PosterProjectInput = z.infer<typeof PosterProjectInputSchema>;

export const PosterStatusSchema = z.enum(["draft", "planning", "ready", "generating", "done", "failed"]);
export type PosterStatus = z.infer<typeof PosterStatusSchema>;
