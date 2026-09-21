import { describe, expect, it } from "vitest";
import { IMAGE_STALE_NOTICE, imageStampOf, isImageStale } from "./pdp.image-freshness";
import type { SectionBlueprint } from "./types";

/**
 * **이 그림이 지금 문구로 만든 것인가**(N-5, 설계 §4.2).
 *
 * 상세페이지는 글자가 이미지 안에 그려진다. 제목을 「3일 만에」에서 「7일
 * 만에」로 고쳐도 **화면의 이미지는 여전히 「3일 만에」**인데 아무 표시가
 * 없었다. 그대로 내보내면 **고친 글과 다른 이미지**가 나간다.
 */

const 섹션 = (patch: Record<string, unknown> = {}): SectionBlueprint =>
  ({
    section_id: "S1", section_name: "히어로", goal: "관심",
    headline: "3일 만에", subheadline: "부제", bullets: ["하나"],
    trust_or_objection_line: "환불됩니다", CTA: "지금 보기",
    prompt_ko: "밝은 방", prompt_en: "a bright room", layout_notes: "",
    ...patch,
  }) as SectionBlueprint;

const 그림있는섹션 = (patch: Record<string, unknown> = {}) => {
  const base = 섹션(patch);
  return { ...base, generatedImage: "data:image/png;base64,AAA", imageStamp: imageStampOf(base) };
};

describe("그림을 만들 때의 문구를 적어 둔다", () => {
  it("**같은 문구면 같은 자국이다**", () => {
    expect(imageStampOf(섹션())).toBe(imageStampOf(섹션()));
  });

  it("**섹션이 없으면 빈 자국이다**", () => {
    expect(imageStampOf(null)).toBe("");
    expect(imageStampOf(undefined)).toBe("");
  });
});

/**
 * **그림에 실제로 들어가는 것만 센다.**
 *
 * 그림이 안 바뀌는 것으로 「낡았다」고 하면 사용자는 표시를 무시하게 된다.
 */
describe("무엇을 고치면 그림이 낡는가", () => {
  it("**제목을 고치면 낡는다** — 이미지에 그 글자가 그려져 있다", () => {
    const 만든뒤 = 그림있는섹션();

    expect(isImageStale({ ...만든뒤, headline: "7일 만에" })).toBe(true);
  });

  it("**부제·불릿·신뢰문장을 고쳐도 낡는다** — 전부 그려진다", () => {
    const 만든뒤 = 그림있는섹션();

    expect(isImageStale({ ...만든뒤, subheadline: "다른 부제" }), "부제").toBe(true);
    expect(isImageStale({ ...만든뒤, bullets: ["둘"] }), "불릿").toBe(true);
    expect(isImageStale({ ...만든뒤, trust_or_objection_line: "다른 문장" }), "신뢰문장").toBe(true);
  });

  it("**장면 지시를 고치면 낡는다** — 같은 글자라도 다른 그림이다", () => {
    const 만든뒤 = 그림있는섹션();

    expect(isImageStale({ ...만든뒤, prompt_en: "a dark room" })).toBe(true);
  });

  /**
   * **CTA 는 이미지에 안 실린다.** 싣지 않기로 한 결정이 있다(2026-07-30 —
   * 눌리지 않는 그림 버튼이 되기 때문). 안 그려지는 글자로 「다시 만들라」고
   * 하면 값이 헛되이 나간다.
   */
  it("**CTA 를 고쳐도 안 낡는다** — 이미지에 안 실린다", () => {
    const 만든뒤 = 그림있는섹션();

    expect(isImageStale({ ...만든뒤, CTA: "다른 버튼" })).toBe(false);
  });

  it("**섹션 이름을 고쳐도 안 낡는다** — 그림에 안 들어간다", () => {
    const 만든뒤 = 그림있는섹션();

    expect(isImageStale({ ...만든뒤, section_name: "다른 이름" })).toBe(false);
  });

  it("**아무것도 안 고치면 안 낡는다**", () => {
    expect(isImageStale(그림있는섹션())).toBe(false);
  });
});

describe("낡았다고 하면 안 되는 때", () => {
  it("**그림이 없으면 낡을 것도 없다**", () => {
    expect(isImageStale(섹션())).toBe(false);
  });

  /**
   * **옛 초안을 나무라지 않는다.** 이 기능이 생기기 전에 만든 그림에는
   * 자국이 없다. 전부 낡았다고 하면 사용자는 표시를 무시한다.
   */
  it("**자국이 없으면 안 낡았다고 본다**", () => {
    expect(isImageStale({ ...섹션(), generatedImage: "data:image/png;base64,AAA" })).toBe(false);
  });

  it("**섹션이 없어도 안 터진다**", () => {
    expect(isImageStale(null)).toBe(false);
    expect(isImageStale(undefined)).toBe(false);
  });
});

describe("낡은 그림 옆에 붙일 말", () => {
  it("**고치기 전 글자라고 말한다**", () => {
    expect(IMAGE_STALE_NOTICE).toContain("고치기 전");
  });

  it("**무엇을 하면 되는지 말한다**", () => {
    expect(IMAGE_STALE_NOTICE).toContain("다시 만들어야");
  });

  it("**줄표를 안 쓴다**", () => {
    expect(IMAGE_STALE_NOTICE).not.toContain("—");
  });
});
