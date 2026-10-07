import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

/**
 * **파일 이름이 길어도 그림은 올라간다**(2026-10-07 운영 보고).
 *
 * 화면은 파일 이름을 제목으로 보낸다. 서버가 제목 200자를 넘으면 거절해,
 * 이름이 긴 그림(인터넷에서 받은 그림 등)은 카드뉴스에 한 장도 못 붙였다.
 * 화면에는 `[{"origin":"string","code":"too_big",…}]` 이 그대로 떴다.
 *
 * 제목은 이름표일 뿐이다. 거절하지 않고 자른다. 거절할 때도 우리말로 말한다.
 */
vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({ auth: vi.fn(), save: vi.fn() }));
vi.mock("../../../../lib/membership/api", () => ({ authenticateApiMember: mocks.auth }));
vi.mock("../../../../lib/reference-images", () => ({
  saveReferenceImage: mocks.save,
  listReferenceImages: async () => [],
  localFileUrl: (id: string) => `/local/${id}`,
}));
vi.mock("../../../../lib/teams/store", () => ({ teamIdOf: async () => null }));
vi.mock("../../../../lib/local-store", () => ({ isLocalStoreEnabled: () => false }));
vi.mock("../../../../lib/access/core", () => ({ viewerFrom: () => ({}), hasFullScope: () => false }));

const { POST } = await import("../route");

const ID = "11111111-1111-4111-8111-111111111111";
const png = () => sharp({ create: { width: 8, height: 8, channels: 3, background: "#c84" } }).png().toBuffer();

async function 올린다(fields: { id?: string; title: string }) {
  const form = new FormData();
  form.append("id", fields.id ?? ID);
  form.append("title", fields.title);
  form.append("purpose", "cardnews");
  form.append("file", new File([Uint8Array.from(await png())], "a.png", { type: "image/png" }));
  return POST(new Request("http://local/api/reference-images", { method: "POST", body: form }));
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, member: { userId: "u1", profile: { role: "member" } } });
  mocks.save.mockResolvedValue({ id: ID, title: "x", purpose: "cardnews" });
});

describe("제목(파일 이름)이 길 때", () => {
  it("거절하지 않고 200자로 잘라 저장한다", async () => {
    const response = await 올린다({ title: "가".repeat(260) });
    expect(response.status).toBe(201);
    expect(mocks.save.mock.calls[0]![0].title).toBe("가".repeat(200));
  });

  /** 이모지는 두 칸이다. 칸으로 자르면 반쪽이 남아 DB 가 거절한다(2026-10-07 리뷰). */
  it("이모지를 반쪽으로 자르지 않는다", async () => {
    await 올린다({ title: "가".repeat(199) + "😀😀" });
    const saved = mocks.save.mock.calls[0]![0].title as string;
    expect(saved).toBe("가".repeat(199) + "😀");
    // 짝 잃은 반쪽(앞쪽 칸)이 없어야 한다.
    expect(saved).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it("200자 이하는 그대로", async () => {
    await 올린다({ title: "본보기" });
    expect(mocks.save.mock.calls[0]![0].title).toBe("본보기");
  });
});

describe("거절할 때의 말", () => {
  it("입력 검사 원문(JSON)을 화면에 내지 않는다", async () => {
    const response = await 올린다({ id: "not-a-uuid", title: "본보기" });
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.message).not.toMatch(/[[{]|"code"|too_big|invalid/i);
    expect(body.message).toContain("다시");
  });
});
