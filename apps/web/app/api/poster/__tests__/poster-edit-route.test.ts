import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 수정이 크기를 실어 보내는 배선.
 *
 * 설계: `docs/superpowers/plans/2026-09-06-ad-creative-sizes.md` §10 3-b
 *
 * **규칙(`editSourceSize`)은 순수 함수 시험이 덮는데, 라우트가 그것을 부르는지는
 * 아무도 안 봤다.** `sourceSize: editSourceSize(…)` 를 `undefined` 로 바꾸는
 * 뮤테이션 — 즉 3-b-2 를 통째로 되돌리는 뮤테이션 — 에서 저장소 772개가 전부
 * 초록이었다.
 */

vi.mock("server-only", () => ({}));

let project: { id: string; ratio: string; modelId: string; data: Record<string, unknown> };
let parent: { id: string; assetPath: string; selected: boolean; width: number | null; height: number | null };
type SubmittedJob = {
  ratioId: string;
  modelId?: string;
  sourceSize?: { width: number; height: number };
  attachments?: Array<{ url: string; role: string }>;
  personUrls?: string[];
  invented?: string[];
  referenceHasText?: boolean;
};
const submitted: SubmittedJob[] = [];
/** `submitPoster` 에 넘어온 조립 함수. **안 넘기면 처음 만들기 조립을 탄다.** */
const builders: unknown[] = [];
/** 지킬 대상으로 읽어 올 라이브러리 그림. */
let libraryReferences: Array<{ id: string; storagePath: string }> = [];
let uploadCount = 0;
/** 저장소에서 파일이 사라진 라이브러리 그림의 경로. */
let missingPaths: string[] = [];
/** 예약이 잡은 장수와 확정한 장수. **돈이 오가는 길이라 둘 다 본다.** */
const reserved: number[] = [];
const finalized: Array<{ success: boolean; units: number; error?: string }> = [];
const updates: Array<Record<string, unknown>> = [];
let reserveFails = false;
let submitThrows: Error | null = null;

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "u1", profile: { role: "member" } } }),
  reserveAiUsage: async (_request: Request, _operation: string, units: number) => {
    if (reserveFails) return { ok: false as const, response: new Response("한도 초과", { status: 429 }) };
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
      update: async (_id: string, patch: Record<string, unknown>) => {
        updates.push(patch);
        Object.assign(project, patch);
        return project;
      },
    },
    images: { byProject: async () => [parent] },
    requests: {},
  }),
}));

vi.mock("../../../../lib/poster/providers", () => ({
  createPosterFalClients: () => ({
    queue: {},
    // 첫 업로드는 언제나 고칠 그림이다. 그 뒤가 지킬 대상이다.
    uploader: { uploadReference: async () => (uploadCount++ === 0 ? "https://fal/parent.png" : `https://fal/ref-${uploadCount - 1}.png`) },
  }),
  PosterProviderConfigurationError: class extends Error {},
}));

vi.mock("../../../../lib/poster/asset-bytes", () => ({
  posterImageBytes: async () => ({ bytes: Buffer.from("x"), contentType: "image/png" }),
  referenceBytes: async (storagePath: string) => {
    if (missingPaths.includes(storagePath)) throw new Error("Object not found");
    return { bytes: Buffer.from("r"), contentType: "image/png" };
  },
}));

vi.mock("../../../../lib/poster/references", () => ({
  posterReferencesByIds: async (_viewer: unknown, ids: string[]) =>
    libraryReferences.filter((reference) => ids.includes(reference.id)),
}));

vi.mock("../../../../lib/teams/store", () => ({ teamIdOf: async () => null }));

vi.mock("../../../../lib/poster/flow", () => ({
  PosterChargedError: class extends Error {
    constructor(readonly falRequestId: string) { super("제출은 됐는데 장부에 적지 못했습니다."); }
  },
  submitPoster: async (job: SubmittedJob, _dependencies: unknown, build?: unknown) => {
    if (submitThrows) throw submitThrows;
    submitted.push(job);
    builders.push(build);
    return { requestRowId: "r", falRequestId: "f", endpoint: "e", estimatedUsd: 1 };
  },
}));

const { POST } = await import("../projects/[id]/edit/route");

const call = (body: unknown) =>
  POST(
    new Request("http://x", { method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: "p1" }) },
  );

beforeEach(() => {
  project = {
    id: "p1", ratio: "match-source", modelId: "gpt-image-2",
    data: { slots: { action: "" } },
  };
  parent = { id: "i1", assetPath: "u1/poster/p1/0.png", selected: true, width: 1200, height: 628 };
  submitted.length = 0;
  builders.length = 0;
  libraryReferences = [];
  uploadCount = 0;
  missingPaths = [];
  reserved.length = 0;
  finalized.length = 0;
  updates.length = 0;
  reserveFails = false;
  submitThrows = null;
});

describe("수정이 크기를 실어 보낸다", () => {
  it("광고 마스터가 있으면 그 값이 넘어간다", async () => {
    project.data.adMaster = { width: 2048, height: 1072 };
    await call({ instruction: "글자를 키워 주세요" });
    expect(submitted[0]!.sourceSize).toEqual({ width: 2048, height: 1072 });
  });

  /**
   * **광고와 무관한 기존 사용자가 여기서 고쳐진다.** 지금까지는 크기가 안 넘어가
   * 「첨부한 그림의 크기를 읽지 못해」로 거절됐다.
   */
  it("마스터가 없으면 부모 그림 크기가 넘어간다", async () => {
    await call({ instruction: "글자를 키워 주세요" });
    expect(submitted[0]!.sourceSize).toEqual({ width: 1200, height: 628 });
  });

  /**
   * **사용자가 고른 비율을 덮으면 안 된다.** 화면이 수정하면서 비율을 바꿀 수
   * 있는데(`ratioId ?? project.ratio`), 그때 크기를 실으면 고른 비율이 무시된다.
   */
  it("비율을 바꾸면 크기를 안 보낸다", async () => {
    project.data.adMaster = { width: 2048, height: 1072 };
    await call({ instruction: "세로로 다시", ratioId: "9:16" });
    expect(submitted[0]!.ratioId).toBe("9:16");
    expect(submitted[0]!.sourceSize).toBeUndefined();
  });

  /** 옛 행에는 크기가 없다. 그때는 지금까지처럼 거절된다 — 후퇴가 없다. */
  it("부모 크기를 모르면 안 보낸다", async () => {
    parent = { ...parent, width: null, height: null };
    await call({ instruction: "글자를 키워 주세요" });
    expect(submitted[0]!.sourceSize).toBeUndefined();
  });
});

/**
 * **수정도 돈이다.**
 *
 * 이 길에는 예약도 확정도 없었다. 「이 장만 고치기」를 열 번 누르면 fal 호출
 * 열 번이 실제로 과금되는데 `generation_events` 에는 한 줄도 안 남았다.
 */
describe("수정이 장부에 남는가", () => {
  it("제출 전에 자리를 잡는다", async () => {
    await call({ instruction: "글자를 키워 주세요" });
    expect(reserved, "예약 없이 fal 로 나갔다").toHaveLength(1);
    expect(reserved[0]).toBeGreaterThan(0);
  });

  it("한도에 걸리면 제출하지 않는다 — 돈이 나가면 안 된다", async () => {
    reserveFails = true;
    const response = await call({ instruction: "글자를 키워 주세요" });
    expect(response.status).toBe(429);
    expect(submitted, "예약이 막았는데 돈이 나갔다").toEqual([]);
  });

  it("예약 열쇠를 작업에 적어 둔다 — 확정이 status 요청에서 일어난다", async () => {
    await call({ instruction: "글자를 키워 주세요" });
    expect((project.data as { reservationId?: string }).reservationId).toBe("req-key");
  });

  it("**확정은 여기서 안 한다** — 몇 장이 올지는 status 가 안다", async () => {
    await call({ instruction: "글자를 키워 주세요" });
    expect(finalized.filter((entry) => entry.success)).toEqual([]);
  });

  it("제출이 실패하면 묶은 장을 돌려준다", async () => {
    submitThrows = new Error("fal 이 죽었다");
    await call({ instruction: "글자를 키워 주세요" });
    expect(finalized).toContainEqual({ success: false, units: 0, error: "poster_edit_failed" });
  });
});

/**
 * **고치기는 자기 조립을 탄다.**
 *
 * 2026-09-29 사용자 보고 — 고칠 때 적은 말이 안 먹혔다. 라우트가 처음 만들기
 * 조립을 그대로 타서, 지시가 장면 칸 한 줄에 묻히고 고칠 그림이 「느낌만 따라 할
 * 참고」로 붙었다. 조립 규칙은 `edit-prompt.test.ts` 가 재고, 여기서는 **라우트가
 * 그 조립을 실제로 넘기는지**를 잰다 — 넘기는 한 줄을 지우면 규칙 시험은 전부
 * 초록인 채로 사용자에게는 옛 동작이 간다.
 */
describe("고치기는 고치기 조립으로 나간다", () => {
  // 실제 작업은 슬롯 칸이 다 있다(스키마 기본값). 위쪽 묶음의 `{ action: "" }` 는
  // 조립을 안 돌리는 시험이라 괜찮았다 — 여기서는 조립을 실제로 돌린다.
  beforeEach(async () => {
    const { EMPTY_SLOTS } = await import("@fixup/poster-core");
    project.data = { ...project.data, slots: EMPTY_SLOTS };
  });

  it("넘긴 조립을 돌리면 사용자 지시가 맨 앞에 서고 고칠 그림이 Image 1 이다", async () => {
    await call({ instruction: "배경을 밤으로 바꿔 주세요" });
    const build = builders[0];
    expect(typeof build, "조립을 안 넘겼다 — 처음 만들기 조립을 탄다").toBe("function");
    const built = (build as (job: unknown) => { prompt: string; input: Record<string, unknown> })(submitted[0]);
    expect(built.prompt.startsWith("USER INSTRUCTION (highest priority — follow exactly):\n배경을 밤으로 바꿔 주세요")).toBe(true);
    expect(built.prompt).toContain("Image 1 is the IMAGE TO EDIT");
    expect(built.input.image_urls).toEqual(["https://fal/parent.png"]);
  });

  it("원래 작업의 지킬 대상을 다시 올려 붙인다 — 따라 만들 그림은 빼고", async () => {
    project.data = {
      ...project.data,
      referenceIds: ["style-1"],
      preservedIds: ["person-1"],
      personIds: ["person-1"],
      attachmentOrder: ["style-1", "person-1"],
    };
    libraryReferences = [
      { id: "style-1", storagePath: "u1/ref/style.png" },
      { id: "person-1", storagePath: "u1/ref/person.png" },
    ];
    await call({ instruction: "배경을 밤으로 바꿔 주세요" });
    expect(submitted[0]!.attachments).toEqual([{ url: "https://fal/ref-1.png", role: "preserve_person" }]);
    expect(submitted[0]!.personUrls).toEqual(["https://fal/ref-1.png"]);
    const built = (builders[0] as (job: unknown) => { prompt: string; input: Record<string, unknown> })(submitted[0]);
    expect(built.input.image_urls).toEqual(["https://fal/parent.png", "https://fal/ref-1.png"]);
    expect(built.prompt).toContain("Image 2 is the original photo of a person");
  });

  /*
   * 원본 사진은 보조다. 라이브러리 행은 있는데 저장소 파일이 사라졌다고 고치기
   * 전체가 실패하면, 전에는 되던 고치기가 안 된다(2026-09-29 리뷰).
   */
  it("원본 사진 한 장을 못 읽어도 고치기는 간다 — 그 장만 뺀다", async () => {
    project.data = {
      ...project.data,
      preservedIds: ["gone", "person-1"],
      personIds: ["person-1"],
      attachmentOrder: ["gone", "person-1"],
    };
    libraryReferences = [
      { id: "gone", storagePath: "u1/ref/gone.png" },
      { id: "person-1", storagePath: "u1/ref/person.png" },
    ];
    missingPaths = ["u1/ref/gone.png"];
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await call({ instruction: "배경을 밤으로 바꿔 주세요" });
    // 조용히 빼지 않는다 — 한 줄은 남긴다.
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
    expect(response.status).toBe(200);
    expect(submitted[0]!.attachments).toEqual([{ url: "https://fal/ref-1.png", role: "preserve_person" }]);
  });

  it("지킬 것이 없는 작업은 고칠 그림 하나만 올린다", async () => {
    await call({ instruction: "배경을 밤으로 바꿔 주세요" });
    expect(uploadCount).toBe(1);
  });

  it("글자를 넣을지 정한 값을 그대로 넘긴다 — 처음 만들 때와 같은 판단을 하려고", async () => {
    project.data = { ...project.data, inventedSlots: ["headline"], referenceHasText: true };
    await call({ instruction: "배경을 밤으로 바꿔 주세요" });
    expect(submitted[0]!.invented).toEqual(["headline"]);
    expect(submitted[0]!.referenceHasText).toBe(true);
  });
});

/**
 * **고치기도 처음 만들기와 같은 모델·같은 크기로 값을 낸다**(2026-09-29 리뷰).
 *
 * ① 처음 만들기는 고른 모델이 그 비율을 못 만들면 만들 수 있는 모델로 바꾼다
 *    (`chooseModelForRatio`). 바꾼 것을 작업에 적지는 않는다. 고치기는 작업의
 *    모델을 그대로 써서, 그런 작업은 고치기가 「만들 수 없는 조합」으로 거절됐다.
 * ② 원본 비율(`match-source`) 작업의 예약 견적에 크기를 안 넘겨 자리표시 픽셀로
 *    값을 냈다. 처음 만들기는 넘긴다 — 예약한 장수와 실제 값이 갈린다.
 */
describe("고치기는 처음 만들기와 같은 모델·크기로 값을 낸다", () => {
  beforeEach(async () => {
    const { EMPTY_SLOTS } = await import("@fixup/poster-core");
    project.data = { ...project.data, slots: EMPTY_SLOTS };
  });

  it("고른 모델이 그 비율을 못 만들면 처음 만들기처럼 만들 수 있는 모델로 고친다", async () => {
    const { chooseModelForRatio, IMAGE_MODELS } = await import("@fixup/sns-core");
    project = { ...project, ratio: "a4-print", modelId: "nano-banana-pro" };
    const choice = chooseModelForRatio("a4-print", "nano-banana-pro", IMAGE_MODELS);
    // 전제: 이 조합은 정말 바뀐다. 안 바뀌면 이 시험은 아무것도 안 잰다.
    expect(choice.switched).toBe(true);

    const response = await call({ instruction: "배경을 밤으로 바꿔 주세요" });
    expect(response.status).toBe(200);
    expect(submitted[0]!.modelId).toBe(choice.model.id);
    const built = (builders[0] as (job: unknown) => { rejected?: string })(submitted[0]);
    expect(built.rejected).toBeUndefined();
  });

  it("원본 비율 작업은 부모 그림의 실제 크기로 예약한다", async () => {
    const { estimatePosterCost } = await import("@fixup/poster-core");
    const { creditUnits } = await import("@fixup/shared");
    const at = (sourceSize?: { width: number; height: number }) => creditUnits(estimatePosterCost({
      modelId: "gpt-image-2", ratioId: "match-source", variants: 1, hasReferences: true, sourceSize,
    }).totalUsd ?? 0);
    parent = { ...parent, width: 3000, height: 3000 };
    // 전제: 실제 크기와 자리표시 크기의 값이 다르다. 같으면 이 시험은 헛돈다.
    expect(at({ width: 3000, height: 3000 })).not.toBe(at());

    await call({ instruction: "배경을 밤으로 바꿔 주세요" });
    expect(reserved[0]).toBe(at({ width: 3000, height: 3000 }));
  });
});
