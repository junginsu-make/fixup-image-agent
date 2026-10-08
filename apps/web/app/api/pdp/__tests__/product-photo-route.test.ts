import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { crc32 } from "node:zlib";

vi.mock("server-only", () => ({}));

let member: { ok: boolean; member?: { userId: string }; response?: Response } = { ok: true, member: { userId: "u1" } };
const settled: boolean[] = [];
const uploaded: Array<{ bytes: number; contentType: string }> = [];
let uploadUrl = "https://v3.fal.media/files/a/b.jpg";
let uploadFails = false;
let 정산결과: object | undefined = {};
let 예약됨 = true;
let 손질결과: object | undefined;
const 차례: string[] = [];

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => member,
  reserveAiUsage: async () => {
    차례.push("reserve");
    return 예약됨
      ? { ok: true as const, userId: "u1", requestId: "r1", usage: {} }
      : { ok: false as const, response: new Response(null, { status: 429 }) };
  },
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

vi.mock("../../../../lib/pdp/product-photo", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../../lib/pdp/product-photo")>();
  return {
    ...real,
    normalizeProductPhoto: async (...args: Parameters<typeof real.normalizeProductPhoto>) => {
      차례.push("normalize");
      return 손질결과 ?? real.normalizeProductPhoto(...args);
    },
  };
});

const { POST } = await import("../product-photo/route");

const 올린다 = (body: BodyInit) =>
  new Request("http://localhost/api/pdp/product-photo", { method: "POST", headers: { "content-type": "image/jpeg" }, body });
const jpeg = () => sharp({ create: { width: 64, height: 48, channels: 3, background: "#2d6a4f" } }).jpeg().toBuffer();
/** 머리말만 8000×5001 인 PNG(40백만 화소 + 1줄). 화소를 펼치지 않고 413 을 재려고. */
const 큰머리말 = async () => {
  const big = Buffer.from(await sharp({ create: { width: 1, height: 1, channels: 3, background: "#000" } }).png().toBuffer());
  big.writeUInt32BE(8000, 16);
  big.writeUInt32BE(5001, 20);
  big.writeUInt32BE(crc32(big.subarray(12, 29)) >>> 0, 29);
  return big;
};

beforeEach(() => {
  member = { ok: true, member: { userId: "u1" } };
  settled.length = 0;
  uploaded.length = 0;
  uploadUrl = "https://v3.fal.media/files/a/b.jpg";
  uploadFails = false;
  정산결과 = {};
  예약됨 = true;
  손질결과 = undefined;
  차례.length = 0;
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
    // 화면은 제 시계로 만료를 다시 잰다(서버·사용자 시계가 어긋나도) — 남은 시간을 함께 준다.
    expect(body.expiresInMs).toBe(60 * 60 * 1000);
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

  it("40백만 화소를 넘으면 413, 시간당 칸을 쓰지 않는다(설계 §9.2)", async () => {
    const response = await POST(올린다(await 큰머리말()));
    expect(response.status).toBe(413);
    expect(차례).toEqual([]);
    expect(uploaded).toHaveLength(0);
  });

  it("무거운 손질은 예약 뒤에 한다 — 예약이 막히면 손질하지 않는다", async () => {
    예약됨 = false;
    expect((await POST(올린다(await jpeg()))).status).toBe(429);
    expect(차례).toEqual(["reserve"]);
    expect(uploaded).toHaveLength(0);
  });

  it("예약한 뒤 손질이 실패하면 그 문구·상태로 답하고 정산은 실패로", async () => {
    손질결과 = { ok: false, status: 413, message: "이미지가 너무 큽니다." };
    const response = await POST(올린다(await jpeg()));
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ ok: false, message: "이미지가 너무 큽니다." });
    expect(차례).toEqual(["reserve", "normalize"]);
    expect(settled).toEqual([false]);
    expect(uploaded).toHaveLength(0);
  });
});
