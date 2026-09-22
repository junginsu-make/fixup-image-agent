import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it } from "vitest";
import { GenerationProgressPanel } from "../redesign-results";
import { describeRedesignProgress } from "../generation-progress";

/**
 * **대기 화면이 실제로 무엇을 그리는가**(2026-09-22 재검토).
 *
 * 판단만 고치고 화면이 옛 값을 계속 그리면 아무것도 안 고친 것이다. 이
 * 저장소가 여러 번 겪은 함정이라 **띄워서 잰다.**
 */

let renderer: ReactTestRenderer;

const 그려진것 = () => JSON.stringify(renderer.toJSON());

const 띄운다 = async (progress: Parameters<typeof GenerationProgressPanel>[0]["progress"]) => {
  await act(async () => {
    renderer = create(
      <GenerationProgressPanel
        progress={progress}
        modelLabel="정밀형"
        count={1}
        currentIndex={1}
        onCancel={() => {}}
      />,
    );
  });
};

const 보기 = (input: Parameters<typeof describeRedesignProgress>[0]) => ({
  ...describeRedesignProgress(input),
  elapsedSeconds: input.elapsedSeconds,
  tip: "도움말",
});

afterEach(() => {
  if (renderer) act(() => renderer.unmount());
});

describe("아는 구간", () => {
  it("**퍼센트를 그린다**", async () => {
    await 띄운다(보기({ phase: "transcribe", done: 3, total: 12, elapsedSeconds: 40 }));

    expect(그려진것()).toContain("25%");
  });

  it("**몇 구간 중 몇인지 그린다**", async () => {
    await 띄운다(보기({ phase: "transcribe", done: 3, total: 12, elapsedSeconds: 40 }));

    expect(그려진것()).toContain("3/12");
  });
});

/**
 * **모르는 구간에는 숫자가 안 나온다.**
 *
 * 전에는 경과 시간으로 만든 퍼센트가 늘 크게 떠 있었다. 그 숫자가 사라졌는지
 * 실제로 본다 — 계산만 고치고 화면이 계속 그리면 소용이 없다.
 */
describe("모르는 구간", () => {
  it("**퍼센트를 안 그린다**", async () => {
    await 띄운다(보기({ phase: "generate", elapsedSeconds: 200, estimateSeconds: 90 }));

    expect(그려진것(), "모르는데 퍼센트를 그렸다").not.toMatch(/\d+%/);
  });

  it("**무슨 일을 하는지는 그린다**", async () => {
    await 띄운다(보기({ phase: "generate", elapsedSeconds: 200, estimateSeconds: 90 }));

    expect(그려진것()).toContain("이미지 생성 중입니다");
  });

  /**
   * **막대가 멈춰 있으면 안 된다.** 퍼센트를 없앴다고 빈 막대를 두면 멈춘
   * 것처럼 보인다. 상세페이지와 같은 왕복 막대를 쓴다.
   */
  it("**흐르는 막대를 그린다**", async () => {
    await 띄운다(보기({ phase: "generate", elapsedSeconds: 200, estimateSeconds: 90 }));

    expect(그려진것(), "왕복 막대가 없다").toContain("pdp-indeterminate");
  });

  it("**예상을 넘기면 남은 시간을 말하지 않는다**", async () => {
    await 띄운다(보기({ phase: "generate", elapsedSeconds: 600, estimateSeconds: 90 }));

    const 글 = 그려진것();
    expect(글, "예상을 넘겼는데 아직 남았다고 한다").not.toContain("남음");
    expect(글).toContain("오래 걸리고");
  });
});

/**
 * **단계 이름이 눈에 보여야 한다.**
 *
 * 그 칸은 `bg-primary` 위에 `text-primary` 였다. 분홍 위의 분홍이라 통째로
 * 빈 칸으로 보였다.
 */
describe("단계 이름", () => {
  it("**배경과 다른 색으로 그린다**", async () => {
    await 띄운다(보기({ phase: "convert", elapsedSeconds: 3 }));

    const 칸 = renderer.root.findAll(
      (node) => typeof node.props?.className === "string" && node.props.className.includes("bg-primary"),
    );
    const 글자색 = 칸.map((node) => String(node.props.className)).filter((name) => /\btext-primary(?![-\w])/.test(name));

    expect(글자색, `배경과 같은 색으로 그린다: ${글자색.join(" | ")}`).toEqual([]);
  });

  it("**하는 일을 그 칸에 그린다**", async () => {
    await 띄운다(보기({ phase: "convert", elapsedSeconds: 3 }));

    expect(그려진것()).toContain("PNG");
  });
});
