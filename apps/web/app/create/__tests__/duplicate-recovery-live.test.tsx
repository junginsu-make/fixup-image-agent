import "fake-indexeddb/auto";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSectionFor } from "../scenario-sections";

/**
 * **같은 요청이 막히면 편집기가 실제로 알리는가**(K-05).
 *
 * 설계 §14.5(E-6-2-b): 처리는 「header 만 아닌 **동일 결과 회수**」.
 *
 * ── 왜 이 파일이 생겼나 ────────────────────────────────────
 *
 * 처음에는 「편집기가 `shouldRecoverAfter` 를 부르는가」를 **소스 문자열로**
 * 쟀다. 편집기가 2,800줄이라 못 띄운다고 보았기 때문이다.
 *
 * **그 판단이 틀렸다.** 리뷰가 실측으로 보여 주었다 — 필수 prop 여섯과
 * `window` 스텁 하나면 진짜 편집기가 뜬다. 그리고 소스 시험으로는 배선을
 * **통째로 끊어도 636건이 전부 초록**이었다. 조건을 뒤집거나, 호출을 성공
 * 가지로 옮기거나, 엉뚱한 값을 넘겨도 마찬가지다.
 *
 * 그래서 눌러 본다.
 */

const captured = vi.hoisted(() => ({
  calls: 0,
  asked: [] as string[],
  answer: null as unknown,
}));

vi.mock("../pdp-utils", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    apiJson: async (path: string) => {
      captured.asked.push(path);
      return captured.answer;
    },
  };
});

import { PdpEditor } from "../PdpEditor";

const 섹션 = createSectionFor([]);

const 결과 = {
  originalImage: "AAAA",
  blueprint: {
    executiveSummary: "요약",
    scorecard: [],
    blueprintList: [],
    sections: [{ ...섹션, headline: "첫 장" }],
  },
} as never;

let renderer: ReactTestRenderer;

/** 단추 라벨은 조각나 있다. 글자 자식을 이어 붙여야 잡힌다. */
const 글자 = (node: { children: unknown[] }) =>
  node.children.filter((child): child is string => typeof child === "string").join("");

const 단추 = (말: string) =>
  renderer.root.findAll((node) => node.type === "button" && 글자(node as never).includes(말));

const 띄운다 = async (extra: Record<string, unknown> = {}) => {
  await act(async () => {
    renderer = create(
      <PdpEditor
        initialResult={결과}
        characterAngles={[]}
        aspectRatio="3:4"
        desiredTone=""
        onReset={() => {}}
        onSectionsChange={() => {}}
        onDuplicateRequest={() => { captured.calls += 1; }}
        {...extra}
      />,
    );
  });
};

/** 화면에 그려진 글자만 훑는다. `children` 을 통째로 JSON 으로 만들면 순환 참조로 터진다. */
const 그려진글 = () => JSON.stringify(renderer.toJSON());

const 가라앉힌다 = async () => {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => { await new Promise<void>((resolve) => setTimeout(resolve, 0)); });
  }
};

beforeEach(() => {
  captured.calls = 0;
  captured.asked.length = 0;
  captured.answer = { ok: false, code: "duplicate_request", message: "막혔다" };
  // 경과 시간 표시가 `window.setInterval` 을 쓴다. 없으면 마운트가 터진다.
  vi.stubGlobal("window", {
    addEventListener: vi.fn(), removeEventListener: vi.fn(), confirm: () => true,
    scrollTo: vi.fn(), setInterval: vi.fn(() => 1), clearInterval: vi.fn(),
  });
});

afterEach(() => {
  if (renderer) act(() => renderer.unmount());
  vi.unstubAllGlobals();
});

describe("일괄 생성이 중복으로 막히면", () => {
  it("**되찾으러 가라고 알린다**", async () => {
    await 띄운다();

    const 만들기 = 단추("남은 1장 만들기");
    expect(만들기[0], "일괄 만들기 단추를 못 찾았다").toBeTruthy();

    await act(async () => { 만들기[0]!.props.onClick(); });
    await 가라앉힌다();

    expect(captured.asked).toContain("/pdp/images/batch");
    expect(captured.calls).toBe(1);
  });

  /**
   * **중복일 때만이다.** 한도 초과나 공급자 장애는 만들어진 것이 없다 —
   * 그때 되찾으러 가면 값 없는 질의만 늘고 사용자에게는 아무 일도 안 일어난다.
   */
  it.each([
    ["quota_exceeded", "한도를 다 썼다"],
    ["AI_PROVIDER_UNAVAILABLE", "공급자가 죽었다"],
  ])("**%s 에는 안 알린다** — %s", async (code) => {
    captured.answer = { ok: false, code, message: "막혔다" };

    await 띄운다();
    await act(async () => { 단추("남은 1장 만들기")[0]!.props.onClick(); });
    await 가라앉힌다();

    expect(captured.asked).toContain("/pdp/images/batch");
    expect(captured.calls).toBe(0);
  });

  it("**잘 만들어지면 안 알린다**", async () => {
    captured.answer = {
      ok: true, requested: 1, succeeded: 1,
      results: [{ sectionId: 섹션.section_id, ok: true, imageBase64: "RESULT", mimeType: "image/png" }],
    };

    await 띄운다();
    await act(async () => { 단추("남은 1장 만들기")[0]!.props.onClick(); });
    await 가라앉힌다();

    expect(captured.calls).toBe(0);
  });
});

describe("단건 생성이 중복으로 막히면", () => {
  it("**되찾으러 가라고 알린다**", async () => {
    await 띄운다();

    // 「생성」은 단건 단추다. 「남은 N장 만들기」가 일괄이다.
    const 생성 = renderer.root.findAll((node) => node.type === "button" && 글자(node as never) === "생성");
    expect(생성[0], "단건 생성 단추를 못 찾았다").toBeTruthy();

    await act(async () => { 생성[0]!.props.onClick(); });
    await 가라앉힌다();

    expect(captured.asked).toContain("/pdp/images");
    expect(captured.calls).toBe(1);
  });
});

/**
 * **어느 장이 왜 안 만들어졌는지 실제로 그린다**(F-7-8).
 *
 * 설계 §14.6: 「failedSections 미표시·토스트만 존재 | **영구 상태·섹션별
 * 실패/미시도 이유 표시**」.
 *
 * 줄을 만들어 넘겨도 **화면이 안 그리면 아무것도 안 고친 것이다**(X-07 의 교훈).
 */
describe("안 만들어진 장을 화면에 그린다", () => {
  it("**섹션 이름과 까닭을 함께 그린다**", async () => {
    await 띄운다({
      recoveredFailures: [
        { label: "베네핏 3개", reason: "만들기 한도를 다 썼습니다.", retryable: false },
      ],
    });

    const 글 = 그려진글();
    expect(글).toContain("베네핏 3개");
    expect(글).toContain("한도를 다 썼습니다");
    expect(글).toContain("만들어지지 않은 섹션 ");
    expect(글).toContain("장");
  });

  /**
   * **다시 눌러 볼 값어치가 있는지 보인다.** 한도를 다 썼으면 눌러도 같은
   * 답이 온다 — 그때 「다시 해 보세요」라고 하면 헛걸음을 시킨다.
   */
  it("**다시 해 볼 것과 아닌 것을 달리 그린다**", async () => {
    await 띄운다({
      recoveredFailures: [{ label: "S1", reason: "잠시 후 다시.", retryable: true }],
    });
    expect(그려진글()).toContain("다시 해 보세요");

    act(() => renderer.unmount());

    await 띄운다({
      recoveredFailures: [{ label: "S1", reason: "설정을 확인해 주세요.", retryable: false }],
    });
    expect(그려진글()).toContain("조치가 필요합니다");
  });

  it("**없으면 아무것도 안 그린다** — 늘 뜨는 상자는 사용자가 넘긴다", async () => {
    await 띄운다({ recoveredFailures: [] });

    expect(그려진글()).not.toContain("만들어지지 않은 섹션");
  });

  it("**이미 만든 것은 그대로 있다고 말한다** — 다시 차감될까 봐 안 누른다", async () => {
    await 띄운다({
      recoveredFailures: [{ label: "S1", reason: "터졌습니다.", retryable: true }],
    });

    expect(그려진글()).toContain("다시 차감되지 않습니다");
  });
});
