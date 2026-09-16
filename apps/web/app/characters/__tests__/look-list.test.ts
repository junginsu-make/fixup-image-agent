import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { IMAGE_LOOK_LABEL, looksWithoutReference } from "@fixup/shared";

/**
 * **결 목록을 도구마다 따로 들지 않는다.**
 *
 * 캐릭터 만들기가 제 표(`실사·애니·3D·그림`)를 갖고 있었다. 2026-09-16 에 결
 * 이름을 바꾸니 **캐릭터만 옛 이름으로 남았다** — 같은 것을 두 벌로 두면 반드시
 * 갈라진다.
 */

const source = readFileSync(new URL("../CharacterStudio.tsx", import.meta.url), "utf8");
/**
 * 주석을 뺀 본문. **왜 안 쓰는지 설명한 주석이 「썼다」로 잡히면 안 된다** —
 * 그러면 까닭을 적어 둘수록 시험이 화를 낸다.
 */
const drawn = source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("캐릭터 그림체", () => {
  it("공용 목록을 가져다 쓴다", () => {
    expect(source).toContain("looksWithoutReference()");
    expect(source).toContain('from "@fixup/shared"');
  });

  /** 이름을 손으로 적으면 또 갈라진다. */
  it("이름을 손으로 적지 않는다", () => {
    for (const stale of ['label: "실사"', 'label: "애니"', 'label: "그림"', 'hint: "사진처럼"']) {
      expect(source).not.toContain(stale);
    }
    expect(source).toContain("IMAGE_LOOK_LABEL[");
  });

  /**
   * 캐릭터는 글로만 만든다. 붙일 레퍼런스가 없으니 「레퍼런스 스타일」은
   * **아예 안 보여 준다** — 못 누르는 버튼을 두는 것과 다르다. 저쪽은 붙이면
   * 눌리지만 여기는 붙일 자리 자체가 없다.
   */
  it("레퍼런스 스타일은 아예 없다", () => {
    expect(looksWithoutReference()).not.toContain("auto");
    expect(drawn).not.toContain(IMAGE_LOOK_LABEL.auto);
  });
});
