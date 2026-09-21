import { describe, expect, it } from "vitest";
import { rerunHref, rerunStartStep } from "../rerun-step";

/**
 * **누른 단계로 바로 연다**(2026-09-17 사용자 보고).
 *
 * 만든 결과물에서 「03 규격」을 눌렀는데 01 지시가 열렸다. 지난 값은 들고
 * 갔지만 **어느 단계를 눌렀는지는 안 들고 가서**, 새로 만드는 화면이 늘 첫
 * 단계에서 시작했다.
 */

const POSTER = ["instruction", "reference", "spec"] as const;

describe("가는 주소", () => {
  it("작업과 누른 단계를 함께 싣는다", () => {
    expect(rerunHref("/poster/new", "abc", "spec")).toBe("/poster/new?from=abc&step=spec");
  });

  it("작업 id 를 인코딩한다 — 주소를 깨뜨릴 글자가 들어와도 안 새 나간다", () => {
    expect(rerunHref("/sns/new", "a&b=c", "images")).toBe("/sns/new?from=a%26b%3Dc&step=images");
  });
});

describe("처음 열 단계", () => {
  it("누른 단계로 연다", () => {
    expect(rerunStartStep("spec", POSTER, "instruction")).toBe("spec");
    expect(rerunStartStep("reference", POSTER, "instruction")).toBe("reference");
  });

  it("**모르는 단계면 첫 단계다** — 주소에 아무거나 적어 없는 화면을 열지 못한다", () => {
    expect(rerunStartStep("plan", POSTER, "instruction")).toBe("instruction");
    expect(rerunStartStep("<script>", POSTER, "instruction")).toBe("instruction");
  });

  it("단계가 안 적혀 있으면 첫 단계다 — 옛 주소도 그대로 열린다", () => {
    expect(rerunStartStep(null, POSTER, "instruction")).toBe("instruction");
    expect(rerunStartStep("", POSTER, "instruction")).toBe("instruction");
  });
});
