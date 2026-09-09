import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 두 라우트가 **같은 옵션을 만든다**는 것을 값으로 잰다.
 *
 * `app/api/pdp/` 에는 시험이 하나도 없었다. 그래서 이런 것이 안 잡혔다.
 *
 *   일괄 라우트가 인물 사진을 받는 자리조차 없었다
 *   일괄 라우트가 `withModel: false` 를 박아 캐릭터를 붙여 놓고 모순을 만들었다
 *   단건 라우트가 장을 모델과 무관하게 1 로 셌다
 *
 * 보는 것은 **무엇이 `generateSectionImage` 로 넘어가는지**다. 「같은 함수를
 * 쓴다」를 문자열로 대조하면 안이 뒤집혀도 통과한다.
 */

vi.mock("server-only", () => ({}));

type Captured = { section: { section_id: string }; options: Record<string, unknown> };
const calls: Captured[] = [];
const reserved: number[] = [];
const finalized: Array<{ success: boolean; units: number }> = [];

vi.mock("@fixup/pdp-core", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@fixup/pdp-core");
  return {
    ...actual,
    generateSectionImage: async (request: Captured) => {
      calls.push(request);
      return { imageBase64: "IMG", mimeType: "image/png", generatedImages: 1, qa: undefined };
    },
  };
});

vi.mock("../../../../lib/membership/api", () => ({
  reserveAiUsage: async (_req: Request, _op: string, units: number) => {
    reserved.push(units);
    return { ok: true as const, userId: "u1", requestId: "r1", usage: {} };
  },
  finalizeAiUsage: async (_r: unknown, success: boolean, units: number) => {
    finalized.push({ success, units });
    return {};
  },
}));

vi.mock("../../../../lib/evidence-gate", () => ({ rejectIfUnverified: () => null }));
vi.mock("../../../../lib/pdp/providers", () => ({
  createPdpProviders: () => ({
    llm: { generate: async () => ({ text: "{}" }) },
    generateImage: async () => ({ base64: "IMG", mimeType: "image/jpeg" }),
  }),
}));
vi.mock("../../../../lib/teams/store", () => ({ teamIdOf: async () => null }));

let character: { base64: string; mimeType: string; identityPrompt: string } | null = null;
vi.mock("../../../../lib/characters", () => ({
  loadCharacterView: async () => character,
}));

const { POST: single } = await import("../images/route");
const { POST: batch } = await import("../images/batch/route");

const section = (id: string) => ({
  section_id: id,
  headline: "제목",
  subheadline: "부제",
  prompt_en: "a clean product photo",
  layout_notes: "",
});

const 인물사진 = { imageBase64: "PERSON", mimeType: "image/png", fileName: "p.png" };

const post = (body: unknown) =>
  new Request("http://localhost/api/pdp/images", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  calls.length = 0;
  reserved.length = 0;
  finalized.length = 0;
  character = null;
});

describe("일괄 생성도 인물 사진을 받는다", () => {
  it("「전 섹션」이면 두 섹션 모두에 사진이 실린다", async () => {
    await batch(
      post({
        originalImageBase64: "AAAA",
        sections: [section("s1"), section("s2")],
        sectionIndexes: [0, 1],
        aspectRatio: "3:4",
        page: {
          imageModel: "nano-banana",
          referenceModel: 인물사진,
          referenceModelUsage: "all-sections",
        },
      }),
    );

    expect(calls).toHaveLength(2);
    expect(calls.map((c) => c.options.referenceModelImageBase64)).toEqual(["PERSON", "PERSON"]);
    expect(calls.map((c) => c.options.withModel)).toEqual([true, true]);
  });

  it("「첫 섹션만」이면 히어로에만 실린다 — 자리는 묶음 순서가 아니라 페이지 순서다", async () => {
    await batch(
      post({
        originalImageBase64: "AAAA",
        sections: [section("s4"), section("s5")],
        // 두 번째 묶음이다. 묶음 안에서는 0번이지만 페이지에서는 히어로가 아니다.
        sectionIndexes: [3, 4],
        aspectRatio: "3:4",
        page: {
          imageModel: "nano-banana",
          referenceModel: 인물사진,
          referenceModelUsage: "hero-only",
        },
      }),
    );

    expect(calls.map((c) => c.options.referenceModelImageBase64)).toEqual([undefined, undefined]);
    expect(calls.map((c) => c.options.withModel)).toEqual([false, false]);
  });
});

describe("캐릭터를 붙이면 장면 지시도 사람을 요구한다", () => {
  it("일괄에서 캐릭터가 붙으면 withModel 이 참이다", async () => {
    character = { base64: "CHAR", mimeType: "image/png", identityPrompt: "같은 사람" };
    await batch(
      post({
        originalImageBase64: "AAAA",
        sections: [section("s1")],
        aspectRatio: "3:4",
        characterId: "c1",
        page: { imageModel: "nano-banana" },
      }),
    );

    expect(calls[0]!.options.characterReference).toEqual(character);
    expect(calls[0]!.options.withModel).toBe(true);
  });
});

describe("두 라우트가 같은 옵션을 만든다", () => {
  const page = {
    imageModel: "nano-banana",
    outputMode: "full-image",
    look: "anime",
    userInstruction: "밤 장면으로",
    preserveProduct: false,
    styleReference: { imageBase64: "REF", mimeType: "image/png", description: "참고" },
    referenceModel: 인물사진,
    referenceModelUsage: "all-sections",
  };

  it("같은 입력이면 만들어진 옵션이 똑같다", async () => {
    await single(
      post({
        originalImageBase64: "AAAA",
        section: section("s1"),
        aspectRatio: "3:4",
        sectionIndex: 0,
        page,
      }),
    );
    const 단건 = calls[0]!.options;

    calls.length = 0;
    await batch(
      post({
        originalImageBase64: "AAAA",
        sections: [section("s1")],
        sectionIndexes: [0],
        aspectRatio: "3:4",
        page,
      }),
    );
    const 일괄 = calls[0]!.options;

    expect(일괄).toEqual(단건);
    expect(단건.styleReferenceImages).toEqual([
      { base64: "REF", mimeType: "image/png", description: "참고" },
    ]);
    expect(단건.look).toBe("anime");
    expect(단건.userInstruction).toBe("밤 장면으로");
    expect(단건.preserveProductImage).toBe(false);
  });
});

describe("장은 두 라우트가 같은 규칙으로 센다", () => {
  it("단건도 모델 단가로 예약한다 — 무조건 1 이 아니다", async () => {
    await single(
      post({
        originalImageBase64: "AAAA",
        section: section("s1"),
        aspectRatio: "3:4",
        page: { imageModel: "gpt-image-2" },
      }),
    );

    expect(reserved).toHaveLength(1);
    expect(reserved[0]!).toBeGreaterThan(1);
    expect(finalized[0]).toEqual({ success: true, units: reserved[0]! });
  });

  it("싼 모델은 적게 잡는다", async () => {
    await single(
      post({
        originalImageBase64: "AAAA",
        section: section("s1"),
        aspectRatio: "3:4",
        page: { imageModel: "nano-banana" },
      }),
    );
    const 싼모델 = reserved[0]!;

    reserved.length = 0;
    await single(
      post({
        originalImageBase64: "AAAA",
        section: section("s1"),
        aspectRatio: "3:4",
        page: { imageModel: "gpt-image-2" },
      }),
    );

    expect(reserved[0]!).toBeGreaterThan(싼모델);
  });
});

/**
 * 몸통에 실은 자리별 지시가 **생성 옵션까지** 남는가.
 *
 * 독립 리뷰가 이 구간에 시험이 없다고 짚었다 — 운반 한 줄을 지워도 전부
 * 통과했다. 조용하고, 타입도 통과하고, 돈은 나간다.
 */
describe("자리별 지시가 라우트를 지나 생성까지 간다", () => {
  const intents = { anchor: "라벨 그대로", person: "안경", style: "색만 가져와" };

  it("단건", async () => {
    await single(
      post({
        originalImageBase64: "AAAA",
        section: section("s1"),
        aspectRatio: "3:4",
        page: { imageModel: "nano-banana", attachmentIntents: intents },
      }),
    );
    expect(calls[0]!.options.attachmentIntents).toEqual(intents);
  });

  it("일괄 — 묶음의 모든 섹션이 같은 지시를 받는다", async () => {
    await batch(
      post({
        originalImageBase64: "AAAA",
        sections: [section("s1"), section("s2")],
        sectionIndexes: [0, 1],
        aspectRatio: "3:4",
        page: { imageModel: "nano-banana", attachmentIntents: intents },
      }),
    );
    expect(calls.map((c) => c.options.attachmentIntents)).toEqual([intents, intents]);
  });

  it("안 보내면 없다", async () => {
    await single(
      post({
        originalImageBase64: "AAAA",
        section: section("s1"),
        aspectRatio: "3:4",
        page: { imageModel: "nano-banana" },
      }),
    );
    expect(calls[0]!.options.attachmentIntents).toBeUndefined();
  });
});
