import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PosterChargedError } from "../../../../lib/poster/flow";

/**
 * 광고 마스터가 생성까지 가는 배선.
 *
 * 설계: `docs/superpowers/plans/2026-09-06-ad-creative-sizes.md` §10 3-b·3-d
 *
 * **이 라우트에는 시험이 하나도 없었다.** `app/api/poster/__tests__/` 에는
 * `projects`·`poster-file-route`·`poster-delete-thumbnails` 뿐이었다.
 *
 * 여기서 보는 것은 **무엇이 `submitPoster` 로 넘어가는지** — 배선이다.
 * `ad-export-route.test.ts` 가 같은 방식으로 쓰였다.
 */

vi.mock("server-only", () => ({}));

let project: { id: string; ratio: string; status: string; updatedAt: string; modelId: string; data: Record<string, unknown> } | undefined;
const measured: string[] = [];
const submitted: Array<{
  sourceSize?: { width: number; height: number };
  attachments?: Array<{ url: string; role: string }>;
  referenceUrls?: string[];
}> = [];
/** 레퍼런스 라이브러리. 시험마다 필요한 만큼 채운다. */
const LIBRARY: Array<{ id: string; storagePath: string }> = [];
const updates: Array<Record<string, unknown>> = [];
let submitThrows: Error | null = null;
/** 작업 읽기가 던질 것(저장소 원문). */
let projectGetThrows: Error | null = null;
/** 참이면 `createPosterFalClients` 가 진짜처럼 설정 오류를 던진다. */
let falKeyMissing = false;
/** 참이면 가짜 `submitPoster` 도 진짜처럼 조립을 돌려 거절이면 던진다. */
let runBuild = false;
/** 조립이 거절한 문장. `runBuild` 일 때 가짜가 적어 둔다. */
let builtRejection: string | undefined;

vi.mock("sharp", () => ({
  default: () => ({ metadata: async () => ({ width: 800, height: 600 }) }),
}));

vi.mock("../../../../lib/poster/asset-bytes", () => ({
  referenceBytes: async (path: string) => {
    measured.push(path);
    return { bytes: Buffer.from("x") };
  },
}));

/** 예약이 잡은 장수와 확정한 장수. **돈이 오가는 길이라 둘 다 본다.** */
const reserved: number[] = [];
const finalized: Array<{ success: boolean; units: number; error?: string }> = [];
let reserveFails = false;

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "u1", profile: { role: "member" } } }),
  reserveAiUsage: async (_request: Request, _operation: string, units: number) => {
    if (reserveFails) {
      return { ok: false as const, response: new Response("한도 초과", { status: 429 }) };
    }
    reserved.push(units);
    return { ok: true as const, userId: "u1", requestId: "req-key", usage: {} };
  },
  finalizeAiUsage: async (
    _reservation: unknown, success: boolean, units: number, errorCode?: string,
  ) => { finalized.push({ success, units, error: errorCode }); },
}));

vi.mock("../../../../lib/poster/stores", () => ({
  posterStoresForUser: () => ({
    projects: {
      get: async () => {
        if (projectGetThrows) throw projectGetThrows;
        return project;
      },
      /**
       * **patch 를 담기만 하면 안 된다.** 그러면 두 번째 요청이 첫 번째가 바꾼
       * 상태를 못 보고, 동시 제출 구멍이 시험에 안 보인다.
       */
      update: async (_id: string, patch: Record<string, unknown>) => {
        updates.push(patch);
        Object.assign(project!, patch, { updatedAt: new Date().toISOString() });
        return project;
      },
    },
    requests: {}, images: {},
  }),
}));

/**
 * 참고 이미지는 **라이브러리와 같은 규칙**으로 읽는다(2026-09-17). 라우트가
 * 스토어 대신 이 함수를 부른다.
 *
 * **물어본 차례 그대로 돌려준다.** 진짜 함수가 그렇게 약속한다 — 목록 차례로
 * 돌려주는 가짜를 쓰면 차례를 보는 아래 시험이 통과해도 뜻이 없다.
 */
vi.mock("../../../../lib/poster/references", () => ({
  posterReferencesByIds: async (_viewer: unknown, ids: string[]) =>
    ids.map((id) => LIBRARY.find((row) => row.id === id)).filter(Boolean),
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
    createPosterFalClients: () => {
      if (falKeyMissing) throw new PosterProviderConfigurationError(["FAL_KEY"]);
      return { queue: {} };
    },
    PosterProviderConfigurationError,
  };
});

vi.mock("../../../../lib/fal/upload", () => ({
  uploadUniqueReferences: async (rows: Array<{ id: string }>) => {
    // 실제로는 네트워크다. 그 사이에 두 번째 요청이 도착한다.
    await new Promise((resolve) => setTimeout(resolve, 30));
    return Object.fromEntries(rows.map((row) => [row.id, `https://fal/${row.id}.png`]));
  },
}));

vi.mock("../../../../lib/poster/flow", async () => ({
  ...(await vi.importActual<typeof import("../../../../lib/poster/flow")>("../../../../lib/poster/flow")),
  submitPoster: async (job: (typeof submitted)[number], _dependencies: unknown, build?: unknown) => {
    submitted.push(job);
    if (submitThrows) throw submitThrows;
    if (runBuild) {
      // 진짜 `submitPoster` 처럼 넘긴 조립(없으면 처음 만들기 조립)을 돌린다.
      const { buildPosterJob } = await vi.importActual<typeof import("@fixup/poster-core")>("@fixup/poster-core");
      const built = ((build ?? buildPosterJob) as (job: unknown) => { rejected?: string })(job);
      builtRejection = built.rejected;
      if (built.rejected) throw new Error(built.rejected);
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
    return { requestRowId: "req1", falRequestId: "fal1", endpoint: "e", estimatedUsd: 1 };
  },
}));

const { POST } = await import("../projects/[id]/generate/route");

const call = () =>
  POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: "p1" }) });

const base = {
  id: "p1", ratio: "match-source", status: "ready", modelId: "gpt-image-2",
  updatedAt: new Date(0).toISOString(),
  data: { variants: 1, referenceIds: ["r1"], preservedIds: [], slots: {}, instruction: "x" },
};

beforeEach(() => {
  project = { ...base, data: { ...base.data } };
  LIBRARY.length = 0;
  LIBRARY.push({ id: "r1", storagePath: "u1/ref/1.png" });
  measured.length = 0;
  submitted.length = 0;
  updates.length = 0;
  submitThrows = null;
  projectGetThrows = null;
  falKeyMissing = false;
  runBuild = false;
  builtRejection = undefined;
  reserved.length = 0;
  finalized.length = 0;
  reserveFails = false;
});

describe("마스터 크기가 어디서 오는가", () => {
  /**
   * **호출 횟수를 본다.** 「`sourceSize` 가 첨부 크기와 같다」만 단언하면
   * 구현이 `?? measure(…)` 를 통째로 지워도 첨부가 없는 픽스처에서는 통과한다.
   * 3단계가 실제로 바꾸는 동작은 **「측정을 안 한다」**이다.
   */
  it("마스터가 실려 있으면 첨부를 재지 않는다", async () => {
    project!.data.adMaster = { width: 2048, height: 1072 };
    await call();
    expect(measured, "마스터가 있는데 파일을 읽으면 안 된다").toEqual([]);
    expect(submitted[0]!.sourceSize).toEqual({ width: 2048, height: 1072 });
  });

  it("마스터가 없으면 첨부를 잰다 — 지금까지의 동작", async () => {
    await call();
    expect(measured).toHaveLength(1);
    expect(submitted[0]!.sourceSize).toEqual({ width: 800, height: 600 });
  });

  it("match-source 가 아니면 어느 쪽도 안 본다", async () => {
    project!.ratio = "1:1";
    project!.data.adMaster = { width: 2048, height: 1072 };
    await call();
    expect(measured).toEqual([]);
    expect(submitted[0]!.sourceSize).toBeUndefined();
  });
});

describe("같은 클릭이 두 번 오면", () => {
  /**
   * 이 라우트는 `project.status` 를 안 봤고 상태 갱신도 제출 뒤였다. 같은
   * 프로젝트에 POST 를 두 번 하면 fal 작업이 둘 생기고 **둘 다 과금된다.**
   */
  it("막 제출한 작업은 다시 제출하지 않는다", async () => {
    project!.status = "generating";
    project!.updatedAt = new Date().toISOString();
    const response = await call();
    expect(response.status).toBe(409);
    expect(submitted, "돈이 두 번 나가면 안 된다").toEqual([]);
  });

  /**
   * **이쪽이 더 중요하다.** `status` 가 `"failed"` 로 가는 코드가 저장소에
   * 없어서, 단순히 「generating 이면 거절」로 두면 실패한 작업이 **영원히
   * 잠긴다.** 창이 지나면 언제나 다시 만들 수 있어야 한다.
   */
  it("오래 전에 멈춘 작업은 다시 만들 수 있다 — 영구히 잠기면 안 된다", async () => {
    project!.status = "generating";
    // **61초다.** 10분으로 두면 창을 9분으로 늘려도 시험이 안 잡는다 —
    // 설계가 피하려던 「실패한 작업이 그만큼 잠긴다」 그 자체가 통과한다.
    project!.updatedAt = new Date(Date.now() - 61 * 1000).toISOString();
    const response = await call();
    expect(response.status).toBe(200);
    expect(submitted).toHaveLength(1);
  });

  it("생성 중이 아니면 창과 무관하게 통과한다", async () => {
    project!.status = "ready";
    project!.updatedAt = new Date().toISOString();
    expect((await call()).status).toBe(200);
  });
});

describe("두 요청이 겹치면", () => {
  /**
   * **자물쇠를 검사만 하고 자리를 안 잡으면 소용이 없다.**
   *
   * 초판은 검사를 맨 앞에서 하고 `status: "generating"` 은 fal 업로드와 제출이
   * **전부 끝난 뒤**에 썼다. 그 사이가 네트워크라 수백 ms~수 초인데, 더블클릭의
   * 두 번째 요청은 그 구간에 도착해 **아직 `"ready"` 인 프로젝트를 읽고 통과한다.**
   * 자물쇠가 실제로 막던 것은 「첫 요청이 DB 갱신까지 마친 뒤의 재클릭」뿐이었다.
   */
  it("같은 클릭이 두 번 와도 한 번만 제출한다", async () => {
    const [first, second] = await Promise.all([call(), call()]);
    expect(submitted, "돈이 두 번 나가면 안 된다").toHaveLength(1);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
  });

  /**
   * **제출이 실패하면 자리를 돌려줘야 한다.** 안 그러면 지금까지 `"ready"` 로
   * 남아 바로 다시 누를 수 있던 것이, 창이 지날 때까지 잠긴다 — 기존 사용자에게
   * 없던 제약이 생긴다.
   */
  it("제출이 실패하면 상태를 되돌린다 — 바로 다시 누를 수 있어야 한다", async () => {
    submitThrows = new Error("fal 이 거절했습니다.");
    await call().catch(() => {});
    expect(project!.status, "generating 에 남으면 60초 동안 못 누른다").toBe("ready");
    submitThrows = null;
    expect((await call()).status).toBe(200);
  });
});

describe("돈이 나간 뒤에 실패하면", () => {
  /**
   * **되돌리면 안 된다.** `queue.submitJob` 이 성공한 뒤에 죽으면 fal 작업은
   * 이미 만들어졌고 과금도 끝났다. 그때 상태를 풀면 사용자가 곧바로 다시 눌러
   * **두 번째 작업을 만든다** — 자물쇠를 단 이유가 바로 그것인데, 무조건
   * 되돌리기가 그 구멍을 다시 연다.
   */
  it("자리를 잡아 둔다 — 되돌리면 두 번째 작업이 만들어진다", async () => {
    submitThrows = new PosterChargedError("fal-abc", new Error("장부 쓰기 실패"));
    await call().catch(() => {});
    expect(project!.status, "풀면 곧바로 다시 눌러 두 번 과금된다").toBe("generating");
  });

  /** 과금 전 실패는 반대다. 돈이 안 나갔으므로 바로 다시 누를 수 있어야 한다. */
  it("과금 전 실패는 자리를 돌려준다", async () => {
    submitThrows = new Error("첨부한 그림의 크기를 읽지 못해 같은 비율로 만들 수 없습니다.");
    await call().catch(() => {});
    expect(project!.status).toBe("ready");
  });
});

/**
 * 화면에서 고른 차례가 fal 까지 가는가 — **라우트 배선**.
 *
 * `restoreAttachments` 자체는 `poster-core` 에서 재고 있는데, **라우트가 그것을
 * 부르는 자리**는 아무도 안 보고 있었다. `attachments: restoreAttachments(…)` 를
 * `attachments: []` 로 바꿔도 시험이 전부 초록이었다(2026-09-08 리뷰).
 *
 * 그러면 사용자가 ①②로 고른 차례가 조용히 사라지고, 프롬프트의 `Image 1` 이
 * 다른 그림을 가리킨다 — 오류 하나 없이.
 */
describe("고른 차례가 제출까지 가는가", () => {
  beforeEach(() => {
    LIBRARY.push({ id: "r2", storagePath: "u1/ref/2.png" });
    project!.data.referenceIds = ["r2"];
    project!.data.preservedIds = ["r1"];
    project!.data.personIds = ["r1"];
    // 화면에서 인물(r1)을 먼저 골랐다. 목록 차례(따라 만들기 먼저)와 **반대다.**
    project!.data.attachmentOrder = ["r1", "r2"];
  });

  it("저장된 차례 그대로 넘긴다 — 목록 차례가 아니다", async () => {
    await call();
    expect(submitted[0]!.attachments).toEqual([
      { url: "https://fal/r1.png", role: "preserve_person" },
      { url: "https://fal/r2.png", role: "style" },
    ]);
  });

  it("차례가 없는 옛 작업은 빈 배열로 넘어간다 — 조립이 옛 목록을 쓴다", async () => {
    delete project!.data.attachmentOrder;
    await call();
    expect(submitted[0]!.attachments).toEqual([]);
    // 빈 배열이어도 옛 목록은 그대로 실려 가야 한다. 둘 다 비면 첨부를 통째로 잃는다.
    expect(submitted[0]!.referenceUrls).toEqual(["https://fal/r2.png"]);
  });

  it("01 화면에 적은 말이 제출까지 간다", async () => {
    project!.data.attachmentIntent = "1번 사람을 2번 느낌으로";
    await call();
    expect(submitted[0]).toMatchObject({ attachmentIntent: "1번 사람을 2번 느낌으로" });
  });
});


/**
 * 이미지 만들기가 **장부에 남는가** (2026-09-08).
 *
 * 지금까지 이 화면은 사용량 장부에 한 줄도 안 남겼다 — 개인 한도에도 안 걸리고
 * 팀 크레딧에서도 안 빠졌다. 운영에서 $5.641 이 장부 밖에 있었다.
 */
describe("돈이 장부에 남는가", () => {
  it("제출 전에 자리를 잡는다", async () => {
    await call();
    expect(reserved).toHaveLength(1);
    expect(reserved[0]).toBeGreaterThan(0);
  });

  it("**실제 단가에서 장을 뽑는다**", async () => {
    // gpt-image-2 · 포스터 2:3 · 1장 = $0.178 → 올림($0.178 / $0.05) = 4장
    project!.ratio = "2:3";
    await call();
    expect(reserved[0]).toBe(4);
  });

  it("**크기가 다르면 장수도 다르다** — 정수 가중치로는 못 하던 것", async () => {
    // 같은 모델·같은 1장인데 정사각은 $0.219 라 5장이다. 픽스처의
    // `match-source` 는 첨부(800×600)를 따라가 정사각 줄에 붙는다.
    project!.ratio = "1:1";
    await call();
    expect(reserved[0]).toBe(5);
  });

  it("장수가 늘면 장도 는다", async () => {
    project!.ratio = "2:3";
    project!.data.variants = 3;
    await call();
    // $0.178 × 3 = $0.534 → 11장
    expect(reserved[0]).toBe(11);
  });

  it("한도에 걸리면 제출하지 않는다 — 돈이 나가면 안 된다", async () => {
    reserveFails = true;
    const response = await call();
    expect(response.status).toBe(429);
    expect(submitted, "예약이 막았는데 돈이 나갔다").toEqual([]);
  });

  it("**예약이 거절되면 자리를 돌려준다** — 영구히 「만드는 중」에 갇히면 안 된다", async () => {
    // 이 갈래는 `return` 이라 아래 `catch` 의 되돌리기를 안 탔다. 이 저장소에는
    // `"failed"` 로 가는 길이 없어서, 한 번 거절되면 프로젝트가 영원히
    // `"generating"` 으로 남고 창이 지날 때까지 재시도까지 막혔다.
    reserveFails = true;
    await call();
    expect(project!.status, "예약 거절 뒤에도 생성 중으로 남았다").toBe("ready");
  });

  it("제출이 실패하면 묶은 장을 돌려준다", async () => {
    submitThrows = new Error("fal 이 죽었다");
    await call();
    expect(finalized).toContainEqual({ success: false, units: 0, error: "poster_submit_failed" });
  });

  it("**확정은 여기서 안 한다** — 몇 장이 올지는 status 가 안다", async () => {
    await call();
    expect(finalized.filter((entry) => entry.success)).toEqual([]);
  });

  it("예약 열쇠를 작업에 적어 둔다 — 확정이 다른 요청에서 일어난다", async () => {
    await call();
    expect(project!.data.reservationId).toBe("req-key");
  });
});

/**
 * **예상 못 한 오류의 원문을 화면에 보내지 않는다**(2026-10-07 후속 Task 12, 고치기의 Task 7 과 같은 규칙).
 *
 * 마지막 `catch` 가 모든 예외를 원문으로 돌려줘 Supabase · fal 글과 환경변수 이름이 「다양하게」 화면에
 * 떴다. 상태 코드는 그대로(500 · 503) 두고 글만 일반 문장으로 바꾼다 — 화면과 쉽게 모드가 받는 상태가
 * 전과 같다. 우리가 일부러 쓴 문장은 그대로 보인다.
 */
describe("예상 못 한 오류는 원문 대신 일반 문장으로", () => {
  const 날것 = new Error('relation "poster_projects" does not exist (https://abc.supabase.co/rest/v1/x?token=secret)');
  const 일반문장 = "생성을 시작하지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
  let errors: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errors = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => errors.mockRestore());

  const logged = () => errors.mock.calls.flat().map(String).join(" ");

  it("작업 읽기가 원문으로 실패하면 500 + 일반 문장, 원문은 주소를 가려 서버 기록에만", async () => {
    projectGetThrows = 날것;
    const response = await call();
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ ok: false, message: 일반문장 });
    expect(text).not.toContain("poster_projects");
    expect(text).not.toContain("supabase");
    expect(logged()).toContain("poster_projects");
    expect(logged()).not.toContain("https://");
  });

  it("예약 뒤 원문 오류도 가리고, 묶은 장과 자리는 지금처럼 돌려준다", async () => {
    submitThrows = 날것;
    const response = await call();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, message: 일반문장 });
    expect(reserved).toHaveLength(1);
    expect(finalized).toEqual([{ success: false, units: 0, error: "poster_submit_failed" }]);
    expect(project!.status).toBe("ready");
  });

  it("fal 이 준 원문(계정 잠김 사유 등)도 화면에 안 보낸다", async () => {
    const { FalQueueFailure } = await import("../../../../lib/fal/queue");
    submitThrows = new FalQueueFailure(403, JSON.stringify({ message: "User is locked. Reason: Exhausted balance." }));
    const response = await call();
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ ok: false, message: 일반문장 });
    expect(text).not.toContain("locked");
    expect(logged()).toContain("Exhausted balance");
  });

  it("설정 오류는 503 그대로, 환경변수 이름과 `missing` 칸은 화면에 안 보낸다", async () => {
    falKeyMissing = true;
    const response = await call();
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ ok: false, message: 일반문장 });
    expect(text).not.toContain("FAL_KEY");
    expect(logged()).toContain("FAL_KEY");
    // 예약 전에 막혔다 — 돈이 오가지 않았고 자리도 돌려준다.
    expect(reserved).toEqual([]);
    expect(project!.status).toBe("ready");
  });

  it("조립이 거절한 우리 문장은 500 · 그 글 그대로 — 묶은 장도 돌려준다", async () => {
    // 따라 할 첨부가 없으면 원본 비율의 크기를 못 읽어 조립이 거절한다.
    project!.data.referenceIds = [];
    runBuild = true;
    const response = await call();
    expect(builtRejection, "조립이 거절해야 하는 픽스처다").toBeTruthy();
    expect(response.status).toBe(500);
    // 쉽게 모드가 가리지 않게 우리 문장이라고 표시하고, 같은 것을 또 보내도 같은 곳에서 막히니 다시 보내기를 안 띄운다.
    expect(await response.json()).toEqual({ ok: false, message: builtRejection, userFacing: true, retryable: false });
    expect(finalized).toEqual([{ success: false, units: 0, error: "poster_submit_failed" }]);
  });

  it("돈이 나간 뒤의 실패는 지금 문장 · 500 그대로 — 자리는 안 돌려준다, 장부 닫기는 지금 그대로", async () => {
    submitThrows = new PosterChargedError("fal-1", 날것);
    const response = await call();
    expect(response.status).toBe(500);
    // 다시 보내면 두 번째 작업이 만들어져 값이 또 나간다 — 다시 보내기를 안 띄운다.
    expect(await response.json()).toEqual({ ok: false, message: "제출은 됐는데 장부에 적지 못했습니다.", userFacing: true, retryable: false });
    // 안쪽 catch 는 이 갈래에서도 예약을 닫는다(돈 흐름 0줄 — 지금 동작을 고정만 한다).
    expect(finalized).toEqual([{ success: false, units: 0, error: "poster_submit_failed" }]);
    expect(project!.status).toBe("generating");
  });

  /* fal 계정 풀의 두 문장은 `queue.ts` 가 일부러 화면에 넘기는 글이다. 원문은 풀이 기록에만 남겼다. */
  it("계정 풀이 몰렸다 · 준비 문제 글은 500 · 그 글 그대로", async () => {
    const { FalPoolBusyError, FalPoolUnavailableError } = await import("../../../../lib/fal/pool/router");
    for (const pool of [new FalPoolBusyError(), new FalPoolUnavailableError(503)]) {
      finalized.length = 0;
      project = { ...base, data: { ...base.data } };
      submitThrows = pool;
      const response = await call();
      expect(response.status, pool.name).toBe(500);
      // 잠시 뒤 다시 하면 풀린다 — 다시 보내기는 그대로 둔다(`retryable` 을 싣지 않는다).
      expect(await response.json()).toEqual({ ok: false, message: pool.message, userFacing: true });
      expect(finalized).toEqual([{ success: false, units: 0, error: "poster_submit_failed" }]);
    }
  });

  it("일부러 쓴 안내는 그대로다 — 작업 없음 404, 방금 시작 409, 예약 거절은 받은 응답 그대로", async () => {
    project = undefined;
    const missing = await call();
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ ok: false, message: "포스터 작업을 찾을 수 없습니다." });

    project = { ...base, data: { ...base.data }, status: "generating", updatedAt: new Date().toISOString() };
    const busy = await call();
    expect(busy.status).toBe(409);
    expect(await busy.json()).toEqual({ ok: false, message: "방금 만들기를 시작했습니다. 잠시 뒤에 다시 눌러 주세요." });

    project = { ...base, data: { ...base.data } };
    reserveFails = true;
    const refused = await call();
    expect(refused.status).toBe(429);
    expect(await refused.text()).toBe("한도 초과");
  });
});
