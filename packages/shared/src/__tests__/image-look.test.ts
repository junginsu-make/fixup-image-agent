import { describe, expect, it } from "vitest";
import {
  IMAGE_LOOKS,
  attachmentPlacementRule,
  designerPersona,
  imageLookDirective,
  preserveDirective,
  priorityLine,
  userInstructionHead,
  userInstructionTail,
} from "../image-look";

describe("결 지시문", () => {
  it("auto 는 아무 말도 보태지 않는다", () => {
    // 지금까지의 동작이 기본이어야 쓰던 사람이 안 깨진다.
    expect(imageLookDirective("auto")).toBe("");
    expect(imageLookDirective("auto", "person")).toBe("");
  });

  it("고른 결마다 다른 말이 나온다", () => {
    const made = IMAGE_LOOKS.filter((look) => look !== "auto").map((look) => imageLookDirective(look));
    expect(new Set(made).size).toBe(made.length);
    for (const directive of made) expect(directive.length).toBeGreaterThan(80);
  });

  it("실사는 사람·동물·그 외가 다르다", () => {
    const person = imageLookDirective("photoreal", "person");
    const animal = imageLookDirective("photoreal", "animal");
    const generic = imageLookDirective("photoreal");
    expect(person).toContain("vellus hair");
    expect(animal).toContain("fur strands");
    expect(generic).not.toContain("vellus hair");
    // 고양이에게 사람 모공을 요구하면 이상해진다.
    expect(animal).not.toMatch(/pores/i);
    expect(generic).not.toMatch(/pores/i);
    // 셋 다 공통 문단은 갖는다 — 같은 「실사」가 도구마다 갈리면 안 된다.
    for (const directive of [person, animal, generic]) {
      expect(directive).toContain("Ultra-detailed photographic realism");
    }
  });

  it("실사에 모호한 강조어를 쓰지 않는다", () => {
    // 2026-09-04 실측: 효과를 낸 것은 무엇이 고품질인지 이름을 댄 말이었다.
    // hyperrealistic 은 "artificially exaggerated pores 를 피하라"와 부딪힌다.
    expect(imageLookDirective("photoreal", "person")).not.toMatch(/hyperrealistic/i);
  });

  it("애니·그림은 사진 질감을 막는다", () => {
    expect(imageLookDirective("anime")).toContain("No photographic texture");
    expect(imageLookDirective("illustration")).toContain("No photographic realism");
  });
});

describe("사용자 지시", () => {
  it("비었으면 자리를 만들지 않는다", () => {
    for (const empty of ["", "   ", "\n"]) {
      expect(userInstructionHead(empty)).toBe("");
      expect(userInstructionTail(empty)).toBe("");
    }
  });

  it("적은 말을 그대로 싣는다", () => {
    const typed = "배경은 밤, 창밖에 네온";
    expect(userInstructionHead(typed)).toContain(typed);
    expect(userInstructionTail(typed)).toContain(typed);
  });

  it("맨 앞은 최우선이라고 선언하고, 맨 뒤는 다시 확인시킨다", () => {
    // 긴 프롬프트에서 중간 문장은 밀린다(2026-09-04 실측). 그래서 양끝에 둔다.
    expect(userInstructionHead("x")).toContain("highest priority");
    expect(userInstructionTail("x")).toContain("re-read");
  });
});

describe("충돌 우선순위", () => {
  it("사용자 지시가 지켜야 할 대상보다 위다", () => {
    const line = priorityLine({ hasUserInstruction: true, hasPreserved: true });
    expect(line.indexOf("USER INSTRUCTION")).toBeLessThan(line.indexOf("PRESERVED SUBJECT"));
    expect(line.indexOf("PRESERVED SUBJECT")).toBeLessThan(line.indexOf("REFERENCE"));
  });

  it("없는 것은 줄에 안 넣는다", () => {
    const line = priorityLine({ hasUserInstruction: false, hasPreserved: true });
    expect(line).not.toContain("USER INSTRUCTION");
    expect(line).toContain("PRESERVED SUBJECT");
  });
});

describe("누가 그리는가", () => {
  it("세계적인 디자이너·일러스트레이터 자리에 세운다", () => {
    // 역할을 안 주면 모델이 「무난한 것」으로 수렴한다.
    expect(designerPersona()).toMatch(/world-class/i);
    expect(designerPersona()).toMatch(/designer/i);
    expect(designerPersona()).toMatch(/illustrator/i);
  });

  it("역할이 지시를 이기지 않는다고 못 박는다", () => {
    // 아무리 좋은 디자이너라도 받은 지시를 자기 취향으로 바꾸면 그건 다른
    // 결과물이다. 사용자가 친 말이 가장 우선이라는 규칙과 부딪히면 안 된다.
    expect(designerPersona()).toMatch(/never overrides it/i);
    expect(designerPersona()).toMatch(/do not substitute your own taste/i);
  });

  it("다섯 도구가 같은 사람을 세운다", () => {
    // 도구마다 다른 사람을 세우면 결과의 격이 도구마다 갈린다.
    expect(designerPersona()).toBe(designerPersona());
  });
});

describe("지켜야 할 것을 지킬 때", () => {
  it("사람은 알아볼 수 있어야 한다고 말한다", () => {
    const person = preserveDirective("preserve-person");
    expect(person).toMatch(/identity/i);
    expect(person).toMatch(/recognise them immediately/i);
  });

  it("사람을 예쁘게 고치지 말라고 못 박는다", () => {
    // 2026-09-04 사용자 보고: 인물이 「약간 변형되어」 나왔다. 모델은 손볼
    // 여지가 있으면 손본다.
    const person = preserveDirective("preserve-person");
    expect(person).toMatch(/do not beautify/i);
    expect(person).toMatch(/do not blend in another face/i);
  });

  it("물건은 비슷한 것이 아니라 그 물건이라고 말한다", () => {
    const object = preserveDirective("preserve-object");
    expect(object).toMatch(/identity/i);
    expect(object).toMatch(/not a similar product/i);
    expect(object).toMatch(/do not redesign/i);
  });

  it("바뀌어도 되는 것을 좁게 적는다", () => {
    // 전에는 「각도와 빛은 바뀌어도 된다」까지만 적어 문이 너무 넓었다.
    // 무엇이 바뀌어도 되는지는 딱 그것뿐이라고 말한다.
    for (const role of ["preserve-person", "preserve-object"] as const) {
      expect(preserveDirective(role)).toMatch(/only the/i);
    }
  });

  it("낱낱이 적는다 — 「정체성을 지켜라」 한 마디로는 안 지켜졌다", () => {
    expect(preserveDirective("preserve-person")).toMatch(/hairstyle/i);
    expect(preserveDirective("preserve-object")).toMatch(/logos/i);
  });
});

describe("첨부한 것을 어디에 놓을까", () => {
  it("지킬 대상이 있으면 자리를 정하라고 한다", () => {
    const rule = attachmentPlacementRule(true);
    expect(rule).toMatch(/explicit, deliberate place/i);
    expect(rule).toMatch(/never cropped away/i);
  });

  it("지킬 대상이 없어도 아무렇게나 놓지 말라고 한다", () => {
    expect(attachmentPlacementRule(false)).toMatch(/deliberate placement/i);
  });

  it("지킬 대상이 있을 때 더 많은 말을 한다", () => {
    // 지킨 것이 구석에 작게 들어가면 지킨 보람이 없다.
    expect(attachmentPlacementRule(true).length)
      .toBeGreaterThan(attachmentPlacementRule(false).length);
  });
});
