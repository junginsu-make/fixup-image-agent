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

/**
 * 설계 §5 4번 — 기획 AI 도 번호·역할·01 지시를 함께 본다.
 *
 * **셋 다 시험 밖이었다.** 위 `input` 에 그 값들이 아예 없어서, `planning.ts`
 * 에서 번호를 지우든 역할을 지우든 01 지시를 지우든 시험 81개가 전부
 * 초록이었다(2026-09-08 리뷰). 기획이 첨부를 못 보면 「첨부한 그림과 겉도는
 * 칸」이라는 원래 문제로 되돌아간다.
 */
describe("기획도 화면과 같은 번호로 첨부를 본다", () => {
  const withRoles = {
    ...input,
    references: [
      { title: "만화 포스터", number: 2, roleLabel: "따라 만들기" },
      { title: "가족 사진", number: 1, roleLabel: "인물 그대로 지키기" },
    ],
  };

  it("넘겨받은 번호를 그대로 쓴다 — 다시 세지 않는다", () => {
    // 화면 ②번이 기획에서도 2번이어야 한다. 여기서 다시 세면 목록에 담긴
    // 차례대로 1, 2 가 되어 화면·프롬프트와 갈린다.
    const prompt = buildPlanPrompt(withRoles);
    expect(prompt).toContain("2. 만화 포스터");
    expect(prompt).toContain("1. 가족 사진");
  });

  it("역할을 함께 알려 준다", () => {
    const prompt = buildPlanPrompt(withRoles);
    expect(prompt).toContain("[따라 만들기]");
    expect(prompt).toContain("[인물 그대로 지키기]");
  });

  it("첨부에 대해 사용자가 적은 말을 넘긴다", () => {
    const prompt = buildPlanPrompt({
      ...withRoles,
      attachmentIntent: "1번 사진의 사람들을 2번 그림 느낌으로",
    });
    expect(prompt).toContain("1번 사진의 사람들을 2번 그림 느낌으로");
  });

  it("안 적었으면 그 줄이 없다", () => {
    expect(buildPlanPrompt(withRoles)).not.toContain("사용자가 적은 말");
  });

  it("번호가 없으면 담긴 차례대로 센다 — 옛 작업", () => {
    const prompt = buildPlanPrompt(input);
    expect(prompt).toContain("1. SNAP 포스터");
  });
});

/**
 * 사람을 한 명씩 넘긴다 (2026-09-08 실측).
 *
 * 전에는 기획이 여럿을 한 줄로 뭉갰다 — 「1번 사진에 등장하는 사람들(흰색
 * 티셔츠 착용)」. 그 한 줄이 최종 프롬프트의 유일한 인물 묘사라, 요약에 없는
 * 안경이 안 그려졌다.
 */
describe("사람을 한 명씩 넘긴다", () => {
  const withPeople = {
    ...input,
    references: [{
      title: "단체 사진",
      number: 1,
      roleLabel: "사람은 그대로, 그림 느낌만",
      people: ["왼쪽 첫째 · 선글라스 · 흰 티셔츠", "둘째 · 검정 캡 · 흰 티셔츠"],
    }],
  };

  it("한 명당 한 줄로 적는다", () => {
    const prompt = buildPlanPrompt(withPeople);
    expect(prompt).toContain("· 왼쪽 첫째 · 선글라스 · 흰 티셔츠");
    expect(prompt).toContain("· 둘째 · 검정 캡 · 흰 티셔츠");
  });

  it("그림 줄 아래에 붙는다 — 어느 그림의 사람인지 알아야 한다", () => {
    const prompt = buildPlanPrompt(withPeople);
    expect(prompt.indexOf("1. 단체 사진")).toBeLessThan(prompt.indexOf("왼쪽 첫째"));
  });

  it("**한 줄로 뭉뚱그리지 말라고 시킨다**", () => {
    expect(buildPlanPrompt(withPeople)).toContain("한 줄로 뭉뚱그리지 마세요");
  });

  it("위에 없는 것은 지어내지 말라고 한다", () => {
    // 읽은 것이 없는데 채우면 그림이 사진과 달라진다.
    expect(buildPlanPrompt(withPeople)).toContain("위에 없는 것은 지어내지 말고");
  });

  it("읽은 사람이 없으면 지금까지 그대로다", () => {
    const prompt = buildPlanPrompt(input);
    expect(prompt).toContain("1. SNAP 포스터");
    expect(prompt).not.toContain("       · ");
  });
});
