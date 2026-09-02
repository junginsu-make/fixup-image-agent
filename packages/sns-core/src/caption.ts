import { z } from "zod";
import { withIssueFallback } from "@fixup/shared";
import { LANGUAGE_LABEL, type CardCopy, type CopyLanguage } from "./copy";

/**
 * 인스타그램 게시글 문구.
 *
 * 전에는 카드 원고를 그냥 이어 붙여 보여줬다. 그건 게시글이 아니라 대본이다.
 * 카드에 이미 쓰인 글을 아래에 또 적어 놓은 꼴이라 읽을 이유가 없었다.
 *
 * 게시글은 따로 쓴다. 그리고 네 칸으로 나눈다 — 붙여넣는 자리가 다르기 때문이다.
 *
 *   hook          첫 두 줄. 인스타그램이 그 뒤를 접으므로 여기서 붙잡아야 한다
 *   body          내용
 *   hashtags      본문 끝이나 첫 댓글에 붙인다
 *   firstComment  첫 댓글. 해시태그를 여기 몰아넣는 사람이 많다
 */

export interface Caption {
  hook: string;
  body: string;
  hashtags: string[];
  firstComment: string;
}

export interface CaptionInput {
  title: string;
  cards: CardCopy[];
  toneNote?: string;
  language: CopyLanguage;
}

export interface CaptionProvider {
  generate(prompt: string): Promise<unknown>;
}

export interface CaptionResult {
  caption?: Caption;
  issues: string[];
}

/** 30개까지 붙일 수 있지만 그만큼 붙이면 스팸으로 보인다. */
const MAX_HASHTAGS = 15;

const CaptionResponseSchema = z.object({
  hook: z.string().min(1),
  body: z.string().min(1),
  hashtags: z.array(z.string()).default([]),
  firstComment: z.string().default(""),
});

export function buildCaptionPrompt(input: CaptionInput): string {
  const script = input.cards
    .map((card) => [`${card.index}. ${card.headline}`, card.body ? `   ${card.body}` : ""]
      .filter(Boolean).join("\n"))
    .join("\n");

  return [
    "만들어 둔 카드뉴스에 붙일 인스타그램 게시글 문구를 씁니다.",
    `출력 언어: ${LANGUAGE_LABEL[input.language]}.`,
    `제목: ${input.title}`,
    `카드에 들어간 글:\n${script}`,
    input.toneNote ? `말투: ${input.toneNote}` : "",
    [
      "카드에 이미 쓰인 문장을 그대로 옮기지 마세요. 카드를 열어 보고 싶게 만드는 글을 새로 씁니다.",
      "친근하고 자연스러운 말투로. 광고 문구처럼 딱딱하지 않게.",
      "이모지를 씁니다. 다만 문장마다 넣지는 마세요 — 눈에 걸립니다.",
      "hook 은 첫 두 줄입니다. 인스타그램이 그 뒤를 접으므로 여기서 붙잡아야 합니다.",
      "body 는 줄바꿈으로 나눠 읽기 좋게 하세요.",
      "firstComment 는 첫 댓글에 남길 말입니다. 사람들이 반응할 거리를 주세요 — 질문이나 저장을 권하는 말이 좋습니다.",
      "hashtags 는 8~15개. 주제와 관련 있는 것만.",
      "카드에 없는 사실·수치·고유명사를 지어내지 마세요.",
    ].join("\n"),
  ].filter(Boolean).join("\n\n");
}

export function normalizeCaption(raw: unknown): Caption {
  const parsed = CaptionResponseSchema.parse(raw);
  const hashtags = [...new Set(
    parsed.hashtags
      .map((tag) => tag.trim())
      .filter(Boolean)
      // 모델이 우물정자를 빼먹고 줄 때가 있다. 붙여 준다.
      .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)),
  )].slice(0, MAX_HASHTAGS);

  return {
    hook: parsed.hook.trim(),
    body: parsed.body.trim(),
    hashtags,
    firstComment: parsed.firstComment.trim(),
  };
}

export async function writeCaption(
  input: CaptionInput,
  primary: CaptionProvider,
  backup?: CaptionProvider,
): Promise<CaptionResult> {
  if (input.cards.length === 0) return { issues: ["게시글을 쓸 카드 원고가 없습니다."] };

  const prompt = buildCaptionPrompt(input);
  const run = async (provider: CaptionProvider) => normalizeCaption(await provider.generate(prompt));
  const result = await withIssueFallback(
    () => run(primary),
    backup ? () => run(backup) : undefined,
    {
      primaryFailure: "주 모델 게시글 문구 실패",
      backupMissing: "OpenAI 예비 게시글 제공자가 설정되지 않았습니다.",
      backupFailure: "OpenAI 예비 게시글도 실패했습니다",
      backupSuccess: "주 모델이 실패해 OpenAI 예비로 게시글을 썼습니다",
    },
  );
  return { caption: result.value, issues: result.issues };
}
