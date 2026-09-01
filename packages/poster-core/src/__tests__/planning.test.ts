import { describe, expect, it, vi } from "vitest";
import { buildPlanPrompt, planPoster, PRIMARY_POSTER_MODEL } from "../planning";
import { EMPTY_SLOTS } from "../schemas";

const input = {
  instruction: "필름 카메라 감성의 사진전 포스터",
  ratio: "2:3",
  references: [{ title: "SNAP 포스터", grammar: "글자가 인물을 통과한다" }],
};

const filled = {
  kind: "전시 홍보",
  headline: "가을, 셔터를 누르다",
  subline: "필름으로 담은 도시의 온도",
  sideTexts: ["28MM F2.0", "ISO 400"],
  scene: "해질녘 골목",
  subject: "필름 카메라를 든 20대 여성",
  action: "셔터를 누르는 순간",
  typeInteraction: "통과",
  dominantColor: "따뜻한 세피아",
  accentColor: "선명한 주황",
  forbidden: "로고, 워터마크",
};

describe("기획 프롬프트", () => {
  it("사용자 지시와 레퍼런스 문법을 함께 준다", () => {
    const prompt = buildPlanPrompt(input);
    expect(prompt).toContain("필름 카메라 감성의 사진전 포스터");
    expect(prompt).toContain("글자가 인물을 통과한다");
  });

  it("글자수를 숫자로 못 박지 않는다", () => {
    // 2026-08-20 결정. 내용에 따라 적절한 양이 달라진다.
    expect(buildPlanPrompt(input)).not.toMatch(/\d+\s*자/);
  });

  it("모르는 것은 지어내지 말라고 못 박는다", () => {
    expect(buildPlanPrompt(input)).toMatch(/지어내|비워/);
  });
});

describe("슬롯 기획", () => {
  it("주 모델은 claude-sonnet-5 다", () => {
    expect(PRIMARY_POSTER_MODEL).toBe("claude-sonnet-5");
  });

  it("채워진 슬롯을 돌려준다", async () => {
    const result = await planPoster(input, { plan: async () => ({ slots: filled }) });
    expect(result.slots.headline).toBe("가을, 셔터를 누르다");
    expect(result.slots.sideTexts).toEqual(["28MM F2.0", "ISO 400"]);
    expect(result.issues).toEqual([]);
  });

  it("주 모델이 실패하면 예비로 넘어가고 사실을 남긴다", async () => {
    const backup = vi.fn(async () => ({ slots: filled }));
    const result = await planPoster(input, {
      plan: async () => { throw new Error("Claude 실패"); },
    }, { plan: backup });
    expect(backup).toHaveBeenCalledTimes(1);
    expect(result.slots.headline).toBe("가을, 셔터를 누르다");
    expect(result.issues.join("\n")).toMatch(/예비.*Claude 실패/);
  });

  it("둘 다 실패하면 빈 슬롯과 두 이유를 준다 — 사람이 직접 채운다", async () => {
    const result = await planPoster(input, {
      plan: async () => { throw new Error("주 실패"); },
    }, { plan: async () => { throw new Error("예비 실패"); } });
    expect(result.slots).toEqual(EMPTY_SLOTS);
    expect(result.issues.join("\n")).toMatch(/주 실패/);
    expect(result.issues.join("\n")).toMatch(/예비 실패/);
  });

  it("예비가 없으면 그 사실도 남긴다", async () => {
    const result = await planPoster(input, {
      plan: async () => { throw new Error("주 실패"); },
    });
    expect(result.issues.join("\n")).toMatch(/예비/);
  });

  it("모르는 칸이 섞여 오면 스키마가 거절하고 빈 슬롯을 준다", async () => {
    const result = await planPoster(input, {
      plan: async () => ({ slots: { ...filled, 이상한칸: "값" } }),
    });
    expect(result.slots).toEqual(EMPTY_SLOTS);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("예외를 밖으로 던지지 않는다", async () => {
    await expect(planPoster(input, {
      plan: async () => { throw new Error("무슨 일이든"); },
    })).resolves.toBeDefined();
  });

  it("일부만 채워 와도 나머지는 빈 칸으로 둔다 — 사람이 마저 채운다", async () => {
    const result = await planPoster(input, {
      plan: async () => ({ slots: { headline: "제목만 있음" } }),
    });
    expect(result.slots.headline).toBe("제목만 있음");
    expect(result.slots.scene).toBe("");
    expect(result.slots.typeInteraction).toBeNull();
  });
});
