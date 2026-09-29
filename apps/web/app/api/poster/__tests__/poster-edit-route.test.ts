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
let parent: {
  id: string; assetPath: string; selected: boolean; width: number | null; height: number | null;
  generationRequestId?: string;
};
/** 같은 작업의 다른 그림들. 고칠 그림을 id 로 고르는지 볼 때 쓴다. */
let otherImages: Array<typeof parent> = [];
/** 부모 그림을 만든 요청 줄의 실제 모델. */
let parentRequestModel: string | null = null;
/** 고칠 그림으로 어느 파일을 올렸나. */
const parentReads: string[] = [];
/** `byProject` 에 넘어온 선택. */
const imageListOptions: unknown[] = [];
type SubmittedJob = {
  ratioId: string;
  modelId?: string;
  parentImageId?: string;
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
    images: {
      byProject: async (_projectId: string, options?: unknown) => {
        imageListOptions.push(options);
        return [parent, ...otherImages];
      },
    },
    requests: { modelOf: async () => parentRequestModel },
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
  posterImageBytes: async (assetPath: string) => {
    parentReads.push(assetPath);
    return { bytes: Buffer.from("x"), contentType: "image/png" };
  },
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
  otherImages = [];
  parentRequestModel = null;
  parentReads.length = 0;
  imageListOptions.length = 0;
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
    const built = (builders[0] as (job: unknown) => { rejected?: string; estimate: { totalUsd?: number } })(submitted[0]);
    expect(built.rejected).toBeUndefined();
    /*
     * **예약도 바뀐 모델로 잡는다.** 견적만 옛 모델로 두면 그 조합은 거절돼 0장을
     * 예약하고, 확정은 예약한 장수를 못 넘어 고치기가 공짜가 된다(2026-09-29 리뷰).
     * 실제 요청이 적는 단가와 예약을 직접 묶는다.
     */
    const { creditUnits } = await import("@fixup/shared");
    expect(reserved[0]).toBeGreaterThan(0);
    expect(reserved[0]).toBe(creditUnits(built.estimate.totalUsd ?? 0));
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

/**
 * **고칠 그림은 화면이 직접 말한다**(2026-09-29 점검).
 *
 * 전에는 화면이 「고르기」를 먼저 보내고, 서버는 그때 「골라져 있는」 그림을 고쳤다.
 * 고르기가 실패하거나(오류가 떠도 입력칸은 열려 있다) 늦게 닿으면 **다른 변형이
 * 고쳐졌다** — 사용자는 변형 3을 고쳤다고 알고, 고친 결과는 변형 1에서 나온다.
 */
describe("고칠 그림을 id 로 받는다", () => {
  beforeEach(async () => {
    const { EMPTY_SLOTS } = await import("@fixup/poster-core");
    project = { ...project, ratio: "2:3", data: { ...project.data, slots: EMPTY_SLOTS } };
    otherImages = [{ id: "i3", assetPath: "u1/poster/p1/req-1/2.png", selected: false, width: 1024, height: 1536 }];
  });

  it("고칠 그림 id 를 보내면 그 그림을 고친다 — 서버에 다른 그림이 골라져 있어도", async () => {
    const response = await call({ instruction: "배경을 밤으로 바꿔 주세요", imageId: "i3" });
    expect(response.status).toBe(200);
    expect(parentReads).toEqual(["u1/poster/p1/req-1/2.png"]);
    expect(submitted[0]!.parentImageId).toBe("i3");
  });

  it("이 작업에 없는 그림 id 면 404 — 예약도 안 한다", async () => {
    const response = await call({ instruction: "배경을 밤으로 바꿔 주세요", imageId: "남의그림" });
    expect(response.status).toBe(404);
    expect(reserved).toEqual([]);
    expect(submitted).toEqual([]);
  });

  it("id 를 안 보내는 옛 화면은 지금처럼 골라 둔 그림을 고친다", async () => {
    await call({ instruction: "배경을 밤으로 바꿔 주세요" });
    expect(submitted[0]!.parentImageId).toBe("i1");
  });
});

/**
 * **부모 그림을 만든 모델로 고친다**(2026-09-29 점검).
 *
 * 모델 목록 차례가 바뀐 뒤(09-10 무렵)에는 `chooseModelForRatio(작업의 모델)` 이
 * 부모 그림과 다른 모델을 고를 수 있었다. 부모 그림의 요청 줄에 실제 모델이 있다.
 */
describe("부모 그림의 모델로 고친다", () => {
  beforeEach(async () => {
    const { EMPTY_SLOTS } = await import("@fixup/poster-core");
    project = { ...project, ratio: "2:3", modelId: "gpt-image-2.5-flare", data: { ...project.data, slots: EMPTY_SLOTS } };
    parent = { ...parent, generationRequestId: "req-parent" };
  });

  it("부모 그림을 만든 모델이 그 비율을 만들 수 있으면 그 모델이다", async () => {
    parentRequestModel = "gpt-image-2";
    await call({ instruction: "배경을 밤으로 바꿔 주세요" });
    expect(submitted[0]!.modelId).toBe("gpt-image-2");
  });

  it("부모 모델을 모르면(옛 기록) 작업의 모델로 — 지금까지와 같다", async () => {
    parentRequestModel = null;
    await call({ instruction: "배경을 밤으로 바꿔 주세요" });
    expect(submitted[0]!.modelId).toBe("gpt-image-2.5-flare");
  });
});

/**
 * **남의 작업은 못 고친다 — 팀원 것도.** 작업·그림 읽기는 팀이면 팀원 것까지
 * 보이는데(RLS), 작업 저장은 본인 것만 된다. 그래서 팀원의 작업을 고치면 fal 에
 * 돈을 낸 **뒤에** 저장에서 막혔다. 그림을 본인 것만 읽으면 돈이 나가기 전에 멈춘다
 * (2026-09-29 점검 — 운영에는 혼자인 팀 하나뿐이라 실제로 일어나지는 않았다).
 */
describe("본인 작업만 고친다", () => {
  it("그림 목록을 본인 것만 달라고 한다", async () => {
    await call({ instruction: "배경을 밤으로 바꿔 주세요" });
    expect(imageListOptions).toContainEqual(expect.objectContaining({ ownOnly: true }));
  });
});
