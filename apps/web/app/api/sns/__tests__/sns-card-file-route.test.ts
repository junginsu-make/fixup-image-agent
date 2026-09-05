import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 로컬 모드에서 카드 한 장을 내려 주는 길.
 *
 * 미리보기 주소가 이 길로 온다. 파일 이름을 통째로 번호로 넘기면
 * `Number("1.thumb.webp")` 가 `NaN` 이 되어 404 가 난다 — 로컬 목록의 표지가
 * 통째로 깨진다. 개발 환경 전체가 이 갈래로 돈다.
 */

vi.mock("server-only", () => ({}));

let cards: Array<Record<string, unknown>> = [];
const reads: string[] = [];
let missing: string[] = [];

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "u1", profile: { role: "member" } } }),
}));

vi.mock("../../../../lib/local-store", () => ({
  isLocalStoreEnabled: () => true,
  localStoreRoot: () => "/tmp",
  getLocalDatabase: () => ({}),
  listLocalSnsCards: async () => cards,
  readLocalSnsResultFile: async (_root: string, path: string) => {
    reads.push(path);
    if (missing.includes(path)) throw new Error("없음");
    return Buffer.from([1, 2, 3]);
  },
}));

const { GET } = await import("../projects/[id]/cards/[index]/file/route");

const call = (url: string, index = "1") =>
  GET(new Request(url), { params: Promise.resolve({ id: "p1", index }) });

beforeEach(() => {
  reads.length = 0;
  missing = [];
  cards = [{ index: 1, assetPath: "u1/sns/p1/1.png", thumbPath: "u1/sns/p1/1.thumb.webp" }];
});

describe("GET 로컬 카드 파일", () => {
  it("size=thumb 이면 미리보기를 준다", async () => {
    const response = await call("https://x/f?size=thumb");

    expect(reads).toEqual(["u1/sns/p1/1.thumb.webp"]);
    expect(response.headers.get("content-type")).toBe("image/webp");
  });

  it("아무 말 없으면 원본이다", async () => {
    const response = await call("https://x/f");

    expect(reads).toEqual(["u1/sns/p1/1.png"]);
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("미리보기 자리가 비어 있으면 원본으로 떨어진다", async () => {
    cards = [{ index: 1, assetPath: "u1/sns/p1/1.png" }];

    const response = await call("https://x/f?size=thumb");

    expect(reads).toEqual(["u1/sns/p1/1.png"]);
    expect(response.status).toBe(200);
  });

  it("미리보기 파일만 사라져도 원본으로 떨어진다", async () => {
    missing = ["u1/sns/p1/1.thumb.webp"];

    const response = await call("https://x/f?size=thumb");

    expect(reads).toEqual(["u1/sns/p1/1.thumb.webp", "u1/sns/p1/1.png"]);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
  });
});
