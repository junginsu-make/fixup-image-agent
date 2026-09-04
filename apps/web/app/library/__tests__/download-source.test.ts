import { describe, expect, it } from "vitest";
import { downloadSource } from "../download-source";

/**
 * 내려받을 때 어디서 받아 어떤 이름으로 저장하는가.
 *
 * 계정 보관분은 WebP 로 저장되므로 우리 라우트를 거쳐 PNG 로 되돌려 받는다.
 * 브라우저 저장분은 예전 그대로다 — 그쪽은 저장 형식을 바꾸지 않았다.
 */
describe("downloadSource", () => {
  it("계정 보관분은 우리 라우트에서 PNG 로 받는다", () => {
    const result = downloadSource({ accountItemId: "item-1", index: 0, image: "https://x/y.webp", title: "겨울 세일" });

    expect(result.url).toBe("/api/library/item-1/images/0/file?format=png");
    expect(result.filename).toBe("겨울 세일-01.png");
  });

  it("주소에 쓸 수 없는 글자가 든 id 도 안전하게 넣는다", () => {
    const result = downloadSource({ accountItemId: "a/b?c", index: 2, image: "https://x/y.webp", title: "t" });

    expect(result.url).toBe("/api/library/a%2Fb%3Fc/images/2/file?format=png");
  });

  it("브라우저 저장분은 예전처럼 그림 주소에서 바로 받는다", () => {
    const result = downloadSource({ index: 1, image: "data:image/jpeg;base64,AAAA", title: "메모" });

    expect(result.url).toBe("data:image/jpeg;base64,AAAA");
    expect(result.filename).toBe("메모-02.jpg");
  });

  it("서명 URL 의 쿼리스트링은 확장자 판정에 섞이지 않는다", () => {
    const result = downloadSource({ index: 0, image: "https://x/y.png?token=abc", title: "t" });

    expect(result.filename).toBe("t-01.png");
  });
});
