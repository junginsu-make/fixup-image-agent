import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **검수도 돈이 드는 길이다 — 본인 그림만 본다**(2026-09-29 리뷰).
 *
 * 검수는 그림을 fal 에 올리고 검수 모델(LLM)을 부른다. 작업·그림 읽기는 팀이면
 * 팀원 것까지 열려 있는데(RLS), 결과 저장(`saveReview`)은 본인 것만 된다. 그래서
 * 팀원의 작업을 검수하면 **모델 값을 낸 뒤에야** 저장에서 막혔다. 그림을 본인 것만
 * 읽으면 돈이 나가기 전에 「먼저 변형 하나를 고르세요」로 멈춘다.
 *
 * **예약도 거친다**(설계 2026-09-30 §3.1). `poster_image` + `poster:{id}:review`,
 * 0 크레딧. 크레딧이 없거나 운영자가 멈췄으면 올리기 전에 막힌다.
 */

vi.mock("server-only", () => ({}));

const listOptions: unknown[] = [];
const uploads: string[] = [];
const order: string[] = [];
const reserveCalls: Array<{ operation: string; units: number; resource?: string }> = [];
const settleCalls: Array<{ success: boolean; code?: string }> = [];
let reserveOk = true;
let providerMissing = false;
let 정산결과: unknown = { remaining: 0 };
let ownImages: Array<{ id: string; selected: boolean; assetPath: string }> = [];
/** 작업이 없는 경우(404). */
let projectMissing = false;
/** 그림 읽기 · fal 올리기가 던질 것. */
let imageBytesThrows: Error | null = null;
let uploadThrows: Error | null = null;
/** 팀 읽기 규칙으로 보이는 남의 그림 — 주인 조건을 안 걸면 이것이 나온다. */
const teammateImage = { id: "남의그림", selected: true, assetPath: "u2/poster/p1/req/0.png" };

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "u1", profile: { role: "member" } } }),
  reserveAiUsage: async (_request: Request, operation: string, units: number, plan?: { resource: string }) => {
    order.push("reserve");
    reserveCalls.push({ operation, units, resource: plan?.resource });
    return reserveOk
      ? { ok: true as const, userId: "u1", requestId: "review-request", usage: undefined }
      : {
          ok: false as const,
          response: Response.json({ ok: false, code: "credits_required", message: "크레딧이 없어 이 기능을 쓸 수 없습니다." }, { status: 403 }),
        };
  },
  settleAiUsage: async (_reservation: unknown, success: boolean, _units: number, code?: string) => {
    settleCalls.push({ success, code });
    return 정산결과;
  },
}));

vi.mock("../../../../lib/poster/stores", () => ({
  posterStoresForUser: () => ({
    projects: { get: async () => (projectMissing ? null : { id: "p1", data: { slots: {} } }) },
    images: {
      byProject: async (_projectId: string, options?: { ownOnly?: boolean }) => {
        listOptions.push(options);
        return options?.ownOnly ? ownImages : [...ownImages, teammateImage];
      },
      saveReview: async () => {},
    },
  }),
}));

vi.mock("../../../../lib/poster/asset-bytes", () => ({
  posterImageBytes: async (assetPath: string) => {
    if (imageBytesThrows) throw imageBytesThrows;
    return { bytes: Buffer.from(assetPath), contentType: "image/png" };
  },
}));

vi.mock("../../../../lib/poster/providers", () => {
  // 진짜와 같은 문장이다 — 환경변수 이름이 화면에 새는지 본다.
  class PosterProviderConfigurationError extends Error {
    constructor(readonly missing: string[]) {
      super(`다음 환경변수가 없어 포스터를 만들 수 없습니다: ${missing.join(", ")}`);
    }
  }
  return {
    createPosterFalClients: () => {
      if (providerMissing) throw new PosterProviderConfigurationError(["FAL_KEY"]);
      return {
        uploader: {
          uploadReference: async (bytes: Buffer) => {
            order.push("upload");
            if (uploadThrows) throw uploadThrows;
            uploads.push(bytes.toString());
            return "https://fal/x.png";
          },
        },
      };
    },
    createPosterReviewProviders: () => ({ primary: {} }),
    PosterProviderConfigurationError,
  };
});

vi.mock("@fixup/poster-core", async () => {
  const real = await vi.importActual<typeof import("@fixup/poster-core")>("@fixup/poster-core");
  return {
    ...real,
    reviewPoster: async () => ({ status: "ok", review: { decision: "pass", summary: "좋다", issues: [] }, issues: [] }),
  };
});

const { POST } = await import("../projects/[id]/review/route");

const call = () => POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: "p1" }) });
const 내그림 = { id: "내그림", selected: true, assetPath: "u1/poster/p1/req/0.png" };

beforeEach(() => {
  listOptions.length = 0;
  uploads.length = 0;
  order.length = 0;
  reserveCalls.length = 0;
  settleCalls.length = 0;
  reserveOk = true;
  providerMissing = false;
  정산결과 = { remaining: 0 };
  ownImages = [];
  projectMissing = false;
  imageBytesThrows = null;
  uploadThrows = null;
});

describe("검수는 본인 그림만", () => {
  it("그림 목록을 본인 것만 달라고 한다", async () => {
    ownImages = [내그림];
    await call();
    expect(listOptions[0]).toMatchObject({ ownOnly: true });
    expect(uploads).toEqual(["u1/poster/p1/req/0.png"]);
  });

  it("본인이 고른 그림이 없으면 예약·올리기·검수 전에 멈춘다 — 팀원 그림이 골라져 있어도", async () => {
    const response = await call();
    expect(response.status).toBe(400);
    expect(uploads).toEqual([]);
    expect(reserveCalls).toEqual([]);
  });
});

describe("검수도 예약을 거친다", () => {
  it("올리기 전에 기존 작업 이름과 제 resource 로 자리를 잡는다", async () => {
    ownImages = [내그림];
    await call();
    expect(order.slice(0, 2)).toEqual(["reserve", "upload"]);
    expect(reserveCalls).toEqual([{ operation: "poster_image", units: 0, resource: "poster:p1:review" }]);
  });

  it("자리를 못 잡으면 올리지도 검수하지도 않는다", async () => {
    ownImages = [내그림];
    reserveOk = false;
    const response = await call();
    expect(response.status).toBe(403);
    expect(uploads).toEqual([]);
  });

  it("끝나면 성공으로 닫는다", async () => {
    ownImages = [내그림];
    await call();
    expect(settleCalls).toEqual([{ success: true, code: undefined }]);
  });

  it("설정이 없어 못 부르면 실패로 닫는다", async () => {
    ownImages = [내그림];
    providerMissing = true;
    const response = await call();
    expect(response.status).toBe(503);
    expect(settleCalls).toEqual([{ success: false, code: "poster_review_failed" }]);
  });

  it("정산이 못 닫혀도 검수 결과는 돌려준다", async () => {
    ownImages = [내그림];
    정산결과 = undefined;
    const response = await call();
    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
  });
});

/**
 * **예상 못 한 오류의 원문을 화면에 보내지 않는다**(2026-10-07 후속 Task 12, 고치기의 Task 7 과 같은 규칙).
 *
 * 마지막 `catch` 가 모든 예외를 원문으로 돌려줘 저장소 · fal 글과 환경변수 이름이 「다양하게」 화면에
 * 떴다. 상태 코드는 그대로(500 · 503) 두고 글만 일반 문장으로 바꾼다. 예약은 지금처럼 실패로 닫는다.
 */
describe("예상 못 한 오류는 원문 대신 일반 문장으로", () => {
  const 날것 = new Error('Object not found: library/u1/poster/p1/req/0.png (https://abc.supabase.co/storage/v1/object?token=secret)');
  const 일반문장 = "검수하지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
  let errors: ReturnType<typeof vi.spyOn>;
  const logged = () => errors.mock.calls.flat().map(String).join(" ");

  beforeEach(() => {
    ownImages = [내그림];
    errors = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => errors.mockRestore());

  it("예약 뒤 그림 읽기가 원문으로 실패하면 500 + 일반 문장, 예약은 실패로 닫는다", async () => {
    imageBytesThrows = 날것;
    const response = await call();
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ ok: false, message: 일반문장 });
    expect(text).not.toContain("Object not found");
    expect(text).not.toContain("supabase");
    expect(settleCalls).toEqual([{ success: false, code: "poster_review_failed" }]);
    expect(logged()).toContain("Object not found");
    expect(logged()).not.toContain("https://");
  });

  it("fal 이 준 원문도 화면에 안 보낸다", async () => {
    uploadThrows = new Error("Forbidden: User is locked. Reason: Exhausted balance.");
    const response = await call();
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ ok: false, message: 일반문장 });
    expect(text).not.toContain("locked");
  });

  it("설정 오류는 503 그대로, 환경변수 이름과 `missing` 칸은 화면에 안 보낸다", async () => {
    providerMissing = true;
    const response = await call();
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ ok: false, message: 일반문장 });
    expect(text).not.toContain("FAL_KEY");
    expect(logged()).toContain("FAL_KEY");
    expect(settleCalls).toEqual([{ success: false, code: "poster_review_failed" }]);
  });

  /* fal 계정 풀의 두 문장은 `queue.ts` · 풀이 일부러 화면에 넘기는 글이다. 원문은 풀이 기록에만 남겼다. */
  it("계정 풀이 몰렸다 · 준비 문제 글은 500 · 그 글 그대로 — 예약은 실패로 닫는다", async () => {
    const { FalPoolBusyError, FalPoolUnavailableError } = await import("../../../../lib/fal/pool/router");
    for (const pool of [new FalPoolBusyError(), new FalPoolUnavailableError(503)]) {
      settleCalls.length = 0;
      uploadThrows = pool;
      const response = await call();
      expect(response.status, pool.name).toBe(500);
      expect(await response.json()).toEqual({ ok: false, message: pool.message });
      expect(settleCalls).toEqual([{ success: false, code: "poster_review_failed" }]);
    }
  });

  it("일부러 쓴 안내는 그대로다 — 작업 없음 404, 고른 그림 없음 400", async () => {
    projectMissing = true;
    const missing = await call();
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ ok: false, message: "포스터 작업을 찾을 수 없습니다." });

    projectMissing = false;
    ownImages = [];
    const none = await call();
    expect(none.status).toBe(400);
    expect(await none.json()).toEqual({ ok: false, message: "먼저 변형 하나를 고르세요. 고른 것만 검수합니다." });
  });
});
