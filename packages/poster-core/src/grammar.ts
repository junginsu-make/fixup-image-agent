import { z } from "zod";
import { failureReason } from "@fixup/shared";
import { TYPE_INTERACTIONS } from "./schemas";

/**
 * 레퍼런스에서 **문법**을 읽는다.
 *
 * 문법이란 "어떻게 보이나" — 글자와 피사체의 관계, 지배색, 강조색이다.
 * "무엇을 말하나"(헤드라인·받침 문구)는 사용자 몫이라 묻지 않는다.
 *
 * **절대 던지지 않는다.** 읽기가 실패하면 그 레퍼런스의 문법만 비우고 나머지는
 * 계속한다. 문법이 하나도 없어도 포스터는 만들 수 있다 — 슬롯이 비어 있을 뿐이다.
 */

const GrammarSchema = z.object({
  /**
   * 이 레퍼런스에 **글자가 있나.**
   *
   * 글자를 넣을지는 규칙이 아니라 붙인 그림이 정한다. VOGUE 표지를 붙였는데
   * 결과에 글자가 하나도 없었다(2026-09-17) — 거대한 타이포그래피가 그
   * 포스터의 핵심인데도 그랬다. 「사용자가 안 시켰으면 넣지 않는다」는 규칙이
   * 2026-09-08 「BEST DAY EVER!」 사고를 막으려고 생겼는데, 그때는 **첨부
   * 어디에도 글자가 없었다.** 두 경우가 다른데 같은 규칙을 받고 있었다.
   *
   * 옛 작업에는 이 값이 없다. 없으면 지금까지대로 읽는다.
   */
  hasText: z.boolean().default(false),
  typeInteraction: z.enum(TYPE_INTERACTIONS).nullable(),
  dominantColor: z.string(),
  accentColor: z.string().default(""),
  note: z.string().default(""),
});

export type ReferenceGrammar = z.infer<typeof GrammarSchema>;

export interface GrammarReaderInput {
  prompt: string;
  imageUrls: string[];
}

export interface GrammarReader {
  read(input: GrammarReaderInput): Promise<unknown>;
}

export interface GrammarSource {
  id: string;
  title: string;
  url: string;
}

export interface GrammarResult {
  grammars: Record<string, ReferenceGrammar>;
  /** 기획 프롬프트에 그대로 넣을 한 줄 요약. */
  summaries: Record<string, string>;
  issues: string[];
}

export function buildGrammarPrompt(): string {
  return [
    "이 포스터가 **어떻게 보이는지**만 읽어 주세요. 무슨 내용인지는 묻지 않습니다.",
    "",
    "읽을 것:",
    "  hasText          이 포스터에 **글자가 있나** — 제목·헤드라인·타이포그래피·",
    "                   작은 글씨까지. 하나라도 있으면 true.",
    `  typeInteraction  글자와 피사체의 관계 — ${TYPE_INTERACTIONS.join(" / ")} 중 하나.`,
    "                   판단이 안 서면 null.",
    "  dominantColor    화면을 지배하는 색",
    "  accentColor      좁게 쓰이지만 눈에 띄는 색",
    "  note             타이포와 피사체가 만나는 방식을 한 줄로",
    "",
    "규칙: 보이지 않는 것을 지어내지 마세요. 모르면 비워 두세요.",
    "      비어 있어도 사람이 채울 수 있습니다.",
  ].join("\n");
}

function summarize(grammar: ReferenceGrammar): string {
  return [
    grammar.typeInteraction ? `글자가 피사체를 ${grammar.typeInteraction}` : "",
    grammar.dominantColor ? `지배색 ${grammar.dominantColor}` : "",
    grammar.accentColor ? `강조색 ${grammar.accentColor}` : "",
    grammar.note,
  ].filter((part) => part.trim().length > 0).join(" · ");
}

export async function readReferenceGrammar(
  references: GrammarSource[],
  reader: GrammarReader,
): Promise<GrammarResult> {
  const prompt = buildGrammarPrompt();
  const grammars: Record<string, ReferenceGrammar> = {};
  const summaries: Record<string, string> = {};
  const issues: string[] = [];

  for (const reference of references) {
    try {
      // 이미지를 그대로 보여준다. 코드가 대신 묘사하면 원본과 멀어진다.
      const grammar = GrammarSchema.parse(await reader.read({ prompt, imageUrls: [reference.url] }));
      grammars[reference.id] = grammar;
      summaries[reference.id] = summarize(grammar);
    } catch (error) {
      issues.push(`${reference.title} 의 문법을 읽지 못했습니다: ${failureReason(error)}`);
    }
  }

  return { grammars, summaries, issues };
}

/**
 * 레퍼런스에서 **읽은 값**과 기획이 **채운 값**을 합친다.
 *
 * **읽은 것이 이긴다.** 전에는 반대였다 — 라우트 주석이 「기획이 채운 값이
 * 이긴다」고 적고 있었다. 그래서 2026-09-17 사고에서 레퍼런스를 실제로 읽어
 * 「가림」을 얻어 놓고도 기획이 추측한 「통과」가 프롬프트로 갔다.
 *
 * 그림을 읽는 비전 호출은 **돈을 내고** 하는 일이다. 그 결과가 근거 없는
 * 추측에 밀리면 그 돈이 버려진다.
 *
 * **글자 관계는 읽은 것만 쓴다.** 못 읽었으면 비운다 — 그 줄이 프롬프트에서
 * 빠지고 모델이 정한다. 사용자가 판단할 수 있는 값이 아니고(「통과 / 뒤로 /
 * 가림 / 감쌈」은 타이포그래피 용어다), 우리가 한 낱말로 못 박으면 오히려
 * 좁힌다(2026-09-17 사용자 판단).
 *
 * **색은 다르다.** 사용자가 판단할 수 있고 실제로 고치고 싶어 하는 값이라
 * 04 에 칸이 남는다. 읽은 것이 비었으면 기획 값이 들어온다.
 */
export function mergeGrammar<T extends {
  typeInteraction?: (typeof TYPE_INTERACTIONS)[number] | null;
  dominantColor?: string;
  accentColor?: string;
}>(planned: T, read: ReferenceGrammar | undefined): T {
  return {
    ...planned,
    typeInteraction: read?.typeInteraction ?? null,
    dominantColor: read?.dominantColor?.trim() || planned.dominantColor || "",
    accentColor: read?.accentColor?.trim() || planned.accentColor || "",
  };
}
