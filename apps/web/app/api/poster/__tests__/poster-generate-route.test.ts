import { beforeEach, describe, expect, it, vi } from "vitest";
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
      get: async () => project,
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
    /**
     * **id 로 걸러 준다.** 늘 같은 한 줄을 돌려주면 차례를 보는 시험을 못 쓴다 —
     * 어떤 id 를 물어도 답이 같으니 순서가 뒤바뀌어도 티가 안 난다.
     */
    references: {
      byIds: async (ids: string[]) => LIBRARY.filter((row) => ids.includes(row.id)),
    },
    requests: {}, images: {},
  }),
}));

vi.mock("../../../../lib/poster/providers", () => ({
  createPosterFalClients: () => ({ queue: {} }),
  PosterProviderConfigurationError: class extends Error {},
}));

vi.mock("../../../../lib/fal/upload", () => ({
  uploadUniqueReferences: async (rows: Array<{ id: string }>) => {
    // 실제로는 네트워크다. 그 사이에 두 번째 요청이 도착한다.
    await new Promise((resolve) => setTimeout(resolve, 30));
    return Object.fromEntries(rows.map((row) => [row.id, `https://fal/${row.id}.png`]));
  },
}));

vi.mock("../../../../lib/poster/flow", async () => ({
  ...(await vi.importActual<typeof import("../../../../lib/poster/flow")>("../../../../lib/poster/flow")),
  submitPoster: async (job: (typeof submitted)[number]) => {
    submitted.push(job);
    if (submitThrows) throw submitThrows;
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
