import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { IMAGE_LOOKS } from "@fixup/shared";

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
    expect(source).toContain("IMAGE_LOOKS");
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
   * **「레퍼런스 스타일」도 보여 준다.**
   *
   * 전에는 이 자리에 「캐릭터는 글로만 만든다. 붙일 레퍼런스가 없으니 아예 안
   * 보여 준다」고 적혀 있었다. **그 전제가 틀렸다** — 캐릭터는 그림을 받고
   * (`REFERENCE_ROLES`), 그 그림은 모델에 들어간다. 시험이 틀린 믿음을 고정하고
   * 있었던 것이다(2026-09-17 대조).
   *
   * 다섯 개를 다 보여 주고, 붙인 그림이 없으면 **흐리게** 막는다. 목록에서
   * 없애면 그런 기능이 있다는 것을 알 길이 없다 — 포스터에서 그렇게 했다가
   * 사용자가 「그게 어디 있냐」고 물었다(2026-09-16).
   */
  it("레퍼런스 스타일도 목록에 있다", () => {
    expect(IMAGE_LOOKS).toContain("auto");
    expect(source).toContain("const LOOKS = IMAGE_LOOKS;");
  });

  /**
   * **막을 까닭을 계산만 하고 안 쓰면 아무 일도 안 일어난다.**
   *
   * 처음에는 `lookBlockedReason(` 이 있는지만 봤는데, 그것을 지우고 버튼을
   * 늘 눌리게 만들어도 시험이 통과했다(2026-09-17 변이 시험). 계산한 값이
   * **실제로 버튼을 막는지**까지 봐야 한다.
   */
  it("붙인 그림이 없으면 막는다", () => {
    expect(source).toContain("lookBlockedReason(");
    expect(source).toContain("Boolean(attached)");
    expect(source).toContain("disabled={locked || Boolean(blocked)}");
  });

  /** 회색 버튼만 두면 고장으로 읽힌다. 무엇을 하면 눌리는지 적어야 한다. */
  it("무엇을 하면 눌리는지 적는다", () => {
    expect(source).toContain('lookBlockedReason("auto"');
  });

  /**
   * **역할 이름도 같은 이름표에서 온다.**
   *
   * 「결만 따라 만들기」는 무슨 말인지 알기 어려웠고, 같은 것을 그림체 쪽은
   * 「레퍼런스 스타일」이라 부르고 있었다 — 한 스위치가 두 이름을 갖고 있었다
   * (2026-09-17 사용자 요청).
   */
  it("역할 이름을 손으로 적지 않는다", () => {
    expect(drawn).not.toContain("결만 따라 만들기");
    expect(source).toContain("IMAGE_LOOK_LABEL.auto");
  });

  /** 두 자리가 따로 움직이면 부딪히는 짝이 생긴다. 판단은 `look-role.ts` 에 있다. */
  it("두 자리를 이어 둔다", () => {
    expect(source).toContain("roleAfterLook(");
    expect(source).toContain("lookAfterRole(");
  });
});
