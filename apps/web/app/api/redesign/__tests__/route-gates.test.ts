import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **리디자인 라우트 여섯 중 셋은 시험이 아예 없었다**(X-04).
 *
 * 설계 §14.6: 「Claude §9 / redesign route 시험 공백 | **인증·본문·모델·정산·
 * 부분 실패 동작 시험** | T-INPUT/T-JOB」.
 *
 * `client-log`·`config`·`knowledge` 를 들이는 시험 파일이 **0건**이었다
 * (2026-09-21 조사). 특히 `knowledge` 는 **관리자 문**이 셋이나 있는데
 * 아무도 안 봤다 — 그 문이 회원 문으로 바뀌어도 시험은 전부 통과한다.
 *
 * 공용 지식은 **모든 사용자의 생성 결과에 들어간다.** 아무나 넣을 수 있으면
 * 한 사람이 올린 글이 남의 상세페이지 문구가 된다.
 */

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  member: vi.fn(),
  admin: vi.fn(),
  stats: vi.fn(),
  index: vi.fn(),
  remove: vi.fn(),
  log: vi.fn(),
}));

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: mocks.member,
  authenticateApiAdmin: mocks.admin,
}));

vi.mock("@fixup/redesign-core", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    knowledgeStats: mocks.stats,
    indexKnowledge: mocks.index,
    deleteKnowledge: mocks.remove,
  };
});

vi.mock("../../../../lib/server-keys", () => ({
  resolveOpenaiKey: () => "sk-test",
  resolveGoogleKey: () => "g-test",
  serverKeyStatus: () => ({ serverOpenaiKeyConfigured: true, serverGoogleKeyConfigured: true }),
}));

const knowledge = await import("../knowledge/route");
const config = await import("../config/route");
const clientLog = await import("../client-log/route");

const 요청 = (body: unknown, method = "POST") =>
  new Request("http://local/api/redesign/knowledge", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const 막힘 = { ok: false as const, response: new Response(null, { status: 403 }) };
const 통과 = { ok: true as const, member: { userId: "u1", profile: { role: "member" } } };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.member.mockResolvedValue(통과);
  mocks.admin.mockResolvedValue(통과);
  mocks.stats.mockResolvedValue({ configured: true, documents: 3 });
  mocks.index.mockResolvedValue({ indexed: true, chunks: 5 });
  mocks.remove.mockResolvedValue({ deleted: true });
});

/**
 * **공용 지식을 아무나 넣으면 남의 페이지가 바뀐다.**
 *
 * 이것이 이 파일에서 가장 중요한 묶음이다.
 */
describe("지식파일은 관리자만 바꾼다", () => {
  it.each([
    ["등록", () => knowledge.POST(요청({ name: "a", text: "b" }))],
    ["삭제", () => knowledge.DELETE(요청({ documentId: "d1" }, "DELETE"))],
  ])("**%s 은 관리자 문을 지난다**", async (_label, call) => {
    await call();

    expect(mocks.admin).toHaveBeenCalledTimes(1);
    // 회원 문으로 바뀌면 아무나 공용 지식을 바꾼다.
    expect(mocks.member).not.toHaveBeenCalled();
  });

  it.each([
    ["등록", () => knowledge.POST(요청({ name: "a", text: "b" }))],
    ["삭제", () => knowledge.DELETE(요청({ documentId: "d1" }, "DELETE"))],
  ])("**관리자가 아니면 %s 이 막힌다**", async (_label, call) => {
    mocks.admin.mockResolvedValue(막힘);

    const response = await call();

    expect(response.status).toBe(403);
    expect(mocks.index).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  /**
   * **읽기는 회원이면 된다.** 등록·삭제만 관리자다. 읽기까지 막으면 화면이
   * 「등록된 자료 없음」으로 보인다.
   */
  it("**읽기는 회원 문이다**", async () => {
    await knowledge.GET();

    expect(mocks.member).toHaveBeenCalledTimes(1);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("**회원이 아니면 읽기도 막힌다**", async () => {
    mocks.member.mockResolvedValue(막힘);

    expect((await knowledge.GET()).status).toBe(403);
    expect(mocks.stats).not.toHaveBeenCalled();
  });
});

describe("지식파일 본문", () => {
  it("**JSON 이 아니면 500 이 아니라 오류 문구를 준다**", async () => {
    const response = await knowledge.POST(
      new Request("http://local/api/redesign/knowledge", { method: "POST", body: "{깨진" }),
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mocks.index).not.toHaveBeenCalled();
  });

  /**
   * **빈 글도 코어까지 간다.** 무엇을 거절할지는 코어가 정한다 — 라우트가
   * 따로 판단하면 두 벌이 된다.
   */
  it("**빈 글자는 코어가 받는다**", async () => {
    await knowledge.POST(요청({ name: "a", text: "" }));

    expect(mocks.index).toHaveBeenCalledWith(expect.objectContaining({ text: "" }));
  });

  it("**코어가 거절하면 그 상태를 그대로 준다**", async () => {
    const { RedesignError } = await import("@fixup/redesign-core");
    mocks.index.mockRejectedValue(new RedesignError("지식 저장소가 없습니다.", 503));

    const response = await knowledge.POST(요청({ name: "a", text: "b" }));

    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe("지식 저장소가 없습니다.");
  });

  it("**모르는 오류는 500 이다**", async () => {
    mocks.index.mockRejectedValue(new Error("알 수 없음"));

    expect((await knowledge.POST(요청({ name: "a", text: "b" }))).status).toBe(500);
  });
});

describe("설정 읽기도 문을 지난다", () => {
  it("**회원이 아니면 막힌다**", async () => {
    mocks.member.mockResolvedValue(막힘);

    expect((await config.GET()).status).toBe(403);
  });

  it("**회원이면 준다**", async () => {
    const response = await config.GET();

    expect(response.status).toBe(200);
  });
});

describe("화면 로그도 문을 지난다", () => {
  const 로그요청 = (body: unknown) =>
    new Request("http://local/api/redesign/client-log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("**회원이 아니면 막힌다** — 아무나 서버 로그를 채우면 안 된다", async () => {
    mocks.member.mockResolvedValue(막힘);

    expect((await clientLog.POST(로그요청({ event: "x" }))).status).toBe(403);
  });

  it("**회원이면 받는다**", async () => {
    const response = await clientLog.POST(로그요청({ event: "generate:start" }));

    expect(response.status).toBeLessThan(400);
  });

  it("**깨진 본문에도 안 터진다** — 로그 때문에 화면이 멈추면 안 된다", async () => {
    const response = await clientLog.POST(
      new Request("http://local/api/redesign/client-log", { method: "POST", body: "{깨진" }),
    );

    expect(response.status).toBeLessThan(500);
  });
});
