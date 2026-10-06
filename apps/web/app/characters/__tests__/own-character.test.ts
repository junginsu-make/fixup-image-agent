import { describe, expect, it } from "vitest";
import { lookAfterRole } from "../look-role";
import { IMAGES_BASE64_MAX, imagesTooLarge, lookLockedByPair, roleWithOwn } from "../own-character";

/**
 * 「내 캐릭터」가 있으면 참고할 그림은 레퍼런스 스타일뿐이다.
 * 화면이 넣고 빼는 순서가 뒤섞여도 그 규칙이 깨지면 안 된다(Review Focus 4).
 */

describe("역할", () => {
  it("내 캐릭터가 있으면 뽑아내기도 레퍼런스 스타일이 된다", () => {
    expect(roleWithOwn("extract", true)).toBe("style");
    expect(roleWithOwn("style", true)).toBe("style");
  });

  it("내 캐릭터가 없으면 고른 그대로다", () => {
    expect(roleWithOwn("extract", false)).toBe("extract");
    expect(roleWithOwn("style", false)).toBe("style");
  });
});

describe("그림체 잠금", () => {
  it("둘 다 있을 때만 잠근다", () => {
    expect(lookLockedByPair(true, true)).not.toBe("");
    expect(lookLockedByPair(true, false)).toBe("");
    expect(lookLockedByPair(false, true)).toBe("");
  });
});

/** 화면이 실제로 지나는 순서를 순수 함수로 그대로 밟는다. */
describe("넣고 빼는 순서", () => {
  type State = { own: boolean; role: "extract" | "style" | null; look: Parameters<typeof lookAfterRole>[1] };
  const putOwn = (s: State, own: boolean): State => {
    const role = s.role ? roleWithOwn(s.role, own) : null;
    return { own, role, look: lookAfterRole(role ?? "extract", s.look) };
  };
  const putReference = (s: State, role: "extract" | "style" | null): State => {
    const next = role ? roleWithOwn(role, s.own) : null;
    return { ...s, role: next, look: lookAfterRole(next ?? "extract", s.look) };
  };

  it("내 캐릭터 → 참고 그림(뽑아내기 기본) → 레퍼런스 스타일·그림체 자동", () => {
    let s: State = { own: false, role: null, look: "3d" };
    s = putOwn(s, true);
    expect(s).toEqual({ own: true, role: null, look: "3d" });
    s = putReference(s, "extract");
    expect(s).toEqual({ own: true, role: "style", look: "auto" });
  });

  it("둘 다 있다가 참고 그림을 빼면 그림체가 레퍼런스 스타일에 남지 않는다", () => {
    let s: State = { own: true, role: "style", look: "auto" };
    s = putReference(s, null);
    expect(s.look).not.toBe("auto");
  });

  it("둘 다 있다가 내 캐릭터를 빼도 역할은 레퍼런스 스타일로 남는다", () => {
    let s: State = { own: true, role: "style", look: "auto" };
    s = putOwn(s, false);
    expect(s).toEqual({ own: false, role: "style", look: "auto" });
  });

  it("참고 그림(뽑아내기) → 내 캐릭터를 넣으면 레퍼런스 스타일로 바뀐다", () => {
    let s: State = { own: false, role: "extract", look: "anime" };
    s = putOwn(s, true);
    expect(s).toEqual({ own: true, role: "style", look: "auto" });
  });
});

/** 두 그림이 base64 로 부풀어 16MB 요청 상한을 넘으면 서버가 본문을 잘라 엉뚱한 오류가 난다. */
describe("붙인 그림 합계 한도", () => {
  const image = (length: number) => ({ base64: "a".repeat(length) });

  it("한도 이하면 보낸다", () => {
    expect(imagesTooLarge(image(IMAGES_BASE64_MAX / 2), image(IMAGES_BASE64_MAX / 2))).toBe(false);
  });

  it("합이 한도를 넘으면 막는다", () => {
    expect(imagesTooLarge(image(IMAGES_BASE64_MAX), image(1))).toBe(true);
  });

  it("그림이 없거나 하나뿐이어도 셈한다", () => {
    expect(imagesTooLarge(null, null)).toBe(false);
    expect(imagesTooLarge(image(IMAGES_BASE64_MAX + 1), null)).toBe(true);
    expect(imagesTooLarge(null, image(10))).toBe(false);
  });
});
