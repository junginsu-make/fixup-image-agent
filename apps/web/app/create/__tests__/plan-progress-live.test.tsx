import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **기다리는 사람이 「검수 중」을 실제로 보는가**(2026-09-22 사용자 요청).
 *
 * ── 왜 실측인가 ────────────────────────────────────────────
 *
 * 이 저장소는 「부품은 도는데 화면이 안 그리는」 사고를 여러 번 겪었다. 단계
 * 이름을 코어가 만들고 서버가 들고 있어도, **화면이 안 물어보면** 사용자에게는
 * 아무 일도 안 일어난다.
 *
 * 그래서 진짜 컴포넌트를 띄우고, 서버 답을 바꿔 가며 **그려진 글자**를 본다.
 */

const captured = vi.hoisted(() => ({
  asked: [] as string[],
  stage: null as unknown,
}));

vi.mock("../pdp-utils", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    apiJson: async (path: string) => {
      captured.asked.push(path);
      return { ok: true, stage: captured.stage };
    },
  };
});

import { PlanProgress } from "../PlanProgress";

let renderer: ReactTestRenderer;

const 그려진글 = () => JSON.stringify(renderer.toJSON());

const 가라앉힌다 = async () => {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
};

const 띄운다 = async (progressId = "plan-00000001") => {
  await act(async () => {
    renderer = create(<PlanProgress progressId={progressId} fallback="확인하는 중입니다." />);
  });
  await 가라앉힌다();
};

beforeEach(() => {
  captured.asked.length = 0;
  captured.stage = null;
  vi.stubGlobal("window", {
    setInterval: vi.fn(() => 1),
    clearInterval: vi.fn(),
  });
});

afterEach(() => {
  if (renderer) act(() => renderer.unmount());
  vi.unstubAllGlobals();
});

describe("서버에 실제로 물어본다", () => {
  it("**번호를 실어 물어본다**", async () => {
    await 띄운다("plan-abcdef12");

    expect(captured.asked.some((path) => path.includes("/pdp/analyze/progress"))).toBe(true);
    expect(captured.asked.some((path) => path.includes("plan-abcdef12"))).toBe(true);
  });

  it("**번호가 없으면 안 물어본다** — 물어도 답할 것이 없다", async () => {
    await 띄운다("");

    expect(captured.asked).toEqual([]);
  });
});

describe("무엇을 하고 있는지 말한다", () => {
  it("**검수 중이면 검수 중이라고 쓴다**", async () => {
    captured.stage = "review";
    await 띄운다();

    expect(그려진글(), "검수라는 말이 화면에 없다").toContain("검수");
  });

  it("**구성안을 짜는 중이면 그렇게 쓴다**", async () => {
    captured.stage = "blueprint";
    await 띄운다();

    expect(그려진글()).toContain("구성안을 짜는 중입니다");
  });

  /**
   * **차례표가 있어야 얼마나 남았는지 보인다.** 한 줄만 바뀌면 「지금 뭘
   * 하는지」는 알아도 「얼마나 남았는지」는 여전히 모른다.
   */
  it("**앞으로 지날 자리도 함께 보인다**", async () => {
    captured.stage = "blueprint";
    await 띄운다();

    const 글 = 그려진글();
    expect(글, "검수 자리가 차례표에 없다").toContain("구성안 검수");
    expect(글, "마무리 자리가 차례표에 없다").toContain("마무리");
  });
});

/**
 * **안 하는 일을 미리 보여 주지 않는다.**
 *
 * 고쳐 쓰기는 심사가 지적했을 때만 일어난다. 미리 차례표에 걸어 두면 통과한
 * 사람은 「왜 저건 안 했지」 하고 뭔가 잘못된 줄 안다.
 */
describe("건너뛸 수 있는 자리", () => {
  it("**아직 안 들어갔으면 차례표에 없다**", async () => {
    captured.stage = "review";
    await 띄운다();

    expect(그려진글()).not.toContain("고쳐 쓰기");
  });

  it("**실제로 시작하면 차례표에 낀다**", async () => {
    captured.stage = "revise";
    await 띄운다();

    expect(그려진글()).toContain("고쳐 쓰기");
  });
});

/**
 * **모르면 지어내지 않는다.**
 *
 * 서버가 아직 첫 자리를 안 찍었거나, 여러 대로 늘어 다른 프로세스가 답했거나,
 * 물음 자체가 실패할 수 있다. 그때는 부르는 쪽이 준 한 줄이 그대로 남는다.
 */
describe("모를 때", () => {
  it("**단계를 모르면 받은 한 줄을 그대로 둔다**", async () => {
    captured.stage = null;
    await 띄운다();

    const 글 = 그려진글();
    expect(글).toContain("확인하는 중입니다");
    expect(글, "모르는데 차례표를 그렸다").not.toContain("구성안 검수");
  });

  it("**모르는 이름이 오면 안 믿는다**", async () => {
    captured.stage = "검수중";
    await 띄운다();

    expect(그려진글()).toContain("확인하는 중입니다");
  });
});
