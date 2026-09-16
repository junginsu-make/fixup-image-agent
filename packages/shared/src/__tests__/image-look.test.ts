import { describe, expect, it } from "vitest";
import {
  IMAGE_LOOKS,
  attachmentPlacementRule,
  designerPersona,
  imageLookDirective,
  looksFor,
  resolveLook,
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

/**
 * **`auto` 는 따라갈 것이 있어야 뜻이 있다.**
 *
 * `auto` 의 뜻은 「첨부한 그림의 결을 그대로 따라감」이고, 지시문은 빈 문자열이다.
 * 첨부가 없으면 따라갈 것이 없는데 지시문도 비어 있으니, 결을 정하는 말이
 * 프롬프트에 **한 줄도 안 들어간다** — 결이 모델 기분대로 나온다.
 *
 * 그래서 첨부가 없으면 실사로 내린다. 고르는 자리가 화면에 있지만 화면을
 * 거치지 않는 길(API 직접 호출, 옛 작업 다시 돌리기)도 있어서, **마지막 보루를
 * 여기 둔다.** 다섯 도구가 같은 `auto` 를 쓰므로 판단도 한 곳이어야 한다.
 */
describe("첨부가 없을 때의 결", () => {
  it("첨부가 없고 auto 면 실사로 내린다", () => {
    expect(resolveLook("auto", false)).toBe("photoreal");
  });

  it("첨부가 있으면 auto 그대로 — 따라갈 것이 있다", () => {
    expect(resolveLook("auto", true)).toBe("auto");
  });

  /** 사람이 고른 것은 첨부가 있든 없든 그대로 간다. */
  it("사람이 고른 결은 안 건드린다", () => {
    for (const look of ["photoreal", "anime", "3d", "illustration"] as const) {
      expect(resolveLook(look, false)).toBe(look);
      expect(resolveLook(look, true)).toBe(look);
    }
  });

  /**
   * 이것이 이 함수의 존재 이유다 — 첨부 없이 만들 때 결 지시문이 **실제로
   * 프롬프트에 실려야** 한다. 비면 아무 말도 안 보태진다.
   */
  it("내린 결은 지시문을 만들어 낸다", () => {
    expect(imageLookDirective(resolveLook("auto", false))).not.toBe("");
    expect(imageLookDirective("auto")).toBe("");
  });
});

/**
 * 첨부가 없으면 **고를 목록에서 `auto` 를 뺀다.**
 *
 * 남겨 두면 「레퍼런스 따라가기」라고 적힌 칸이 따라갈 레퍼런스가 없는 화면에
 * 뜬다. 고르면 조용히 실사가 되는데, 화면은 다른 말을 하고 있다.
 */
describe("고를 수 있는 결", () => {
  it("첨부가 있으면 다섯 가지 다", () => {
    expect(looksFor(true)).toEqual(["auto", "photoreal", "anime", "3d", "illustration"]);
  });

  it("첨부가 없으면 auto 가 빠진다", () => {
    expect(looksFor(false)).toEqual(["photoreal", "anime", "3d", "illustration"]);
  });

  /** 목록이 비면 화면에 고를 것이 없어진다. */
  it("어느 쪽이든 비지 않는다", () => {
    expect(looksFor(true).length).toBeGreaterThan(0);
    expect(looksFor(false).length).toBeGreaterThan(0);
  });
});
