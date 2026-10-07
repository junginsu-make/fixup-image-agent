import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **기획이 실패했을 때 화면에 무엇을 말하는가**(2026-10-07 후속 Task 12).
 *
 * 마지막 `catch` 가 모든 예외를 원문으로 돌려줘 Supabase 글과 환경변수 이름이 「다양하게」 화면에
 * 떴다. 상태 코드는 그대로(500 · 503) 두고 글만 일반 문장으로 바꾼다. 묶은 장은 지금처럼 돌려준다.
 *
 * 예약 순서 · 읽기 배선은 `plan-reserve-order.test.ts` · `plan-people-wiring.test.ts` 가 소스로 잰다.
 */

vi.mock("server-only", () => ({}));

let project: { id: string; ratio: string; data: Record<string, unknown> } | null;
let projectGetThrows: Error | null = null;
let projectUpdateThrows: Error | null = null;
let planningKeyMissing = false;
let reserveFails = false;
const reserved: number[] = [];
const finalized: Array<{ success: boolean; units: number; error?: string }> = [];
/** 참이면 패키지의 진짜 `readAttachments` · `planPoster` 를 쓴다 — 제공자가 던진 글이 `issues` 로 가는 길을 본다. */
let realCore = false;
/** 붙인 그림. 진짜 읽기를 돌릴 때만 채운다. */
let references: Array<{ id: string; title: string; url: string }> = [];
/** 제공자가 던질 것과 예비가 있는지. */
let readThrows: Error | null = null;
let primaryThrows: Error | null = null;
let hasBackup = false;
let backupCalls = 0;
let backupThrows: Error | null = null;
/** 실패로 닫는 정산이 던질 것(RPC 흔들림). */
let finalizeFailureThrows: Error | null = null;
/** 마지막으로 저장한 것. */
let saved: Record<string, unknown> | undefined;

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "u1", profile: { role: "member" } } }),
  reserveAiUsage: async (_request: Request, _operation: string, units: number) => {
    if (reserveFails) {
      return {
        ok: false as const,
        response: Response.json({ ok: false, code: "credits_required", message: "크레딧이 없어 이 기능을 쓸 수 없습니다." }, { status: 403 }),
      };
    }
    reserved.push(units);
    return { ok: true as const, userId: "u1", requestId: "plan-key", usage: {} };
  },
  finalizeAiUsage: async (_reservation: unknown, success: boolean, units: number, errorCode?: string) => {
    finalized.push({ success, units, error: errorCode });
    if (!success && finalizeFailureThrows) throw finalizeFailureThrows;
  },
}));

vi.mock("../../../../lib/poster/stores", () => ({
  posterStoresForUser: () => ({
    projects: {
      get: async () => {
        if (projectGetThrows) throw projectGetThrows;
        return project;
      },
      update: async (_id: string, patch: Record<string, unknown>) => {
        if (projectUpdateThrows) throw projectUpdateThrows;
        saved = patch;
        return { ...project, ...patch };
      },
    },
  }),
}));

vi.mock("../../../../lib/poster/references", () => ({
  posterReferencesByIds: async (_viewer: unknown, ids: string[]) => references.filter((reference) => ids.includes(reference.id)),
}));
vi.mock("../../../../lib/teams/store", () => ({ teamIdOf: async () => null }));

vi.mock("../../../../lib/poster/providers", () => {
  // 진짜와 같은 문장이다 — 환경변수 이름이 화면에 새는지 본다.
  class PosterProviderConfigurationError extends Error {
    constructor(readonly missing: string[]) {
      super(`다음 환경변수가 없어 포스터를 만들 수 없습니다: ${missing.join(", ")}`);
    }
  }
  return {
    createPosterAttachmentReader: () => ({
      read: async () => {
        if (readThrows) throw readThrows;
        return { people: [], staging: "", hasText: false };
      },
    }),
    createPosterPlanningProviders: () => {
      if (planningKeyMissing) throw new PosterProviderConfigurationError(["ANTHROPIC_API_KEY"]);
      const 기획 = { slots: {}, invented: [] };
      return {
        primary: {
          plan: async () => {
            if (primaryThrows) throw primaryThrows;
            return 기획;
          },
        },
        backup: hasBackup
          ? {
            plan: async () => {
              backupCalls += 1;
              if (backupThrows) throw backupThrows;
              return 기획;
            },
          }
          : undefined,
      };
    },
    PosterProviderConfigurationError,
  };
});

vi.mock("@fixup/poster-core", async () => {
  const real = await vi.importActual<typeof import("@fixup/poster-core")>("@fixup/poster-core");
  return {
    ...real,
    readAttachments: async (...args: Parameters<typeof real.readAttachments>) =>
      realCore ? real.readAttachments(...args) : { reads: {}, summaries: {}, people: {}, issues: [] },
    planPoster: async (...args: Parameters<typeof real.planPoster>) =>
      realCore ? real.planPoster(...args) : { slots: real.EMPTY_SLOTS, invented: [], issues: [] },
  };
});

const { POST } = await import("../projects/[id]/plan/route");

const call = () => POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: "p1" }) });

const 날것 = new Error('포스터 작업 저장: relation "poster_projects" does not exist (https://abc.supabase.co/rest/v1/x?token=secret)');
const 일반문장 = "기획하지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
let errors: ReturnType<typeof vi.spyOn>;
const logged = () => errors.mock.calls.flat().map(String).join(" ");

beforeEach(() => {
  project = { id: "p1", ratio: "1:1", data: { referenceIds: [], preservedIds: [], instruction: "가을 세일" } };
  projectGetThrows = null;
  projectUpdateThrows = null;
  planningKeyMissing = false;
  reserveFails = false;
  reserved.length = 0;
  finalized.length = 0;
  realCore = false;
  references = [];
  readThrows = null;
  primaryThrows = null;
  hasBackup = false;
  backupCalls = 0;
  backupThrows = null;
  finalizeFailureThrows = null;
  saved = undefined;
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errors.mockRestore());

describe("예상 못 한 오류는 원문 대신 일반 문장으로", () => {
  it("예약 뒤 저장이 원문으로 실패하면 500 + 일반 문장, 묶은 장은 지금처럼 돌려준다", async () => {
    projectUpdateThrows = 날것;
    const response = await call();
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ ok: false, message: 일반문장 });
    expect(text).not.toContain("poster_projects");
    expect(text).not.toContain("supabase");
    expect(reserved).toHaveLength(1);
    expect(finalized).toEqual([{ success: false, units: 0, error: "poster_plan_failed" }]);
    expect(logged()).toContain("poster_projects");
    expect(logged()).not.toContain("https://");
  });

  it("예약 전 작업 읽기가 원문으로 실패해도 500 + 일반 문장 — 닫을 예약은 없다", async () => {
    projectGetThrows = 날것;
    const response = await call();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, message: 일반문장 });
    expect(finalized).toEqual([]);
  });

  it("설정 오류는 503 그대로, 환경변수 이름과 `missing` 칸은 화면에 안 보낸다 — 묶은 장은 돌려준다", async () => {
    planningKeyMissing = true;
    const response = await call();
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ ok: false, message: 일반문장 });
    expect(text).not.toContain("ANTHROPIC_API_KEY");
    expect(logged()).toContain("ANTHROPIC_API_KEY");
    expect(finalized).toEqual([{ success: false, units: 0, error: "poster_plan_failed" }]);
  });

  /*
   * **쉽게 모드도 같은 답을 받는다.** 쉽게는 이 라우트를 함수로 부르고 `read()` 로 읽어 `EasyStepError` 로
   * 올린 뒤, `status>=500 && !code && retryable` 이면 한 번 더 가린다. 상태가 전과 같으니 갈래도 같다.
   */
  it("쉽게 모드의 read() 로 읽으면 가림 조건(500 · 코드 없음 · 다시 시도 가능)을 맞춘다", async () => {
    const { EasyStepError, read } = await import("../../../../lib/easy/relay");
    projectUpdateThrows = 날것;
    const thrown = await read(await call(), "기획").catch((error: unknown) => error);
    expect(thrown).toBeInstanceOf(EasyStepError);
    const step = thrown as InstanceType<typeof EasyStepError>;
    expect(step.status).toBe(500);
    expect(step.code).toBeUndefined();
    expect(step.retryable).toBe(true);
    expect(step.message).not.toContain("poster_projects");
  });
});

describe("일부러 쓴 안내 · 성공은 그대로", () => {
  it("작업이 없으면 404 그 글 그대로", async () => {
    project = null;
    const response = await call();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, message: "포스터 작업을 찾을 수 없습니다." });
  });

  it("예약 거절은 받은 응답 그대로 — 닫을 예약도 없다", async () => {
    reserveFails = true;
    const response = await call();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, code: "credits_required", message: "크레딧이 없어 이 기능을 쓸 수 없습니다." });
    expect(finalized).toEqual([]);
  });

  it("쓴 그대로 보내는 작업은 기획을 건너뛴다는 안내 그대로", async () => {
    project!.data.promptMode = "verbatim";
    const body = await (await call()).json();
    expect(body).toMatchObject({ ok: true, skipped: "쓴 그대로 보내는 작업이라 기획을 돌리지 않았습니다." });
  });

  it("성공하면 200 · 성공으로 닫는다", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
    expect(finalized.map((entry) => entry.success)).toEqual([true]);
  });
});

/**
 * **제공자가 던진 원문은 `issues` 에도 싣지 않는다**(2026-10-07 후속 Task 12b).
 *
 * 패키지(`readAttachments` · `withIssueFallback`)는 던진 글을 그대로 「주 모델 기획 실패: <원문>」으로
 * 적는다. 그 목록은 성공 응답으로 화면에 뜨고 작업(`grammarIssues`)에도 저장된다. 라우트가 제공자 호출을
 * 감싸 원문은 기록에 남기고 우리 문장으로 **다시 던진다** — 던지기는 그대로라 주→예비 넘어가기가 같다.
 */
describe("제공자 원문은 issues 에도 싣지 않는다", () => {
  const 제공자원문 = new Error("529 Overloaded: request_id=req_abc (https://api.anthropic.com/v1/messages?key=secret)");

  beforeEach(() => {
    realCore = true;
  });

  it("주 기획이 던지면 「주 모델 기획 실패: 응답을 받지 못했습니다.」 — 응답 · 저장 둘 다 원문 없음", async () => {
    primaryThrows = 제공자원문;
    const response = await call();
    expect(response.status).toBe(200);
    const text = await response.text();
    const body = JSON.parse(text);
    expect(body.issues).toContain("주 모델 기획 실패: 응답을 받지 못했습니다.");
    expect(text).not.toContain("Overloaded");
    expect(JSON.stringify(saved)).not.toContain("Overloaded");
    expect((saved?.data as { grammarIssues: string[] }).grammarIssues).toContain("주 모델 기획 실패: 응답을 받지 못했습니다.");
    expect(logged()).toContain("Overloaded");
    expect(logged()).not.toContain("https://");
  });

  it("주가 던져도 예비로 넘어가는 것은 전과 같다", async () => {
    primaryThrows = 제공자원문;
    hasBackup = true;
    const body = await (await call()).json();
    expect(backupCalls).toBe(1);
    expect(body.ok).toBe(true);
    expect(body.issues.join(" ")).toContain("예비로 기획했습니다: 응답을 받지 못했습니다.");
    expect(JSON.stringify(body)).not.toContain("Overloaded");
  });

  it("예비까지 던지면 둘 다 우리 문장이다", async () => {
    primaryThrows = 제공자원문;
    hasBackup = true;
    backupThrows = new Error("400 Bad Request: invalid_api_key sk-proj-abc");
    const text = await (await call()).text();
    expect(JSON.parse(text).issues.join(" ")).toContain("예비 기획도 실패했습니다: 응답을 받지 못했습니다.");
    expect(text).not.toContain("invalid_api_key");
    expect(text).not.toContain("Overloaded");
  });

  it("붙인 그림 읽기가 던지면 「… 을 읽지 못했습니다: 응답을 받지 못했습니다.」", async () => {
    references = [{ id: "r1", title: "표지", url: "https://cdn.example/r1.png" }];
    project!.data.referenceIds = ["r1"];
    readThrows = 제공자원문;
    const text = await (await call()).text();
    expect(JSON.parse(text).issues).toContain("표지 을 읽지 못했습니다: 응답을 받지 못했습니다.");
    expect(text).not.toContain("Overloaded");
    expect(logged()).toContain("Overloaded");
  });
});

/**
 * **실패로 닫는 정산이 흔들려도 화면은 우리 JSON 을 받는다**(Task 12b). 전에는 그 `await` 가 던지면
 * `planFailure` 를 건너뛰어 Next 기본 500(본문이 JSON 이 아님)이 나갔다. 닫기 호출의 인자 · 순서는 같다.
 */
describe("실패로 닫기가 던져도", () => {
  it("닫기를 같은 인자로 부르고, 응답은 일반 문장 JSON 500 그대로", async () => {
    projectUpdateThrows = 날것;
    finalizeFailureThrows = new Error("rpc finalize_generation failed (https://abc.supabase.co/rest/v1/rpc)");
    const response = await call();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, message: 일반문장 });
    expect(finalized).toEqual([{ success: false, units: 0, error: "poster_plan_failed" }]);
    expect(logged()).toContain("finalize_generation");
    expect(logged()).not.toContain("https://");
  });
});
