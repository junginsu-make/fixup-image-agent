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
