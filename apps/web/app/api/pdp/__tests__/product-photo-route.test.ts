import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("server-only", () => ({}));

let member: { ok: boolean; member?: { userId: string }; response?: Response } = { ok: true, member: { userId: "u1" } };
const settled: boolean[] = [];
const uploaded: Array<{ bytes: number; contentType: string }> = [];
let uploadUrl = "https://v3.fal.media/files/a/b.jpg";
let uploadFails = false;
let 정산결과: object | undefined = {};

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => member,
  reserveAiUsage: async () => ({ ok: true as const, userId: "u1", requestId: "r1", usage: {} }),
  settleAiUsage: async (_r: unknown, success: boolean) => { settled.push(success); return 정산결과; },
}));
vi.mock("../../../../lib/fal/upload", () => ({
  createFalUploader: () => ({
    uploadReference: async (bytes: Uint8Array, contentType: string) => {
      if (uploadFails) throw new Error("fal 500 internal detail");
      uploaded.push({ bytes: bytes.byteLength, contentType });
      return uploadUrl;
    },
  }),
}));

const { POST } = await import("../product-photo/route");

const 올린다 = (body: BodyInit) =>
  new Request("http://localhost/api/pdp/product-photo", { method: "POST", headers: { "content-type": "image/jpeg" }, body });
const jpeg = () => sharp({ create: { width: 64, height: 48, channels: 3, background: "#2d6a4f" } }).jpeg().toBuffer();

beforeEach(() => {
  member = { ok: true, member: { userId: "u1" } };
  settled.length = 0;
  uploaded.length = 0;
  uploadUrl = "https://v3.fal.media/files/a/b.jpg";
  uploadFails = false;
  정산결과 = {};
});

describe("제품 원본 올리기", () => {
  it("로그인 안 했으면 그 답을 그대로", async () => {
    member = { ok: false, response: new Response(null, { status: 401 }) };
    expect((await POST(올린다(await jpeg()))).status).toBe(401);
    expect(uploaded).toHaveLength(0);
  });

  it("그림이면 fal 에 한 번 올리고 주소와 만료 시각을 준다", async () => {
    const response = await POST(올린다(await jpeg()));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, url: "https://v3.fal.media/files/a/b.jpg" });
    expect(body.expiresAt).toBeGreaterThan(Date.now() + 50 * 60 * 1000);
    expect(uploaded).toEqual([{ bytes: expect.any(Number), contentType: "image/jpeg" }]);
    expect(settled).toEqual([true]);
  });

  it("딱지만 그림인 글자는 400, 올리지 않는다", async () => {
    expect((await POST(올린다("hello"))).status).toBe(400);
    expect(uploaded).toHaveLength(0);
  });

  it("20MB 를 넘으면 413", async () => {
    expect((await POST(올린다(new Uint8Array(20 * 1024 * 1024 + 2048)))).status).toBe(413);
  });

  it("fal 이 실패하면 내부 문구 없이 502, 정산은 실패로", async () => {
    uploadFails = true;
    const response = await POST(올린다(await jpeg()));
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("internal detail");
    expect(settled).toEqual([false]);
  });

  it("정산이 못 닫혀도(결과 없음) 올린 주소는 그대로 준다", async () => {
    정산결과 = undefined;
    const response = await POST(올린다(await jpeg()));
    expect(response.status).toBe(200);
    expect(settled).toEqual([true]);
  });

  it("돌아온 주소가 fal 저장소가 아니면 쓰지 않는다", async () => {
    uploadUrl = "https://example.com/a.jpg";
    expect((await POST(올린다(await jpeg()))).status).toBe(502);
  });
});
