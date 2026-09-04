import { describe, expect, it } from "vitest";
import { posterAssetPathsToRemove } from "../../../../lib/poster/supabase-store-core";

/**
 * 지울 때 사본도 함께 지운다.
 *
 * 행은 FK 로 함께 사라지므로 **사본의 자리를 아는 근거가 없어진다.** 여기서
 * 빠뜨리면 아무도 못 찾는 파일이 버킷에 영원히 남는다. 라이브러리·갤러리에서
 * 이미 한 번씩 잡힌 실수라 같은 모양으로 못 박아 둔다.
 */

describe("posterAssetPathsToRemove", () => {
  it("원본과 사본을 함께 모은다", () => {
    expect(posterAssetPathsToRemove([
      { assetPath: "u/poster/p/0.png", thumbPath: "u/poster/p/0.thumb.webp" },
      { assetPath: "u/poster/p/1.png", thumbPath: "u/poster/p/1.thumb.webp" },
    ])).toEqual([
      "u/poster/p/0.png", "u/poster/p/0.thumb.webp",
      "u/poster/p/1.png", "u/poster/p/1.thumb.webp",
    ]);
  });

  it("사본이 없는 옛 결과는 원본만 모은다", () => {
    expect(posterAssetPathsToRemove([{ assetPath: "u/poster/p/0.png", thumbPath: null }]))
      .toEqual(["u/poster/p/0.png"]);
  });
});
