import { readFileSync } from "node:fs";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LandingPageBlueprint } from "@fixup/pdp-core";
// 캐릭터 고르기는 목록을 받은 뒤 next/link 를 그린다 — 브라우저 없이는 못 그린다. 칩과 상관없다.
vi.mock("../CharacterPicker", () => ({ CharacterPicker: () => null }));
vi.mock("../StyleReferenceAttach", () => ({ StyleReferenceAttach: () => null }));

import { ScenarioEditor } from "../ScenarioEditor";
import { createEmptySection } from "../scenario-sections";
import { productChips, toggleSectionProduct } from "../products";

/**
 * **구성안에서 섹션마다 나올 제품을 고른다**(설계 2026-10-08 §5).
 *
 * 제품이 둘 이상일 때만 칩이 보인다. 하나는 늘 켜져 있어야 한다 — 제품 사진 없이
 * 그리는 섹션은 없다. 배정이 없는 섹션은 모든 제품이 켜진 것으로 보인다.
 */

const 구성안 = (productIds?: string[]): LandingPageBlueprint => ({
  executiveSummary: "요약",
  scorecard: [],
  blueprintList: [],
  sections: [0, 1].map((index) => ({
    ...createEmptySection(index),
    section_id: `s${index + 1}`,
    section_name: `섹션 ${index + 1}`,
    ...(productIds ? { product_ids: productIds } : {}),
  })),
});

const 두제품 = [
  { id: "p1" as const, label: "레몬맛" },
  { id: "p2" as const, label: "제품 2" },
];

let renderer: ReactTestRenderer;
let 바뀐것: LandingPageBlueprint[];

const 띄운다 = async (blueprint: LandingPageBlueprint, products?: typeof 두제품) => {
  바뀐것 = [];
  await act(async () => {
    renderer = create(
      <ScenarioEditor
        blueprint={blueprint}
        products={products}
        styleReferenceEnabled={false}
        onStyleReferenceToggle={() => {}}
        onStyleReferenceAttached={() => {}}
        preserveProduct
        onPreserveProductChange={() => {}}
        characterAngles={[]}
        onCharacterChange={() => {}}
        attachmentIntents={{}}
        onIntentChange={() => {}}
        outputMode="editable"
        imageModel="gpt-image-2"
        isBusy={false}
        onChange={(next) => 바뀐것.push(next)}
        onModelChange={() => {}}
        onRegenerate={() => {}}
        onConfirm={() => {}}
      />,
    );
  });
};

const 칩들 = () => renderer.root.findAll((node) => node.type === "button" && node.props["data-product-chip"] !== undefined);

beforeEach(() => {
  // 끌어 놓기 막기가 창에 귀를 단다. 이 시험에는 창이 없다.
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  // 캐릭터·레퍼런스 고르기가 처음에 목록을 부른다. 칩과 상관없으므로 빈 답을 준다.
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ ok: true, characters: [], references: [] }), { status: 200 }));
});

afterEach(() => {
  if (renderer) act(() => renderer.unmount());
  vi.unstubAllGlobals();
});

describe("구성안의 제품 칩", () => {
  it("제품이 둘이면 섹션마다 칩 둘, 배정이 없으면 모두 켜져 있다", async () => {
    await 띄운다(구성안(), 두제품);
    const chips = 칩들();
    expect(chips).toHaveLength(4);
    expect(chips.map((chip) => chip.props["aria-pressed"])).toEqual([true, true, true, true]);
  });

  it("하나를 끄면 그 섹션의 product_ids 가 남은 하나다", async () => {
    await 띄운다(구성안(), 두제품);
    await act(async () => {
      칩들()[1]!.props.onClick();
    });
    expect(바뀐것).toHaveLength(1);
    expect(바뀐것[0]!.sections[0]!.product_ids).toEqual(["p1"]);
    // 다른 섹션은 그대로다.
    expect(바뀐것[0]!.sections[1]!.product_ids).toBeUndefined();
  });

  it("마지막 하나는 끌 수 없다 — 눌러도 그대로이고 aria-disabled 다", async () => {
    await 띄운다(구성안(["p2"]), 두제품);
    const [p1, p2] = 칩들();
    expect(p1!.props["aria-pressed"]).toBe(false);
    expect(p2!.props["aria-pressed"]).toBe(true);
    expect(p2!.props["aria-disabled"]).toBe(true);
    await act(async () => {
      p2!.props.onClick();
    });
    expect(바뀐것).toEqual([]);
  });

  it("꺼진 것을 켜면 제품 차례대로 둘 다", async () => {
    await 띄운다(구성안(["p2"]), 두제품);
    await act(async () => {
      칩들()[0]!.props.onClick();
    });
    expect(바뀐것[0]!.sections[0]!.product_ids).toEqual(["p1", "p2"]);
  });

  it("제품이 하나면(또는 안 넘기면) 칩이 없다", async () => {
    await 띄운다(구성안(), [두제품[0]!]);
    expect(칩들()).toHaveLength(0);
    act(() => renderer.unmount());
    await 띄운다(구성안());
    expect(칩들()).toHaveLength(0);
  });
});

describe("칩 판단(순수 함수)", () => {
  it("모르는 id 는 버리고, 비면 모두로 본다", () => {
    expect(toggleSectionProduct(["p1", "p2"], ["p9"], "p1")).toEqual(["p2"]);
    expect(toggleSectionProduct(["p1", "p2", "p3"], ["p3"], "p1")).toEqual(["p1", "p3"]);
  });

  it("사진이 있는 제품만 칩이 되고, 이름이 비면 「제품 N」", () => {
    const 사진 = { base64: "A", mimeType: "image/jpeg", previewUrl: "", fileName: "a.jpg" };
    expect(productChips([
      { id: "p1", name: "레몬맛", photos: [사진] },
      { id: "p2", name: "", photos: [사진] },
      { id: "p3", name: "빈칸", photos: [] },
    ])).toEqual([{ id: "p1", label: "레몬맛" }, { id: "p2", label: "제품 2" }]);
  });
});

describe("배선", () => {
  const 소스 = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

  it("사진 경로의 구성안은 제품을 넘기고, 글 경로는 넘기지 않는다", () => {
    const maker = 소스("PdpMakerClient.tsx");
    const scenario = maker.slice(maker.indexOf("<ScenarioEditor"), maker.indexOf("/>", maker.indexOf("onConfirm={() => {", maker.indexOf("<ScenarioEditor"))));
    expect(scenario).toContain("products={productChips(products)}");
    const text = 소스("TextModeFlow.tsx");
    const textScenario = text.slice(text.indexOf("<ScenarioEditor"), text.indexOf("/>", text.indexOf("onConfirm=", text.indexOf("<ScenarioEditor"))));
    expect(textScenario).not.toContain("products=");
  });
});
