import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **「다양하게」 작업 처리가 실패할 때 저장소 원문을 화면에 보내지 않는다**(2026-10-07, 고치기의 `editFailure` 와 같은 규칙).
 *
 * 저장소는 「포스터 작업 조회: <Supabase 원문>」처럼 던진다. 원문 대신 각 처리가 원래 쓰던 일반 문장을 주고
 * **상태 코드는 그대로**다. 우리가 쓴 문장(입력 검사 `PosterValidationError` · 404 · 고르기 거절)은 그대로다.
 */

vi.mock("server-only", () => ({}));

const 원문 = '포스터 작업 조회: relation "poster_projects" does not exist';

let 오류: unknown = null;
let 작업: Record<string, unknown> | null = { id: "p1", status: "ready", data: {} };
let 서비스오류: unknown = null;
let 저장오류: unknown = null;

const 던지면 = <T>(value: T) => async () => {
  if (오류) throw 오류;
  return value;
};

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "u1", profile: { role: "member" } } }),
  finalizeAiUsage: async () => ({}),
}));

vi.mock("../../../../lib/poster/stores", () => ({
  posterStoresForUser: () => ({
    projects: {
      get: async () => {
        if (오류) throw 오류;
        return 작업;
      },
      update: async () => {
        if (오류 || 저장오류) throw 오류 ?? 저장오류;
        return { id: "p1" };
      },
    },
    images: {
      byProject: 던지면([{ id: "11111111-1111-4111-8111-111111111111", selected: false }]),
      byProjects: 던지면([]),
      select: 던지면(undefined),
    },
  }),
}));

vi.mock("../projects/poster-service", async (importOriginal) => {
  const real = await importOriginal<typeof import("../projects/poster-service")>();
  const 서비스 = async () => {
    if (서비스오류) throw 서비스오류;
    return { id: "p1" };
  };
  return {
    ...real,
    createPosterService: () => ({ list: 서비스, create: 서비스, updateSlots: 서비스, remove: 서비스 }),
  };
});

vi.mock("../../admin/works/store", () => ({ deleteAnyWork: async () => true }));
vi.mock("../../../../lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock("../../../../lib/teams/store", () => ({ teamIdOf: async () => null }));
vi.mock("../../../../lib/poster/references", () => ({
  posterReferences: async () => {
    if (오류) throw 오류;
    return [];
  },
}));

const { PosterValidationError } = await import("../projects/poster-service");
const projects = await import("../projects/route");
const project = await import("../projects/[id]/route");
const select = await import("../projects/[id]/select/route");
const stop = await import("../projects/[id]/stop/route");
const references = await import("../references/route");

const params = { params: Promise.resolve({ id: "p1" }) };
const 본문 = (body: unknown, method = "POST") =>
  new Request("http://localhost/api/poster/projects", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const 새작업 = { title: "가을 사진전", ratio: "2:3", modelId: "gpt-image-2", variants: 3, instruction: "사진전 포스터" };

beforeEach(() => {
  오류 = new Error(원문);
  서비스오류 = new Error(원문);
  저장오류 = null;
  작업 = { id: "p1", status: "ready", data: {} };
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("원문 대신 일반 문장, 상태 코드 그대로", () => {
  it.each([
    ["목록", () => projects.GET(), 500, "포스터 작업을 불러오지 못했습니다."],
    ["만들기", () => projects.POST(본문(새작업)), 500, "포스터 작업을 만들지 못했습니다."],
    ["한 건 읽기", () => project.GET(new Request("http://localhost/x"), params), 500, "포스터 작업을 불러오지 못했습니다."],
    ["칸 고치기", () => project.PATCH(본문({}, "PATCH"), params), 500, "슬롯을 저장하지 못했습니다."],
    ["지우기", () => project.DELETE(new Request("http://localhost/x", { method: "DELETE" }), params), 500, "이미지 작업을 지우지 못했습니다."],
    ["변형 고르기", () => select.POST(본문({ imageId: "11111111-1111-4111-8111-111111111111" }), params), 400, "변형을 고르지 못했습니다."],
    ["멈추기", () => stop.POST(new Request("http://localhost/x", { method: "POST" }), params), 500, "멈추지 못했습니다."],
    ["레퍼런스 목록", () => references.GET(), 500, "레퍼런스를 불러오지 못했습니다."],
  ])("%s", async (_이름, 부른다, 상태, 문장) => {
    const response = await 부른다();
    const body = (await response.json()) as { ok: boolean; message: string };

    expect(response.status).toBe(상태);
    expect(body).toEqual({ ok: false, message: 문장 });
  });

  it("멈추기: 저장이 원문으로 실패해도 일반 문장이다", async () => {
    오류 = null;
    저장오류 = new Error(원문);

    const response = await stop.POST(new Request("http://localhost/x", { method: "POST" }), params);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, message: "멈추지 못했습니다." });
  });
});

describe("우리가 쓴 문장은 그대로", () => {
  it("만들기: 입력 검사 거절은 400 · issues 그대로다", async () => {
    서비스오류 = new PosterValidationError(["모르는 광고 마스터입니다."]);

    const response = await projects.POST(본문(새작업));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false, message: "모르는 광고 마스터입니다.", issues: ["모르는 광고 마스터입니다."],
    });
  });

  it("칸 고치기: 없는 작업 거절은 400 그대로다", async () => {
    서비스오류 = new PosterValidationError(["포스터 작업을 찾을 수 없습니다."]);

    const response = await project.PATCH(본문({}, "PATCH"), params);

    expect(response.status).toBe(400);
    expect(((await response.json()) as { message: string }).message).toBe("포스터 작업을 찾을 수 없습니다.");
  });

  it("한 건 읽기 · 멈추기: 없으면 404 그대로다", async () => {
    오류 = null;
    작업 = null;

    const read = await project.GET(new Request("http://localhost/x"), params);
    const stopped = await stop.POST(new Request("http://localhost/x", { method: "POST" }), params);

    expect(read.status).toBe(404);
    expect(((await read.json()) as { message: string }).message).toBe("포스터 작업을 찾을 수 없습니다.");
    expect(stopped.status).toBe(404);
    expect(((await stopped.json()) as { message: string }).message).toBe("작업을 찾지 못했습니다.");
  });

  it("변형 고르기: 이 작업에 없는 그림이면 그 안내가 400 그대로다", async () => {
    오류 = null;

    const response = await select.POST(본문({ imageId: "22222222-2222-4222-8222-222222222222" }), params);

    expect(response.status).toBe(400);
    expect(((await response.json()) as { message: string }).message).toBe("이 프로젝트에 없는 이미지입니다.");
  });
});
