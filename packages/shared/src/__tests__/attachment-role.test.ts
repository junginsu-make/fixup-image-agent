import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_ROLE_HINT,
  ATTACHMENT_ROLE_LABEL,
  fromCardNewsAttachment,
  fromPdpReference,
  characterAngleDirective,
  countPreservedPeople,
  fromPosterImage,
  personOverflow,
  toCardNewsAttachment,
  toPdpReference,
  toPosterImage,
  type AttachmentRole,
} from "../attachment-role";

const ROLES: AttachmentRole[] = ["style", "preserve_product", "preserve_person", "place_as_is"];

describe("세 도구가 같은 말을 쓴다", () => {
  it("역할마다 사용자에게 보일 이름이 하나씩 있다", () => {
    expect(ATTACHMENT_ROLE_LABEL.style).toBe("따라 만들기");
    expect(ATTACHMENT_ROLE_LABEL.preserve_product).toBe("제품 그대로 지키기");
    expect(ATTACHMENT_ROLE_LABEL.preserve_person).toBe("인물 그대로 지키기");
    expect(ATTACHMENT_ROLE_LABEL.place_as_is).toBe("원본 그대로 넣기");
  });
});

describe("카드뉴스 어휘로 오가기", () => {
  it("네 역할이 다 옮겨진다", () => {
    expect(toCardNewsAttachment("style")).toEqual({ kind: "style_reference" });
    expect(toCardNewsAttachment("preserve_product")).toEqual({ kind: "keep_identity", subject: "object" });
    expect(toCardNewsAttachment("preserve_person")).toEqual({ kind: "keep_identity", subject: "person" });
    expect(toCardNewsAttachment("place_as_is")).toEqual({ kind: "place_as_is" });
  });

  it("되돌리면 원래 역할이 나온다", () => {
    // 도구를 옮겨 다녀도 사용자가 정한 역할이 살아 있어야 한다.
    for (const role of ROLES) {
      const attachment = toCardNewsAttachment(role);
      expect(fromCardNewsAttachment(attachment.kind, attachment.subject)).toBe(role);
    }
  });

  it("대상을 안 적은 옛 자료는 물건으로 본다", () => {
    // 인물로 잘못 보면 '인물은 하나만' 규칙에 걸려 멀쩡한 첨부가 막힌다.
    expect(fromCardNewsAttachment("keep_identity")).toBe("preserve_product");
  });

  it("카드뉴스 고유의 마지막 장은 역할이 아니라 자리다", () => {
    expect(fromCardNewsAttachment("ending")).toBeNull();
  });
});

describe("포스터 어휘로 오가기", () => {
  it("포스터는 사람과 물건을 구분하지 않으므로 대상을 따로 들고 다닌다", () => {
    expect(toPosterImage("preserve_person")).toEqual({ kind: "preserved", subject: "person" });
    expect(toPosterImage("preserve_product")).toEqual({ kind: "preserved", subject: "object" });
    expect(toPosterImage("style")).toEqual({ kind: "style_reference" });
  });

  it("되돌리면 원래 역할이 나온다", () => {
    for (const role of ["style", "preserve_product", "preserve_person"] as AttachmentRole[]) {
      const image = toPosterImage(role)!;
      expect(fromPosterImage(image.kind, image.subject)).toBe(role);
    }
  });

  it("포스터는 원본 그대로 넣기를 지원하지 않는다", () => {
    // 한 장짜리 도구라 '그대로 넣을 장'이라는 개념이 없다.
    expect(toPosterImage("place_as_is")).toBeNull();
  });
});

describe("상세페이지 어휘로 오가기", () => {
  it("앵커·인물·스타일로 옮겨진다", () => {
    expect(toPdpReference("preserve_product")).toBe("anchor");
    expect(toPdpReference("preserve_person")).toBe("person");
    expect(toPdpReference("style")).toBe("style");
    expect(toPdpReference("place_as_is")).toBeNull();
  });

  it("되돌리면 원래 역할이 나온다", () => {
    expect(fromPdpReference("anchor")).toBe("preserve_product");
    expect(fromPdpReference("person")).toBe("preserve_person");
    expect(fromPdpReference("style")).toBe("style");
  });
});

describe("인물은 하나만", () => {
  it("얼굴이 둘이면 알린다", () => {
    // 실측 정책(pdp.reference-policy.ts): 얼굴이 둘이면 모델이 절충해
    // 제3의 인물을 만든다.
    expect(personOverflow(["preserve_person", "preserve_person"])).toBe(true);
  });

  it("인물 하나에 제품이 여럿인 것은 괜찮다", () => {
    expect(personOverflow(["preserve_person", "preserve_product", "preserve_product"])).toBe(false);
    expect(personOverflow(["style", "style"])).toBe(false);
    expect(personOverflow([])).toBe(false);
  });
});

/**
 * 「사람은 그대로, 그림 느낌만」 (설계 §4-3, 2026-09-08 사용자 결정).
 */
describe("그림 느낌만 바꾸는 사람", () => {
  it("이름과 설명을 갖는다", () => {
    expect(ATTACHMENT_ROLE_LABEL.preserve_person_restyled).toBe("사람은 그대로, 그림 느낌만");
    expect(ATTACHMENT_ROLE_HINT.preserve_person_restyled).toContain("안경");
  });

  it("포스터에서는 지킬 사람으로 간다", () => {
    expect(toPosterImage("preserve_person_restyled")).toEqual({ kind: "preserved", subject: "person" });
  });

  it("**인물은 한 명만에 함께 걸린다** — 지킬 얼굴인 것은 같다", () => {
    expect(personOverflow(["preserve_person", "preserve_person_restyled"])).toBe(true);
    expect(personOverflow(["preserve_person_restyled"])).toBe(false);
  });

  it("아직 모르는 도구에서는 가장 가까운 것으로 간다 — 사람을 잃지 않는다", () => {
    // 카드뉴스·상세페이지는 설계 §3 3단계에서 배운다.
    expect(toCardNewsAttachment("preserve_person_restyled")).toEqual({ kind: "keep_identity", subject: "person" });
    expect(toPdpReference("preserve_person_restyled")).toBe("person");
  });
});

/**
 * **장을 세는 게 아니라 사람을 센다.**
 *
 * 캐릭터 하나는 정면·측면·뒷모습이 한 벌이다. 그 넷을 붙이면 장은 넷이지만
 * 사람은 하나다. 장으로 세면 캐릭터를 만든 뜻이 사라진다 — 각도를 쓰려고
 * 넷을 만들어 놓고, 붙이는 순간 「인물이 넷」으로 막힌다(2026-09-15 사용자).
 */
describe("지킬 사람 세기", () => {
  const 호랑이 = "char-tiger";
  const 강아지 = "char-dog";

  it("같은 캐릭터의 네 각도는 한 명이다", () => {
    const 네각도 = ["front", "left_45", "right_45", "back"].map(() => ({
      role: "preserve_person" as const,
      characterId: 호랑이,
    }));

    expect(countPreservedPeople(네각도)).toBe(1);
    expect(personOverflow(네각도)).toBe(false);
  });

  it("다른 캐릭터가 섞이면 둘이다", () => {
    const 섞임 = [
      { role: "preserve_person" as const, characterId: 호랑이 },
      { role: "preserve_person" as const, characterId: 호랑이 },
      { role: "preserve_person" as const, characterId: 강아지 },
    ];

    expect(countPreservedPeople(섞임)).toBe(2);
    expect(personOverflow(섞임)).toBe(true);
  });

  /** 캐릭터가 아닌 낱장 사진은 지금까지처럼 각각 한 사람이다. */
  it("캐릭터에서 오지 않은 사진은 장마다 한 명이다", () => {
    const 낱장둘 = [{ role: "preserve_person" as const }, { role: "preserve_person" as const }];

    expect(countPreservedPeople(낱장둘)).toBe(2);
    expect(personOverflow(낱장둘)).toBe(true);
  });

  it("캐릭터 한 벌에 낱장 사진이 끼면 둘이다", () => {
    expect(
      countPreservedPeople([
        { role: "preserve_person", characterId: 호랑이 },
        { role: "preserve_person", characterId: 호랑이 },
        { role: "preserve_person" },
      ]),
    ).toBe(2);
  });

  it("그림 느낌만 바꾸는 각도도 같은 캐릭터로 센다", () => {
    expect(
      countPreservedPeople([
        { role: "preserve_person", characterId: 호랑이 },
        { role: "preserve_person_restyled", characterId: 호랑이 },
      ]),
    ).toBe(1);
  });

  it("사람이 아닌 것은 세지 않는다", () => {
    expect(
      countPreservedPeople([
        { role: "preserve_product", characterId: 호랑이 },
        { role: "style" },
        { role: "place_as_is" },
      ]),
    ).toBe(0);
  });

  /** 옛 호출부는 역할 배열만 넘긴다. 그 모양도 계속 받아야 한다. */
  it("역할만 넘겨도 지금까지처럼 센다", () => {
    expect(personOverflow(["preserve_person", "preserve_person"])).toBe(true);
    expect(personOverflow(["preserve_person"])).toBe(false);
    expect(personOverflow([])).toBe(false);
  });
});

describe("여러 각도 지시문", () => {
  it("장수를 적고, 같은 사람이라고 말한다", () => {
    const 지시 = characterAngleDirective(4);
    expect(지시).toContain("4");
    expect(지시).toMatch(/SAME character/i);
  });

  /** 각도를 베끼면 캐릭터 시트가 그대로 결과물이 된다. */
  it("자세·구도·옷·배경을 베끼지 말라고 못 박는다", () => {
    const 지시 = characterAngleDirective(3);
    expect(지시).toMatch(/poses/i);
    expect(지시).toMatch(/backgrounds/i);
    expect(지시).toMatch(/exactly one person/i);
  });
});
