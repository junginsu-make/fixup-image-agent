import { describe, expect, it } from "vitest";
import { applyUserEdit, findUncoveredFactTargets } from "./pdp.evidence";
import type { LandingPageBlueprint, SectionBlueprint } from "./types";

/**
 * **문구를 한 번 고쳤다고 생성이 막히면 안 된다**(2026-09-22 사용자 신고).
 *
 * ── 무슨 일이 있었나 ───────────────────────────────────────
 *
 * 사용자가 프로틴 상세페이지를 만들다가 섹션별 이미지 생성에서 막혔다.
 *
 * ```
 * api/pdp/images:1  Failed to load resource: 400 (Bad Request)
 * ```
 *
 * ── 왜 그런가 ──────────────────────────────────────────────
 *
 * 사진 경로의 구성안에는 **근거(`evidence`)가 없다.** 분석 응답 스키마에 그
 * 칸이 아예 없고, 프롬프트도 요구하지 않는다. 그래서 `evidenceVersion` 이
 * 안 붙고, 게이트는 그런 섹션을 **건드리지 않고 지나간다** — 그대로 두면
 * 이미지가 잘 만들어진다.
 *
 * 그런데 사용자가 구성안 화면에서 **아무 칸이나 한 번 고치면**
 * `applyUserEdit` 가 그 섹션에 **`evidenceVersion: 1` 을 찍는다.** 고친 칸
 * 하나만 근거가 생기고, 나머지 칸의 수치는 전부 「근거 없음」이 된다.
 *
 * 그때부터 그 섹션은 **영구히 400** 이다. 장면 지시 한 줄만 고쳐도 그렇다.
 *
 * ── 무엇이 잘못됐나 ────────────────────────────────────────
 *
 * `evidenceVersion: 1` 은 「이 섹션은 **근거 체계를 갖췄다**」는 뜻이다.
 * 그런데 `applyUserEdit` 는 **편집 한 번의 부수효과로** 그 깃발을 꽂는다.
 * 버전 표시와 근거 충족은 다른 것인데 같은 것으로 쓰고 있었다.
 *
 * 게다가 막히는 문장은 **사용자가 쓴 주장이 아니라 우리 AI 가 사진을 보고
 * 쓴 제목**이고, 사진 경로는 그 문장에 붙일 근거를 애초에 만들지 않는다.
 * **충족이 원리적으로 불가능한 조건**이었다.
 */

const 사진경로섹션 = (patch: Partial<SectionBlueprint> = {}): SectionBlueprint =>
  ({
    section_id: "S1",
    section_name: "히어로",
    goal: "관심",
    headline: "2.5kg 대용량, 22g 단백질",
    subheadline: "5.5g BCAAs 저당",
    bullets: ["물에도 잘 풀립니다"],
    trust_or_objection_line: "",
    CTA: "",
    prompt_ko: "밝은 주방",
    prompt_en: "a bright kitchen",
    layout_notes: "",
    // 사진 경로는 근거를 만들지 않는다. 그래서 이 칸이 없다.
    ...patch,
  }) as SectionBlueprint;

const 구성안 = (section: SectionBlueprint): LandingPageBlueprint =>
  ({ executiveSummary: "전략", scorecard: [], blueprintList: [], sections: [section] }) as LandingPageBlueprint;

describe("사진 경로 구성안은 그대로 두면 지나간다", () => {
  it("**근거 체계가 없는 섹션은 게이트가 안 잡는다**", () => {
    expect(findUncoveredFactTargets(사진경로섹션())).toEqual([]);
  });
});

/**
 * **편집이 「근거를 갖췄다」고 선언하면 안 된다.**
 *
 * 고친 칸에 근거를 남기는 것은 맞다 — 그 문구는 사용자가 쓴 것이다. 하지만
 * 그것이 **섹션 전체를 1판으로 승격시키면**, 손대지 않은 다른 칸까지 갑자기
 * 근거를 요구받는다.
 */
describe("한 칸을 고쳐도 다른 칸이 막히지 않는다", () => {
  it("**장면 지시를 고쳐도 생성이 막히지 않는다**", () => {
    const 고친뒤 = applyUserEdit(구성안(사진경로섹션()), "S1", { slot: "prompt_ko" }, "어두운 주방");

    expect(findUncoveredFactTargets(고친뒤.sections[0]!)).toEqual([]);
  });

  it("**제목을 고쳐도 부제 때문에 막히지 않는다**", () => {
    const 고친뒤 = applyUserEdit(구성안(사진경로섹션()), "S1", { slot: "headline" }, "3kg 대용량");

    expect(findUncoveredFactTargets(고친뒤.sections[0]!)).toEqual([]);
  });

  it("**불릿을 고쳐도 막히지 않는다**", () => {
    const 고친뒤 = applyUserEdit(구성안(사진경로섹션()), "S1", { slot: "bullet", index: 0 }, "잘 풀립니다");

    expect(findUncoveredFactTargets(고친뒤.sections[0]!)).toEqual([]);
  });

  /**
   * **고친 내용은 그대로 들어가야 한다.** 막히지 않게 하려다 편집 자체가
   * 안 되면 더 나쁘다.
   */
  it("**고친 문구는 제대로 반영된다**", () => {
    const 고친뒤 = applyUserEdit(구성안(사진경로섹션()), "S1", { slot: "headline" }, "새 제목");

    expect(고친뒤.sections[0]!.headline).toBe("새 제목");
  });

  /**
   * **누가 썼는지는 남긴다.** 근거 기록 자체는 값어치가 있다 — 나중에
   * 「이 문구는 사용자가 직접 썼다」를 알 수 있어야 한다.
   */
  it("**사용자가 썼다는 기록은 남는다**", () => {
    const 고친뒤 = applyUserEdit(구성안(사진경로섹션()), "S1", { slot: "headline" }, "새 제목");
    const 근거 = 고친뒤.sections[0]!.evidence ?? [];

    expect(근거.some((entry) => entry.kind === "user" && entry.value === "새 제목")).toBe(true);
  });
});

/**
 * **원래 근거 체계를 갖춘 섹션은 그대로 검사한다.**
 *
 * 글 경로는 분석이 근거를 만들어 준다. 거기서는 「근거 없이 수치를 말한다」가
 * 실제로 잡아야 하는 문제다 — 그 보호를 없애면 안 된다.
 */
describe("글 경로의 보호는 그대로다", () => {
  const 글경로섹션 = 사진경로섹션({
    evidenceVersion: 1,
    evidence: [{ target: { slot: "headline" }, value: "2.5kg 대용량, 22g 단백질", kind: "quoted", quote: "2.5kg" }],
  } as never);

  it("**근거가 없는 수치 칸을 여전히 잡는다**", () => {
    // 부제의 `5.5g` 에는 근거가 없다.
    expect(findUncoveredFactTargets(글경로섹션).length).toBeGreaterThan(0);
  });

  it("**고쳐도 1판은 유지된다** — 원래 갖춘 체계를 벗기지 않는다", () => {
    const 고친뒤 = applyUserEdit(구성안(글경로섹션), "S1", { slot: "subheadline" }, "5.5g BCAAs");

    expect(고친뒤.sections[0]!.evidenceVersion).toBe(1);
  });

  it("**고친 칸은 충족된 것으로 본다**", () => {
    const 고친뒤 = applyUserEdit(구성안(글경로섹션), "S1", { slot: "subheadline" }, "5.5g BCAAs");
    const 빈칸 = findUncoveredFactTargets(고친뒤.sections[0]!);

    expect(빈칸.some((target) => target.slot === "subheadline")).toBe(false);
  });
});
