import { describe, expect, it } from "vitest";
import {
  CHARACTER_ANGLES,
  buildCandidatePrompt,
  buildSceneWithCharacterDirective,
  buildTurnaroundPrompt,
  pickAngleForSection,
  selectCharacterModel,
} from "./pdp.character";

describe("각도 정의", () => {
  // 앞·뒤·좌·우 넷으로 고정한다.
  it("네 종을 쓴다", () => {
    expect(CHARACTER_ANGLES.map((angle) => angle.id)).toEqual([
      "front",
      "left",
      "right",
      "back",
    ]);
  });

  // 이 순서가 화면과 라이브러리의 순서다. 목록 표지와 첫 장이 정면이어야 한다.
  it("정면이 맨 앞이다", () => {
    expect(CHARACTER_ANGLES[0].id).toBe("front");
  });

  // 90도 측면은 얼굴이 반만 보여 정체성 기준으로 쓰기 나쁘다.
  // 좌·우는 45도로 돌린 시점을 쓴다 — 두 눈이 남는다.
  it("좌·우는 두 눈이 보이는 45도다", () => {
    for (const id of ["left", "right"] as const) {
      const angle = CHARACTER_ANGLES.find((entry) => entry.id === id)!;
      expect(angle.directive).toMatch(/45 degrees/i);
      expect(angle.directive).toMatch(/both eyes remain visible/i);
    }
  });

  it("좌와 우가 서로 반대쪽을 본다", () => {
    const left = CHARACTER_ANGLES.find((angle) => angle.id === "left")!;
    const right = CHARACTER_ANGLES.find((angle) => angle.id === "right")!;
    expect(left.directive).toMatch(/subject-left/i);
    expect(right.directive).toMatch(/subject-right/i);
  });

  it("각도마다 영어 지시문이 있다", () => {
    for (const angle of CHARACTER_ANGLES) {
      expect(angle.directive.length).toBeGreaterThan(30);
      expect(angle.label.length).toBeGreaterThan(0);
    }
  });

  // 원본이 겪어보고 넣은 문장이다. 없으면 뒤통수에 얼굴이 생긴다.
  it("뒷모습에 얼굴을 그리지 말라고 명시한다", () => {
    const back = CHARACTER_ANGLES.find((angle) => angle.id === "back")!;
    expect(back.directive).toMatch(/do not place facial features on the back/i);
  });
});

describe("후보 생성 프롬프트", () => {
  const prompt = buildCandidatePrompt({
    description: "30대 한국인 여성, 단발머리, 베이지 니트",
    aspectRatio: "9:16",
    photoreal: true,
  });

  it("사용자 묘사를 그대로 싣는다", () => {
    expect(prompt).toContain("30대 한국인 여성");
  });

  it("한 명만 그리라고 못 박는다", () => {
    expect(prompt).toMatch(/exactly one/i);
    expect(prompt).toMatch(/do not add a second character/i);
  });

  // 세로 비율은 전신이 들어가야 한다. 억지로 욱여넣으면 비율이 깨진다.
  it("세로 비율이면 전신 구도를 요구한다", () => {
    expect(prompt).toMatch(/head to toe|full-length/i);
    expect(prompt).toMatch(/never compress|never squeeze/i);
  });

  it("가로·정사각이면 상반신 구도를 요구한다", () => {
    const wide = buildCandidatePrompt({ description: "x", aspectRatio: "16:9", photoreal: true });
    expect(wide).toMatch(/head-to-waist|three-quarter view/i);
  });

  // 보정 티가 나면 상세페이지에서 바로 가짜로 보인다.
  it("실사면 피부 표현을 지시한다", () => {
    expect(prompt).toMatch(/pores/i);
    expect(prompt).toMatch(/avoid beauty filters|airbrush/i);
  });

  it("실사가 아니면 피부 지시를 넣지 않는다", () => {
    const illustration = buildCandidatePrompt({
      description: "x",
      aspectRatio: "1:1",
      photoreal: false,
    });
    expect(illustration).not.toMatch(/pores/i);
  });
});

describe("다각도 프롬프트", () => {
  it("고른 후보를 기준으로 그 각도를 만든다", () => {
    const prompt = buildTurnaroundPrompt({
      identityPrompt: "30대 한국인 여성, 단발머리",
      angle: "back",
      photoreal: true,
    });
    expect(prompt).toContain("30대 한국인 여성");
    expect(prompt).toMatch(/back view/i);
  });

  it("같은 인물임을 못 박는다", () => {
    const prompt = buildTurnaroundPrompt({
      identityPrompt: "x",
      angle: "front",
      photoreal: false,
    });
    expect(prompt).toMatch(/same character|same person/i);
  });
});

describe("섹션에 쓸 각도 고르기", () => {
  it("클로즈업·정면이면 정면", () => {
    expect(pickAngleForSection("정면 클로즈업, 인물 중심 구도")).toBe("front");
    expect(pickAngleForSection("close-up portrait facing camera")).toBe("front");
  });

  it("뒤돌아선 장면이면 뒷모습", () => {
    expect(pickAngleForSection("뒤돌아 걸어가는 뒷모습")).toBe("back");
    expect(pickAngleForSection("walking away, seen from behind")).toBe("back");
  });

  it("오른쪽을 보는 장면이면 우측", () => {
    expect(pickAngleForSection("모델이 오른쪽을 바라보는 구도")).toBe("right");
    expect(pickAngleForSection("facing right, product on the left")).toBe("right");
  });

  // 대부분의 사용 장면은 좌측 45도가 자연스럽다. 판단이 안 서면 여기로 온다.
  it("그 외에는 좌측", () => {
    expect(pickAngleForSection("주방에서 제품을 쓰는 장면")).toBe("left");
    expect(pickAngleForSection("")).toBe("left");
  });
});

describe("섹션 생성에 붙일 지시", () => {
  const directive = buildSceneWithCharacterDirective({
    identityPrompt: "30대 한국인 여성, 단발머리",
    hasStyleReference: true,
  });

  // 캐릭터와 스타일 레퍼런스가 인물을 두고 다툰다. 안 정해주면 모델이
  // 절충하는데, 그 절충이 얼굴을 바꾼다.
  it("얼굴은 캐릭터가 이긴다고 못 박는다", () => {
    expect(directive).toMatch(/identity.*overrides|overrides.*identity/i);
    expect(directive).toMatch(/face/i);
  });

  it("스타일 레퍼런스가 있으면 역할을 나눠 적는다", () => {
    expect(directive).toMatch(/colour|color|typograph/i);
  });

  it("스타일 레퍼런스가 없으면 그 얘기를 하지 않는다", () => {
    const alone = buildSceneWithCharacterDirective({
      identityPrompt: "x",
      hasStyleReference: false,
    });
    expect(alone).not.toMatch(/typograph/i);
  });

  it("한 명만 그리라고 못 박는다", () => {
    expect(directive).toMatch(/exactly one/i);
  });
});

describe("모델 선택", () => {
  // 실사 인물은 Nano Banana Pro 가 낫다는 것이 원본의 결론이다.
  it("실사는 nano-banana-pro", () => {
    expect(selectCharacterModel(true)).toBe("nano-banana-pro");
  });

  it("실사가 아니어도 우리가 쓰는 모델 안에서 고른다", () => {
    expect(["gpt-image-2", "nano-banana-pro", "nano-banana"]).toContain(
      selectCharacterModel(false),
    );
  });
});
