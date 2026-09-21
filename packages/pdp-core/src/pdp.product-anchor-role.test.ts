import { describe, expect, it } from "vitest";
import { anchorRoleFor, shouldSendAnchor } from "./pdp.product-anchor";
import { buildReferenceRoleDirective } from "./pdp.reference-policy";
import { PdpService } from "./pdp.service";

/**
 * **제품 보존을 꺼도 제품 사진은 간다**(U-03).
 *
 * 토글을 끄면 `shouldSendAnchor` 가 `false` 를 돌려줘 **제품 사진을 아예 안
 * 보냈다.** 모델은 레퍼런스만 보고 제품을 **지어낸다.**
 *
 * 화면은 그것을 「섹션마다 제품 모습이 조금씩 달라질 수 있습니다」라고 말했다.
 * 사실은 「다른 제품이 나옵니다」다.
 *
 * 설계 §9.1(U-03): 「**실물 product 역할의 보존 불변**, 레거시 이관」.
 * 토글이 정하는 것은 **얼마나 지킬 것인가**지 **보낼 것인가**가 아니다.
 */

describe("실물 제품은 언제나 보낸다", () => {
  it("**보존을 꺼도 보낸다**", () => {
    expect(shouldSendAnchor({ anchorKind: "product-photo", hasStyleReference: true })).toBe(true);
  });

  it("레퍼런스가 없어도 보낸다", () => {
    expect(shouldSendAnchor({ anchorKind: "product-photo", hasStyleReference: false })).toBe(true);
  });

  it("안 알려 주면 실물로 본다 — 옛 호출자가 제품을 잃지 않는다", () => {
    expect(shouldSendAnchor({ hasStyleReference: true })).toBe(true);
  });
});

/**
 * **만들어 낸 대표 이미지는 지켜야 할 실물이 아니다.**
 *
 * 글 경로의 앵커는 `TextModeFlow` 가 만든 그림이다. 거기엔 헤드라인 글자와
 * 임의의 소품이 박혀 있다.
 */
describe("대표 이미지는 다르게 다룬다", () => {
  it("**디자인 레퍼런스가 있으면 보내지 않는다** — 둘 다 보내면 절충한다", () => {
    expect(shouldSendAnchor({ anchorKind: "key-visual", hasStyleReference: true })).toBe(false);
  });

  it("레퍼런스가 없으면 보낸다 — 섹션을 잇는 유일한 시각 기준이다", () => {
    expect(shouldSendAnchor({ anchorKind: "key-visual", hasStyleReference: false })).toBe(true);
  });

  it("**「판매 중인 제품」이라고 하지 않는다**", () => {
    const role = anchorRoleFor({ anchorKind: "key-visual", hasStyleReference: false, preserveProduct: true });

    expect(role).toBe("mood-only");
  });

  it("**결만 가져오고 글자·소품은 안 가져온다**", () => {
    const text = buildReferenceRoleDirective(
      [{ kind: "anchor", base64: "A", mimeType: "image/png" }] as never,
      { anchorRole: "mood-only" },
    );

    expect(text).toContain("visual tone only");
    expect(text).toContain("Do not reproduce its text, logos, props");
    // 판매 중인 제품이라고 선언하지 않는다.
    expect(text).not.toContain("This is the product.");
    expect(text).not.toContain("every logo, label and package text");
  });
});

describe("토글은 얼마나 지킬지를 정한다", () => {
  it("켜면 **정체성을 지킨다**", () => {
    expect(anchorRoleFor({ hasStyleReference: true, preserveProduct: true })).toBe("identity");
  });

  it("**형태만일 때도 실루엣·비율·각도 규칙은 남는다**", () => {
    const text = buildReferenceRoleDirective(
      [{ kind: "anchor", base64: "A", mimeType: "image/png" }] as never,
      { anchorRole: "shape-only" },
    ).toLowerCase();

    for (const part of [
      "silhouette",
      "proportions",
      "logo",
      "label",
      "do not copy the reference's camera angle",
      "this is the product",
    ]) {
      expect(text).toContain(part);
    }
  });

  it("**끄면 형태만 지키고 색·마감은 레퍼런스를 따른다**", () => {
    expect(anchorRoleFor({ hasStyleReference: true, preserveProduct: false })).toBe("shape-only");
  });

  it("**레퍼런스가 없으면 끄든 켜든 정체성을 지킨다**", () => {
    // 따를 디자인이 없는데 색을 풀면 제품이 아무 색이나 된다.
    expect(anchorRoleFor({ hasStyleReference: false, preserveProduct: false })).toBe("identity");
  });
});

describe("역할에 따라 지시가 달라진다", () => {
  const 지시 = (anchorRole: "identity" | "shape-only") =>
    buildReferenceRoleDirective([
      { kind: "anchor", base64: "A", mimeType: "image/png" },
      { kind: "style", base64: "B", mimeType: "image/png" },
    ] as never, { anchorRole });

  it("정체성이면 색·마감까지 **지켜야 할 것**으로 적는다", () => {
    expect(지시("identity")).toContain("· colour, finish and material");
  });

  it("**형태만이면 색을 레퍼런스에 넘긴다**", () => {
    const text = 지시("shape-only");

    // 지켜야 할 것의 목록에서 빠진다.
    expect(text).not.toContain("· colour, finish and material");
    // 대신 레퍼런스를 따르라고 말한다.
    expect(text).toContain("may be restyled to match the design reference");
  });

  it("**형태만이어도 라벨 글자는 지킨다** — 글자가 바뀌면 다른 제품이다", () => {
    expect(지시("shape-only")).toContain("label");
  });

  it("**형태만이어도 다른 물건으로 바꾸지 말라고 한다**", () => {
    expect(지시("shape-only")).toContain("substitute");
  });

  it("역할을 안 주면 정체성이 기본이다 — 옛 호출자가 보존을 잃지 않는다", () => {
    const text = buildReferenceRoleDirective([
      { kind: "anchor", base64: "A", mimeType: "image/png" },
    ] as never);

    expect(text).toContain("colour, finish and material");
  });
});

describe("실제로 돌려 본다", () => {
  const 보낸참조 = async (preserveProductImage: boolean, anchorKind?: "product-photo" | "key-visual") => {
    const 담긴것: string[] = [];
    const llm = {
      generate: async (request: unknown) => {
        담긴것.push(JSON.stringify(request));
        return { text: JSON.stringify({ defects: [] }) };
      },
    };

    await new PdpService().generateSectionImage(
      {
        originalImageBase64: "PRODUCTPHOTO",
        section: {
          section_id: "S1", section_name: "히어로", goal: "", headline: "", subheadline: "",
          bullets: [], trust_or_objection_line: "", CTA: "", prompt_ko: "", prompt_en: "a scene",
          layout_notes: "",
        } as never,
        aspectRatio: "3:4",
        options: {
          style: "studio",
          preserveProductImage,
          anchorKind,
          styleReferenceImages: [{ base64: "STYLEREF", mimeType: "image/png" }],
        } as never,
      },
      {
        llm,
        // `(model, input)` 순서다. 두 번째가 실제로 보내는 것이다.
        generateImage: async (_model: string, input: unknown) => {
          담긴것.push(JSON.stringify(input));
          return { base64: "OUT", mimeType: "image/png" };
        },
      } as never,
    );

    return 담긴것.join("\n");
  };

  /** 레퍼런스 없이 돌린다. 대표 이미지가 유일한 시각 기준인 경우다. */
  const 보낸참조WithoutStyle = async (anchorKind: "product-photo" | "key-visual") => {
    const 담긴것: string[] = [];
    await new PdpService().generateSectionImage(
      {
        originalImageBase64: "PRODUCTPHOTO",
        section: {
          section_id: "S1", section_name: "히어로", goal: "", headline: "", subheadline: "",
          bullets: [], trust_or_objection_line: "", CTA: "", prompt_ko: "", prompt_en: "a scene",
          layout_notes: "",
        } as never,
        aspectRatio: "3:4",
        options: { style: "studio", anchorKind } as never,
      },
      {
        llm: { generate: async () => ({ text: JSON.stringify({ defects: [] }) }) },
        generateImage: async (_model: string, input: unknown) => {
          담긴것.push(JSON.stringify(input));
          return { base64: "OUT", mimeType: "image/png" };
        },
      } as never,
    );
    return 담긴것.join(" ");
  };

  it("**보존을 꺼도 제품 사진이 실려 나간다**", async () => {
    expect(await 보낸참조(false)).toContain("PRODUCTPHOTO");
  });

  it("켜면 당연히 실린다", async () => {
    expect(await 보낸참조(true)).toContain("PRODUCTPHOTO");
  });

  it("**글 경로의 대표 이미지는 레퍼런스가 있으면 안 실린다**", async () => {
    // 우리가 만든 그림이다. 디자인 레퍼런스가 이 페이지의 기준이고, 둘 다
    // 보내면 모델이 절충한다.
    expect(await 보낸참조(false, "key-visual")).not.toContain("PRODUCTPHOTO");
  });

  it("**실린 대표 이미지를 「판매 중인 제품」이라고 하지 않는다**", async () => {
    const 보낸것 = await 보낸참조WithoutStyle("key-visual");

    expect(보낸것).toContain("PRODUCTPHOTO");
    expect(보낸것).toContain("visual tone only");
    expect(보낸것).not.toContain("every logo, label and package text");
  });
});
