import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanBar } from "../[id]/plan-bar";

/**
 * **「그대로 생성」 작업도 만들기 단추에 닿는다**(2026-09-29).
 *
 * ── 무엇이 있었나 ──────────────────────────────────────────
 *
 * 01 에 완성된 프롬프트를 넣고 「그대로 생성」을 고르면 04 기획이 없다 — 칸을
 * 채우지 않으니 고칠 것이 없다. 그래서 기획 패널을 **일부러 안 연다.** 그런데
 * 「N장 만들기」 단추가 **그 패널 안에만** 있었다. 회원은 결과 화면에 와서
 * 무엇을 눌러야 만들어지는지 알 수 없었다(설명서 대조에서 발견).
 *
 * ── 어떻게 고쳤나 ──────────────────────────────────────────
 *
 * 패널 밖, 화면 위 안내 줄에 **그대로 만들기 단추를 바로 둔다.** 빈 칸뿐인
 * 기획 패널은 여전히 안 연다.
 */

let renderer: ReactTestRenderer;
afterEach(() => { if (renderer) act(() => renderer.unmount()); });

const 글자 = (node: { children: unknown[] }): string =>
  node.children.map((child) => (typeof child === "string" ? child : 글자(child as never))).join("");
const 단추들 = () => renderer.root.findAll((node) => node.type === "button");
const 단추 = (말: string) => 단추들().find((node) => 글자(node as never).includes(말));

function 띄운다(props: Partial<React.ComponentProps<typeof PlanBar>> = {}) {
  const 불림 = { plan: vi.fn(), generate: vi.fn() };
  act(() => {
    renderer = create(
      <PlanBar
        verbatim={false}
        hasImages={false}
        variants={3}
        busyKind={null}
        onOpenPlan={불림.plan}
        onGenerate={불림.generate}
        {...props}
      />,
    );
  });
  return 불림;
}

describe("그대로 생성 작업", () => {
  it("안내 줄에 바로 「N장 만들기」가 있다", () => {
    const 불림 = 띄운다({ verbatim: true, variants: 3 });
    const 만들기 = 단추("3장 만들기");

    expect(만들기, "만들기 단추가 패널 안에만 있으면 닿을 수 없다").toBeTruthy();
    act(() => { (만들기!.props.onClick as () => void)(); });
    expect(불림.generate).toHaveBeenCalledTimes(1);
  });

  /** 빈 칸뿐인 기획 패널을 여는 단추는 두지 않는다 — 열면 무엇을 할지 더 모른다. */
  it("기획 패널을 여는 단추는 없다", () => {
    띄운다({ verbatim: true });

    expect(단추("기획 확인")).toBeUndefined();
  });

  it("쓴 글 그대로 만든다고 말한다", () => {
    띄운다({ verbatim: true });

    expect(JSON.stringify(renderer.toJSON())).toContain("그대로");
  });

  it("만드는 동안에는 눌리지 않고 그렇다고 보여 준다", () => {
    띄운다({ verbatim: true, busyKind: "generate" });
    const 만들기 = 단추("만드는 중");

    expect(만들기).toBeTruthy();
    expect(만들기!.props.disabled).toBe(true);
  });
});

describe("AI 가 다듬는 작업", () => {
  it("지금처럼 「기획 확인」으로 패널을 연다", () => {
    const 불림 = 띄운다({ verbatim: false });
    const 기획 = 단추("기획 확인");

    expect(기획).toBeTruthy();
    act(() => { (기획!.props.onClick as () => void)(); });
    expect(불림.plan).toHaveBeenCalledTimes(1);
  });

  /** 여기서는 만들기가 패널 안에 있다. 두 곳에 두면 기획을 안 보고 만든다. */
  it("안내 줄에 만들기 단추를 따로 두지 않는다", () => {
    띄운다({ verbatim: false });

    expect(단추("장 만들기")).toBeUndefined();
  });
});

describe("결과 화면이 이 줄을 쓴다", () => {
  const 화면 = readFileSync(join(__dirname, "..", "[id]", "poster-client.tsx"), "utf8");

  it("안내 줄을 그리고, 그대로 생성인지 넘긴다", () => {
    expect(화면).toContain("<PlanBar");
    expect(화면).toContain('verbatim={project.data.promptMode === "verbatim"}');
  });

  /**
   * **단추가 정말 만들기를 부르는가**(2026-09-29 독립 리뷰). 부품은 받은 함수를
   * 부를 뿐이라, 여기서 패널을 여는 함수를 넘기면 원래 버그로 되돌아간다.
   * 장수도 이 작업의 값이어야 한다.
   */
  it("만들기 단추에 실제 만들기와 이 작업의 장수를 넘긴다", () => {
    expect(화면).toContain("onGenerate={() => void generate()}");
    expect(화면).toContain("variants={project.data.variants}");
  });
});
