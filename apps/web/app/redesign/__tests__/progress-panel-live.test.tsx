import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RedesignWorkingStatus } from "../redesign-working";
import { describeRedesignProgress } from "../generation-progress";
import type { GenerationPlan } from "../redesign-model";

/**
 * **대기 표시가 실제로 무엇을 그리는가**(2026-09-22 재검토).
 *
 * 판단만 고치고 화면이 옛 값을 계속 그리면 아무것도 안 고친 것이다. 이
 * 저장소가 여러 번 겪은 함정이라 **띄워서 잰다.**
 *
 * **전체 화면 창은 위쪽 띠가 됐다**(2026-10-08 사용자 승인). 만드는 동안에도
 * 화면을 쓸 수 있게 한다. 창이 보이던 것(구간 수·진행률·걸린 시간·지금 하는 일·
 * 차감 안내·취소)은 띠에서 같은 값으로 잰다. 넘겨 보이던 상세페이지 팁만 뺐다.
 */

let renderer: ReactTestRenderer;

const 그려진것 = () => JSON.stringify(renderer.toJSON());

const 한장: GenerationPlan = { model: "openai", count: 1, startedAt: Date.now() };

const 띄운다 = async (
  progress: Parameters<typeof RedesignWorkingStatus>[0]["progress"],
  more: Partial<Parameters<typeof RedesignWorkingStatus>[0]> = {},
) => {
  await act(async () => {
    renderer = create(
      <RedesignWorkingStatus progress={progress} plan={한장} editing={false} transcribeCount={null} onStop={() => {}} {...more} />,
    );
  });
};

const 보기 = (input: Parameters<typeof describeRedesignProgress>[0]) => ({
  ...describeRedesignProgress(input),
  elapsedSeconds: input.elapsedSeconds,
});

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("window", { setInterval, clearInterval });
});

afterEach(() => {
  if (renderer) act(() => renderer.unmount());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("아는 구간", () => {
  /* 창은 「25%」 를 크게 썼다. 띠는 같은 값만큼 막대를 채운다. */
  it("**진행률만큼 막대를 채운다**", async () => {
    await 띄운다(보기({ phase: "transcribe", done: 3, total: 12, elapsedSeconds: 40 }), {
      transcribeCount: { done: 3, total: 12 },
    });

    const 채움 = renderer.root.findByProps({ "data-working-fill": "progress" });
    expect(채움.props.style.width).toBe("25%");
  });

  it("**몇 구간 중 몇인지 그린다**", async () => {
    await 띄운다(보기({ phase: "transcribe", done: 3, total: 12, elapsedSeconds: 40 }), {
      transcribeCount: { done: 3, total: 12 },
    });

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
    expect(renderer.root.findAll((node) => node.props["data-working-fill"] === "progress")).toHaveLength(0);
  });

  it("**무슨 일을 하는지는 그린다**", async () => {
    await 띄운다(보기({ phase: "generate", elapsedSeconds: 200, estimateSeconds: 90 }));

    expect(그려진것()).toContain("이미지 생성 중입니다");
  });

  /**
   * **막대가 멈춰 있으면 안 된다.** 퍼센트를 없앴다고 빈 막대를 두면 멈춘
   * 것처럼 보인다. 공통 띠의 흐르는 막대를 쓴다(창일 때는 `pdp-indeterminate`).
   */
  it("**흐르는 막대를 그린다**", async () => {
    await 띄운다(보기({ phase: "generate", elapsedSeconds: 200, estimateSeconds: 90 }));

    expect(그려진것(), "흐르는 막대가 없다").toContain("fixup-working-bar");
  });

  it("**예상을 넘기면 남은 시간을 말하지 않는다**", async () => {
    await 띄운다(보기({ phase: "generate", elapsedSeconds: 600, estimateSeconds: 90 }));

    const 글 = 그려진것();
    expect(글, "예상을 넘겼는데 아직 남았다고 한다").not.toContain("남음");
    expect(글).toContain("오래 걸리고");
  });

  it("**예상 안이면 남은 시간을 말한다**", async () => {
    await 띄운다(보기({ phase: "generate", elapsedSeconds: 30, estimateSeconds: 90 }));

    expect(그려진것()).toContain("1분 0초 남음");
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
      (node) => typeof node.props?.className === "string" && /\bbg-primary(?![-\w])/.test(node.props.className),
    );
    const 글자색 = 칸.map((node) => String(node.props.className)).filter((name) => /\btext-primary(?![-\w])/.test(name));

    expect(글자색, `배경과 같은 색으로 그린다: ${글자색.join(" | ")}`).toEqual([]);
  });

  it("**하는 일을 띠에 그린다**", async () => {
    await 띄운다(보기({ phase: "convert", elapsedSeconds: 3 }));

    expect(그려진것()).toContain("PNG");
  });
});

/**
 * **창이 아니라 띠다**(2026-10-08 사용자 승인).
 *
 * 전체 화면을 덮으면 만드는 동안 결과도, 다른 섹션도 볼 수 없었다.
 */
describe("위쪽 띠", () => {
  it("**화면 전체를 덮지 않는다**", async () => {
    await 띄운다(보기({ phase: "generate", elapsedSeconds: 3 }));

    expect(그려진것()).not.toContain("fixed inset-0");
    expect(renderer.root.findByProps({ role: "status" })).toBeTruthy();
  });

  it("**한 장이면 「리디자인 만드는 중입니다」**", async () => {
    await 띄운다(보기({ phase: "generate", elapsedSeconds: 3 }));

    expect(그려진것()).toContain("리디자인 만드는 중입니다");
  });

  it("**걸린 시간이 흐른다**", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T00:00:00Z"));
    vi.stubGlobal("window", { setInterval, clearInterval });
    await 띄운다(보기({ phase: "generate", elapsedSeconds: 0 }), {
      plan: { model: "openai", count: 1, startedAt: Date.now() },
    });
    act(() => { vi.advanceTimersByTime(65_000); });

    expect(그려진것()).toContain("1분 05초");
  });

  /* 창이 「성공 시 현재 요청에서 최대 N장 차감」을 말했다. 띠도 같은 말을 한다. */
  it("**모델과 최대 차감을 말한다**", async () => {
    await 띄운다(보기({ phase: "generate", elapsedSeconds: 3 }));

    const 글 = 그려진것();
    expect(글).toContain("정밀형");
    expect(글).toContain("성공 시 현재 요청에서 최대");
  });

  it("**정밀형이 2분을 넘기면 늦어질 수 있다고 말한다**", async () => {
    await 띄운다(보기({ phase: "generate", elapsedSeconds: 130, estimateSeconds: 600 }));

    expect(그려진것()).toContain("2분 이상 걸릴 수 있습니다");
  });
});

/**
 * **여러 장이면 몇 장 끝났는지 센다.**
 *
 * 창은 「8장 중 3번째 이미지 생성중입니다」라고 했다. 띠는 끝난 장 수(2/8장)와
 * 채워지는 막대로 같은 것을 말한다.
 */
describe("여러 장", () => {
  it("**장 수와 끝난 장을 그린다**", async () => {
    await 띄운다(보기({ phase: "generate", elapsedSeconds: 3 }), {
      plan: { model: "google", count: 1, displayCount: 8, displayIndex: 3, startedAt: Date.now() },
    });

    const 글 = 그려진것();
    expect(글).toContain("8장 만드는 중입니다");
    expect(글).toContain("2/8장");
    expect(renderer.root.findByProps({ "data-working-fill": "progress" }).props.style.width).toBe("25%");
  });
});

describe("섹션 수정", () => {
  /* 수정은 원본을 다시 읽지 않는다. 지난 생성의 구간 이름(「PNG 로 바꾸는 중」)을 띄우면 거짓말이다. */
  it("**「섹션 고치는 중입니다」이고 생성 구간 이름을 띄우지 않는다**", async () => {
    await 띄운다(보기({ phase: "convert", elapsedSeconds: 3 }), { editing: true });

    const 글 = 그려진것();
    expect(글).toContain("섹션 고치는 중입니다");
    expect(글).not.toContain("PNG");
  });
});

/**
 * **취소는 띠의 「중지」다.** 창의 「요청 취소」와 같은 손잡이(`cancelGeneration`)를
 * 부른다 — 그 손잡이가 요청을 끊는다(`AbortController.abort()`).
 */
describe("중지", () => {
  it("**누르면 받은 손잡이를 부른다**", async () => {
    const 멈춤 = vi.fn();
    await 띄운다(보기({ phase: "generate", elapsedSeconds: 3 }), { onStop: 멈춤 });

    const 단추 = renderer.root.findAll((node) => node.type === "button" && node.children.includes("중지"));
    expect(단추).toHaveLength(1);
    act(() => { 단추[0]!.props.onClick(); });
    expect(멈춤).toHaveBeenCalledTimes(1);
  });

  it("**이미 보낸 요청의 비용 안내를 함께 그린다**", async () => {
    await 띄운다(보기({ phase: "generate", elapsedSeconds: 3 }));

    expect(그려진것()).toContain("이미 보낸 요청의 비용은 나갈 수 있습니다");
  });
});
