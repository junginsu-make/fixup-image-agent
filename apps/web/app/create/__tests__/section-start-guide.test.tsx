import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptySection } from "../scenario-sections";

/**
 * **3단계에 도착한 사람이 무엇을 하면 되는지 아는가**(2026-09-22 사용자 신고).
 *
 * ── 무엇이 있었나 ──────────────────────────────────────────
 *
 * 기획이 끝나면 섹션 카드가 죽 깔린 화면으로 넘어온다. 카드는 전부 비어
 * 있고, 만들기 단추는 **빽빽한 도구 막대 오른쪽 끝에 작은 테두리 단추**로
 * 하나 있다. 보기·카드 크기·진행률에 밀려 눈에 안 띈다.
 *
 * 사용자는 「여기서 뭘 해야 하는지 모르겠다」고 했다.
 *
 * ── 어떻게 고치나 ──────────────────────────────────────────
 *
 * **글로 말하고, 단추를 크게 하고, 잠깐 움직인다.** 셋 다 필요하다 —
 * 움직임만 주면 화면을 늦게 본 사람은 못 보고, 글만 주면 눈이 먼저 가지
 * 않는다.
 *
 * 움직임은 **멎는다.** 이 저장소가 이미 정한 것이다(`fixup-attention`:
 * 「멈추지 않는 움직임은 화면 구석에서 계속 신경을 긁는다」). 못 본 사람에게는
 * 글이 대신 말한다.
 */

const captured = vi.hoisted(() => ({ asked: [] as string[] }));

vi.mock("../pdp-utils", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    apiJson: async (path: string) => {
      captured.asked.push(path);
      return { ok: false, code: "quota_exceeded", message: "한도" };
    },
  };
});

import { PdpEditor } from "../PdpEditor";

const 섹션들 = (만든장수: number) =>
  [0, 1, 2].map((index) => ({
    ...createEmptySection(index),
    section_name: `섹션 ${index + 1}`,
    // 카피 칸이 비어 있으면 카피 탭이 아무것도 안 그린다. 글자 레이어를 놓으려면 필요하다.
    headline: `${index + 1}번 제목`,
    ...(index < 만든장수 ? { generatedImage: "data:image/png;base64,AAAA" } : {}),
  }));

const 결과 = (만든장수: number) =>
  ({
    originalImage: "AAAA",
    blueprint: {
      executiveSummary: "요약",
      scorecard: [],
      blueprintList: [],
      sections: 섹션들(만든장수),
    },
  }) as never;

let renderer: ReactTestRenderer;

/** 단추 라벨은 조각나 있다. 글자 자식을 이어 붙여야 잡힌다. */
const 글자 = (node: { children: unknown[] }) =>
  node.children.filter((child): child is string => typeof child === "string").join("");

const 단추 = (말: string) =>
  renderer.root.findAll((node) => node.type === "button" && 글자(node as never).includes(말));

const 띄운다 = async (만든장수 = 0) => {
  await act(async () => {
    renderer = create(
      <PdpEditor
        initialResult={결과(만든장수)}
        characterAngles={[]}
        aspectRatio="3:4"
        desiredTone=""
        onReset={() => {}}
        onSectionsChange={() => {}}
      />,
    );
  });
};

/** 화면에 그려진 글자만 훑는다. `children` 을 통째로 JSON 으로 만들면 순환 참조로 터진다. */
const 그려진글 = () => JSON.stringify(renderer.toJSON());

const 가라앉힌다 = async () => {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
};

beforeEach(() => {
  captured.asked.length = 0;
  // 경과 시간 표시가 `window.setInterval` 을 쓴다. 없으면 마운트가 터진다.
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    confirm: () => true,
    scrollTo: vi.fn(),
    setInterval: vi.fn(() => 1),
    clearInterval: vi.fn(),
  });
});

afterEach(() => {
  if (renderer) act(() => renderer.unmount());
  vi.unstubAllGlobals();
});

describe("아직 한 장도 안 만들었을 때", () => {
  it("**무엇을 하면 되는지 글로 말한다**", async () => {
    await 띄운다(0);

    const 글 = 그려진글();
    expect(글, "다음에 할 일을 알려 주는 문장이 없다").toContain("이미지를 만들 차례입니다");
    expect(글, "단추를 누르라는 말이 없다").toContain("아래 단추를 누르면");
  });

  /**
   * **글만으로는 부족하다.** 안내를 읽고도 그 단추가 어디 있는지 찾아야 하면
   * 같은 일이 반복된다. 안내 바로 아래에 누를 것이 있어야 한다.
   */
  it("**안내 안의 단추를 누르면 만들기가 실제로 돈다**", async () => {
    await 띄운다(0);

    const 시작 = 단추("3장 만들기");
    expect(시작[0], "시작 단추를 못 찾았다").toBeTruthy();

    await act(async () => {
      시작[0]!.props.onClick();
    });
    await 가라앉힌다();

    expect(captured.asked).toContain("/pdp/images/batch");
  });

  it("**시작 단추가 눈에 띄게 움직인다**", async () => {
    await 띄운다(0);

    const 시작 = 단추("3장 만들기")[0];
    expect(String(시작?.props.className ?? ""), "시작 단추에 눈길을 끄는 움직임이 없다").toContain(
      "fixup-cta-pulse",
    );
  });

  /**
   * **도구 막대에 같은 단추를 또 두지 않는다.** 같은 일을 하는 단추가 둘이면
   * 어느 쪽이 맞는지 다시 헷갈린다.
   */
  it("**같은 단추가 둘이 아니다**", async () => {
    await 띄운다(0);

    expect(단추("3장 만들기").length, "만들기 단추가 화면에 여럿이다").toBe(1);
  });
});

/**
 * **다 만든 사람에게는 안내가 방해다.** 한 장이라도 만들었으면 사용자는 이미
 * 이 화면을 안다.
 */
describe("한 장이라도 만들었으면", () => {
  it("**시작 안내가 사라진다**", async () => {
    await 띄운다(1);

    expect(그려진글()).not.toContain("이미지를 만들 차례입니다");
  });

  /**
   * **있는 것만 보면 모자란다.** 라벨이 바뀌면서 이 단추를 **누르던** 시험이
   * 안내 쪽으로 옮겨 갔다. 그래서 한 장이라도 만든 사용자에게 **유일한 일괄
   * 경로**인 이 단추의 배선을 끊어도 아무도 못 잡는 구멍이 생겼다(리뷰 지적).
   */
  it("**도구 막대 단추를 누르면 만들기가 실제로 돈다**", async () => {
    await 띄운다(1);

    const 남은것만들기 = 단추("남은 2장 만들기")[0];
    expect(남은것만들기, "남은 장 만들기 단추가 없다").toBeTruthy();

    await act(async () => {
      남은것만들기!.props.onClick();
    });
    await 가라앉힌다();

    expect(captured.asked).toContain("/pdp/images/batch");
  });
});

/**
 * **글자가 붙은 단추 앞에 아이콘을 두지 않는다**(2026-09-22 사용자 지시).
 *
 * ── 무엇만 보는가 ──────────────────────────────────────────
 *
 * **글자 없는 단추는 그대로 둔다.** 위로·아래로·삭제·닫기는 아이콘이 곧
 * 라벨이라, 빼면 누를 것이 없어진다.
 *
 * **도는 표시(`Loader2`)도 그대로다.** 그것은 장식이 아니라 「지금 돌고
 * 있다」는 상태다. 그래서 **아무것도 안 돌고 있을 때**만 잰다.
 *
 * ── 처음에는 갤러리만 봤다 ─────────────────────────────────
 *
 * 그래서 **편집 화면의 일곱 개를 통째로 놓쳤다**(리뷰 지적). 「삭제」·「배경
 * 사각형 추가」·「옆으로 붙이기」·독과 작업대의 탭들이다. 시험은 초록인데
 * 성질은 안 지켜지는, 이 저장소가 네 번 겪은 그 유형이다.
 *
 * 이제 **두 화면 다** 본다. `<summary>` 도 누르는 것이라 함께 본다 —
 * 「AI 분석 요약 보기」가 정확히 그것이었다.
 */
describe("글자가 있는 단추 앞에 아이콘이 없다", () => {
  const 누를것 = new Set(["button", "summary"]);

  /**
   * **「앞에」를 글자 그대로 잰다.**
   *
   * 뒤에 붙는 꺾쇠(`숨기기 ⌃`)는 장식이 아니라 **열림/닫힘 상태**다. 도는
   * 표시와 같은 갈래라 그대로 둔다. 앞에 서서 자리만 차지하는 것을 뺀다.
   */
  const 앞에아이콘 = (node: { children: unknown[] }) => {
    const 자식 = node.children;
    const 글자자리 = 자식.findIndex((child) => typeof child === "string" && child.trim().length > 0);
    if (글자자리 < 0) return false;

    return 자식.slice(0, 글자자리).some((child) => {
      if (typeof child === "string") return false;
      const 것 = child as { type?: unknown; findAllByType: (type: string) => unknown[] };
      return 것.type === "svg" || 것.findAllByType("svg").length > 0;
    });
  };

  const 아이콘단추 = () =>
    renderer.root
      .findAll((node) => 누를것.has(String(node.type)) && 글자(node as never).trim().length > 0)
      .filter((node) => 앞에아이콘(node as never))
      .map((node) => 글자(node as never).trim());

  /** 3단계에서 4단계로 넘어간다. 같은 페이지의 다른 화면이다. */
  const 편집화면으로 = async () => {
    const 이동 = 단추("편집으로")[0];
    expect(이동, "편집으로 가는 단추를 못 찾았다").toBeTruthy();
    await act(async () => {
      이동!.props.onClick();
    });
  };

  it("**아무것도 안 만든 갤러리에 없다**", async () => {
    await 띄운다(0);

    const 남은것 = 아이콘단추();
    expect(남은것, `아이콘이 남은 단추: ${남은것.join(", ")}`).toEqual([]);
  });

  it("**만든 것이 있는 갤러리에도 없다**", async () => {
    await 띄운다(2);

    const 남은것 = 아이콘단추();
    expect(남은것, `아이콘이 남은 단추: ${남은것.join(", ")}`).toEqual([]);
  });

  it("**편집 화면에도 없다**", async () => {
    await 띄운다(3);
    await 편집화면으로();

    const 남은것 = 아이콘단추();
    expect(남은것, `아이콘이 남은 단추: ${남은것.join(", ")}`).toEqual([]);
  });

  /**
   * **레이어를 고를 때만 뜨는 자리도 본다.**
   *
   * 「삭제」 단추는 글자·사각형을 고른 뒤에야 그려진다. 화면만 넘겨서는 안
   * 닿아, 여기 아이콘을 되돌려도 아무도 안 잡혔다(실측으로 확인했다).
   * 사각형을 하나 놓으면 그 패널이 열린다.
   */
  it("**레이어 패널에도 없다**", async () => {
    await 띄운다(3);
    await 편집화면으로();

    const 사각형추가 = 단추("배경 사각형 추가")[0];
    expect(사각형추가, "사각형 추가 단추를 못 찾았다").toBeTruthy();
    await act(async () => {
      사각형추가!.props.onClick();
    });

    expect(그려진글(), "레이어 패널이 안 열렸다").toContain("삭제");

    const 남은것 = 아이콘단추();
    expect(남은것, `아이콘이 남은 단추: ${남은것.join(", ")}`).toEqual([]);
  });

  /**
   * **글자 레이어 패널은 또 다른 자리다.**
   *
   * 사각형 패널과 「삭제」 단추가 따로 있다. 사각형 쪽만 재고 끝냈더니 글자
   * 쪽 아이콘을 되돌려도 안 잡혔다 — 자리마다 따로 눌러 봐야 안다.
   */
  it("**글자 레이어 패널에도 없다**", async () => {
    await 띄운다(3);
    await 편집화면으로();

    await act(async () => {
      단추("카피")[0]!.props.onClick();
    });

    const 카피블록 = 단추("1번 제목")[0];
    expect(카피블록, "얹을 카피를 못 찾았다").toBeTruthy();
    await act(async () => {
      카피블록!.props.onClick();
    });

    // 얹기만 하면 카피 탭에 그대로 있다. 레이어 패널은 따로 연다.
    await act(async () => {
      단추("텍스트 편집")[0]!.props.onClick();
    });

    expect(그려진글(), "글자 레이어 패널이 안 열렸다").toContain("삭제");

    const 남은것 = 아이콘단추();
    expect(남은것, `아이콘이 남은 단추: ${남은것.join(", ")}`).toEqual([]);
  });

  /**
   * **화면을 실제로 넘겼는지부터 확인한다.** 안 넘어갔으면 위 시험들은
   * 갤러리를 다시 재고 통과한다 — 값없이 초록이 되는 자리다.
   */
  it("**편집 화면이 실제로 떴다**", async () => {
    await 띄운다(3);
    await 편집화면으로();

    expect(그려진글(), "편집 화면으로 안 넘어갔다").toContain("배경 사각형 추가");
  });
});

/**
 * **움직임을 줄여 달라고 한 사람에게는 움직이지 않는다.**
 *
 * 이 저장소는 움직이는 것마다 `prefers-reduced-motion` 을 달아 왔다
 * (`fixup-panel`·`fixup-attention`·`fixup-typing-dot`·`fixup-working-bar`).
 * 새로 더한 것만 빠지면 그 약속이 깨진다.
 */
describe("움직임 규칙", () => {
  // vitest 는 `apps/web` 에서 돈다. 경로에 공백·한글이 있으면 `import.meta.url`
  // 쪽은 `%20` 으로 인코딩돼 터진다(저장소 관행: `webfont.test.ts`).
  const CSS = readFileSync(join(process.cwd(), "../../packages/ui/src/styles/globals.css"), "utf8");

  it("**움직임이 실제로 정의돼 있다**", () => {
    expect(CSS).toContain("@keyframes fixup-cta-pulse");
    expect(CSS).toContain(".fixup-cta-pulse");
  });

  it("**몇 번 뛰고 선다** — 횟수를 값으로 잰다", () => {
    const 규칙 = /\.fixup-cta-pulse\s*\{[^}]*\}/.exec(CSS)?.[0] ?? "";
    expect(규칙, "움직임 규칙을 못 찾았다").toBeTruthy();

    /*
      **`infinite` 만 막으면 모자란다.** `... ease-out 9999` 는 그 낱말이 없어도
      사실상 안 멎는다. 잡으려던 것이 바로 그것이라 **횟수를 읽어** 상한을 건다.
    */
    const 횟수 = Number(/animation:[^;]*?\s(\d+)\s*;/.exec(규칙)?.[1]);

    expect(횟수, `반복 횟수를 못 읽었다: ${규칙}`).toBeGreaterThan(0);
    expect(횟수, "끝없이 도는 움직임은 신경을 긁는다").toBeLessThanOrEqual(10);
  });

  it("**움직임을 줄여 달라고 하면 멈춘다**", () => {
    const 줄인블록 = CSS.split("@media (prefers-reduced-motion: reduce)").slice(1);

    expect(
      줄인블록.some((block) => block.slice(0, 400).includes(".fixup-cta-pulse")),
      "prefers-reduced-motion 에서 멈추지 않는다",
    ).toBe(true);
  });
});
