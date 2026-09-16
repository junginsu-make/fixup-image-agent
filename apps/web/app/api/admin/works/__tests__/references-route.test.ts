import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 복사 주소를 **실제로 불러서** 잰다.
 *
 * 원문을 훑는 가늠자는 두 번 뚫렸다(2026-09-16 독립 리뷰).
 *
 * - `request.json(` 을 금지했더니 `.text()` 로, `_request` 이름을 세었더니
 *   `arguments[0]` 로 본문을 읽어도 초록이었다
 * - 주인 팀을 `null` 로, 주인을 관리자로 바꿔도 초록이었다
 *
 * 그래서 요청 본문에 **어떤 식으로든 손대면 터지는** 가짜 요청을 넣고, 복사
 * 함수가 받은 인자를 그대로 본다.
 */
vi.mock("server-only", () => ({}));

const copyReferencesToSelf = vi.fn();
const readAnyWork = vi.fn();
const teamIdOf = vi.fn();
let admin = true;

vi.mock("../../../../../lib/membership/api", () => ({
  authenticateApiAdmin: async () => (admin
    ? { ok: true, member: { userId: "관리자" } }
    : { ok: false, response: Response.json({ ok: false }, { status: 403 }) }),
}));
vi.mock("../store", () => ({ copyReferencesToSelf, readAnyWork }));
vi.mock("../../../../../lib/teams/store", () => ({ teamIdOf }));

const { POST } = await import("../[kind]/[id]/references/route");

/** 무엇이든 건드리면 터지는 요청. 본문을 읽으려는 순간 잡힌다. */
const untouchable = new Proxy({}, {
  get(_target, key) {
    throw new Error(`요청을 건드렸다: ${String(key)}`);
  },
}) as Request;

const context = (kind: string, id = "w1") => ({ params: Promise.resolve({ kind, id }) });

beforeEach(() => {
  admin = true;
  copyReferencesToSelf.mockReset().mockResolvedValue([{ from: "a", id: "b", storagePath: "p", url: null }]);
  readAnyWork.mockReset().mockResolvedValue({
    userId: "회원A",
    data: { referenceIds: ["그림1"], preservedIds: ["그림2"], attachmentOrder: ["그림2", "그림1"] },
  });
  teamIdOf.mockReset().mockImplementation(async (userId: string) => (userId === "회원A" ? "팀X" : "관리자팀"));
});

describe("복사 주소 — 무엇을 누구 기준으로 복사하나", () => {
  it("**작업 기록의 그림을, 관리자에게, 작업 주인과 그 팀 기준으로** 복사한다", async () => {
    const response = await POST(untouchable, context("poster"));

    expect(response.status).toBe(200);
    expect(copyReferencesToSelf).toHaveBeenCalledTimes(1);
    const [ids, adminId, owner, adminTeam] = copyReferencesToSelf.mock.calls[0]!;
    expect([...ids].sort()).toEqual(["그림1", "그림2"]);
    expect(adminId).toBe("관리자");
    // 주인을 관리자로 바꾸면 주인 팀 그림이 조용히 빠진다.
    expect(owner).toEqual({ userId: "회원A", teamId: "팀X" });
    // 공용 원본의 복사본을 둘 곳 — 관리자의 팀이다. 주인 팀과 헷갈리면 안 된다.
    expect(adminTeam).toBe("관리자팀");
  });

  it("**요청을 전혀 건드리지 않는다** — 화면이 보낸 id 로 복사할 길이 없다", async () => {
    // `untouchable` 을 건드리면 던지고, 라우트가 그것을 잡아 500 을 낸다.
    const response = await POST(untouchable, context("sns"));

    expect(response.status).toBe(200);
  });

  it("**진짜 본문에 남의 그림 id 를 실어 보내도** 복사 대상에 안 섞인다", async () => {
    /*
      건드리면 터지는 요청만으로는 모자랐다. 라우트가 본문 읽기를 try 로 감싸면
      터져도 삼켜서 초록이었다(2026-09-16 리뷰가 실증). 그래서 **읽을 수 있는 진짜
      본문**을 주고, 그것이 결과에 안 섞이는지 본다.
    */
    const tempting = new Request("http://localhost/api/admin/works/poster/w1/references", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["남의그림"], referenceIds: ["남의그림"] }),
    });

    const response = await POST(tempting, context("poster"));

    expect(response.status).toBe(200);
    expect(copyReferencesToSelf.mock.calls[0]![0]).not.toContain("남의그림");
    expect([...copyReferencesToSelf.mock.calls[0]![0]].sort()).toEqual(["그림1", "그림2"]);
  });

  it("카드뉴스는 첨부의 id 를 쓴다", async () => {
    readAnyWork.mockResolvedValue({ userId: "회원A", data: { attachments: [{ id: "첨부1" }] } });

    await POST(untouchable, context("sns"));

    expect(copyReferencesToSelf.mock.calls[0]![0]).toEqual(["첨부1"]);
  });
});

describe("복사 주소 — 막아야 할 때", () => {
  it("관리자가 아니면 작업을 읽지도 않는다", async () => {
    admin = false;

    const response = await POST(untouchable, context("poster"));

    expect(response.status).toBe(403);
    expect(readAnyWork).not.toHaveBeenCalled();
    expect(copyReferencesToSelf).not.toHaveBeenCalled();
  });

  it("모르는 갈래는 404", async () => {
    expect((await POST(untouchable, context("character"))).status).toBe(404);
    expect(copyReferencesToSelf).not.toHaveBeenCalled();
  });

  it("작업이 없으면 404", async () => {
    readAnyWork.mockResolvedValue(null);

    expect((await POST(untouchable, context("poster"))).status).toBe(404);
    expect(copyReferencesToSelf).not.toHaveBeenCalled();
  });

  it("**작업 주인을 모르면 복사하지 않는다**", async () => {
    readAnyWork.mockResolvedValue({ data: { referenceIds: ["그림1"] } });

    const response = await POST(untouchable, context("poster"));

    expect(response.status).toBe(500);
    expect(copyReferencesToSelf).not.toHaveBeenCalled();
  });

  it("DB 오류 문구를 화면에 흘리지 않는다", async () => {
    copyReferencesToSelf.mockRejectedValue(new Error('relation "reference_images" violates check'));

    const response = await POST(untouchable, context("poster"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("reference_images");
  });
});
