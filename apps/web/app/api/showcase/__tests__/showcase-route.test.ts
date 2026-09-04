import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 갤러리 그림 라우트의 배선.
 *
 * `showcaseThumbUrl` → 라우트의 `?size=thumb` → `readShowcaseImage` 로 이어지는
 * 길이 한 군데라도 끊기면 **갤러리가 조용히 원본을 통째로 내보낸다.** 화면은
 * 멀쩡해 보이고 시험도 통과하므로 아무도 모른다. 그래서 여기서 붙잡는다.
 */

vi.mock("server-only", () => ({}));

const asked: Array<string | undefined> = [];

// 경로는 **이 시험 파일** 기준으로 풀린다. 라우트가 쓰는 경로와 다르다.
vi.mock("../store", () => ({
  readShowcaseImage: async (_id: string, size?: string) => {
    asked.push(size);
    return { bytes: Buffer.from("bytes"), mimeType: "image/webp" };
  },
}));

const { GET } = await import("../[id]/file/route");

const call = (url: string) =>
  GET(new Request(url), { params: Promise.resolve({ id: "abc" }) });

beforeEach(() => { asked.length = 0; });

describe("GET /api/showcase/[id]/file", () => {
  it("size=thumb 이면 사본을 청한다", async () => {
    await call("https://x/api/showcase/abc/file?size=thumb");

    expect(asked).toEqual(["thumb"]);
  });

  it("아무 말 없으면 원본을 청한다", async () => {
    await call("https://x/api/showcase/abc/file");

    expect(asked).toEqual(["full"]);
  });

  it("모르는 값은 원본으로 친다", async () => {
    await call("https://x/api/showcase/abc/file?size=../../etc/passwd");

    expect(asked).toEqual(["full"]);
  });
});
