import { describe, expect, it } from "vitest";
import { gridSrc } from "../grid-src";

/**
 * 격자 한 칸에 걸 주소를 고른다.
 *
 * 라이브러리 목록은 `works-cover.ts` 가 이미 이 규칙을 지키고 있었는데,
 * **불러오기 창은 안 지켰다.** 같은 규칙을 두 군데가 따로 들고 있으면
 * 한쪽만 고쳐지고 끝난다 — 이 저장소가 같은 자리에서 여러 번 깨진 방식이다.
 */
describe("gridSrc", () => {
  it("사본이 있으면 사본을 쓴다", () => {
    expect(gridSrc({ url: "signed:orig", thumbUrl: "signed:thumb" })).toBe("signed:thumb");
  });

  it("카드뉴스처럼 이름이 assetUrl 이어도 사본을 쓴다", () => {
    expect(gridSrc({ assetUrl: "signed:orig", thumbUrl: "signed:thumb" })).toBe("signed:thumb");
  });

  it("참고 이미지처럼 이름이 signedUrl 이어도 사본을 쓴다", () => {
    expect(gridSrc({ signedUrl: "signed:orig", thumbUrl: "signed:thumb" })).toBe("signed:thumb");
  });

  it("사본이 없는 옛 항목은 원본으로 떨어진다", () => {
    expect(gridSrc({ url: "signed:orig" })).toBe("signed:orig");
    expect(gridSrc({ url: "signed:orig", thumbUrl: null })).toBe("signed:orig");
    expect(gridSrc({ assetUrl: "signed:orig", thumbUrl: null })).toBe("signed:orig");
    /*
      **이 줄이 실제 사고를 막는다.** `signedUrl` 을 모르는 채로 두면 사본이
      없는 옛 참고 이미지가 격자에서 통째로 사라진다 — 느린 것이 아니라
      안 보인다. 세트 편집·카드뉴스 배치 화면이 이 이름을 쓴다.
    */
    expect(gridSrc({ signedUrl: "signed:orig", thumbUrl: null })).toBe("signed:orig");
    expect(gridSrc({ signedUrl: "signed:orig" })).toBe("signed:orig");
  });

  it("그림이 아직 없으면 비어 있다", () => {
    expect(gridSrc(undefined)).toBeNull();
    expect(gridSrc({})).toBeNull();
    expect(gridSrc({ url: null, thumbUrl: null })).toBeNull();
  });
});
