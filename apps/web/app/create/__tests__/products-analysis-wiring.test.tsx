import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { savePdpDraft, deletePdpDraft, type PdpDraftInput } from "../pdp-drafts";
import { createSectionFor } from "../scenario-sections";
import { deletePdpDocument } from "../document-store";
import { productsKey, type PdpProductDraft } from "../products";

/**
 * **분석이 제품 칸을 모두 보고, 무엇을 봤는지 결과에 적는다**(설계 2026-10-08 §5, R10·R11).
 *
 * - 분석 요청에 `products` 가 실린다(제품 둘 이상·사진 둘 이상일 때).
 * - 분석이 끝나면 그때의 제품 목록 열쇠를 결과에 붙인다 — 편집기가 만들기 직전에 견준다.
 *   안 붙이면 여러 제품 작업은 늘 「구성안을 다시 만들어 주세요」에서 멈춘다.
 * - 제품 1 대표 사진이 없어도 다른 칸에 사진·이름이 있으면 빈 작업이 아니다.
 */
const captured = vi.hoisted(() => ({
  scenario: {} as Record<string, any>,
  editor: {} as Record<string, any>,
  bodies: [] as Array<{ path: string; body: string }>,
  search: new URLSearchParams("draft=products-draft"),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => captured.search }));
vi.mock("../../../lib/handoff", () => ({ peekHandoff: () => null, takeHandoff: () => null }));
vi.mock("../PdpEditor", () => ({
  PdpEditor: (props: Record<string, unknown>) => { captured.editor = props; return null; },
}));
vi.mock("../SavedImagePicker", () => ({ SavedImagePicker: () => null }));
vi.mock("../CharacterPicker", () => ({ CharacterPicker: () => null }));
vi.mock("../StyleReferenceAttach", () => ({ StyleReferenceAttach: () => null }));
vi.mock("../StyleReferenceCard", () => ({ StyleReferenceCard: () => null }));
vi.mock("../TextModeFlow", () => ({ TextModeFlow: () => null }));
vi.mock("../ScenarioEditor", () => ({
  ScenarioEditor: (props: Record<string, unknown>) => { captured.scenario = props; return null; },
}));
vi.mock("../pdp-utils", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../pdp-utils");
  return {
    ...actual,
    apiJson: async (path: string, init?: RequestInit) => {
      captured.bodies.push({ path, body: String(init?.body ?? "") });
      return {
        ok: true,
        result: {
          originalImage: "AAAA",
          blueprint: {
            executiveSummary: "다시 짠 전략", scorecard: [], blueprintList: [],
            sections: [{ ...createSectionFor([]), headline: "다시 짠 제목", product_ids: ["p2"] }],
          },
        },
        usage: null,
      };
    },
  };
});
import { PdpMakerClient } from "../PdpMakerClient";

const 사진 = (base64: string) => ({ base64, mimeType: "image/png", fileName: `${base64}.png`, previewUrl: `data:image/png;base64,${base64}` });
const 두제품: PdpProductDraft[] = [
  { id: "p1", name: "레몬맛", photos: [사진("AAAA"), 사진("BBBB")] },
  { id: "p2", name: "", photos: [사진("CCCC")] },
];

let renderer: ReactTestRenderer;
const flush = async () => {
  for (let i = 0; i < 8; i++) await act(async () => { await new Promise<void>((r) => setImmediate(r)); });
};
const 글자 = (node: { children: unknown[] }) =>
  node.children.filter((child): child is string => typeof child === "string").join("");

beforeEach(() => {
  captured.bodies.length = 0;
  captured.scenario = {};
  captured.editor = {};
  vi.stubGlobal("React", React);
  vi.stubGlobal("window", {
    addEventListener: vi.fn(), removeEventListener: vi.fn(), confirm: () => true, scrollTo: vi.fn(),
    setInterval: vi.fn(() => 1), clearInterval: vi.fn(),
  });
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => { queueMicrotask(cb); return 1; });
});
afterEach(async () => {
  if (renderer) act(() => renderer.unmount());
  vi.unstubAllGlobals();
  await deletePdpDraft("products-draft");
  await deletePdpDocument("products-draft");
});

const 초안 = (overrides: Partial<PdpDraftInput> = {}): PdpDraftInput => ({
  id: "products-draft", appState: "scenario",
  preparedImage: 사진("AAAA"),
  products: 두제품,
  modelImage: null, modelImageUsage: null,
  result: {
    originalImage: "AAAA",
    blueprint: {
      executiveSummary: "처음 전략", scorecard: [], blueprintList: [],
      sections: [{ ...createSectionFor([]), headline: "처음 제목" }],
    },
  },
  additionalInfo: "", desiredTone: "", aspectRatio: "3:4", notice: "", editorState: null,
  imageModel: "nano-banana", characterId: undefined, characterAngles: [], preserveProduct: true,
  ...overrides,
} as PdpDraftInput);

const 띄운다 = async (draft: PdpDraftInput) => {
  await savePdpDraft(draft);
  await act(async () => { renderer = create(<PdpMakerClient documentV3Enabled={false} />); });
  await flush();
};

describe("분석은 제품 칸을 모두 보고, 본 것을 결과에 적는다", () => {
  it("다시 짜는 요청에 두 제품의 사진이 모두 실린다", async () => {
    await 띄운다(초안());
    await act(async () => { captured.scenario.onReplanFromStrategy("두 맛을 비교하는 이야기"); });
    await flush();

    const 기획 = captured.bodies.find((call) => call.path === "/pdp/analyze");
    expect(기획, "기획 요청이 안 나갔다").toBeTruthy();
    const body = JSON.parse(기획!.body) as { products?: Array<{ id: string; name?: string; photos: unknown[] }> };
    expect(body.products?.map((product) => [product.id, product.name, product.photos.length])).toEqual([
      ["p1", "레몬맛", 2],
      ["p2", undefined, 1],
    ]);
  });

  it("분석이 끝나면 그때의 제품 열쇠가 결과에 붙어 편집기로 간다", async () => {
    await 띄운다(초안());
    await act(async () => { captured.scenario.onReplanFromStrategy("두 맛을 비교하는 이야기"); });
    await flush();
    // 구성안 화면의 칩은 사진이 있는 두 제품이다.
    expect(captured.scenario.products).toEqual([{ id: "p1", label: "레몬맛" }, { id: "p2", label: "제품 2" }]);

    await act(async () => { captured.scenario.onConfirm(); });
    await flush();
    expect(captured.editor.analyzedProductsKey).toBe(productsKey(두제품));
    expect(captured.editor.products).toEqual(두제품);
  });
});

describe("제품 칸만 채운 작업도 빈 작업이 아니다", () => {
  it("제품 1 대표 사진이 없어도 이름을 적은 칸이 있으면 「처음부터 다시」가 뜬다", async () => {
    await 띄운다(초안({
      appState: "upload",
      preparedImage: null,
      result: null,
      products: [{ id: "p1", name: "레몬맛", photos: [] }],
    }));
    const 다시 = renderer.root.findAll((node) => node.type === "button" && 글자(node as never).includes("처음부터 다시"));
    expect(다시.length).toBeGreaterThan(0);
  });

  it("임시저장 판단(hasDraftContent)도 제품 칸을 본다", () => {
    const maker = readFileSync(new URL("../PdpMakerClient.tsx", import.meta.url), "utf8");
    const line = maker.slice(maker.indexOf("const hasDraftContent"), maker.indexOf("\n", maker.indexOf("const hasDraftContent")));
    expect(line).toContain("hasProductContent(products)");
  });
});
