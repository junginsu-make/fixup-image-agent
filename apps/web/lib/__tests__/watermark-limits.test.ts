import { describe, expect, it, vi } from "vitest";
// sharp 0.35.0 은 lib/index.d.ts 를 담지만 exports 에 types 조건이 없다.
// @ts-expect-error 런타임 export 는 정상. 꾸러미 메타데이터가 선언을 가린다.
import sharp from "sharp";

/**
 * 표기를 새기는 자리에도 픽셀 상한이 있어야 한다.
 *
 * `saveLibraryItem` 은 `markAsAi` 를 먼저 부르고 그 결과를 인코딩에 넘긴다.
 * 그래서 인코딩 쪽에만 상한을 걸면 **표기 단계가 상한을 앞질러 간다** —
 * 작은 파일 한 장으로 서버 메모리를 훑을 수 있는 길이 열린 채로 남는다.
 */

// watermark.ts 는 `server-only` 를 부르는데 시험 환경에는 그 꾸러미가 없다.
vi.mock("server-only", () => ({}));
vi.mock("../ai-badge-setting", () => ({ isAiBadgeEnabled: async () => true }));

const { markAsAi } = await import("../watermark");
const { MAX_INPUT_PIXELS } = await import("../image-encoding");

describe("markAsAi", () => {
  it("상한을 넘는 그림은 손대지 않고 원본을 돌려준다", async () => {
    const edge = Math.ceil(Math.sqrt(MAX_INPUT_PIXELS)) + 500;
    const huge = await sharp({
      create: { width: edge, height: edge, channels: 3, background: "#123456" },
    }).png().toBuffer();
    expect(edge * edge).toBeGreaterThan(MAX_INPUT_PIXELS);

    expect((await markAsAi(huge)).equals(huge)).toBe(true);
  });

  it("보통 크기의 그림에는 표기를 새긴다", async () => {
    const normal = await sharp({
      create: { width: 400, height: 400, channels: 3, background: "#123456" },
    }).png().toBuffer();

    expect((await markAsAi(normal)).equals(normal)).toBe(false);
  });
});
