import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleCandidatePatch } from "../candidate-handler";

/**
 * **수집함이 실패할 때 데이터베이스 원문을 화면에 보내지 않는다**(2026-10-07).
 *
 * 원문 대신 이 라우트가 원래 쓰던 일반 문장을 주고 상태 코드는 그대로다. 우리가 쓴 입력 안내(400)는 그대로다.
 */

vi.mock("server-only", () => ({}));

let 목록오류: unknown = null;

vi.mock("../../../../lib/access/disabled-api", () => ({ disabledRouteResponse: () => null }));
vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true, member: { userId: "u1", profile: { role: "member" } } }),
}));
vi.mock("../../../../lib/repository-factory", () => ({
  candidateServiceForUser: async () => ({
    list: async () => {
      if (목록오류) throw 목록오류;
      return [];
    },
  }),
}));

const { GET } = await import("../route");

const 고치기 = (body: unknown) =>
  new Request("http://localhost/api/candidates/c1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  목록오류 = null;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("수집함 원문 가리기", () => {
  it("목록: 원문 대신 일반 문장이고 500 그대로다", async () => {
    목록오류 = new Error('relation "content_candidates" does not exist');

    const response = await GET();
    const body = (await response.json()) as { ok: boolean; message: string };

    expect(response.status).toBe(500);
    expect(body).toEqual({ ok: false, message: "수집함을 불러오지 못했습니다." });
  });

  it("상태 바꾸기: 원문 대신 일반 문장이고 500 그대로다", async () => {
    const response = await handleCandidatePatch(고치기({ status: "picked" }), "c1", {
      updateStatus: async () => { throw new Error("JWT expired"); },
    });
    const body = (await response.json()) as { ok: boolean; message: string };

    expect(response.status).toBe(500);
    expect(body).toEqual({ ok: false, message: "후보 상태를 바꾸지 못했습니다." });
  });

  it("상태 바꾸기: 입력 안내는 그대로다", async () => {
    const response = await handleCandidatePatch(고치기({ status: "완료" }), "c1", {
      updateStatus: async () => ({}),
    });
    const body = (await response.json()) as { message: string };

    expect(response.status).toBe(400);
    expect(body.message).toBe("후보 상태를 확인해 주세요.");
  });
});
