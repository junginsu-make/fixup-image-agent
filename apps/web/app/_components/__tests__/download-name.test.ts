import { describe, expect, it } from "vitest";
import { downloadName } from "../download-name";

describe("내려받을 때 붙일 이름", () => {
  it("정해 준 이름이 있으면 그것을 쓴다", () => {
    expect(downloadName({ name: "여름세일-변형1.png", alt: "변형 1", src: "https://x/y.png" }))
      .toBe("여름세일-변형1.png");
  });

  it("없으면 보이는 이름과 주소의 확장자로 만든다", () => {
    expect(downloadName({ alt: "변형 1", src: "https://x/a/b.png?token=1" }))
      .toBe("변형 1.png");
  });

  it("확장자를 알 수 없으면 png 로 둔다", () => {
    // 서명 주소는 경로에 확장자가 없을 때가 있다.
    expect(downloadName({ alt: "표지", src: "https://x/storage/object/sign/abc" }))
      .toBe("표지.png");
  });

  it("파일 이름에 못 쓰는 글자는 바꾼다", () => {
    expect(downloadName({ alt: 'a/b\\c:d*e?f"g<h>i|j', src: "https://x/y.jpg" }))
      .toBe("a-b-c-d-e-f-g-h-i-j.jpg");
  });

  it("이름이 없으면 그냥 image", () => {
    expect(downloadName({ alt: "", src: "https://x/y.webp" })).toBe("image.webp");
    expect(downloadName({ alt: "   ", src: "https://x/y.webp" })).toBe("image.webp");
  });

  it("이름이 너무 길면 자른다", () => {
    // 운영체제마다 상한이 있고, 넘치면 저장 자체가 실패한다.
    const long = "가".repeat(200);
    expect(downloadName({ alt: long, src: "https://x/y.png" }).length).toBeLessThanOrEqual(84);
  });
});
