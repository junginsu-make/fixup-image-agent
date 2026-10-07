import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

/**
 * **레퍼런스 처리가 실패할 때 저장소 · 데이터베이스 원문을 화면에 보내지 않는다**(2026-10-07).
 *
 * 화면(`SectionGallery` · `StyleReferenceAttach` · `ResultViewer`)은 `message` 를 그대로 띄운다. 원문 대신
 * 이 라우트가 원래 쓰던 일반 문장을 주고 상태 코드와 다른 칸은 그대로다. 우리가 쓴 안내는 그대로다.
 */

vi.mock("server-only", () => ({}));

const 원문 = 'new row violates row-level security policy for table "style_references"';

let 등록결과: unknown = { ok: true, id: "new-id", description: "" };
let 등록오류: unknown = null;
let 목록오류: unknown = null;
let 지우기결과: unknown = { ok: true, deleted: true };
let 지우기오류: unknown = null;
let 쌓인수 = 0;

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true, member: { userId: "u1" } }),
  reserveAiUsage: async () => ({ ok: true as const, userId: "u1", requestId: "r1", usage: {} }),
  settleAiUsage: async () => ({ remaining: 1 }),
}));

vi.mock("../../../../lib/user-style-references", () => ({
  registerUserStyleReference: async () => {
    if (등록오류) throw 등록오류;
    return 등록결과;
  },
  listUserStyleReferences: async () => {
    if (목록오류) throw 목록오류;
    return { references: [], total: 0, nextOffset: null, failed: false };
  },
  deleteUserStyleReference: async () => {
    if (지우기오류) throw 지우기오류;
    return 지우기결과;
  },
  ownerOfStyleReference: async () => null,
  countUserStyleReferences: async () => 쌓인수,
}));

const { GET, POST, DELETE } = await import("../style-references/route");

const png = async () =>
  sharp({ create: { width: 8, height: 8, channels: 3, background: "#456" } }).png().toBuffer();

const 올리기 = async () =>
  POST(new Request("http://localhost/api/pdp/style-references", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ imageBase64: (await png()).toString("base64") }),
  }));

const 지우기 = (id: string) =>
  DELETE(new Request("http://localhost/api/pdp/style-references", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  }));

const 아이디 = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  등록결과 = { ok: true, id: "new-id", description: "" };
  등록오류 = null;
  목록오류 = null;
  지우기결과 = { ok: true, deleted: true };
  지우기오류 = null;
  쌓인수 = 0;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("목록", () => {
  it("원문 대신 일반 문장이고 500 그대로다", async () => {
    목록오류 = new Error("Supabase 서비스 역할 키가 없습니다: SUPABASE_SERVICE_ROLE_KEY");

    const response = await GET(new Request("http://localhost/api/pdp/style-references"));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, message: "레퍼런스를 불러오지 못했습니다." });
  });
});

describe("등록", () => {
  it("저장이 원문으로 실패하면 일반 문장이고 422 · usage 그대로다", async () => {
    등록결과 = { ok: false, message: 원문 };

    const response = await 올리기();
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(422);
    expect(body).toEqual({ ok: false, message: "레퍼런스를 등록하지 못했습니다.", usage: { remaining: 1 } });
  });

  it("던지면 일반 문장이고 500 그대로다", async () => {
    등록오류 = new Error("Input buffer contains unsupported image format");

    const response = await 올리기();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, message: "레퍼런스를 등록하지 못했습니다." });
  });

  it("보관 한도 안내는 그대로다", async () => {
    쌓인수 = 10_000;

    const response = await 올리기();
    const body = (await response.json()) as { message: string };

    expect(response.status).toBe(409);
    expect(body.message).toMatch(/장까지 보관할 수 있습니다/);
  });
});

describe("지우기", () => {
  it("데이터베이스가 원문으로 실패하면 일반 문장이고 500 그대로다", async () => {
    지우기결과 = { ok: false, deleted: false, message: 원문 };

    const response = await 지우기(아이디);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, message: "삭제하지 못했습니다." });
  });

  it("던지면 일반 문장이고 500 그대로다", async () => {
    지우기오류 = new Error(원문);

    const response = await 지우기(아이디);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, message: "삭제하지 못했습니다." });
  });

  it("id 형식 안내는 그대로다", async () => {
    const response = await 지우기("not-a-uuid");

    expect(response.status).toBe(400);
    expect(((await response.json()) as { message: string }).message).toBe("id 형식이 올바르지 않습니다.");
  });
});
