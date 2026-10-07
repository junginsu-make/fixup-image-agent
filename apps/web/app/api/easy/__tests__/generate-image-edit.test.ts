import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **「쉽게」 문 — 만든 이미지 이어서 고치기** (2026-10-06 사용자 보고).
 *
 * 실제로 난 일: 이미지를 만든 대화에서 「로고 사진에 있는 로고로 변경해줘」 →
 * 판단 모델은 `revise`(실측 6/6) → 원고가 없어 빈 답의 `talk` → 「무엇을 만들어
 * 드릴까요?」 되풀이. 여기서는 그 대화를 그대로 넣고 문이 **고치기를 부르는지** 잰다.
 */

vi.mock("server-only", () => ({}));

const 사진 = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

let 판단: unknown;
let 지난줄: Array<{ id: string; role: string; body: string; workId: string | null }>;
const 남긴줄: Array<{ role: string; body?: string; workId?: string | null }> = [];
const 부른라우트: Array<{ step: string; url: string; body: Record<string, unknown> }> = [];
let 받은갈래: string[] = [];
let 그림들: Array<{ id: string; generationRequestId: string; selected: boolean }> = [];
let 고치기실패 = false;
let 목록실패 = false;

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "me-1", profile: { role: "member" } } }),
  reserveAiUsage: async () => ({ ok: true as const, userId: "me-1", requestId: "decide", usage: undefined }),
  settleAiUsage: async () => ({ remaining: 0 }),
}));
vi.mock("../../../../lib/teams/store", () => ({ teamIdOf: async () => null }));
vi.mock("../../../../lib/easy/store", () => ({
  easyStoreForUser: () => ({
    getConversation: async () => ({ id: "c1", title: "있음" }),
    listMessages: async () => 지난줄,
    appendMessage: async (row: { role: string; body?: string }) => {
      남긴줄.push(row);
      return { id: `m${남긴줄.length}`, ...row };
    },
    renameConversation: async () => {},
  }),
}));
vi.mock("../../../../lib/easy/chat-provider", () => ({
  createEasyChatProvider: () => ({
    decide: async (_prompt: string, wants: readonly string[]) => { 받은갈래 = [...wants]; return 판단; },
    decideRoles: async () => ({ photos: [], conflicting: false }),
  }),
}));
vi.mock("../../../../lib/easy/cardnews-steps", async (original) => ({
  ...(await original<object>()),
  lastCardnewsProject: async () => null,
  cardnewsProjectIds: async () => new Set<string>(),
}));
vi.mock("../../../../lib/easy/read-photos", () => ({ readEasyPhotos: async () => ({}) }));
vi.mock("../../../../lib/poster/references", () => ({
  posterReferencesByIds: async (_viewer: unknown, ids: string[]) => ids.map((id) => ({ id, title: id, url: `https://x.test/${id}.png` })),
}));
vi.mock("../../../../lib/llm/meter", () => ({
  withLlmMeter: (fn: () => unknown) => fn(),
  readLlmMeter: () => ({ metered: true, usd: 0, calls: 0, inputTokens: 0, outputTokens: 0 }),
  llmSettleCost: () => ({ model: "", billableImages: 0 }),
}));
vi.mock("../../../../lib/poster/stores", () => ({
  posterStoresForUser: () => ({
    projects: {
      get: async (id: string) => (id === "p1"
        ? { id: "p1", ratio: "1:1", data: { referenceIds: [사진(1)], preservedIds: [], personIds: [], restyledIds: [] } }
        : undefined),
    },
    images: {
      byProject: async () => 그림들,
      byProjects: async () => {
        if (목록실패) throw new Error("잠깐 끊김");
        return 그림들.map((one) => ({ ...one, projectId: "p1", assetPath: `me-1/${one.id}.png`, thumbPath: null }));
      },
    },
  }),
}));
const 라우트 = (step: string) => ({
  POST: async (req: Request) => {
    부른라우트.push({ step, url: req.url, body: await req.json() });
    if (step === "edit" && 고치기실패) return Response.json({ ok: false, message: "고치기가 막혔습니다." }, { status: 403 });
    return step === "project"
      ? Response.json({ ok: true, project: { id: "new" } })
      : Response.json({ ok: true, submission: { requestRowId: `${step}-row`, falRequestId: "f", endpoint: "e" } });
  },
});
vi.mock("../../poster/projects/route", () => 라우트("project"));
vi.mock("../../poster/projects/[id]/plan/route", () => 라우트("plan"));
vi.mock("../../poster/projects/[id]/generate/route", () => 라우트("generate"));
vi.mock("../../poster/projects/[id]/edit/route", () => 라우트("edit"));

const { POST } = await import("../generate/route");
const { NOTHING_TO_EDIT } = await import("../../../easy/chat");
const { failureRowBody } = await import("../../../../lib/easy/failure-row");
const { askBody, readAsk, visibleBody } = await import("../../../easy/row-marks");
const { editRowBody, rowFromOf } = await import("../../../easy/row-image");
const { IMAGE_NOT_READY } = await import("../../../../lib/easy/image-edit-turn");
const { NO_DONE_IMAGE } = await import("../../../../lib/easy/edit-target");
const { sayBody } = await import("../../../easy/row-marks");
const { sayEditText } = await import("../../../easy/turn-words");

const 보낸다 = async (body: Record<string, unknown>) => {
  const response = await POST(new Request("http://localhost/api/easy/generate", {
    method: "POST",
    headers: { "x-idempotency-key": "11111111-1111-4111-8111-111111111111" },
    body: JSON.stringify({ conversationId: "c1", imageModel: "gpt-image-2.5-flare", ...body }),
  }));
  return { status: response.status, json: await response.json() };
};

const 로고바꿔줘 = "지금 생성한 사진 맨 오른쪽 맨 밑에 있는 로고 사진에 있는 로고로 변경해줘";

beforeEach(() => {
  판단 = { wants: "revise", reply: "", ratio: "", look: "", card: 0, note: "" };
  지난줄 = [
    { id: "u1", role: "user", body: "화장품을 넣어줘", workId: null },
    { id: "i1", role: "image", body: "", workId: "p1" },
  ];
  남긴줄.length = 0; 부른라우트.length = 0;
  그림들 = [{ id: "img-1", generationRequestId: "r1", selected: false }];
  고치기실패 = false;
  목록실패 = false;
});

describe("이미지를 만든 대화에서 고쳐 달라고 하면", () => {
  it("모델이 revise 라고 해도 마지막 이미지를 고친다 — 「무엇을 만들어 드릴까요?」가 아니다", async () => {
    const { status, json } = await 보낸다({ prompt: 로고바꿔줘, referenceIds: [사진(1), 사진(2)] });
    expect(status).toBe(200);
    expect(부른라우트.map((call) => call.step)).toEqual(["edit"]);
    expect(부른라우트[0]!.url).toContain("/api/poster/projects/p1/edit");
    // 2차 D3: 첨부는 쓴 뒤 내려간다 — 붙어 있으면 일부러 붙인 것이라 다 넣는다(지킬 사진만 뺀다. 이 작업엔 없다).
    expect(부른라우트[0]!.body).toEqual({ instruction: 로고바꿔줘, imageId: "img-1", addedReferenceIds: [사진(1), 사진(2)] });
    expect(json).toMatchObject({ ok: true, projectId: "p1", submission: { requestRowId: "edit-row" } });
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant", "image"]);
  });

  /**
   * 2차 최종 리뷰 b — 판단 읽기가 revise 를 이미지 고치기로 바꿔 읽으면, 모델이 revise 로 쓴 「원고를 고치겠습니다」는
   * 이 일과 안 맞는다. 판단 읽기가 그 reply 를 비우고 코드 문장이 머리말로 나간다.
   */
  it("revise 를 이미지 고치기로 바꿔 읽으면 처음 갈래로 쓴 말 대신 코드 문장을 머리말로 쓴다", async () => {
    판단 = { ...(판단 as object), wants: "revise", reply: "카드뉴스 원고를 짧게 고치겠습니다." };
    await 보낸다({ prompt: 로고바꿔줘 });
    expect(남긴줄[1]!.body).toBe(sayBody(sayEditText()));
  });

  it("모델이 image_edit 이라고 해도 같다", async () => {
    판단 = { ...(판단 as object), wants: "image_edit" };
    await 보낸다({ prompt: "배경만 파랗게" });
    expect(부른라우트.map((call) => call.step)).toEqual(["edit"]);
  });

  it("새 이미지를 말하면(image) 지금처럼 새로 만든다 — 고치기를 안 부른다", async () => {
    판단 = { ...(판단 as object), wants: "image", ratio: "1:1" };
    await 보낸다({ prompt: "고양이 포스터 새로 만들어줘" });
    expect(부른라우트.map((call) => call.step)).toEqual(["project", "plan", "generate"]);
  });
});

describe("고칠 것이 없는 대화에서 고쳐 달라고 하면", () => {
  it("빈 답이 아니라 안내를 한다 — 값도 안 나간다", async () => {
    지난줄 = [{ id: "u1", role: "user", body: "안녕", workId: null }];
    const { json } = await 보낸다({ prompt: 로고바꿔줘 });
    expect(부른라우트).toEqual([]);
    expect(json.talked).toBe(true);
    expect(json.message.body).toBe(NOTHING_TO_EDIT);
  });
});

describe("선택지와 고른 갈래 (2026-10-06 A1 · A2)", () => {
  it("이미지를 만든 대화면 선택지에 image_edit 이 있다", async () => {
    await 보낸다({ prompt: "배경만 파랗게" });
    expect(받은갈래).toContain("image_edit");
  });

  it("만든 것이 없는 대화면 선택지에 고치기 갈래가 없다", async () => {
    지난줄 = [{ id: "u1", role: "user", body: "안녕", workId: null }];
    await 보낸다({ prompt: 로고바꿔줘 });
    expect(받은갈래).not.toContain("image_edit");
    expect(받은갈래).not.toContain("revise");
  });

  it("「이미지 한 장」을 고른 답이면 마지막 이미지를 고치지 않고 새로 만든다", async () => {
    판단 = { ...(판단 as object), wants: "image_edit" };
    await 보낸다({ prompt: "광고 사진을 만들어주세요", kind: "image", kindPicked: true, ratio: "1:1" });
    expect(부른라우트.map((call) => call.step)).toEqual(["project", "plan", "generate"]);
  });

  it("단추로 고른 것이 아니면(이어 온 갈래) 고치기 판단을 따른다", async () => {
    판단 = { ...(판단 as object), wants: "image_edit" };
    await 보낸다({ prompt: "배경만 파랗게", kind: "image" });
    expect(부른라우트.map((call) => call.step)).toEqual(["edit"]);
  });
});

describe("고치기가 실패하면 (2026-10-06 B4)", () => {
  it("말 뒤에 실패 안내를 남긴다", async () => {
    고치기실패 = true;
    판단 = { ...(판단 as object), wants: "image_edit" };
    await 보낸다({ prompt: "배경만 파랗게" });
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant", "assistant"]);
    expect(남긴줄[2]!.body).toBe(failureRowBody("고치기가 막혔습니다."));
  });
});

describe("번호로 고르기 (2차 D2)", () => {
  beforeEach(() => {
    그림들 = [{ id: "img-1", generationRequestId: "r1", selected: false }, { id: "img-3", generationRequestId: "r3", selected: false }];
    지난줄 = [
      { id: "u1", role: "user", body: "화장품을 넣어줘", workId: null }, { id: "i1", role: "image", body: "", workId: "p1" },
      { id: "u2", role: "user", body: "배경 파랗게", workId: null }, { id: "i3", role: "image", body: editRowBody("r3"), workId: "p1" },
    ];
  });

  /** Review Focus 4 — 이미지 2 는 이미지 1 을 고친 것이다. 「이미지 1」은 1번 줄의 그림이다. */
  it("「이미지 1 고쳐줘」는 1번 줄의 그림을 고친다 — 같은 작업의 나중 줄(이미지 2)이 아니라", async () => {
    판단 = { ...(판단 as object), wants: "image_edit", target: 1 };
    const { json } = await 보낸다({ prompt: "이미지 1 글자 크게" });
    expect(부른라우트[0]!.body).toMatchObject({ imageId: "img-1" });
    expect(rowFromOf(남긴줄.at(-1)!.body)).toBe("i1");
    expect(json.resultLabel).toBe("이미지 3");
  });

  it("없는 번호면 값 없이 사실대로 답한다", async () => {
    판단 = { ...(판단 as object), wants: "image_edit", target: 7 };
    const { json } = await 보낸다({ prompt: "이미지 7 고쳐줘" });
    expect(부른라우트).toEqual([]);
    expect(json.talked).toBe(true);
    expect(json.message.body).toContain("7번은 이 대화에 없습니다");
  });

  /** 2차 최종 리뷰 5 — 결과물 번호는 지운 결과도 센다. 그 번호는 값 없이 코드가 쓴 사실 문장이다. */
  it("지운 결과의 번호면 값 없이 사실대로 답한다 — 뒤 번호는 그대로다", async () => {
    지난줄 = [...지난줄, { id: "u3", role: "user", body: "배너", workId: null }, { id: "c3", role: "image", body: "", workId: "gone" }];
    판단 = { ...(판단 as object), wants: "image_edit", target: 3 };
    const { json } = await 보낸다({ prompt: "3번 고쳐줘" });
    expect(부른라우트).toEqual([]);
    expect(json.message.body).toContain("3번은 지운 결과라 고칠 수 없습니다");
  });

  it("어느 이미지인지 모르면 묻고 번호 단추용 물음 줄을 남긴다", async () => {
    판단 = { wants: "talk", reply: "어느 이미지를 고칠까요?", ratio: "", look: "", card: 0, note: "ask_target" };
    await 보낸다({ prompt: "고쳐줘" });
    expect(readAsk(남긴줄[1] as never)).toEqual({ kind: "target", text: "어느 이미지를 고칠까요?", data: { numbers: [1, 2] } });
    expect(부른라우트).toEqual([]);
  });

  /**
   * 최종 수정 3 — 번호 물음 줄에 붙인 사진 id 를 적는다. 안 적으면 새로고침 · 새 탭에서 번호를 누를 때 화면에 첨부가
   * 없어 로고 없이 고친다(값은 나간다). 단추 답은 다른 물음처럼 물음 줄의 사진을 같은 확인 길로 되살린다.
   */
  it("붙인 사진과 함께 어느 이미지인지 물으면 물음 줄에 사진을 적고, 새로고침 뒤 번호 단추로 고르면 그 사진으로 고친다", async () => {
    판단 = { wants: "talk", reply: "어느 이미지를 고칠까요?", ratio: "", look: "", card: 0, note: "ask_target" };
    await 보낸다({ prompt: "로고를 이걸로 바꿔줘", referenceIds: [사진(2)] });
    expect(readAsk(남긴줄[1] as never)?.data).toEqual({ numbers: [1, 2], ids: [사진(2)] });

    지난줄 = [
      ...지난줄,
      { id: "u3", role: "user", body: 남긴줄[0]!.body!, workId: null },
      { id: "q1", role: "assistant", body: 남긴줄[1]!.body!, workId: null },
    ];
    남긴줄.length = 0; 판단 = undefined;
    await 보낸다({ prompt: "이미지 2", answersRowId: "q1", pick: { target: 2 } });
    expect(부른라우트.map((call) => call.step)).toEqual(["edit"]);
    expect(부른라우트[0]!.body).toMatchObject({ instruction: "로고를 이걸로 바꿔줘", imageId: "img-3", addedReferenceIds: [사진(2)] });
  });

  it("번호 단추로 답하면 판단 없이 물음을 부른 말로 그 이미지를 고친다", async () => {
    지난줄 = [
      ...지난줄,
      { id: "u3", role: "user", body: "배경만 하얗게", workId: null },
      { id: "q1", role: "assistant", body: askBody("target", "어느 이미지를 고칠까요?", { numbers: [1, 2] }), workId: null },
    ];
    판단 = undefined; // 판단 모델을 부르면 읽기가 실패한다 — 단추 답은 안 부른다
    await 보낸다({ prompt: "이미지 1", answersRowId: "q1", pick: { target: 1 } });
    expect(부른라우트.map((call) => call.step)).toEqual(["edit"]);
    expect(부른라우트[0]!.body).toMatchObject({ instruction: "배경만 하얗게", imageId: "img-1" });
  });

  /**
   * 컨트롤러 결정 2 — 누른 번호가 이긴다. 마지막 이미지(이미지 2)가 아니라 누른 번호의 줄을 고치고, 고친 대상으로
   * 그 줄을 적고, 새 줄의 이름표는 다음 결과물 번호다.
   */
  it("번호 단추의 번호로 고친다 — 마지막 이미지로 떨어지지 않는다", async () => {
    지난줄 = [
      ...지난줄,
      { id: "u3", role: "user", body: "글자 크게", workId: null },
      { id: "q1", role: "assistant", body: askBody("target", "어느 이미지를 고칠까요?", { numbers: [1, 2] }), workId: null },
    ];
    판단 = undefined;
    const { json } = await 보낸다({ prompt: "이미지 1", answersRowId: "q1", pick: { target: 1 } });
    expect(부른라우트[0]!.body).toMatchObject({ imageId: "img-1" });
    expect(rowFromOf(남긴줄.at(-1)!.body)).toBe("i1");
    expect(json.resultLabel).toBe("이미지 3");
  });

  it("번호 단추의 번호가 그 사이 지운 결과면 값 없이 사실대로 답한다", async () => {
    지난줄 = [
      ...지난줄,
      { id: "u3", role: "user", body: "배너", workId: null }, { id: "c3", role: "image", body: "", workId: "gone" },
      { id: "u4", role: "user", body: "글자 크게", workId: null },
      { id: "q1", role: "assistant", body: askBody("target", "어느 이미지를 고칠까요?", { numbers: [1, 2, 3] }), workId: null },
    ];
    판단 = undefined;
    const { json } = await 보낸다({ prompt: "이미지 3", answersRowId: "q1", pick: { target: 3 } });
    expect(부른라우트).toEqual([]);
    expect(json.message.body).toContain("3번은 지운 결과라 고칠 수 없습니다");
  });

  /** 2차 최종 리뷰 6 · Review Focus 8 — 번호 물음 바로 뒤 image_edit 이면 note 가 없어도 답이다. 처음 말로 고친다. */
  it("번호 물음에 말로 「1번」이라 답하면 note 가 없어도 물음을 부른 말로 그 이미지를 고친다", async () => {
    지난줄 = [
      ...지난줄,
      { id: "u3", role: "user", body: "배경만 하얗게", workId: null },
      { id: "q1", role: "assistant", body: askBody("target", "어느 이미지를 고칠까요?", { numbers: [1, 2] }), workId: null },
    ];
    판단 = { wants: "image_edit", reply: "", ratio: "", look: "", card: 0, note: "", target: 1 };
    await 보낸다({ prompt: "1번" });
    expect(부른라우트[0]!.body).toMatchObject({ instruction: "배경만 하얗게", imageId: "img-1" });
  });

  /** 컨트롤러 결정 3 — 번호 물음 뒤 번호 없는 고치기를 마지막 이미지로 몰래 떨어뜨리지 않는다. */
  it("번호 물음에 번호 없이 말로 답하면 마지막 이미지를 고치지 않고 다시 묻는다", async () => {
    지난줄 = [
      ...지난줄,
      { id: "u3", role: "user", body: "배경만 하얗게", workId: null },
      { id: "q1", role: "assistant", body: askBody("target", "어느 이미지를 고칠까요?", { numbers: [1, 2] }), workId: null },
    ];
    판단 = { wants: "image_edit", reply: "", ratio: "", look: "", card: 0, note: "", target: 0 };
    await 보낸다({ prompt: "그거요" });
    expect(부른라우트).toEqual([]);
    expect(readAsk(남긴줄[1] as never)).toMatchObject({ kind: "target", data: { numbers: [1, 2] } });
  });
});

/**
 * 2차 최종 리뷰 a — 고칠 수 있는 이미지는 지운 것만 뺀다. 만드는 중에 「글자 크게」면 「이 대화에는 아직 고칠
 * 이미지가 없습니다」가 아니라 「아직 준비되지 않았습니다」여야 한다. 값은 안 든다.
 */
describe("만드는 중인 이미지를 고쳐 달라면 (2차 최종 리뷰 a)", () => {
  it("고칠 것이 없다가 아니라 아직 준비 안 됐다고 답한다", async () => {
    그림들 = [];
    지난줄 = [{ id: "u1", role: "user", body: "카페 포스터", workId: null }, { id: "i1", role: "image", body: "", workId: "p1" }];
    판단 = { wants: "image_edit", reply: "", ratio: "", look: "", card: 0, note: "", target: 0 };
    const { json } = await 보낸다({ prompt: "글자 크게" });
    expect(json.message.body).toBe(IMAGE_NOT_READY);
    expect(부른라우트).toEqual([]);
  });
});

/** Task 8 고침 1 · 2 · 3 — 번호 물음의 말 답이 지시를 더럽히거나 사용자 말을 잃지 않는다. */
describe("번호 물음의 말 답 (Task 8 고침)", () => {
  const 물음줄 = (id: string, cont = false) => ({
    id, role: "assistant", body: askBody("target", "어느 이미지를 고칠까요?", { numbers: [1, 2], ...(cont ? { cont: true } : {}) }), workId: null,
  });
  beforeEach(() => {
    그림들 = [{ id: "img-1", generationRequestId: "r1", selected: false }, { id: "img-3", generationRequestId: "r3", selected: false }];
    지난줄 = [
      { id: "u1", role: "user", body: "화장품을 넣어줘", workId: null }, { id: "i1", role: "image", body: "", workId: "p1" },
      { id: "u2", role: "user", body: "배경 파랗게", workId: null }, { id: "i3", role: "image", body: editRowBody("r3"), workId: "p1" },
      { id: "u3", role: "user", body: "배경만 하얗게", workId: null }, 물음줄("q1"),
    ];
  });

  it("번호 없이 답해 다시 물은 뒤 단추로 고르면 지시는 처음 말뿐이다 (고침 1)", async () => {
    지난줄 = [...지난줄, { id: "u4", role: "user", body: "그거요", workId: null }, 물음줄("q2", true)];
    판단 = undefined;
    await 보낸다({ prompt: "이미지 1", answersRowId: "q2", pick: { target: 1 } });
    expect(부른라우트[0]!.body).toMatchObject({ instruction: "배경만 하얗게", imageId: "img-1" });
  });

  it("번호와 함께 고칠 내용을 말하면 그 내용도 지시에 잇는다 (고침 3)", async () => {
    판단 = { wants: "image_edit", reply: "", ratio: "", look: "", card: 0, note: "", target: 1 };
    await 보낸다({ prompt: "이미지 1 글자도 크게" });
    expect(부른라우트[0]!.body).toMatchObject({ instruction: "배경만 하얗게\n글자도 크게", imageId: "img-1" });
  });

  /**
   * 최종 수정 1 — 「글자 크게 고쳐줘」 → 번호 물음 → 「그거요」 → 판단 모델이 talk + ask_target 으로 다시 묻는다. 그 말을 답으로
   * 보고 사슬을 잇는다. 안 이으면 새 물음의 처음 말이 「그거요」가 되어 단추로 고르면 「그거요」로 고친다(값이 나가고 말을 잃는다).
   */
  it("번호 없이 답해 AI 가 다시 물으면(talk + ask_target) 사슬을 잇는다 — 단추로 고르면 처음 말로 고친다 (최종 수정 1)", async () => {
    판단 = { wants: "talk", reply: "몇 번 이미지를 고칠까요?", ratio: "", look: "", card: 0, note: "ask_target" };
    await 보낸다({ prompt: "그거요" });
    expect(readAsk(남긴줄[1] as never)).toMatchObject({ kind: "target", data: { cont: true, numbers: [1, 2] } });
    expect(visibleBody(남긴줄[0] as never)).toBe("그거요");

    지난줄 = [
      ...지난줄,
      { id: "u4", role: "user", body: 남긴줄[0]!.body!, workId: null },
      { id: "q2", role: "assistant", body: 남긴줄[1]!.body!, workId: null },
    ];
    남긴줄.length = 0; 판단 = undefined;
    await 보낸다({ prompt: "이미지 2", answersRowId: "q2", pick: { target: 2 } });
    expect(부른라우트[0]!.body).toMatchObject({ instruction: "배경만 하얗게", imageId: "img-3" });
  });

  it("번호 없이 답했는데 다 만든 이미지가 하나뿐이면 그 이미지를 고친다 — 만드는 중인 마지막 것이 아니라 (고침 2)", async () => {
    그림들 = [{ id: "img-1", generationRequestId: "r1", selected: false }]; // 이미지 2(i3)는 아직 만드는 중
    판단 = { wants: "image_edit", reply: "", ratio: "", look: "", card: 0, note: "", target: 0 };
    await 보낸다({ prompt: "그거요" });
    expect(부른라우트[0]!.body).toMatchObject({ instruction: "배경만 하얗게", imageId: "img-1" });
    expect(rowFromOf(남긴줄.at(-1)!.body)).toBe("i1");
  });

  it("번호 없이 답했는데 다 만든 이미지가 없으면 값 없이 사실대로 답한다 (고침 2)", async () => {
    그림들 = [];
    판단 = { wants: "image_edit", reply: "", ratio: "", look: "", card: 0, note: "", target: 0 };
    const { json } = await 보낸다({ prompt: "그거요" });
    expect(부른라우트).toEqual([]);
    expect(json.message.body).toBe(NO_DONE_IMAGE);
  });
});

/**
 * 최종 수정 7 — 결과물 목록을 통째로 못 읽으면(그림 목록 조회 실패) 「이미지가 없다」가 아니라 번호마다 「모름」이다.
 * 빈 목록이면 고치기 갈래가 빠져 「고쳐줘」가 새 이미지 만들기(값)로 새거나, 번호 단추가 「고칠 것이 없다」로 끝난다.
 */
describe("결과물 목록을 못 읽으면 (최종 수정 7)", () => {
  beforeEach(() => {
    그림들 = [{ id: "img-1", generationRequestId: "r1", selected: false }, { id: "img-3", generationRequestId: "r3", selected: false }];
    지난줄 = [
      { id: "u1", role: "user", body: "화장품을 넣어줘", workId: null }, { id: "i1", role: "image", body: "", workId: "p1" },
      { id: "u2", role: "user", body: "배경 파랗게", workId: null }, { id: "i3", role: "image", body: editRowBody("r3"), workId: "p1" },
    ];
    목록실패 = true;
  });

  it("말로 「고쳐줘」면 고치기 갈래를 주고, 새로 만들지 않고 지금 확인할 수 없다고 답한다", async () => {
    판단 = { wants: "image_edit", reply: "", ratio: "", look: "", card: 0, note: "", target: 0 };
    const { json } = await 보낸다({ prompt: "글자 크게 고쳐줘" });
    expect(받은갈래).toContain("image_edit");
    expect(부른라우트).toEqual([]);
    expect(json.message.body).toContain("결과물 2 을 확인할 수 없습니다");
  });

  it("번호 단추로 답해도 「고칠 것이 없다」 · 「그 사이 바뀌어」가 아니라 지금 확인할 수 없다고 답한다", async () => {
    지난줄 = [
      ...지난줄,
      { id: "u3", role: "user", body: "글자 크게", workId: null },
      { id: "q1", role: "assistant", body: askBody("target", "어느 이미지를 고칠까요?", { numbers: [1, 2] }), workId: null },
    ];
    판단 = undefined;
    const { json } = await 보낸다({ prompt: "이미지 1", answersRowId: "q1", pick: { target: 1 } });
    expect(부른라우트).toEqual([]);
    expect(json.message.body).toContain("결과물 1 을 확인할 수 없습니다");
    expect(json.message.body).not.toBe(NOTHING_TO_EDIT);
  });
});

/**
 * 후속 Task 2 — 결과물이 100개를 넘는 대화에서 오래된 번호(최근 100개 밖이라 읽지 않은 것)를 고쳐 달라면 「잠시 뒤 다시」가
 * 아니라 오래되어 이 대화에서는 못 고친다고 답한다. 고치기 라우트를 안 부른다(값 0). 잠깐 못 읽은 것은 위처럼 그대로다.
 */
describe("결과물이 100개를 넘는 대화의 옛 번호 (후속 Task 2)", () => {
  beforeEach(() => {
    const 옛줄 = Array.from({ length: 100 }, (_, at) => ({ id: `o${at + 1}`, role: "image", body: "", workId: `w${at + 1}` }));
    지난줄 = [{ id: "u0", role: "user", body: "많이 만들어 줘", workId: null }, ...옛줄, { id: "i1", role: "image", body: "", workId: "p1" }];
  });

  it("1번을 고쳐 달라면 고치기를 안 부르고 오래되었다고 답한다 — 번호는 그대로다", async () => {
    판단 = { wants: "image_edit", reply: "", ratio: "", look: "", card: 0, note: "", target: 1 };
    const { json } = await 보낸다({ prompt: "1번 글자 크게" });
    expect(부른라우트).toEqual([]);
    expect(json.message.body).toBe(
      "결과물 1 은 오래되어 이 대화에서는 고칠 수 없습니다. 지우지 않았다면 이미지는 「다양하게」 화면의 지난 작업에서 열어 「이 장만 고치기」로, 카드뉴스는 「카드뉴스」 화면의 지난 작업에서 열어 「다시 만들기」로 고쳐 주세요. 안 보이면 사이드바에서 프로젝트를 골라 두었는지 보고 「전체 보기」를 눌러 주세요.",
    );
    expect(json.message.body).not.toContain("잠시 뒤");
  });

  it("최근 것(101번)은 지금처럼 고친다", async () => {
    판단 = { wants: "image_edit", reply: "", ratio: "", look: "", card: 0, note: "", target: 101 };
    await 보낸다({ prompt: "101번 글자 크게" });
    expect(부른라우트.map((call) => call.step)).toEqual(["edit"]);
    expect(부른라우트[0]!.url).toContain("/api/poster/projects/p1/edit");
  });
});
