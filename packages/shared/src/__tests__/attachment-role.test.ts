import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_ROLE_LABEL,
  fromCardNewsAttachment,
  fromPdpReference,
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
