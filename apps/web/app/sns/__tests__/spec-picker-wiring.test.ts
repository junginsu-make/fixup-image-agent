import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **「레퍼런스 스타일」은 따라갈 그림이 있어야 고를 수 있다.**
 *
 * 그 결은 붙인 그림을 따라간다는 뜻이라, 없으면 결 지시가 **한 줄도 안 붙은
 * 채로** 그림이 나간다. 포스터는 흐리게 막는데 카드뉴스는 안 막고 있었다
 * (2026-09-17 대조).
 *
 * **화면은 판단하지 않는다.** 어느 첨부가 따라갈 결을 갖는지는 `sns-core` 의
 * `hasStyleSource` 가 정한다. 화면이 제 손으로 세면 그 판단을 값으로 못 잰다.
 */

const source = readFileSync(new URL("../_components/spec-picker.tsx", import.meta.url), "utf8");

describe("카드뉴스 그림체 고르기", () => {
  it("막을 까닭을 코드에서 받아 온다", () => {
    expect(source).toContain("lookBlockedReason(");
    expect(source).toContain("hasStyleSource(attachments)");
  });

  it("막힌 것은 못 누르게 한다", () => {
    expect(source).toContain("disabled={Boolean(blocked)}");
  });

  /**
   * **빼지 않고 흐리게 둔다.** 목록에서 없애면 그런 기능이 있다는 것을 알 길이
   * 없다 — 포스터에서 그렇게 했다가 사용자가 「그게 어디 있냐」고 물었다.
   */
  it("목록에서 빼지는 않는다", () => {
    expect(source).toContain("IMAGE_LOOKS.map(");
  });

  /** 회색 버튼만 두면 고장으로 읽힌다. 무엇을 하면 눌리는지 적어야 한다. */
  it("무엇을 하면 눌리는지 적는다", () => {
    expect(source).toContain('lookBlockedReason("auto"');
  });

  /** 어느 첨부가 따라갈 결을 갖는지 화면이 제 손으로 세면 안 된다. */
  it("첨부 종류를 화면이 직접 세지 않는다", () => {
    expect(source).not.toContain('kind === "style_reference"');
    expect(source).not.toContain('kind === "keep_identity"');
  });
});
