import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DropPasteHint } from "../drop-paste-hint";
import { DROP_PASTE_HINT } from "../image-drop";

/** 모든 그림 칸이 같은 말로 안내한다(2026-10-07 사용자 요청: 모두 동일하게). */
describe("DropPasteHint", () => {
  it("끌어다 놓기·붙여넣기를 쓸 수 있다고 말하고, 눌러 둔 칸에서는 「지금 붙여넣을 수 있습니다」", () => {
    const html = renderToStaticMarkup(<DropPasteHint locked={false} />);
    expect(html).toContain(DROP_PASTE_HINT);
    expect(html).toContain("지금 붙여넣을 수 있습니다");
    expect(html).toContain("group-focus-within:inline");
  });

  it("잠긴 칸에서는 아무것도 말하지 않는다 — 받지 않는데 받는다고 하면 안 된다", () => {
    expect(renderToStaticMarkup(<DropPasteHint locked />)).toBe("");
  });
});
