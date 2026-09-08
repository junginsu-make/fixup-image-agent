import { z } from "zod";
import { failureReason } from "@fixup/shared";
import type { GrammarReader, GrammarSource } from "./grammar";

/**
 * 지킬 사람의 첨부에서 **누가 있는지**를 읽는다.
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────
 *
 * 2026-09-08 실측에서 사진 다섯 명을 만화로 바꿨더니 **세 번째 사람의 안경이
 * 몇 번을 돌려도 안 나왔다.** 프롬프트에 있던 인물 묘사가 이것뿐이었기 때문이다.
 *
 *   Subject: 1번 사진에 등장하는 사람들(흰색 티셔츠 착용)을 …
 *
 * 기획이 쓴 **한 줄 요약**이다. 요약에 없는 것은 안 그려진다.
 *
 * 그리고 기획은 사람을 **볼 방법이 아예 없었다.** `readReferenceGrammar` 는
 * 「어떻게 보이나」(색·타이포)만 읽고 「무엇이 있나」는 일부러 안 읽는다. 게다가
 * 「따라 만들기」 그림에만 돈다 — 지킬 사람의 사진은 아무도 안 봤다.
 *
 * ── 무엇을 읽나 ──────────────────────────────────────────────
 *
 * **왼쪽부터 한 명씩.** 사람마다 한 줄이다. 한 문단으로 뭉치면 기획이 다시
 * 요약해 버려 원래 문제로 돌아간다.
 *
 * **절대 던지지 않는다.** 읽기가 실패하면 그 그림만 비우고 나머지는 계속한다 —
 * `readReferenceGrammar` 와 같은 약속이다. 사람 묘사가 없어도 포스터는 만들 수
 * 있고, 그림 모델은 사진 자체를 여전히 본다.
 */

/**
 * **`default([])` 를 쓰면 안 된다.**
 *
 * 기본값을 두면 모양이 틀린 응답(`{ 사람: "…" }`)이 조용히 「사람 없음」이 된다.
 * 그러면 읽기가 깨진 것을 아무도 모르고, 기획은 인물 묘사 없이 계속 돈다 —
 * 고치려던 그 고장으로 되돌아간다. 없는 것과 못 읽은 것은 다르다.
 */
const PeopleSchema = z.object({
  people: z.array(z.string().trim().min(1)),
});

export interface PeopleResult {
  /** 첨부 id 마다 사람 한 명당 한 줄. */
  people: Record<string, string[]>;
  issues: string[];
}

export function buildPeoplePrompt(): string {
  return [
    "이 사진에 **누가 있는지** 왼쪽부터 한 명씩 적어 주세요.",
    "그림을 그리는 사람이 이 글만 보고도 같은 사람들을 그릴 수 있어야 합니다.",
    "",
    "한 사람에 한 줄. 이 순서로 적습니다.",
    "  자리 — 왼쪽에서 몇 번째인지",
    "  머리 — 길이·색·묶었는지",
    "  얼굴에 걸친 것 — 안경·선글라스가 있으면 반드시. 없으면 적지 않습니다",
    "  머리에 쓴 것 — 모자·캡·두건",
    "  옷 — 색과 종류, 프린트나 글자가 있으면 그것도",
    "  그 밖에 — 시계·목걸이·가방처럼 눈에 띄는 것",
    "  자세 — 앉음/섬, 팔 위치",
    "",
    "**작은 것을 빠뜨리지 마세요.** 안경 하나가 다른 사람을 만듭니다.",
    "**안 보이는 것은 지어내지 마세요.** 확실하지 않으면 그 항목을 빼고 적습니다.",
    "나이·직업·감정처럼 보이지 않는 것은 짐작하지 않습니다.",
    "",
    "사람이 없으면 빈 목록을 주세요.",
  ].join("\n");
}

/**
 * 첨부마다 사람을 읽는다.
 *
 * 한 장씩 따로 읽는다 — 여러 장을 한 번에 주면 모델이 사람을 뒤섞는다.
 */
export async function readPeople(
  sources: GrammarSource[],
  reader: GrammarReader,
): Promise<PeopleResult> {
  const people: Record<string, string[]> = {};
  const issues: string[] = [];

  for (const source of sources) {
    try {
      const raw = await reader.read({ prompt: buildPeoplePrompt(), imageUrls: [source.url] });
      const parsed = PeopleSchema.safeParse(raw);
      if (!parsed.success) {
        issues.push(`${source.title}: 사람을 읽지 못했습니다.`);
        continue;
      }
      if (parsed.data.people.length) people[source.id] = parsed.data.people;
    } catch (error) {
      issues.push(`${source.title}: 사람을 읽지 못했습니다 (${failureReason(error)}).`);
    }
  }

  return { people, issues };
}
