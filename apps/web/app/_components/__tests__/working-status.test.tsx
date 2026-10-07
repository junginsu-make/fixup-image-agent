import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkingStatus } from "../working-status";
import { ItemStatusBadge, ItemWorkingOverlay, ITEM_STATE_TEXT } from "../item-status";
import { workingButton } from "../working-words";

/**
 * **시간이 걸리는 단계는 모두 같은 모양으로 「돌고 있다」를 말한다**(2026-10-08 사용자).
 *
 * 기능마다 상단 띠·전체 화면 창·단추 글자만 바뀌는 것이 섞여 있었다.
 * 위쪽 띠 하나(`WorkingStatus`)와 칸 표시 하나(`ItemStatusBadge`)로 맞춘다.
 */
let renderer: ReactTestRenderer;
const text = () => JSON.stringify(renderer.toJSON());

beforeEach(() => { vi.stubGlobal("React", React); });
afterEach(() => { act(() => renderer?.unmount()); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("위쪽 띠", () => {
  it("무엇을 하는 중인지와 안내를 보여 주고, 화면 읽기 도구에 알린다", () => {
    act(() => { renderer = create(<WorkingStatus label="기획 중입니다" hint="1~2분 걸립니다" />); });
    expect(text()).toContain("기획 중입니다");
    expect(text()).toContain("1~2분 걸립니다");
    expect(renderer.root.findByProps({ role: "status" })).toBeTruthy();
  });

  it("시작 시각을 주면 걸린 시간이 흐른다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T00:00:00Z"));
    vi.stubGlobal("window", { setInterval, clearInterval });
    const startedAt = Date.now();
    act(() => { renderer = create(<WorkingStatus label="만드는 중입니다" startedAt={startedAt} />); });
    act(() => { vi.advanceTimersByTime(65_000); });
    expect(text()).toContain("1분 05초");
  });

  it("여러 장이면 몇 장째인지와 채워지는 막대를 보여 준다", () => {
    act(() => { renderer = create(<WorkingStatus label="6장 만드는 중입니다" progress={{ done: 2, total: 6 }} remaining="약 3분 남음" />); });
    expect(text()).toContain("2/6장");
    expect(text()).toContain("약 3분 남음");
    const filled = renderer.root.findByProps({ "data-working-fill": "progress" });
    expect(filled.props.style.width).toBe("33%");
  });

  it("장 수를 모르면 흐르는 막대를 쓴다 — 진행률처럼 보이면 거짓말이 된다", () => {
    act(() => { renderer = create(<WorkingStatus label="분석 중입니다" />); });
    expect(renderer.root.findAllByProps({ "data-working-fill": "progress" })).toHaveLength(0);
    expect(text()).toContain("fixup-working-bar");
  });

  it("멈출 수 있는 작업만 중지 단추와 비용 안내를 단다", () => {
    const onStop = vi.fn();
    act(() => { renderer = create(<WorkingStatus label="만드는 중입니다" onStop={onStop} />); });
    expect(text()).toContain("중지");
    expect(text()).toContain("이미 보낸 요청의 비용은 나갈 수 있습니다");
    act(() => { renderer.root.findByType("button").props.onClick(); });
    expect(onStop).toHaveBeenCalledTimes(1);

    act(() => { renderer.update(<WorkingStatus label="만드는 중입니다" />); });
    expect(renderer.root.findAllByType("button")).toHaveLength(0);
    expect(text()).not.toContain("비용");
  });

  it("단계 목록 같은 덧붙임을 띠 안에 담는다", () => {
    act(() => { renderer = create(<WorkingStatus label="분석 중입니다"><p>1단계 사진 읽기</p></WorkingStatus>); });
    expect(text()).toContain("1단계 사진 읽기");
  });
});

describe("칸 표시", () => {
  it("네 가지 말만 쓴다", () => {
    expect(ITEM_STATE_TEXT).toEqual({ working: "만드는 중", queued: "차례 대기", done: "완료", failed: "실패", idle: "만들기 전" });
  });

  it("상태마다 그 말을 띄운다", () => {
    for (const state of ["working", "queued", "done", "failed", "idle"] as const) {
      act(() => { renderer = create(<ItemStatusBadge state={state} />); });
      expect(text()).toContain(ITEM_STATE_TEXT[state]);
      act(() => renderer.unmount());
    }
  });

  it("그림 위 덮개는 만드는 중·차례 대기일 때만 뜬다", () => {
    act(() => { renderer = create(<ItemWorkingOverlay state="working" />); });
    expect(text()).toContain("만드는 중");
    act(() => { renderer.update(<ItemWorkingOverlay state="queued" />); });
    expect(text()).toContain("차례 대기");
    for (const state of ["done", "failed", "idle"] as const) {
      act(() => { renderer.update(<ItemWorkingOverlay state={state} />); });
      expect(renderer.toJSON()).toBeNull();
    }
  });
});

describe("단추 글자", () => {
  it("정해 둔 말만 쓴다", () => {
    expect(workingButton("plan")).toBe("기획 중…");
    expect(workingButton("write")).toBe("작성 중…");
    expect(workingButton("make")).toBe("만드는 중…");
    expect(workingButton("edit")).toBe("고치는 중…");
    expect(workingButton("analyze")).toBe("분석 중…");
    expect(workingButton("review")).toBe("검수 중…");
    expect(workingButton("save")).toBe("저장 중…");
  });
});
