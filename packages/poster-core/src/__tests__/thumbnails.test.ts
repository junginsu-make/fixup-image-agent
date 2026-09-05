import { describe, expect, it } from "vitest";
import { posterImageRows } from "../generate";

/**
 * 미리보기 사본의 자리.
 *
 * 결과 목록은 변형 세 장을 한꺼번에 깔면서 **원본을 그대로** 내려받는다.
 * 한 장이 2~4MB 라 목록 한 번이 10MB 를 넘는다.
 *
 * 사본은 원본과 별개 파일이라 원본에는 아무 영향이 없다. 여기서 지킬 것은
 * 사본의 자리가 행에 정확히 실리는가 하나다 — 안 실리면 아무도 못 찾는
 * 파일이 되고, 어긋나면 남의 그림이 뜬다.
 */
describe("posterImageRows — 사본의 자리", () => {
  const images = [{ url: "a", width: 1024, height: 1536 }, { url: "b", width: 1024, height: 1536 }];

  it("장마다 제 사본 자리를 싣는다", () => {
    const rows = posterImageRows({
      projectId: "p1",
      generationRequestId: "r1",
      images,
      paths: ["u/poster/p1/0.png", "u/poster/p1/1.png"],
      thumbPaths: ["u/poster/p1/0.thumb.webp", "u/poster/p1/1.thumb.webp"],
    });

    expect(rows[0]!.thumbPath).toBe("u/poster/p1/0.thumb.webp");
    expect(rows[1]!.thumbPath).toBe("u/poster/p1/1.thumb.webp");
  });

  it("사본을 못 만든 장은 자리가 비어 있다", () => {
    const rows = posterImageRows({
      projectId: "p1",
      generationRequestId: "r1",
      images,
      paths: ["u/poster/p1/0.png", "u/poster/p1/1.png"],
      thumbPaths: [null, "u/poster/p1/1.thumb.webp"],
    });

    expect(rows[0]!.thumbPath).toBeNull();
    expect(rows[1]!.thumbPath).toBe("u/poster/p1/1.thumb.webp");
  });

  it("사본 자리를 아예 안 주면 전부 비어 있다 — 옛 흐름이 안 깨진다", () => {
    const rows = posterImageRows({
      projectId: "p1", generationRequestId: "r1", images,
      paths: ["u/poster/p1/0.png", "u/poster/p1/1.png"],
    });

    expect(rows.every((row) => row.thumbPath === null)).toBe(true);
  });

  it("장수와 사본 수가 다르면 거부한다 — 어긋나면 남의 그림이 뜬다", () => {
    expect(() => posterImageRows({
      projectId: "p1", generationRequestId: "r1", images,
      paths: ["u/poster/p1/0.png", "u/poster/p1/1.png"],
      thumbPaths: ["u/poster/p1/0.thumb.webp"],
    })).toThrow();
  });
});
