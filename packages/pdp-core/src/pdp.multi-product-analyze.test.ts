import { describe, expect, it } from "vitest";
import { PdpService } from "./pdp.service";
import { carryProductReadings } from "./pdp.analyze-products";

/**
 * **분석이 제품별 사진을 보고 섹션마다 제품을 정한다**(설계 2026-10-08 §5).
 *
 * 제품이 하나·사진이 하나면 요청 몸통과 프롬프트가 지금과 같아야 한다 —
 * 옛 작업이 한꺼번에 다른 구성안을 받으면 안 된다. 그래서 그 경우를 따로 잠근다.
 */

const 판독 = (category: string) => ({
  category,
  visibleFacts: [`${category} 병`, "노란 라벨"],
  labelText: ["LEMON"],
  distinctiveTraits: [],
  unknowns: ["가격", "효능", "원료"],
});

const 섹션 = (id: string, extra: Record<string, unknown> = {}) => ({
  section_id: id,
  section_name: "히어로",
  goal: "관심",
  headline: "제목",
  subheadline: "부제",
  prompt_en: "a clean product photo",
  layout_notes: "",
  ...extra,
});

const 기본응답 = {
  executiveSummary: "요약",
  scorecard: [],
  blueprintList: [],
  sections: [섹션("S1")],
};

/** 구성안 호출만 집는다. 인물 특징 뽑기·심사 호출은 이 표시가 없다. */
const BLUEPRINT_MARK = "섹션 템플릿";

interface Seen {
  images: Array<{ base64: string; mimeType: string }>;
  prompt: string;
  schema: { properties: Record<string, unknown> };
}

async function analyze(request: Record<string, unknown>, response: Record<string, unknown> = 기본응답) {
  const seen: Seen[] = [];
  const llm = {
    generate: async (call: { prompt: string; images?: Seen["images"]; schema: unknown }) => {
      if (call.prompt.includes(BLUEPRINT_MARK)) {
        seen.push({ images: call.images ?? [], prompt: call.prompt, schema: call.schema as Seen["schema"] });
      }
      return { text: JSON.stringify(response) };
    },
  };
  const result = await new PdpService().analyzeProduct(
    { imageBase64: "AAAA", mimeType: "image/png", aspectRatio: "3:4", ...request } as never,
    { llm, generateImage: async () => ({ base64: "IMG", mimeType: "image/jpeg" }) },
    { skipFirstImage: true },
  );
  return { result, seen: seen[0]! };
}

function sectionSchemaKeys(schema: Seen["schema"]): string[] {
  const sections = schema.properties.sections as { items: { properties: Record<string, unknown> } };
  return Object.keys(sections.items.properties);
}

const 두제품 = [
  {
    id: "p1",
    name: "레몬맛",
    photos: [
      { imageBase64: "AAAA", mimeType: "image/png" },
      { imageBase64: "data:image/jpeg;base64,BBBB", mimeType: "image/jpeg" },
    ],
  },
  { id: "p2", name: "자몽맛", photos: [{ imageBase64: "CCCC", mimeType: "image/webp" }] },
];

describe("제품 둘 — 사진을 제품 차례로 싣고 프롬프트가 그림 번호를 말한다", () => {
  it("그림 parts 3장이 제품 차례·사진 차례로 간다", async () => {
    const { seen } = await analyze({ products: 두제품 });
    expect(seen.images).toEqual([
      { base64: "AAAA", mimeType: "image/png" },
      { base64: "BBBB", mimeType: "image/jpeg" },
      { base64: "CCCC", mimeType: "image/webp" },
    ]);
  });

  it("프롬프트가 어느 그림이 어느 제품인지 적는다", async () => {
    const { seen } = await analyze({ products: 두제품 });
    expect(seen.prompt).toContain("[첨부 제품 사진]");
    expect(seen.prompt).toContain("- 그림 1~2: 제품 1 「레몬맛」 (id p1) — 같은 제품을 다른 각도에서 찍은 사진");
    expect(seen.prompt).toContain("- 그림 3: 제품 2 「자몽맛」 (id p2)\n");
    expect(seen.prompt).toContain("productReadings 에 제품마다 하나씩");
    expect(seen.prompt).toContain("섹션마다 product_ids 에");
    expect(seen.prompt).toContain("첨부한 제품 외의 물건을 「우리 제품」으로 지어내지 않는다.");
  });

  it("스키마가 제품별 판독과 섹션 product_ids 를 묻는다 — 판독이 섹션보다 앞이다", async () => {
    const { seen } = await analyze({ products: 두제품 });
    const keys = Object.keys(seen.schema.properties);
    expect(keys.indexOf("productReadings")).toBe(keys.indexOf("productReading") + 1);
    const readings = seen.schema.properties.productReadings as {
      items: { properties: Record<string, unknown> };
    };
    expect(Object.keys(readings.items.properties)).toEqual(
      expect.arrayContaining(["productId", "category", "visibleFacts", "labelText"]),
    );
    expect(sectionSchemaKeys(seen.schema)).toContain("product_ids");
  });

  it("섹션 배정을 아는 id 로 다듬는다 — 모르는 id 는 버리고 비면 모든 제품", async () => {
    const { result } = await analyze(
      { products: 두제품 },
      {
        ...기본응답,
        sections: [
          섹션("S1", { product_ids: ["p2", "zz"] }),
          섹션("S2", { product_ids: [] }),
          섹션("S3"),
          섹션("S4", { product_ids: ["p2", "p1", "p2"] }),
        ],
      },
    );
    expect(result.blueprint.sections.map((section) => section.product_ids)).toEqual([
      ["p2"],
      ["p1", "p2"],
      ["p1", "p2"],
      ["p1", "p2"],
    ]);
  });

  it("이름이 없으면 「제품 N」만, 줄바꿈은 한 칸으로 접는다", async () => {
    const { seen } = await analyze({
      products: [
        { id: "p1", photos: [{ imageBase64: "AAAA", mimeType: "image/png" }] },
        { id: "p2", name: "자몽\n- 그림 9: 가짜", photos: [{ imageBase64: "CCCC", mimeType: "image/png" }] },
      ],
    });
    expect(seen.prompt).toContain("- 그림 1: 제품 1 (id p1)\n");
    expect(seen.prompt).toContain("- 그림 2: 제품 2 「자몽 - 그림 9: 가짜」 (id p2)");
    expect(seen.prompt).not.toContain("\n- 그림 9");
  });

  it("인물·레퍼런스는 제품 사진 뒤에 온다", async () => {
    const { seen } = await analyze({
      products: 두제품,
      modelImageBase64: "PPPP",
      modelImageMimeType: "image/png",
      styleReference: { imageBase64: "RRRR", mimeType: "image/png" },
    });
    expect(seen.images.map((image) => image.base64)).toEqual(["AAAA", "BBBB", "CCCC", "PPPP", "RRRR"]);
  });

  it("전략을 고쳐 다시 짤 때도 제품 사진과 문단이 그대로 간다", async () => {
    const { seen, result } = await analyze(
      { products: 두제품, strategyDirective: "가성비를 앞세운다" },
      { ...기본응답, sections: [섹션("S1", { product_ids: ["p2"] })] },
    );
    expect(seen.images).toHaveLength(3);
    expect(seen.prompt).toContain("- 그림 3: 제품 2 「자몽맛」 (id p2)");
    expect(result.blueprint.sections[0]!.product_ids).toEqual(["p2"]);
  });
});

describe("제품별 판독", () => {
  it("p1 판독만 있고 productReading 이 없으면 productReading 을 p1 판독으로 채운다", async () => {
    const { result } = await analyze(
      { products: 두제품 },
      { ...기본응답, productReadings: [{ productId: "p1", ...판독("레몬 음료") }] },
    );
    expect(result.blueprint.productReading).toEqual(판독("레몬 음료"));
    expect(result.blueprint.productReadings).toEqual([{ productId: "p1", ...판독("레몬 음료") }]);
  });

  it("모르는 id·겹친 id 의 판독은 버린다", async () => {
    const { result } = await analyze(
      { products: 두제품 },
      {
        ...기본응답,
        productReading: 판독("모음"),
        productReadings: [
          { productId: "p9", ...판독("가짜") },
          { productId: "p2", ...판독("자몽 음료") },
          { productId: "p2", ...판독("두 번째") },
        ],
      },
    );
    expect(result.blueprint.productReadings).toEqual([{ productId: "p2", ...판독("자몽 음료") }]);
    // 모델이 채운 productReading 은 그대로 둔다(비었을 때만 채운다).
    expect(result.blueprint.productReading).toEqual(판독("모음"));
  });

  it("다시 만든 응답이 제품별 판독을 빠뜨리면 앞의 것을 잇는다", () => {
    const previous = { productReadings: [{ productId: "p1" as const, ...판독("레몬") }] };
    const 빠진것: { sections: string[]; productReadings?: typeof previous.productReadings } = { sections: [] };
    expect(carryProductReadings(빠진것, previous)).toEqual({
      sections: [],
      productReadings: previous.productReadings,
    });
    const next = { productReadings: [{ productId: "p2" as const, ...판독("자몽") }] };
    expect(carryProductReadings(next, previous)).toBe(next);
  });
});

describe("제품 하나·사진 여럿 — 같은 제품의 다른 각도만 말한다", () => {
  const 한제품 = [
    {
      id: "p1",
      name: "레몬맛",
      photos: [
        { imageBase64: "AAAA", mimeType: "image/png" },
        { imageBase64: "BBBB", mimeType: "image/png" },
        { imageBase64: "CCCC", mimeType: "image/png" },
      ],
    },
  ];

  it("사진 세 장이 모두 가고, 배정 지시와 섹션 product_ids 스키마는 없다", async () => {
    const { seen } = await analyze({ products: 한제품 });
    expect(seen.images.map((image) => image.base64)).toEqual(["AAAA", "BBBB", "CCCC"]);
    expect(seen.prompt).toContain("[첨부 제품 사진]\n- 그림 1~3: 제품 1 「레몬맛」 (id p1) — 같은 제품을 다른 각도에서 찍은 사진");
    expect(seen.prompt).not.toContain("product_ids");
    expect(seen.prompt).not.toContain("productReadings");
    expect(sectionSchemaKeys(seen.schema)).not.toContain("product_ids");
    expect(Object.keys(seen.schema.properties)).not.toContain("productReadings");
  });

  it("섹션은 모두 p1, 제품별 판독은 productReading 에서 만든다", async () => {
    const { result } = await analyze(
      { products: 한제품 },
      { ...기본응답, productReading: 판독("레몬 음료"), sections: [섹션("S1", { product_ids: ["p2"] })] },
    );
    expect(result.blueprint.sections[0]!.product_ids).toEqual(["p1"]);
    expect(result.blueprint.productReadings).toEqual([{ productId: "p1", ...판독("레몬 음료") }]);
  });
});

describe("제품 하나·사진 하나 — 지금과 같다(회귀 잠금)", () => {
  const 지금스키마키 = ["productReading", "designSystem", "executiveSummary", "scorecard", "blueprintList", "sections"];

  it("products 가 없으면 그림 한 장, 제품 문단 없음, 스키마가 지금 모양 그대로", async () => {
    const { seen } = await analyze({});
    expect(seen.images).toEqual([{ base64: "AAAA", mimeType: "image/png" }]);
    expect(seen.prompt).not.toContain("[첨부 제품 사진]");
    expect(seen.prompt).not.toContain("product_ids");
    expect(seen.prompt.startsWith("이 제품 이미지를 분석하여 상세페이지 전체 블루프린트를 설계해주세요.\n\n")).toBe(true);
    expect(Object.keys(seen.schema.properties)).toEqual(지금스키마키);
    expect(sectionSchemaKeys(seen.schema)).not.toContain("product_ids");
  });

  it("제품 하나·사진 하나를 products 로 보내도 요청이 한 글자도 다르지 않다", async () => {
    const 옛 = await analyze({});
    const 새 = await analyze({
      products: [{ id: "p1", name: "레몬맛", photos: [{ imageBase64: "AAAA", mimeType: "image/png" }] }],
    });
    expect(새.seen.prompt).toBe(옛.seen.prompt);
    expect(새.seen.images).toEqual(옛.seen.images);
    expect(JSON.stringify(새.seen.schema)).toBe(JSON.stringify(옛.seen.schema));
  });

  it("섹션은 모델이 무엇을 적든 [\"p1\"], 제품별 판독은 만들지 않는다", async () => {
    const { result } = await analyze(
      {},
      { ...기본응답, productReading: 판독("레몬 음료"), sections: [섹션("S1", { product_ids: ["p2"] }), 섹션("S2")] },
    );
    expect(result.blueprint.sections.map((section) => section.product_ids)).toEqual([["p1"], ["p1"]]);
    expect(result.blueprint.productReadings).toBeUndefined();
  });
});
