import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **마지막으로 만든 이미지를 이어서 고친다** (2026-10-06 사용자 보고).
 *
 * 새 생성 길을 만들지 않는다 — 포스터 「이 장만 고치기」 라우트를 그대로 부른다.
 * 여기서 재는 것은 **무엇을 고치고(마지막 줄의 그 그림), 무엇을 붙이고(새로 붙인
 * 것만), 대화에 무엇을 남기는가(고친 줄 표시)** 다.
 */

vi.mock("server-only", () => ({}));

type Image = { id: string; generationRequestId: string; selected: boolean };
let project: { id: string; ratio: string; data: Record<string, unknown> } | undefined;
let images: Image[];
let 다른작업 = new Set<string>();
const imageOptions: unknown[] = [];
const edits: Array<{ url: string; body: Record<string, unknown>; step: string | null }> = [];
let editResponse: Response;

vi.mock("../../poster/stores", () => ({
  posterStoresForUser: () => ({
    projects: {
      get: async (id: string) => (project && project.id === id
        ? project
        : 다른작업.has(id) ? { id, ratio: "1:1", data: {} } : undefined),
    },
    images: {
      byProject: async (_id: string, options?: unknown) => { imageOptions.push(options); return images; },
    },
  }),
}));
vi.mock("../../../app/api/poster/projects/[id]/edit/route", () => ({
  POST: async (request: Request) => {
    edits.push({ url: request.url, body: await request.json(), step: request.headers.get("x-idempotency-key") });
    return editResponse;
  },
}));

const { countEasyImages, imageEditTurn, lastEasyImage } = await import("../image-edit-turn");
const { editRowBody, withRowJob } = await import("../../../app/easy/row-image");

const 남긴줄: Array<{ role: string; body?: string; workId?: string | null }> = [];
const store = {
  appendMessage: async (row: { role: string; body?: string; workId?: string | null }) => {
    남긴줄.push(row);
    return { id: `m${남긴줄.length}`, ...row };
  },
} as never;

const 줄 = {
  user: (body: string) => ({ id: `u-${body}`, role: "user", body, workId: null }),
  image: (workId: string, body = "") => ({ id: `i-${workId}-${body}`, role: "image", body, workId }),
};

const 요청 = () => new Request("http://localhost/api/easy/generate", {
  method: "POST",
  headers: { "x-idempotency-key": "11111111-1111-4111-8111-111111111111" },
});

beforeEach(() => {
  project = { id: "p1", ratio: "4:5", data: { referenceIds: ["src-1"], preservedIds: ["keep-1"], personIds: [], restyledIds: [] } };
  images = [{ id: "img-1", generationRequestId: "r1", selected: false }];
  imageOptions.length = 0;
  edits.length = 0;
  남긴줄.length = 0;
  다른작업 = new Set();
  editResponse = Response.json({ ok: true, submission: { requestRowId: "r2", falRequestId: "f2", endpoint: "e" } });
});

describe("고칠 이미지 찾기", () => {
  it("대화의 마지막 결과가 포스터 작업이면 그것", async () => {
    const target = await lastEasyImage("me", [줄.user("만들어줘"), 줄.image("p1")]);
    expect(target?.projectId).toBe("p1");
    expect(target?.ratio).toBe("4:5");
  });

  it("마지막 결과가 카드뉴스(포스터 작업이 아님)면 없다 — 앞의 이미지로 거슬러 가지 않는다", async () => {
    expect(await lastEasyImage("me", [줄.image("p1"), 줄.image("card-9")])).toBeNull();
  });

  it("만든 것이 없으면 없다", async () => {
    expect(await lastEasyImage("me", [줄.user("안녕")])).toBeNull();
  });
});

describe("고치기", () => {
  const 고친다 = async (rows: ReturnType<typeof 줄.image>[], attachments: string[] = []) => {
    const all = [줄.user("만들어줘"), ...rows];
    const target = await lastEasyImage("me", all);
    return imageEditTurn({
      request: 요청(), userId: "me", store, conversationId: "c1", prompt: "로고를 이걸로 바꿔줘",
      textModel: "claude-sonnet-5", target: target!, rows: all, attachments,
    });
  };

  it("마지막 줄의 그 그림을 포스터 고치기로 고친다", async () => {
    const response = await 고친다([줄.image("p1")]);
    const json = await response.json();
    expect(edits).toHaveLength(1);
    expect(edits[0]!.url).toContain("/api/poster/projects/p1/edit");
    expect(edits[0]!.body).toEqual({ instruction: "로고를 이걸로 바꿔줘", imageId: "img-1" });
    expect(json).toMatchObject({ ok: true, projectId: "p1", submission: { requestRowId: "r2" }, ratio: "4:5" });
  });

  it("본인 그림만 본다", async () => {
    await 고친다([줄.image("p1")]);
    expect(imageOptions[0]).toMatchObject({ ownOnly: true });
  });

  it("고친 줄을 다시 고치면 그 고친 그림을 고친다 — 이어서 작업", async () => {
    images = [
      { id: "img-1", generationRequestId: "r1", selected: true },
      { id: "img-2", generationRequestId: "r2", selected: false },
    ];
    await 고친다([줄.image("p1"), 줄.image("p1", editRowBody("r2"))]);
    expect(edits[0]!.body.imageId).toBe("img-2");
  });

  it("말과 고친 줄을 대화에 남긴다 — 고친 줄에는 요청 번호", async () => {
    await 고친다([줄.image("p1")]);
    expect(남긴줄).toEqual([
      { conversationId: "c1", role: "user", body: "로고를 이걸로 바꿔줘" },
      { conversationId: "c1", role: "image", workId: "p1", body: withRowJob(editRowBody("r2"), { requestRowId: "r2", falRequestId: "f2", endpoint: "e" }) },
    ]);
  });

  /**
   * 2차 D3: 첨부는 만들기 · 고치기에 쓴 뒤 입력창에서 내려간다. 붙어 있다면 이번에 일부러 붙인 것이다.
   * 원래 작업의 **지킬 사진**(제품 · 인물 그대로)만 뺀다 — 고치기 라우트가 알아서 다시 붙인다.
   */
  it("지킬 사진만 빼고 붙인 사진을 넣는다 — 따라 만들 사진도 다시 붙였으면 넣는다 (2차 D3)", async () => {
    await 고친다([줄.image("p1")], ["src-1", "keep-1", "logo-1"]);
    expect(edits[0]!.body.addedReferenceIds).toEqual(["src-1", "logo-1"]);
  });

  it("고칠 그림이 아직 없으면(만드는 중) 값 없이 안내만 한다", async () => {
    images = [];
    const json = await (await 고친다([줄.image("p1")])).json();
    expect(edits).toEqual([]);
    expect(json.talked).toBe(true);
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant"]);
  });

  it("고치기가 실패하면 그림 줄을 남기지 않는다", async () => {
    editResponse = Response.json({ ok: false, message: "한도를 다 썼습니다." }, { status: 402 });
    await expect(고친다([줄.image("p1")])).rejects.toThrow("한도를 다 썼습니다.");
    expect(남긴줄.map((row) => row.role)).toEqual(["user"]);
  });
});

/* ── 독립 리뷰 반영(2026-10-06) ── */
describe("이어서 고칠 때", () => {
  const 대화 = (...rows: Array<{ id: string; role: string; body: string; workId: string | null; createdAt?: string }>) => rows;
  const 고친다 = async (rows: ReturnType<typeof 대화>, attachments: string[] = []) => {
    const target = await lastEasyImage("me", rows);
    return imageEditTurn({
      request: 요청(), userId: "me", store, conversationId: "c1", prompt: "글자만 크게",
      textModel: "claude-sonnet-5", target: target!, rows, attachments,
    });
  };

  /** 2차 D3: 예전에는 남아 있던 첨부를 걸렀다. 이제 첨부가 내려가므로 다시 붙인 로고는 일부러 붙인 것이다. */
  it("앞서 고칠 때 넣은 로고를 다시 붙이면 다시 넣는다 (2차 D3)", async () => {
    images = [
      { id: "img-1", generationRequestId: "r1", selected: false },
      { id: "img-2", generationRequestId: "r2", selected: false },
    ];
    await 고친다(대화(
      { id: "i1", role: "image", body: "", workId: "p1" },
      { id: "i2", role: "image", body: editRowBody("r2", ["logo-1"]), workId: "p1" },
    ), ["src-1", "logo-1"]);
    expect(edits[0]!.body.addedReferenceIds).toEqual(["src-1", "logo-1"]);
    expect(edits[0]!.body.imageId).toBe("img-2");
  });

  it("넣은 사진을 고친 줄에 적어 둔다", async () => {
    await 고친다(대화({ id: "i1", role: "image", body: "", workId: "p1" }), ["logo-1"]);
    expect(남긴줄.at(-1)).toMatchObject({ role: "image", body: withRowJob(editRowBody("r2", ["logo-1"]), { requestRowId: "r2", falRequestId: "f2", endpoint: "e" }) });
  });

  it("앞의 고치기가 실패했으면(오래 지나도 그림 없음) 그 앞의 그림을 고친다 — 막히지 않는다", async () => {
    images = [{ id: "img-1", generationRequestId: "r1", selected: false }];
    await 고친다(대화(
      { id: "i1", role: "image", body: "", workId: "p1", createdAt: "2026-10-06T05:00:00Z" },
      { id: "i2", role: "image", body: editRowBody("r-failed"), workId: "p1", createdAt: "2026-10-06T05:01:00Z" },
    ));
    expect(edits[0]!.body.imageId).toBe("img-1");
  });

  it("앞의 고치기가 아직 만드는 중이면 기다리라고 한다 — 값이 안 나간다", async () => {
    images = [{ id: "img-1", generationRequestId: "r1", selected: false }];
    const json = await (await 고친다(대화(
      { id: "i1", role: "image", body: "", workId: "p1", createdAt: new Date(Date.now() - 60_000).toISOString() },
      { id: "i2", role: "image", body: editRowBody("r-busy"), workId: "p1", createdAt: new Date(Date.now() - 30_000).toISOString() },
    ))).json();
    expect(edits).toEqual([]);
    expect(json.talked).toBe(true);
  });
});

describe("기다리라는 안내", () => {
  // 바로 거절된 고치기도 10분 동안은 만드는 중으로 보인다 — 그때 할 일을 함께 알린다(재리뷰).
  it("실패했을 때 할 일도 알려 준다", async () => {
    const { IMAGE_NOT_READY } = await import("../image-edit-turn");
    expect(IMAGE_NOT_READY).toContain("10분");
    expect(IMAGE_NOT_READY).toContain("새로 만들어");
  });
});

describe("이 대화에서 만든 이미지 수 (규격 안내, 최종 리뷰 2026-10-06)", () => {
  /**
   * 그림 줄을 그대로 세면 고친 줄 · 카드뉴스 줄 · 지운 작업까지 센다 — 「만든 이미지가 5장
   * 있습니다」라고 안내하고 「광고소재」에서는 2장만 보인다.
   */
  it("서로 다른 포스터 작업만 센다 — 고친 줄 · 카드뉴스 · 지운 작업은 안 센다", async () => {
    다른작업 = new Set(["p2"]);
    const rows = [
      줄.user("카페 포스터 만들어줘"),
      줄.image("p1"),
      줄.image("p1", editRowBody("r2")), // 같은 작업을 고친 줄
      줄.image("p2"),
      줄.image("card-9"), // 카드뉴스 작업 — 포스터 저장소에 없다
      줄.image("gone"), // 지운 작업
      줄.user("규격별로"),
    ];
    expect(await countEasyImages("me", rows)).toBe(2);
  });

  it("그림 줄이 없으면 0", async () => {
    expect(await countEasyImages("me", [줄.user("안녕")])).toBe(0);
  });
});
