import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **미리보기가 실제와 같은 길로 지어지는가.**
 *
 * 04 에서 보여 주는 프롬프트가 제출 때와 다르면 **안 보여 주느니만 못하다** —
 * 사용자가 미리보기를 보고 고친 말이 엉뚱한 곳에 붙는다(2026-09-16 설계 §4.2).
 *
 * 되돌리기 쉬운 줄들이라 문자열로 못 박는다. 이 시험이 없으면 누가 미리보기를
 * 손으로 다시 짜도 아무도 모른다.
 */

const source = readFileSync(new URL("../[id]/poster-client.tsx", import.meta.url), "utf8");

describe("04 프롬프트 미리보기", () => {
  it("제출 때와 같은 함수를 부른다", () => {
    expect(source).toContain("previewPosterPrompt({");
    expect(source).toContain('from "@fixup/poster-core"');
  });

  /** 차례를 여기서 새로 짜면 미리보기의 ①이 실제 ①과 달라진다. */
  it("첨부 차례도 같은 함수로 세운다", () => {
    expect(source).toContain("restoreAttachments(");
    expect(source).not.toMatch(/referenceIds[\s\S]{0,80}concat/);
  });

  /** 저장 전에 고친 것도 바로 비쳐야 「고쳤더니 이렇게 바뀐다」를 본다. */
  it("지금 화면의 슬롯을 쓴다", () => {
    expect(source).toMatch(/previewPosterPrompt\(\{\s*\n\s*slots,/);
  });

  /** 읽기 전용이다 — 고치게 하면 첨부 번호·크기의 보장이 깨진다. */
  it("고칠 수 없게 그린다", () => {
    const block = source.slice(source.indexOf("모델에 보낼 프롬프트 보기"));
    const shown = block.slice(0, 900);

    expect(shown).toContain("<pre");
    expect(shown).not.toContain("<Textarea");
    expect(shown).not.toContain("onChange");
  });

  /** 늘 펼쳐 두면 고칠 칸이 화면 밖으로 밀린다. */
  it("접어 둔다", () => {
    expect(source).toContain("<details");
  });
});
