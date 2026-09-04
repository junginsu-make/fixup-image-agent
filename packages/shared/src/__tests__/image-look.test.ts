import { describe, expect, it } from "vitest";
import {
  IMAGE_LOOKS,
  imageLookDirective,
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
