import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canReachStep, editorScreenFor } from "../step-jump";

/**
 * 막대를 눌렀는데 아무 일이 안 일어나면 사용자는 고장으로 읽는다.
 * 반대로 아직 없는 화면으로 보내면 빈 화면이 나온다.
 */

const 시작전 = { hasResult: false };
const 구성안있음 = { hasResult: true };

describe("구성안이 없을 때", () => {
  it("1단계로는 언제나 갈 수 있다", () => {
    expect(canReachStep("upload", 시작전)).toBe(true);
  });

  it("나머지는 아직 갈 데가 없다", () => {
    expect(canReachStep("analyze", 시작전)).toBe(false);
    expect(canReachStep("sections", 시작전)).toBe(false);
    expect(canReachStep("edit", 시작전)).toBe(false);
  });
});

describe("구성안이 만들어진 뒤", () => {
  it("네 단계를 다 오갈 수 있다", () => {
    for (const id of ["upload", "analyze", "sections", "edit"]) {
      expect(canReachStep(id, 구성안있음)).toBe(true);
    }
  });
});

describe("모르는 단계", () => {
  /** 목록이 늘었는데 여기를 안 고치면, 새 단계가 조용히 막히거나 조용히 열린다. */
  it("구성안 여부를 따른다", () => {
    expect(canReachStep("mystery", 시작전)).toBe(false);
    expect(canReachStep("mystery", 구성안있음)).toBe(true);
  });
});

describe("편집기로 넘어갈 때 누른 단계에 내려앉는가", () => {
  /** 01·02 에서 04 를 눌러도 편집기가 늘 갤러리(03)로 열렸다(2026-09-29 독립 리뷰). */
  it("04 는 편집 화면, 03 은 갤러리로 연다", () => {
    expect(editorScreenFor("edit")).toBe("editor");
    expect(editorScreenFor("sections")).toBe("gallery");
  });

  it("편집기가 다시 그려져도 보던 화면을 지킨다 — 화면은 부모가 든다", () => {
    const maker = readFileSync(new URL("../PdpMakerClient.tsx", import.meta.url), "utf8");
    const editor = readFileSync(new URL("../PdpEditor.tsx", import.meta.url), "utf8");
    // 두 막대는 누른 단계로, 나머지 길(작업 불러오기·글 경로 완료·구성안 확정)은 갤러리로 연다.
    expect(maker.match(/setEditorScreen\(editorScreenFor\(id\)\)/g)).toHaveLength(2);
    expect(maker.match(/setEditorScreen\("gallery"\)/g)).toHaveLength(3);
    // 새 작업은 들어서자마자 저장돼 key 가 바뀐다. 그때도 이 값을 받아야 04 에 머문다.
    // 한 번 쓰고 되돌리던 방식은 여기서 갤러리로 떨어졌다(2026-09-29 독립 리뷰).
    expect(maker).toContain("initialScreen={editorScreen}");
    expect(maker).toContain("onScreenChange={setEditorScreen}");
    expect(maker).not.toContain("setEditorEntry");
    expect(editor).toContain('useState<"gallery" | "editor">(initialScreen)');
    expect(editor).toContain("onScreenChange?.(screen);");
  });
});
