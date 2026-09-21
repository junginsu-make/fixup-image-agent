import { describe, expect, it } from "vitest";
import { countClearedCopy } from "./pdp.evidence";
import type { LandingPageBlueprint, SectionBlueprint } from "./types";

/**
 * **「치웠습니다」를 말하려면 정말 치웠는지 알아야 한다.**
 *
 * 정책을 정하는 것과 그 정책이 무언가를 바꾸는 것은 다른 일이다.
 * `verifyEvidenceStructure` 는 근거 딱지가 없는 섹션을 통째로 건너뛰므로,
 * 정책을 아무리 엄하게 내려도 **한 칸도 안 비워질 수 있다.**
 */
const 섹션 = (overrides: Partial<SectionBlueprint> = {}): SectionBlueprint =>
  ({
    section_id: "s1",
    section_name: "히어로",
    goal: "관심",
    headline: "제목",
    subheadline: "부제",
    bullets: ["하나", "둘"],
    trust_or_objection_line: "안심",
    CTA: "구매",
    prompt_ko: "",
    prompt_en: "",
    layout_notes: "",
    ...overrides,
  }) as SectionBlueprint;

const 구성안 = (sections: SectionBlueprint[]): LandingPageBlueprint =>
  ({ executiveSummary: "", scorecard: [], blueprintList: [], sections }) as LandingPageBlueprint;

describe("실제로 비운 칸을 센다", () => {
  it("아무것도 안 바뀌면 0", () => {
    expect(countClearedCopy(구성안([섹션()]), 구성안([섹션()]))).toBe(0);
  });

  it("**비운 칸만 센다**", () => {
    const 결과 = countClearedCopy(
      구성안([섹션()]),
      구성안([섹션({ headline: "", trust_or_objection_line: "" })]),
    );

    expect(결과).toBe(2);
  });

  it("불릿도 센다", () => {
    expect(countClearedCopy(구성안([섹션()]), 구성안([섹션({ bullets: ["하나", ""] })]))).toBe(1);
  });

  it("공백만 남긴 것도 비운 것이다", () => {
    expect(countClearedCopy(구성안([섹션()]), 구성안([섹션({ headline: "   " })]))).toBe(1);
  });

  it("**원래 비어 있던 칸은 세지 않는다** — 안 한 일을 했다고 하면 안 된다", () => {
    const 원래빈것 = 섹션({ subheadline: "" });

    expect(countClearedCopy(구성안([원래빈것]), 구성안([원래빈것]))).toBe(0);
  });

  it("**채운 것은 세지 않는다**", () => {
    expect(countClearedCopy(구성안([섹션({ headline: "" })]), 구성안([섹션({ headline: "새 제목" })]))).toBe(0);
  });

  it("섹션이 여럿이면 모두 센다", () => {
    const 앞 = 구성안([섹션(), 섹션({ section_id: "s2" })]);
    const 뒤 = 구성안([섹션({ headline: "" }), 섹션({ section_id: "s2", CTA: "" })]);

    expect(countClearedCopy(앞, 뒤)).toBe(2);
  });

  it("**짝이 어긋나면 세지 않는다** — 부풀리는 것보다 낫다", () => {
    const 앞 = 구성안([섹션()]);
    const 뒤 = 구성안([섹션({ section_id: "다른섹션", headline: "" })]);

    expect(countClearedCopy(앞, 뒤)).toBe(0);
  });
});
