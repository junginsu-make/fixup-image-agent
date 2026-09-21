import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PAGE_GOAL, DEFAULT_PRODUCT_KIND, PRODUCT_KINDS } from "@fixup/pdp-core";
import { TextBriefInput } from "../TextBriefInput";

/**
 * **글로 시작한다고 무형이 아니다**(K-08).
 *
 * 전에는 상품 종류를 묻는 칸이 **아예 없었다.** 글 입력 경로의 프롬프트가
 * 「무형 상품이다. 만질 수 있는 제품 사진을 전제하지 마라」로 못 박혀 있어,
 * 사진이 없을 뿐인 실물을 파는 사람은 제품 자리에 은유가 들어간 페이지를
 * 돌려받았다.
 *
 * 설계 §9.1: 「이미지/텍스트는 **입력 방식**이다. 실물/서비스/디지털/기타와
 * 판매/문의/홍보 목적은 **별도로 받는다.**」
 *
 * 소스로는 「칸이 있다」밖에 못 잰다. 띄워서 **눌러** 본다.
 */

let renderer: ReactTestRenderer;
const 고른것: string[] = [];

beforeEach(() => {
  고른것.length = 0;
  vi.stubGlobal("React", React);
});
afterEach(() => {
  if (renderer) act(() => renderer.unmount());
  vi.unstubAllGlobals();
});

const 그리기 = (over: Record<string, unknown> = {}) => {
  act(() => {
    renderer = create(
      <TextBriefInput
        value="비누를 팝니다"
        copyIntensity="normal"
        gapPolicy="ask"
        isBusy={false}
        productKind={DEFAULT_PRODUCT_KIND}
        pageGoal={DEFAULT_PAGE_GOAL}
        onChange={() => {}}
        onCopyIntensityChange={() => {}}
        onGapPolicyChange={() => {}}
        onProductKindChange={(kind) => 고른것.push(kind)}
        onPageGoalChange={(goal) => 고른것.push(goal)}
        onSubmit={() => {}}
        {...over}
      />,
    );
  });
};

/**
 * 그 표식이 달린 단추. 글자로 찾으면 트리 직렬화가 순환으로 터진다.
 *
 * **부품 쪽 노드를 집는다.** `Button` 은 `variant` 를 className 으로 바꿔
 * 내리므로, DOM 쪽 `button` 에는 그 값이 없다.
 */
const 단추 = (attr: string, value: string) =>
  renderer.root.findAll((node) => node.props?.[attr] === value && node.type !== "button")[0]
  ?? renderer.root.findAll((node) => node.props?.[attr] === value)[0];

describe("무엇을 파는지 묻는다", () => {
  it.each(PRODUCT_KINDS.map((kind) => [kind]))("**%s 를 고를 수 있다**", (kind) => {
    그리기();

    expect(단추("data-product-kind", kind), `${kind} 단추가 없다`).toBeTruthy();
  });

  it("**고르면 위로 올린다**", () => {
    그리기();

    act(() => 단추("data-product-kind", "physical").props.onClick());

    expect(고른것).toEqual(["physical"]);
  });

  /**
   * **고른 것이 눌려 보여야 한다.** 안 그러면 사용자는 골랐는지 모르고 다시
   * 누른다.
   */
  it("**고른 것이 눌린 모양이다**", () => {
    그리기({ productKind: "physical" });

    expect(단추("data-product-kind", "physical").props.variant).toBe("default");
    expect(단추("data-product-kind", "service").props.variant).toBe("outline");
  });
});

describe("무엇을 하려는지도 묻는다", () => {
  it("**세 가지를 고를 수 있다**", () => {
    그리기();

    for (const goal of ["purchase", "inquiry", "promotion"]) {
      expect(단추("data-page-goal", goal), `${goal} 단추가 없다`).toBeTruthy();
    }
  });

  it("고르면 위로 올린다", () => {
    그리기();

    act(() => 단추("data-page-goal", "inquiry").props.onClick());

    expect(고른것).toEqual(["inquiry"]);
  });
});

/**
 * **본보기가 셋 다 무형이면 실물을 파는 사람은 이 길이 자기 것이 아니라고
 * 읽는다.** 칸을 만들어 두고 본보기로 반대 신호를 보내면 소용이 없다.
 */
describe("본보기가 한쪽으로 기울지 않는다", () => {
  it("**실물 본보기가 있다**", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("../TextBriefInput.tsx", import.meta.url), "utf8");
    const 본보기 = source.slice(source.indexOf("const EXAMPLES"), source.indexOf("];", source.indexOf("const EXAMPLES")));

    // 만질 수 있는 것이 하나는 있어야 한다.
    expect(본보기).toMatch(/비누|가방|의자|화분|양초/);
  });
});

/**
 * **화면이 그 값을 실제로 보내는가**(K-08).
 *
 * 칩을 만들고 상태에 담아도 **요청에 안 실으면** 서버는 모른다. 변이로
 * 확인했다 — 두 줄을 빼도 다른 시험은 전부 통과했다.
 *
 * `TextModeFlow` 는 초안 저장·핸드오프까지 들고 있어 띄우는 값이 크다. 그래서
 * **덩이로 잘라서** 본다 — 두 글자를 따로 찾으면 엉뚱한 자리에 있어도 통과한다.
 */
describe("글 모드가 고른 값을 실어 보낸다", () => {
  it("**기획 요청 본문에 실린다**", async () => {
    const { readFileSync } = await import("node:fs");
    const flow = readFileSync(new URL("../TextModeFlow.tsx", import.meta.url), "utf8");
    const 요청 = flow.slice(flow.indexOf('"/pdp/plan-from-text"'));

    expect(요청.slice(0, 500)).toContain("productKind,");
    expect(요청.slice(0, 500)).toContain("pageGoal,");
  });

  it("**부품에 내려준다** — 상태만 들고 안 내리면 칸이 안 움직인다", async () => {
    const { readFileSync } = await import("node:fs");
    const flow = readFileSync(new URL("../TextModeFlow.tsx", import.meta.url), "utf8");
    const 부품 = flow.slice(flow.indexOf("<TextBriefInput"));

    expect(부품.slice(0, 400)).toContain("onProductKindChange={setProductKind}");
    expect(부품.slice(0, 400)).toContain("onPageGoalChange={setPageGoal}");
  });
});
