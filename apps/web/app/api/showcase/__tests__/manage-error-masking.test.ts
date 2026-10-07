import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **갤러리 관리가 실패할 때 저장소 · 데이터베이스 원문을 화면에 보내지 않는다**(2026-10-07).
 *
 * 관리자 화면(`showcase-panel.tsx` · `works-tab.tsx`)은 `message` 를 그대로 띄운다. 원문 대신 이 라우트가
 * 원래 쓰던 일반 문장을 주고 **상태 코드는 그대로**다. 우리가 쓴 안내(못 찾음 · 이미 걸림 · 차례 거절)는 그대로다.
 */

vi.mock("server-only", () => ({}));

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiAdmin: async () => ({ ok: true as const, member: { userId: "admin-1", profile: { role: "admin" } } }),
}));

type 답 = { data?: unknown; error?: unknown };

/** `<표>.<동작>` 마다 돌려줄 답. 없으면 오류 없는 빈 답이다. */
let 답들: Record<string, 답> = {};
let 올리기답: 답 = { error: null };

function 질의(table: string) {
  let op = "select";
  const self: Record<string, unknown> = {
    select: () => self,
    eq: () => self,
    not: () => self,
    order: () => self,
    limit: () => self,
    update: () => { op = "update"; return self; },
    delete: () => { op = "delete"; return self; },
    insert: async () => 답들[`${table}.insert`] ?? { error: null },
    maybeSingle: async () => 답들[`${table}.maybeSingle`] ?? { data: null, error: null },
    then: (resolve: (value: 답) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(답들[`${table}.${op}`] ?? { data: [], error: null }).then(resolve, reject),
  };
  return self;
}

vi.mock("../../../../lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => 질의(table),
    storage: {
      from: () => ({
        download: async () => ({ data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }, error: null }),
        upload: async () => 올리기답,
        remove: async () => ({ error: null }),
      }),
    },
  }),
}));

const { GET, POST, PATCH, PUT, DELETE } = await import("../manage/route");

const 일반 = "요청을 처리하지 못했습니다.";
const 원문 = { message: 'relation "showcase_items" does not exist', code: "42P01" };
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const 본문 = (method: string, body: unknown) =>
  new Request("http://localhost/api/showcase/manage", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const 걸기 = () => POST(본문("POST", { sourceKind: "sns", sourceId: A }));
const 줄 = { id: A, source_kind: "sns", source_id: B, source_index: 0, owner_id: "u2", storage_path: "showcase/a.png", position: 5, visible: true };

beforeEach(() => {
  답들 = {
    "sns_cards.select": { data: [{ user_id: "u2", index: 0, asset_path: "u2/sns/p/0.png" }], error: null },
  };
  올리기답 = { error: null };
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

async function 읽기(response: Response) {
  return { status: response.status, body: (await response.json()) as { ok: boolean; message?: string } };
}

describe("원문 대신 일반 문장, 상태 코드 그대로", () => {
  it("목록: 500", async () => {
    답들["showcase_items.select"] = { data: null, error: 원문 };

    expect(await 읽기(await GET())).toEqual({ status: 500, body: { ok: false, message: 일반 } });
  });

  it("걸기: 검사 원문(zod) 대신 일반 문장이고 400", async () => {
    expect(await 읽기(await POST(본문("POST", { sourceKind: "sns", sourceId: "x" }))))
      .toEqual({ status: 400, body: { ok: false, message: 일반 } });
  });

  it("걸기: 복사본을 못 올리면 400", async () => {
    올리기답 = { error: { message: "The resource already exists https://x.supabase.co/storage/v1/object/sign/a?token=SECRET" } };

    expect(await 읽기(await 걸기())).toEqual({ status: 400, body: { ok: false, message: 일반 } });
  });

  it("걸기: 줄을 못 넣으면 400", async () => {
    답들["showcase_items.insert"] = { error: 원문 };

    expect(await 읽기(await 걸기())).toEqual({ status: 400, body: { ok: false, message: 일반 } });
  });

  it("고치기: 500", async () => {
    답들["showcase_items.update"] = { error: 원문 };

    expect(await 읽기(await PATCH(본문("PATCH", { id: A, visible: false }))))
      .toEqual({ status: 500, body: { ok: false, message: 일반 } });
  });

  it("차례: 409", async () => {
    답들["showcase_items.select"] = { data: [줄], error: null };
    답들["showcase_items.update"] = { error: 원문 };

    expect(await 읽기(await PUT(본문("PUT", { order: [A] }))))
      .toEqual({ status: 409, body: { ok: false, message: 일반 } });
  });

  it("내리기: 404", async () => {
    답들["showcase_items.maybeSingle"] = { data: { storage_path: "showcase/a.png", thumb_path: null }, error: null };
    답들["showcase_items.delete"] = { error: 원문 };

    expect(await 읽기(await DELETE(본문("DELETE", { id: A }))))
      .toEqual({ status: 404, body: { ok: false, message: 일반 } });
  });
});

describe("우리가 쓴 안내는 그대로", () => {
  it("걸기: 이미 걸린 그림", async () => {
    답들["showcase_items.insert"] = { error: { message: "duplicate key", code: "23505" } };

    expect(await 읽기(await 걸기()))
      .toEqual({ status: 400, body: { ok: false, message: "이미 갤러리에 걸린 그림입니다." } });
  });

  it("걸기: 걸 그림이 없음", async () => {
    답들["sns_cards.select"] = { data: [], error: null };

    expect(await 읽기(await 걸기()))
      .toEqual({ status: 400, body: { ok: false, message: "걸 그림을 찾지 못했습니다." } });
  });

  it("차례: 같은 항목 두 번", async () => {
    답들["showcase_items.select"] = { data: [줄], error: null };

    expect(await 읽기(await PUT(본문("PUT", { order: [A, A] }))))
      .toEqual({ status: 409, body: { ok: false, message: "같은 항목이 두 번 들어 있습니다." } });
  });

  it("내리기: 없는 항목", async () => {
    expect(await 읽기(await DELETE(본문("DELETE", { id: A }))))
      .toEqual({ status: 404, body: { ok: false, message: "갤러리 항목을 찾지 못했습니다." } });
  });

  it("걸기: 성공은 그대로", async () => {
    const { status, body } = await 읽기(await 걸기());

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });
});
